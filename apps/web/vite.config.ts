import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// dev: `npm run dev -w @preference-memory/web` proxies to the running compose stack
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/mcp': 'http://localhost:3000',
    },
  },
  build: { sourcemap: false, assetsInlineLimit: 0 },
});
