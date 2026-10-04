import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The proxy must follow the API's real port, else changing PORT silently 500s it.
const rootEnvPath = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const apiTarget =
  process.env.VITE_API_PROXY_TARGET ?? `http://localhost:${process.env.PORT ?? '3000'}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxying keeps the API same-origin in dev so the refresh cookie stays
    // first-party, which is what production does too (architecture.md section 5).
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
