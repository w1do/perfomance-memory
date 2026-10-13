import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { login, makeApp } from './setup.js';

const CHATGPT = 'не люблю, когда ChatGPT отвечает грубо';

describe('REST transfer: export → preview → apply', () => {
  let source: FastifyInstance;
  let target: FastifyInstance;
  let cookie: string;
  let targetCookie: string;

  beforeAll(async () => {
    const a = await makeApp();
    const b = await makeApp();
    source = a.app;
    target = b.app;
    await a.core.prefs.save({ text: CHATGPT, source: 'text' });
    cookie = await login(source);
    targetCookie = await login(target);
  });

  const post = (app: FastifyInstance, c: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: { cookie: c } });

  it('exports the schema as a package', async () => {
    const res = await post(source, cookie, '/api/export/schema', { all: true, name: 'Тест' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.format).toBe('preference-memory/schema');
    expect(body.counts.preferences).toBeGreaterThanOrEqual(1);
    expect(res.body).not.toContain('sk-secret-value');
  });

  it('previews, applies once, then applies the same file with nothing new', async () => {
    const exported = (
      await post(source, cookie, '/api/export/schema', { all: true, name: 'Тест' })
    ).json();

    const preview = await post(target, targetCookie, '/api/import/schema/preview', {
      package: exported,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().tree.length).toBeGreaterThan(0);

    const first = await post(target, targetCookie, '/api/import/schema/apply', {
      package: exported,
      selection: { all: true },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().rules_created).toBe(1);

    const second = await post(target, targetCookie, '/api/import/schema/apply', {
      package: exported,
      selection: { all: true },
    });
    expect(second.json().rules_created).toBe(0);
    expect(second.json().duplicates).toBe(1);
    expect(second.body).not.toContain('sk-secret-value');
  });

  it('rejects a foreign file and a missing package with 400', async () => {
    const foreign = await post(target, targetCookie, '/api/import/schema/preview', {
      package: { format: 'x' },
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error).toBeTruthy();
    const missing = await post(target, targetCookie, '/api/import/schema/preview', {});
    expect(missing.statusCode).toBe(400);
  });

  it('rejects a body larger than 10 MiB with 413', async () => {
    const res = await post(target, targetCookie, '/api/import/schema/preview', {
      package: { format: 'x', pad: 'а'.repeat(6 * 1024 * 1024) },
    });
    expect(res.statusCode).toBe(413);
  });

  it('requires a session on all three routes', async () => {
    for (const url of [
      '/api/export/schema',
      '/api/import/schema/preview',
      '/api/import/schema/apply',
    ]) {
      const res = await target.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(401);
    }
  });
});
