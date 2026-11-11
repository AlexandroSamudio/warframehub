import type { PartSource } from '@warframehub/shared';
import { readFileSync } from 'node:fs';
import { PartSourcesFile } from './wiki-quests.js';

// Works from both src/sources (dev) and dist/sources (build): data/ sits next to them.
const DEFAULT_FILE = new URL('../../data/part-sources.json', import.meta.url);

let cached: {
  file: PartSourcesFile;
  byName: Map<string, PartSourcesFile['items'][string]>;
} | null = null;

/** The quest sources saved from the Warframe wiki (`npm run update-part-sources`). */
export function loadPartSources(file: URL | string = DEFAULT_FILE): PartSourcesFile {
  if (file === DEFAULT_FILE && cached) return cached.file;
  const parsed = PartSourcesFile.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (file === DEFAULT_FILE) {
    cached = {
      file: parsed,
      byName: new Map(Object.entries(parsed.items).map(([name, e]) => [name.toLowerCase(), e])),
    };
  }
  return parsed;
}

/**
 * Where the wiki says a part comes from. A quest that gives an item's blueprint is the
 * source of its "Blueprint" part, and of every part when the wiki says "and parts".
 */
export function partSources(itemName: string, partName: string): PartSource[] {
  loadPartSources();
  const entry = cached!.byName.get(itemName.toLowerCase());
  if (!entry) return [];
  return partName === 'Blueprint' || entry.allParts ? entry.sources : [];
}
