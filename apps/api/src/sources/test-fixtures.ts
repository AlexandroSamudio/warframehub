import { readFileSync } from 'node:fs';

/** Real warframestat.us responses saved on 2026-11-10 at 13:29:12 UTC (tests only). */
export const FIXTURES_SAVED_AT = new Date('2026-11-10T13:29:12.000Z');

/** `duviriCycle.json` and `archimedeas.json` were saved later, at 15:59:02 UTC. */
export const LATER_FIXTURES_SAVED_AT = new Date('2026-11-10T15:59:02.000Z');

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}
