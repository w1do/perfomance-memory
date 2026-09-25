import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@preference-memory/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globalSetup: ['../../packages/core/test/qdrant-global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
