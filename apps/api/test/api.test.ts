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

const LOGIN = { email: 'admin@example.com', password: 'correct horse battery' };

async function login(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN });
  return String(res.headers['set-cookie']).split(';')[0] as string;
}

describe('REST API (signed in)', () => {
  let app: FastifyInstance;
  let call: FastifyInstance['inject'];

  beforeAll(async () => {
    ({ app } = await makeApp());
    const cookie = await login(app);
    call = ((opts: string | Record<string, unknown>) => {
      const o = typeof opts === 'string' ? { url: opts } : opts;
      return app.inject({ ...o, headers: { ...(o.headers as object), cookie } } as never);
    }) as FastifyInstance['inject'];
  });

  it('health, auth/me', async () => {
    expect((await call('/api/health')).json()).toEqual({ status: 'ok' });
    expect((await call('/api/auth/me')).json()).toEqual({
      auth_required: true,
      authenticated: true,
    });
  });

  it('transcribe accepts webm and rejects other formats', async () => {
    const ok = await call({
      method: 'POST',
      url: '/api/transcribe',
      ...multipart('a.webm', 'audio/webm;codecs=opus', Buffer.from('fake')),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().text).toContain('ChatGPT');
    const bad = await call({
      method: 'POST',
      url: '/api/transcribe',
      ...multipart('a.txt', 'text/plain', Buffer.from('x')),
    });
    expect(bad.statusCode).toBe(415);
  });

  it('preview → save(preview) → list → patch → delete', async () => {
    const preview = await call({
      method: 'POST',
      url: '/api/preferences/preview',
      payload: { text: 'не люблю, когда ChatGPT отвечает грубо' },
    });
    expect(preview.statusCode).toBe(200);
    const pv = preview.json();
    expect(pv.enrichment.folder_path).toEqual(['ChatGPT', 'Не люблю']);
    expect(pv.folder_exists).toBe(false);

    pv.enrichment.strength = 5; // user edited the preview
    const saved = await call({
      method: 'POST',
      url: '/api/preferences',
      payload: { preview: { text: pv.text, enrichment: pv.enrichment }, source: 'voice' },
    });
    expect(saved.statusCode).toBe(200);
    const s = saved.json();
    expect(s.action).toBe('created');
    expect(s.preference.strength).toBe(5);
    expect(s.preference.source).toBe('voice');

    const list = await call('/api/preferences?folder=ChatGPT&polarity=dislike&applies_to=chatgpt');
    expect(list.json().items).toHaveLength(1);
    const search = await call('/api/preferences?q=грубые%20ответы');
    expect(search.json().items[0].preference.id).toBe(s.preference.id);

    const patched = await call({
      method: 'PATCH',
      url: `/api/preferences/${s.preference.id}`,
      payload: { tags: ['тон', 'грубость', 'chatgpt'] },
    });
    expect(patched.json().tags).toEqual(['тон', 'грубость', 'chatgpt']);
    const badPatch = await call({
      method: 'PATCH',
      url: `/api/preferences/${s.preference.id}`,
      payload: { strength: 9 },
    });
    expect(badPatch.statusCode).toBe(400);

    const facets = (await call('/api/facets')).json();
    expect(facets.domain).toEqual([{ value: 'ai_assistants', count: 1 }]);
    const stats = (await call('/api/stats')).json();
    expect(stats).toMatchObject({ total: 1, like: 0, dislike: 1, folders: 2 });

    const md = await call('/api/export.md?folder=ChatGPT');
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.body).toContain('Грубые ответы ChatGPT');

    expect(
      (await call({ method: 'DELETE', url: `/api/preferences/${s.preference.id}` })).statusCode,
    ).toBe(200);
    expect((await call(`/api/preferences/${s.preference.id}`)).statusCode).toBe(404);
  });

  it('folders CRUD with 409 on non-empty delete', async () => {
    const a = (
      await call({ method: 'POST', url: '/api/folders', payload: { name: 'Путешествия' } })
    ).json();
    const b = (
      await call({
        method: 'POST',
        url: '/api/folders',
        payload: { name: 'Люблю', parent_id: a.id },
      })
    ).json();
    expect(b.path).toEqual(['Путешествия', 'Люблю']);
    const dup = await call({
      method: 'POST',
      url: '/api/folders',
      payload: { name: 'люблю', parent_id: a.id },
    });
    expect(dup.statusCode).toBe(409);
    const renamed = (
      await call({
        method: 'PATCH',
        url: `/api/folders/${a.id}`,
        payload: { name: 'Поездки' },
      })
    ).json();
    expect(renamed.path).toEqual(['Поездки']);
    const tree = (await call('/api/folders')).json().tree;
    expect(tree.some((n: { name: string }) => n.name === 'Поездки')).toBe(true);
    expect((await call({ method: 'DELETE', url: `/api/folders/${a.id}` })).statusCode).toBe(409);
    expect(
      (await call({ method: 'DELETE', url: `/api/folders/${a.id}?force=true` })).statusCode,
    ).toBe(200);
  });

  it('status shows models but never secrets', async () => {
    const res = await call('/api/status');
    const body = res.body;
    expect(res.json().models.llm).toBe('gpt-5.5');
    expect(res.json().services).toMatchObject({ api: 'ok', qdrant: 'ok', mcp: 'down' });
    expect(res.json().mcp.url).toBe('http://localhost:3000/mcp');
    expect(body).not.toContain('sk-secret-value');
    expect(body).not.toContain('test-token-0123456789abcdef');
  });
});

describe('Login form (ADMIN_EMAIL + ADMIN_PASSWORD)', () => {
  it('everything but health/auth is closed; login sets an httpOnly cookie', async () => {
    const { app } = await makeApp();
    expect((await app.inject('/api/stats')).statusCode).toBe(401);
    expect((await app.inject('/api/status')).statusCode).toBe(401);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
    expect((await app.inject('/api/auth/me')).json()).toEqual({
      auth_required: true,
      authenticated: false,
    });
    const wrongPass = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...LOGIN, password: 'nope' },
    });
    expect(wrongPass.statusCode).toBe(401);
    expect(wrongPass.json().error).toBe('Неверный email или пароль');
    const wrongEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...LOGIN, email: 'x@y.z' },
    });
    expect(wrongEmail.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...LOGIN, email: ' ADMIN@example.com ' },
    });
    expect(ok.statusCode).toBe(200);
    const setCookie = String(ok.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const cookie = setCookie.split(';')[0] as string;
    expect((await app.inject({ url: '/api/stats', headers: { cookie } })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/stats', headers: { cookie: 'pm_session=1.forged' } }))
        .statusCode,
    ).toBe(401);
  });

  it('limits failed attempts per address (429 with retry-after)', async () => {
    const { app } = await makeApp();
    const bad = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { ...LOGIN, password: 'wrong-wrong' },
      });
    for (let i = 0; i < 5; i++) expect((await bad()).statusCode).toBe(401);
    const blocked = await bad();
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN });
    expect(good.statusCode).toBe(429); // even the right password waits out the window
  }, 30_000);
});
