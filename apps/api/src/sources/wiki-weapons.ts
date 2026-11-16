import { z } from 'zod';
import { wikiPlain } from './wiki-abilities.js';
import { isTable, type LuaTable, type LuaValue } from './wiki-lua.js';

/**
 * Weapon facts the item data lacks, from the Warframe wiki (checked 15–16 Nov 2026):
 * - `Module:Weapons/data/*`: each weapon's class, its compatibility tags and its family.
 *   warframestat.us only says "Melee" for every melee weapon and calls some of them "Rifle";
 *   the wiki has "Polearm", "Nikana", and so on.
 * - `Module:Mods/data`: each mod's type ("Rifle", "Sniper", "Swords"…) and the tags it needs
 *   or refuses, which decide which weapons it fits (weapon builds, SPEC §15.1).
 * - The "Riven Mods" page: the stats a Riven can have per weapon type.
 * Saved by `npm run update-weapon-wiki` in `apps/api/data/weapon-wiki.json`; the app never
 * calls the wiki.
 */

export const WEAPON_MODULES = [
  'Module:Weapons/data/primary',
  'Module:Weapons/data/secondary',
  'Module:Weapons/data/melee',
  'Module:Weapons/data/archwing',
] as const;

export const MODS_MODULE = 'Module:Mods/data';
export const RIVEN_PAGE = 'Riven Mods';

export const WeaponWikiEntry = z.object({
  /** The wiki's class: "Rifle", "Sniper Rifle", "Polearm", "Archgun"… */
  class: z.string(),
  /** Compatibility tags ("SNIPER_AMMO", "SWORDS_STANCE"…) that mods can need or refuse. */
  tags: z.array(z.string()).default([]),
  /** The family it belongs to ("Hek" for Kuva Hek and Vaykor Hek): its augments' type. */
  family: z.string().nullable().default(null),
});
export type WeaponWikiEntry = z.infer<typeof WeaponWikiEntry>;

export const ModWikiEntry = z.object({
  /** "Rifle", "Shotgun", "Sniper", "Swords" (a stance), or a weapon's name (its augments). */
  type: z.string(),
  /** Tags the weapon must have (stances: "SWORDS_STANCE"). */
  tags: z.array(z.string()),
  /** Tags the weapon must not have. */
  notTags: z.array(z.string()),
});
export type ModWikiEntry = z.infer<typeof ModWikiEntry>;

export const RivenType = z.enum(['Rifle', 'Shotgun', 'Pistol', 'Archgun', 'Melee']);
export type RivenType = z.infer<typeof RivenType>;

export const RivenStatEntry = z.object({
  name: z.string(),
  /** It can be the Riven's negative stat. */
  negative: z.boolean(),
  /** A spliced stat (two stats in one). */
  spliced: z.boolean(),
});
export type RivenStatEntry = z.infer<typeof RivenStatEntry>;

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
  /** Keyed by the mod's internal name (the item data's `uniqueName`). */
  mods: z.record(z.string(), ModWikiEntry).default({}),
  /** The stats a Riven can have, per Riven type. */
  riven: z.record(RivenType, z.array(RivenStatEntry)).default({} as never),
});
export type WeaponWikiFile = z.infer<typeof WeaponWikiFile>;

function str(t: LuaTable, key: string): string | null {
  const v = t.map[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function strings(t: LuaTable, key: string): string[] {
  const v = t.map[key];
  return isTable(v) ? v.list.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Every weapon in the given modules. Skipped: the "(Atmosphere)" entries (an arch-gun's
 * stats on the ground, same weapon) and exalted weapons (abilities, not items).
 */
function weaponEntries(modules: LuaValue[]) {
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
      const value = {
        class: cls,
        tags: strings(entry, 'CompatibilityTags'),
        family: str(entry, 'Family'),
      };
      if (id?.startsWith('/Lotus/')) weapons[id] ??= value;
      if (name) byName[name] ??= value;
    }
  }
  return { weapons, byName };
}

/** Every mod with a type, by internal name (`Module:Mods/data`'s `Mods` table). */
export function modEntries(module: LuaValue): Record<string, ModWikiEntry> {
  const out: Record<string, ModWikiEntry> = {};
  const mods = isTable(module) ? module.map.Mods : undefined;
  if (!isTable(mods)) return out;
  for (const entry of Object.values(mods.map)) {
    if (!isTable(entry)) continue;
    const id = str(entry, 'InternalName');
    const type = str(entry, 'Type');
    if (!id?.startsWith('/Lotus/') || !type) continue;
    out[id] = {
      type,
      tags: strings(entry, 'CompatibilityTags'),
      notTags: strings(entry, 'IncompatibilityTags'),
    };
  }
  return out;
}

/**
 * The Riven stats per type, from the "Riven Mods" page's attribute tables (one tab per type:
 * "|-|Rifle Attribute Ranges=" …). A stat can be negative when its negative columns aren't
 * "—". Rows after the "Spliced Attributes" header are spliced stats.
 */
export function rivenStats(wikitext: string): Partial<Record<RivenType, RivenStatEntry[]>> {
  const out: Partial<Record<RivenType, RivenStatEntry[]>> = {};
  const tabs = wikitext.split(/^\|-\|/m).slice(1);
  for (const tab of tabs) {
    const head = /^(\w+) Attribute Ranges=/.exec(tab);
    const parsed = head ? RivenType.safeParse(head[1]) : null;
    if (!parsed?.success) continue;
    const stats: RivenStatEntry[] = [];
    let spliced = false;
    for (const line of tab.split('\n')) {
      // Only the tab's first table: later ones (the Melee tab's name syllables) aren't stats.
      if (line.startsWith('|}')) break;
      if (/Spliced Attributes/.test(line)) spliced = true;
      if (!line.startsWith('| ')) continue;
      // `| style="text-align: left | Ammo Maximum || …` (the wiki leaves the quote open).
      const cells = line
        .replace(/^\|\s*style="[^|]*\|/, '')
        .split('||')
        .map((c) => c.trim());
      if (cells.length < 7) continue;
      const name = (wikiPlain(cells[0]!) ?? []).join(' ').trim();
      if (!name) continue;
      const blank = (c: string) => c.replace(/&#x2007;|\s/g, '') === '—';
      stats.push({ name, negative: !blank(cells[5]!) || !blank(cells[6]!), spliced });
    }
    if (stats.length > 0) out[parsed.data] = stats;
  }
  return out;
}

export function buildWeaponWiki(
  modules: LuaValue[],
  generatedAt: Date,
  modsModule: LuaValue = null,
  rivenPage = '',
): WeaponWikiFile {
  return {
    source:
      'https://wiki.warframe.com (Module:Weapons/data, Module:Mods/data, Riven Mods; CC BY-SA)',
    generatedAt: generatedAt.toISOString(),
    ...weaponEntries(modules),
    mods: modEntries(modsModule),
    riven: rivenStats(rivenPage) as WeaponWikiFile['riven'],
  };
}
