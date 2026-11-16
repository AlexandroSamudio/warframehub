import { readFileSync } from 'node:fs';
import { IncarnonFile, type IncarnonEntry } from './wiki-incarnon.js';

// Works from both src/sources (dev) and dist/sources (build): data/ sits next to them.
const FILE = new URL('../../data/incarnon.json', import.meta.url);

let cached: IncarnonFile | null = null;

/** Incarnon evolutions saved from the Warframe wiki (`npm run update-incarnon`). */
export function loadIncarnon(): IncarnonFile {
  cached ??= IncarnonFile.parse(JSON.parse(readFileSync(FILE, 'utf8')));
  return cached;
}

/** A weapon version's evolutions, by its English name ("Braton Prime"), or null. */
export function incarnonOf(name: string): IncarnonEntry | null {
  return loadIncarnon().weapons[name] ?? null;
}
