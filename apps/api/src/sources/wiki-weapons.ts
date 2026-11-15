import { z } from 'zod';
import { isTable, type LuaTable, type LuaValue } from './wiki-lua.js';

/**
 * Weapon facts the item data lacks, from the Warframe wiki's `Module:Weapons/data/*`
 * (checked 15 Nov 2026): each weapon's class. warframestat.us only says "Melee" for every
 * melee weapon and calls some of them "Rifle"; the wiki has "Polearm", "Nikana", and so on.
 * Saved by `npm run update-weapon-wiki` in `apps/api/data/weapon-wiki.json`; the app never
 * calls the wiki.
 */

export const WEAPON_MODULES = [
  'Module:Weapons/data/primary',
  'Module:Weapons/data/secondary',
  'Module:Weapons/data/melee',
  'Module:Weapons/data/archwing',
] as const;

export const WeaponWikiEntry = z.object({
  /** The wiki's class: "Rifle", "Sniper Rifle", "Polearm", "Archgun"… */
  class: z.string(),
});
export type WeaponWikiEntry = z.infer<typeof WeaponWikiEntry>;

export const WeaponWikiFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** Keyed by the weapon's internal name (the item data's `uniqueName`). */
  weapons: z.record(z.string(), WeaponWikiEntry),
  /**
   * Keyed by English name, for the few wiki entries whose internal name is missing or
   * out of date (Mandonel, Kuva Ghoulsaw, Quassus Prime… on 15 Nov 2026).
   */
  byName: z.record(z.string(), WeaponWikiEntry),
});
export type WeaponWikiFile = z.infer<typeof WeaponWikiFile>;

function str(t: LuaTable, key: string): string | null {
  const v = t.map[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * The class of every weapon in the given modules. Skipped: the "(Atmosphere)" entries
 * (an arch-gun's stats on the ground, same weapon) and exalted weapons (abilities, not
 * items).
 */
export function buildWeaponWiki(modules: LuaValue[], generatedAt: Date): WeaponWikiFile {
  const weapons: Record<string, WeaponWikiEntry> = {};
  const byName: Record<string, WeaponWikiEntry> = {};
  for (const module of modules) {
    if (!isTable(module)) continue;
    for (const entry of Object.values(module.map)) {
      if (!isTable(entry)) continue;
      const id = str(entry, 'InternalName');
      const name = str(entry, 'Name');
      const cls = str(entry, 'Class');
      const slot = str(entry, 'Slot') ?? '';
      if (!cls || cls === 'Exalted Weapon' || slot.includes('(Atmosphere)')) continue;
      if (id?.startsWith('/Lotus/')) weapons[id] ??= { class: cls };
      if (name) byName[name] ??= { class: cls };
    }
  }
  return {
    source: 'https://wiki.warframe.com (Module:Weapons/data, CC BY-SA)',
    generatedAt: generatedAt.toISOString(),
    weapons,
    byName,
  };
}
