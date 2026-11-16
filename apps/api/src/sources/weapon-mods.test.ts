import { describe, expect, it } from 'vitest';
import { fixture } from './test-fixtures.js';
import { loadWeaponWiki } from './weapon-wiki.js';
import {
  arcaneSlotKinds,
  hasExilus,
  hasProgenitor,
  modFit,
  normaliseWeaponArcanes,
  normaliseWeaponMods,
  rivenTypeOf,
  type WeaponFit,
} from './weapon-mods.js';

/** Real mods (warframestat.us, trimmed) checked against the real wiki data we committed. */
const mods = normaliseWeaponMods(fixture('warframes/mods') as unknown[], loadWeaponWiki().mods);
const mod = (name: string) => mods.find((m) => m.name === name)!;

function weapon(name: string, slot: WeaponFit['slot']): WeaponFit {
  const w = loadWeaponWiki().byName[name]!;
  return { name, slot, class: w.class, tags: w.tags, family: w.family };
}
const fits = (modName: string, w: WeaponFit) => modFit(mod(modName), w).fits;

const braton = weapon('Braton', 'primary');
const hek = weapon('Hek', 'primary');
const vectis = weapon('Vectis', 'primary');
const skana = weapon('Skana', 'melee');
const glaive = weapon('Glaive', 'melee');
const lex = weapon('Lex', 'secondary');
const mausolon = weapon('Mausolon', 'archgun');

describe('normaliseWeaponMods', () => {
  it('keeps weapon mods and stances once each, the real one under a shared name', () => {
    expect(mod('Serration').uniqueName).toBe('/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod');
    expect(mod('Serration').maxRank).toBe(10);
    expect(mod('Point Strike').maxRank).toBe(5); // not the 10-rank "Expert" copy
    expect(mods.some((m) => m.uniqueName.includes('/Beginner/'))).toBe(false);
    // A stance has no per-rank stats: its rank limit and description stand in.
    expect(mod('Crimson Dervish')).toMatchObject({ stance: true, maxRank: 3, exilus: false });
    expect(mod('Vigilante Supplies').exilus).toBe(true);
    // Warframe mods aren't weapon mods.
    expect(mods.some((m) => m.name === 'Intensify')).toBe(false);
  });
});

describe('modFit (wiki rules, checked 16 Nov 2026)', () => {
  it('gives Rifle mods to every primary but shotguns', () => {
    expect(fits('Point Strike', braton)).toBe(true);
    expect(fits('Point Strike', vectis)).toBe(true);
    expect(fits('Point Strike', hek)).toBe(false);
  });

  it('gives Sniper mods to sniper rifles only', () => {
    expect(fits('Primed Chamber', vectis)).toBe(true);
    expect(fits('Primed Chamber', braton)).toBe(false);
  });

  it('gives Pistol mods to secondaries, melee mods to melee, arch-gun mods to arch-guns', () => {
    expect(fits('Hollow Point', lex)).toBe(true);
    expect(fits('Hollow Point', braton)).toBe(false);
    expect(fits('Pressure Point', skana)).toBe(true);
    expect(fits('Rubedo-Lined Barrel', mausolon)).toBe(true);
    expect(fits('Rubedo-Lined Barrel', braton)).toBe(false);
  });

  it('gives Thrown Melee mods to glaives only', () => {
    expect(fits('Power Throw', glaive)).toBe(true);
    expect(fits('Power Throw', skana)).toBe(false);
  });

  it('gives a stance to the melee weapons with its tag', () => {
    expect(fits('Crimson Dervish', skana)).toBe(true);
    expect(fits('Crimson Dervish', glaive)).toBe(false);
    expect(fits('Crimson Dervish', braton)).toBe(false);
  });

  it('gives an augment to its weapon and family, unless the weapon refuses it', () => {
    expect(modFit(mod('Scattered Justice'), hek)).toEqual({ fits: true, augment: true });
    expect(fits('Scattered Justice', weapon('Kuva Hek', 'primary'))).toBe(true);
    // Vaykor Hek has the wiki's SYNDICATEMODBLOCKED tag.
    expect(fits('Scattered Justice', weapon('Vaykor Hek', 'primary'))).toBe(false);
    expect(fits('Scattered Justice', braton)).toBe(false);
    expect(fits('Bright Purity', skana)).toBe(true);
  });
});

describe('slots by weapon', () => {
  it('has an Exilus on Primary, Secondary and Melee only', () => {
    expect(['primary', 'secondary', 'melee'].every((s) => hasExilus(s as never))).toBe(true);
    expect(hasExilus('archgun')).toBe(false);
    expect(hasExilus('archmelee')).toBe(false);
  });

  it('has the arcane slots the game gives each weapon', () => {
    expect(arcaneSlotKinds(braton)).toEqual([['primary'], []]);
    expect(arcaneSlotKinds(hek)).toEqual([['primary', 'shotgun'], []]);
    expect(arcaneSlotKinds(weapon('Paris', 'primary'))).toEqual([['primary', 'bow'], []]);
    expect(arcaneSlotKinds(lex)).toEqual([['secondary'], []]);
    expect(arcaneSlotKinds(mausolon)).toEqual([['primary'], ['secondary']]);
    expect(arcaneSlotKinds(weapon('Veritux', 'archmelee'))).toEqual([[], []]);
  });

  it('knows the Riven type, and which weapons have a progenitor bonus', () => {
    expect(rivenTypeOf(braton)).toBe('Rifle');
    expect(rivenTypeOf(hek)).toBe('Shotgun');
    expect(rivenTypeOf(lex)).toBe('Pistol');
    expect(rivenTypeOf(skana)).toBe('Melee');
    expect(rivenTypeOf(mausolon)).toBe('Archgun');
    expect(rivenTypeOf(weapon('Veritux', 'archmelee'))).toBeNull();
    expect(hasProgenitor('Kuva Hek')).toBe(true);
    expect(hasProgenitor('Tenet Detron')).toBe(true);
    expect(hasProgenitor('Coda Hirudo')).toBe(true);
    expect(hasProgenitor('Hek')).toBe(false);
  });
});

describe('normaliseWeaponArcanes', () => {
  it('keeps weapon arcanes by kind and leaves Warframe arcanes out', () => {
    const arcanes = normaliseWeaponArcanes(fixture('warframes/arcanes') as unknown[]);
    expect(arcanes.find((a) => a.name === 'Primary Merciless')?.kind).toBe('primary');
    expect(arcanes.find((a) => a.name === 'Melee Exposure')?.kind).toBe('melee');
    expect(arcanes.some((a) => a.name === 'Arcane Energize')).toBe(false);
  });
});
