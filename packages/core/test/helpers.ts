import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';
import { createCore } from '../src/core.js';
import { loadConfig } from '../src/env.js';
import { createLogger } from '../src/logger.js';
import { FakeAi } from './fake-ai.js';

export function testConfig(overrides: Record<string, string> = {}) {
  const suffix = randomUUID().slice(0, 8);
  return loadConfig({
    OPENAI_API_KEY: 'sk-test',
    MCP_TOKEN: 'test-token-0123456789abcdef',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'correct horse battery',
    QDRANT_URL: inject('qdrantUrl'),
    QDRANT_COLLECTION: `t_prefs_${suffix}`,
    QDRANT_FOLDERS_COLLECTION: `t_folders_${suffix}`,
    EMBED_DIM: '64',
    CONFLICT_SCORE: '0.5',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

export async function testCore(overrides: Record<string, string> = {}) {
  const config = testConfig(overrides);
  const ai = new FakeAi(config.EMBED_DIM);
  const dataDir = mkdtempSync(join(tmpdir(), 'pm-test-'));
  const core = createCore({ config, log: createLogger('silent', 'test'), ai, dataDir });
  await core.bootstrap({ owner: true });
  return { core, ai, config, dataDir };
}

declare module 'vitest' {
  export interface ProvidedContext {
    qdrantUrl: string;
  }
}
