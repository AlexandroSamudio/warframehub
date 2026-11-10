import { createRequire } from 'node:module';

// Works from both src/ (dev) and dist/ (build): package.json is one level up in both cases.
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

export const APP_VERSION = pkg.version;
