import { defineConfig } from 'drizzle-kit';

// Used only by `npm run db:generate` to write SQL migrations into ./drizzle.
// The app applies them itself at startup (src/db/client.ts).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
