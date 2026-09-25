import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/qdrant-global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
