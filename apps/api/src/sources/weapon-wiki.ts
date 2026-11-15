import { readFileSync } from 'node:fs';
import { WeaponWikiFile, type WeaponWikiEntry } from './wiki-weapons.js';

// Works from both src/sources (dev) and dist/sources (build): data/ sits next to them.
const FILE = new URL('../../data/weapon-wiki.json', import.meta.url);

let cached: WeaponWikiFile | null = null;

/** Weapon classes saved from the Warframe wiki (`npm run update-weapon-wiki`). */
export function loadWeaponWiki(): WeaponWikiFile {
  cached ??= WeaponWikiFile.parse(JSON.parse(readFileSync(FILE, 'utf8')));
  return cached;
}

/** A weapon's wiki facts, by its `uniqueName`, else by its English name. */
export function weaponWiki(uniqueName: string, name: string): WeaponWikiEntry | null {
  const file = loadWeaponWiki();
  return file.weapons[uniqueName] ?? file.byName[name] ?? null;
}
