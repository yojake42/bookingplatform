import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin API in dev, exactly like nginx in production, so cookies need no CORS gymnastics.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3100', changeOrigin: false },
    },
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true, interval: 300 } : undefined,
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
} as never);
