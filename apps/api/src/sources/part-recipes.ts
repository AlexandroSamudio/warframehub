import type { PartCraft } from '@warframehub/shared';
import { readFileSync } from 'node:fs';
import { PartRecipesFile } from './de-export.js';

// Works from both src/sources (dev) and dist/sources (build): data/ sits next to them.
const DEFAULT_FILE = new URL('../../data/part-recipes.json', import.meta.url);

let cached: PartRecipesFile | null = null;

/**
 * The part recipes saved from DE's public export (`npm run update-part-recipes`).
 * Read once and kept in memory. Pass `file` to read another one (tests).
 */
export function loadPartRecipes(file: URL | string = DEFAULT_FILE): PartRecipesFile {
  if (file === DEFAULT_FILE && cached) return cached;
  const parsed = PartRecipesFile.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (file === DEFAULT_FILE) cached = parsed;
  return parsed;
}

/** What it takes to craft the part with this `uniqueName`, or null if it isn't crafted. */
export function partCraft(uniqueName: string): PartCraft | null {
  return loadPartRecipes().recipes[uniqueName] ?? null;
}
