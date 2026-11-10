import { defaultServerConditions } from 'vite';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Load @warframehub/shared from its TypeScript source, so tests never need a build first.
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
  resolve: { conditions: ['source', ...defaultServerConditions] },
  test: { name: 'api', include: ['src/**/*.test.ts'], environment: 'node' },
});
