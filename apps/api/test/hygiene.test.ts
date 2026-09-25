import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { login, makeApp } from './setup.js';

describe('REST hygiene: duplicates → distinct / merge', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    const made = await makeApp({ DUPLICATE_SCORE: '0.5' });
    app = made.app;
    const rule = (statement: string) => ({
      statement,
      polarity: 'like' as const,
      folder_path: ['Claude Code', 'Люблю'],
      domain: 'ai_assistants',
      tags: ['вопросы'],
    });
    made.ai
      .script('a', rule('Вопросы перед кодом'))
      .script('b', rule('Вопросы перед написанием кода'));
    for (const text of ['a', 'b']) await made.core.prefs.save({ text, source: 'text' });
    cookie = await login(app);
  });

  const call = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as object, headers: { cookie } });

  it('lists a group, merges it, then nothing is left', async () => {
    const res = await call('GET', '/api/hygiene/duplicates');
    expect(res.statusCode).toBe(200);
    const [g] = res.json().groups;
    expect(g.preferences).toHaveLength(2);
    const other = g.preferences.find((p: { id: string }) => p.id !== g.keep).id;
    const merged = await call('POST', '/api/hygiene/merge', { keep: g.keep, remove: [other] });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().history.at(-1).reason).toBe('слито как дубль');
    expect((await call('GET', '/api/hygiene/duplicates')).json().groups).toEqual([]);
    expect(
      (await call('POST', '/api/hygiene/merge', { keep: g.keep, remove: [g.keep] })).statusCode,
    ).toBe(400);
    expect((await call('POST', '/api/hygiene/distinct', { ids: [g.keep] })).statusCode).toBe(400);
  });

  it('is closed without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/hygiene/duplicates' });
    expect(res.statusCode).toBe(401);
  });
});
