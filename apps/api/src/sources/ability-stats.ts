import { readFileSync } from 'node:fs';
import {
  AbilityStatsFile,
  type AbilityStatsEntry,
  type WarframeWikiEntry,
} from './wiki-abilities.js';

// Works from both src/sources (dev) and dist/sources (build): data/ sits next to them.
const FILE = new URL('../../data/ability-stats.json', import.meta.url);

let cached: AbilityStatsFile | null = null;

/** Ability numbers and passives saved from the Warframe wiki (`npm run update-ability-stats`). */
export function loadAbilityStats(): AbilityStatsFile {
  cached ??= AbilityStatsFile.parse(JSON.parse(readFileSync(FILE, 'utf8')));
  return cached;
}

export function abilityStats(internalName: string): AbilityStatsEntry | null {
  return loadAbilityStats().abilities[internalName] ?? null;
}

export function warframeWiki(internalName: string): WarframeWikiEntry | null {
  return loadAbilityStats().warframes[internalName] ?? null;
}
