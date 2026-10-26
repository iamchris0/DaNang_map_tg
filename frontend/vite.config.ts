/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The map and admin pages are lazy-loaded; pre-bundle their deps up front so the dev
    // server doesn't discover them on first use and force a page reload (losing input).
    optimizeDeps: {
      include: ['maplibre-gl', 'supercluster', 'react-hook-form', 'zod', '@hookform/resolvers/zod'],
    },
    // MapLibre (~1 MB, ~290 kB gzipped) is its own lazy chunk, loaded with the map.
    build: { chunkSizeWarningLimit: 1200 },
    server: {
      host: true,
      port: 5173,
      // Telegram opens the Mini App via an HTTPS tunnel during development.
      allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [],
      // File events don't reliably cross Docker bind mounts (e.g. Colima/virtiofs).
      ...(env.VITE_USE_POLLING === 'true' && { watch: { usePolling: true, interval: 300 } }),
      proxy: {
        '/api': { target: env.VITE_PROXY_TARGET || 'http://localhost:8000', changeOrigin: true },
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
