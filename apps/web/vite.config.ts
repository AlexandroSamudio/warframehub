import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Explicit path so the config is found even when tests run from the repo root.
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.js', import.meta.url)) })],
  // Use @warframehub/shared's TypeScript source directly (no build step during development).
  resolve: { conditions: ['source', ...defaultClientConditions] },
  // Vitest (node environment) resolves through the SSR side: same source condition, so web
  // tests that import shared's runtime values never need a build first (as in apps/api).
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Forward API calls to the Fastify server during development.
    proxy: { '/api': 'http://127.0.0.1:4317' },
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
});
