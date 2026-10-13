import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/qdrant-global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Файлы делят один Qdrant-контейнер: параллельный запуск выбивает старые тесты за testTimeout.
    fileParallelism: false,
  },
});
