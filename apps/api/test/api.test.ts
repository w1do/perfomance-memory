import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCore, createLogger } from '@preference-memory/core';
import { FakeAi } from '../../../packages/core/test/fake-ai.js';
import { testConfig } from '../../../packages/core/test/helpers.js';
import { buildServer } from '../src/server.js';

async function makeApp(env: Record<string, string> = {}) {
  const config = testConfig({ OPENAI_API_KEY: 'sk-secret-value', ...env });
  const ai = new FakeAi(config.EMBED_DIM);
  ai.script('не люблю, когда ChatGPT отвечает грубо', {
    statement: 'Грубые ответы ChatGPT',
    polarity: 'dislike',
    folder_path: ['ChatGPT', 'Не люблю'],
    domain: 'ai_assistants',
    applies_to: ['chatgpt'],
    tags: ['chatgpt', 'тон', 'ответы'],
  });
  const core = createCore({
    config,
    log: createLogger('silent', 't'),
    ai,
    dataDir: mkdtempSync(join(tmpdir(), 'pm-api-')),
  });
  await core.bootstrap({ owner: true });
  const app = await buildServer(core, {
    mcpHealthUrl: 'http://127.0.0.1:1/health',
    version: 'test',
  });
  return { app, core };
}

function multipart(filename: string, type: string, data: Buffer) {
  const boundary = '----pmtest';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('REST API without password', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await makeApp());
  });

  it('health, auth/me', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/api/auth/me')).json()).toEqual({
      auth_required: false,
      authenticated: true,
    });
  });

  it('transcribe accepts webm and rejects other formats', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      ...multipart('a.webm', 'audio/webm;codecs=opus', Buffer.from('fake')),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().text).toContain('ChatGPT');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/transcribe',
      ...multipart('a.txt', 'text/plain', Buffer.from('x')),
    });
    expect(bad.statusCode).toBe(415);
  });

  it('preview → save(preview) → list → patch → delete', async () => {
    const preview = await app.inject({
      method: 'POST',
      url: '/api/preferences/preview',
      payload: { text: 'не люблю, когда ChatGPT отвечает грубо' },
    });
    expect(preview.statusCode).toBe(200);
    const pv = preview.json();
    expect(pv.enrichment.folder_path).toEqual(['ChatGPT', 'Не люблю']);
    expect(pv.folder_exists).toBe(false);

    pv.enrichment.strength = 5; // user edited the preview
    const saved = await app.inject({
      method: 'POST',
      url: '/api/preferences',
      payload: { preview: { text: pv.text, enrichment: pv.enrichment }, source: 'voice' },
    });
    expect(saved.statusCode).toBe(200);
    const s = saved.json();
    expect(s.action).toBe('created');
    expect(s.preference.strength).toBe(5);
    expect(s.preference.source).toBe('voice');

    const list = await app.inject(
      '/api/preferences?folder=ChatGPT&polarity=dislike&applies_to=chatgpt',
    );
    expect(list.json().items).toHaveLength(1);
    const search = await app.inject('/api/preferences?q=грубые%20ответы');
    expect(search.json().items[0].preference.id).toBe(s.preference.id);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/preferences/${s.preference.id}`,
      payload: { tags: ['тон', 'грубость', 'chatgpt'] },
    });
    expect(patched.json().tags).toEqual(['тон', 'грубость', 'chatgpt']);
    const badPatch = await app.inject({
      method: 'PATCH',
      url: `/api/preferences/${s.preference.id}`,
      payload: { strength: 9 },
    });
    expect(badPatch.statusCode).toBe(400);

    const facets = (await app.inject('/api/facets')).json();
    expect(facets.domain).toEqual([{ value: 'ai_assistants', count: 1 }]);
    const stats = (await app.inject('/api/stats')).json();
    expect(stats).toMatchObject({ total: 1, like: 0, dislike: 1, folders: 2 });

    const md = await app.inject('/api/export.md?folder=ChatGPT');
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.body).toContain('Грубые ответы ChatGPT');

    expect(
      (await app.inject({ method: 'DELETE', url: `/api/preferences/${s.preference.id}` }))
        .statusCode,
    ).toBe(200);
    expect((await app.inject(`/api/preferences/${s.preference.id}`)).statusCode).toBe(404);
  });

  it('folders CRUD with 409 on non-empty delete', async () => {
    const a = (
      await app.inject({ method: 'POST', url: '/api/folders', payload: { name: 'Путешествия' } })
    ).json();
    const b = (
      await app.inject({
        method: 'POST',
        url: '/api/folders',
        payload: { name: 'Люблю', parent_id: a.id },
      })
    ).json();
    expect(b.path).toEqual(['Путешествия', 'Люблю']);
    const dup = await app.inject({
      method: 'POST',
      url: '/api/folders',
      payload: { name: 'люблю', parent_id: a.id },
    });
    expect(dup.statusCode).toBe(409);
    const renamed = (
      await app.inject({
        method: 'PATCH',
        url: `/api/folders/${a.id}`,
        payload: { name: 'Поездки' },
      })
    ).json();
    expect(renamed.path).toEqual(['Поездки']);
    const tree = (await app.inject('/api/folders')).json().tree;
    expect(tree.some((n: { name: string }) => n.name === 'Поездки')).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: `/api/folders/${a.id}` })).statusCode).toBe(
      409,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/folders/${a.id}?force=true` })).statusCode,
    ).toBe(200);
  });

  it('status shows models but never secrets', async () => {
    const res = await app.inject('/api/status');
    const body = res.body;
    expect(res.json().models.llm).toBe('gpt-5.5');
    expect(res.json().services).toMatchObject({ api: 'ok', qdrant: 'ok', mcp: 'down' });
    expect(res.json().mcp.url).toBe('http://localhost:3000/mcp');
    expect(body).not.toContain('sk-secret-value');
    expect(body).not.toContain('test-token-0123456789abcdef');
  });
});

describe('REST API with WEB_PASSWORD', () => {
  it('requires login and uses an httpOnly cookie', async () => {
    const { app } = await makeApp({ WEB_PASSWORD: 'correct horse' });
    expect((await app.inject('/api/stats')).statusCode).toBe(401);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/auth/me')).json()).toEqual({
      auth_required: true,
      authenticated: false,
    });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'nope' },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'correct horse' },
    });
    expect(ok.statusCode).toBe(200);
    const setCookie = String(ok.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(ok.body).not.toContain('pm_session');
    const cookie = setCookie.split(';')[0] as string;
    expect((await app.inject({ url: '/api/stats', headers: { cookie } })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/stats', headers: { cookie: 'pm_session=1.forged' } }))
        .statusCode,
    ).toBe(401);
  });
});
