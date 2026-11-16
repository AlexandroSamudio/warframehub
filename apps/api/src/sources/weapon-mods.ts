import type {
  WeaponArcaneKind,
  WeaponArcaneOption,
  WeaponModOption,
  WeaponSlot,
} from '@warframehub/shared';
import { z } from 'zod';
import { effectText, pathRank, SKIPPED_PATHS } from './build-data.js';
import type { ModWikiEntry } from './wiki-weapons.js';

/**
 * What a weapon build can hold (SPEC §15.1): weapon mods, stances and weapon arcanes from
 * warframestat.us's `/mods` and arcane list, and which of them fit a weapon. Which weapons a
 * mod fits comes from the Warframe wiki (`Module:Mods/data`, saved in weapon-wiki.json): the
 * mod's type plus the compatibility tags it needs or refuses, against the weapon's class,
 * tags and family (`Module:Weapons/data`). Checked 16 Nov 2026 against the wiki's mod pages:
 * - Rifle mods: primary assault rifles, bows, sniper rifles, spearguns, launchers and
 *   arm-cannons: every primary but shotguns ("Rifle Mods").
 * - Shotgun mods: primary shotguns only; secondary shotguns take Pistol mods ("Shotgun Mods").
 * - Pistol mods: every secondary, Tomes included ("Pistol Mods"); Tome mods: Tomes only.
 * - Assault Rifle, Sniper and Bow mods: those classes only. Crossbows aren't offered Bow
 *   mods: the wiki doesn't say they take them.
 * - Thrown Melee mods: glaives. Stances: the weapon has the stance's tag ("SWORDS_STANCE").
 * - A type that names a weapon ("Hek") is an augment for that weapon and its family.
 */

// Defined here, not imported: build-data.ts and warframes.ts import each other, and a
// schema used while this module loads must not come through that cycle.
const LevelStats = z.array(z.looseObject({ stats: z.array(z.string()) })).default([]);

/** A weapon mod as cached, with what decides which weapons it fits. */
export interface StoredWeaponMod extends Omit<WeaponModOption, 'augment' | 'alias'> {
  /** The wiki's type: "Rifle", "Sniper", "Swords", or a weapon's name. */
  type: string;
  tags: string[];
  notTags: string[];
}

const RawWeaponMod = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  type: z.string().optional(),
  isExilus: z.boolean().optional(),
  isUtility: z.boolean().optional(),
  polarity: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  imageName: z.string().optional(),
  description: z.string().optional(),
  fusionLimit: z.int().min(0).optional(),
  levelStats: LevelStats,
});

/** warframestat.us's mod types that go on weapons. */
const WEAPON_MOD_TYPES = new Set([
  'Primary Mod',
  'Shotgun Mod',
  'Secondary Mod',
  'Melee Mod',
  'Arch-Gun Mod',
  'Arch-Melee Mod',
  'Stance Mod',
]);

/**
 * The weapon mods and stances, A–Z. Mods the wiki gives no type are left out (we can't say
 * what they fit). Copies under one name keep the best path, as Warframe mods do.
 */
export function normaliseWeaponMods(
  rawMods: unknown[],
  wikiMods: Record<string, ModWikiEntry>,
): StoredWeaponMod[] {
  const byName = new Map<string, { rank: number; mod: StoredWeaponMod }>();
  for (const raw of rawMods) {
    const parsed = RawWeaponMod.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data;
    if (!m.type || !WEAPON_MOD_TYPES.has(m.type)) continue;
    if (SKIPPED_PATHS.some((p) => m.uniqueName.includes(p))) continue;
    const wiki = wikiMods[m.uniqueName];
    if (!wiki) continue;
    const stance = m.type === 'Stance Mod';
    // Stances have no per-rank stats: their rank limit and description stand in.
    const maxRank = stance ? m.fusionLimit : m.levelStats.length - 1;
    if (maxRank === undefined || maxRank < 0) continue;
    const effects = stance
      ? Array<string>(maxRank + 1).fill(m.description ?? '')
      : m.levelStats.map((level) => effectText(level.stats));
    const mod: StoredWeaponMod = {
      uniqueName: m.uniqueName,
      name: m.name,
      polarity: m.polarity ?? null,
      rarity: m.rarity ?? null,
      image: m.imageName ?? null,
      maxRank,
      exilus: !stance && (m.isExilus === true || m.isUtility === true),
      stance,
      effects,
      type: wiki.type,
      tags: wiki.tags,
      notTags: wiki.notTags,
    };
    const rank = pathRank(m.uniqueName);
    const kept = byName.get(m.name);
    if (!kept || rank < kept.rank) byName.set(m.name, { rank, mod });
  }
  return [...byName.values()].map((v) => v.mod).sort((a, b) => a.name.localeCompare(b.name));
}

/** What a weapon brings to the fit check. */
export interface WeaponFit {
  name: string;
  slot: WeaponSlot;
  /** The wiki's class ("Rifle", "Sniper Rifle", "Sword"…), null when unknown. */
  class: string | null;
  tags: string[];
  /** The wiki's family ("Hek" for Kuva Hek), null when unknown. */
  family: string | null;
}

/** The type rules (see the comment at the top). Returns null for a type that names a weapon. */
function typeFits(type: string, w: WeaponFit): boolean | null {
  switch (type) {
    case 'Primary':
      return w.slot === 'primary';
    case 'Rifle':
    case 'Rifle (No Aoe)':
      return w.slot === 'primary' && w.class !== 'Shotgun';
    case 'Assault Rifle':
      return w.slot === 'primary' && w.class === 'Rifle';
    case 'Sniper':
      return w.class === 'Sniper Rifle';
    case 'Bow':
      return w.class === 'Bow';
    case 'Shotgun':
      return w.slot === 'primary' && w.class === 'Shotgun';
    case 'Pistol':
    case 'Pistol (No Aoe)':
      return w.slot === 'secondary';
    case 'Tome':
      return w.class === 'Tome';
    case 'Melee':
      return w.slot === 'melee';
    case 'Thrown Melee':
      return w.class === 'Glaive';
    case 'Archgun':
      return w.slot === 'archgun';
    case 'Archmelee':
      return w.slot === 'archmelee';
    case 'Unique':
      return false;
    default:
      return null;
  }
}

/** Whether a mod (or stance) fits this weapon, and whether it's made for this weapon only. */
export function modFit(mod: StoredWeaponMod, w: WeaponFit): { fits: boolean; augment: boolean } {
  if (mod.notTags.some((t) => w.tags.includes(t))) return { fits: false, augment: false };
  if (!mod.tags.every((t) => w.tags.includes(t))) return { fits: false, augment: false };
  if (mod.stance) return { fits: w.slot === 'melee', augment: false };
  const byType = typeFits(mod.type, w);
  if (byType !== null) return { fits: byType, augment: false };
  const own = mod.type === w.name || (w.family !== null && mod.type === w.family);
  return { fits: own, augment: own };
}

const ARCANE_KINDS: Record<string, WeaponArcaneKind> = {
  'Primary Arcane': 'primary',
  'Secondary Arcane': 'secondary',
  'Melee Arcane': 'melee',
  'Bow Arcane': 'bow',
  'Shotgun Arcane': 'shotgun',
};

const RawArcane = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  type: z.string().optional(),
  rarity: z.string().nullable().optional(),
  imageName: z.string().optional(),
  levelStats: LevelStats,
});

/** Weapon arcanes (Primary, Secondary, Melee, Bow, Shotgun), A–Z, without rankless copies. */
export function normaliseWeaponArcanes(rawArcanes: unknown[]): WeaponArcaneOption[] {
  const byName = new Map<string, WeaponArcaneOption>();
  for (const raw of rawArcanes) {
    const parsed = RawArcane.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    const kind = a.type ? ARCANE_KINDS[a.type] : undefined;
    if (!kind || a.levelStats.length === 0 || byName.has(a.name)) continue;
    byName.set(a.name, {
      uniqueName: a.uniqueName,
      name: a.name,
      rarity: a.rarity ?? null,
      image: a.imageName ?? null,
      maxRank: a.levelStats.length - 1,
      effects: a.levelStats.map((level) => effectText(level.stats)),
      kind,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The arcane kinds each slot takes (wiki, "Arcane Enhancement", checked 16 Nov 2026): one
 * slot for Primary, Secondary and Melee weapons (bows and shotguns also take their own
 * arcanes); arch-guns a Primary and a Secondary slot; arch-melee none.
 */
export function arcaneSlotKinds(w: Pick<WeaponFit, 'slot' | 'class'>): WeaponArcaneKind[][] {
  switch (w.slot) {
    case 'primary': {
      const kinds: WeaponArcaneKind[] = ['primary'];
      if (w.class === 'Bow') kinds.push('bow');
      if (w.class === 'Shotgun') kinds.push('shotgun');
      return [kinds, []];
    }
    case 'secondary':
      return [['secondary'], []];
    case 'melee':
      return [['melee'], []];
    case 'archgun':
      return [['primary'], ['secondary']];
    case 'archmelee':
      return [[], []];
  }
}

/** The Exilus slot (wiki, "Exilus Weapon Adapter"): Primary, Secondary and Melee only. */
export function hasExilus(slot: WeaponSlot): boolean {
  return slot === 'primary' || slot === 'secondary' || slot === 'melee';
}

/** Which Riven type a weapon takes (wiki, "Riven Mods"); arch-melee have none. */
export function rivenTypeOf(
  w: Pick<WeaponFit, 'slot' | 'class'>,
): 'Rifle' | 'Shotgun' | 'Pistol' | 'Archgun' | 'Melee' | null {
  switch (w.slot) {
    case 'primary':
      return w.class === 'Shotgun' ? 'Shotgun' : 'Rifle';
    case 'secondary':
      return 'Pistol';
    case 'melee':
      return 'Melee';
    case 'archgun':
      return 'Archgun';
    case 'archmelee':
      return null;
  }
}

/** Kuva, Tenet and Coda weapons carry a progenitor bonus. */
export function hasProgenitor(name: string): boolean {
  return /^(Kuva|Tenet|Coda|Dual Coda) /.test(name);
}
