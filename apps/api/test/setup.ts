/** Общее для тестов API: приложение на FakeAi и отдельных коллекциях Qdrant, вход администратора. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createCore, createLogger } from '@preference-memory/core';
import { FakeAi } from '../../../packages/core/test/fake-ai.js';
import { testConfig } from '../../../packages/core/test/helpers.js';
import { buildServer } from '../src/server.js';

export async function makeApp(env: Record<string, string> = {}) {
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
  return { app, core, ai };
}

export const LOGIN = { email: 'admin@example.com', password: 'correct horse battery' };

export async function login(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: LOGIN });
  return String(res.headers['set-cookie']).split(';')[0] as string;
}
