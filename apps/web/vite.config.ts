import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Explicit path so the config is found even when tests run from the repo root.
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  // Use @warframehub/shared's TypeScript source directly (no build step during development).
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Forward API calls to the Fastify server during development.
    proxy: { '/api': 'http://127.0.0.1:4317' },
  },
  test: { name: 'web', include: ['src/**/*.test.ts'], environment: 'node' },
});
