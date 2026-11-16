import { describe, expect, it } from 'vitest';
import { parseLuaData } from './wiki-lua.js';
import { buildWeaponWiki, modEntries, rivenStats } from './wiki-weapons.js';

/** The shape of Module:Weapons/data/* (trimmed), as read on 15 Nov 2026. */
const MELEE = `return {
  Skana = { Class = "Sword", InternalName = "/Lotus/Weapons/Tenno/Melee/LongSword/LongSword", Name = "Skana", Range = math.huge },
  ["Kuva Ghoulsaw"] = { Class = "Assault Saw", InternalName = "KuvaGhoulsaw", Name = "Kuva Ghoulsaw" },
  ["Exalted Blade"] = { Class = "Exalted Weapon", InternalName = "/Lotus/Powersuits/Excalibur/Blade", Name = "Exalted Blade" },
}`;
const ARCHWING = `return {
  Mausolon = { Class = "Archgun", Slot = "Archgun", InternalName = "/Lotus/Weapons/Mausolon", Name = "Mausolon" },
  ["Mausolon (Atmosphere)"] = { Class = "Rifle", Slot = "Archgun (Atmosphere)", InternalName = "/Lotus/Weapons/Mausolon", Name = "Mausolon (Atmosphere)" },
}`;

describe('buildWeaponWiki', () => {
  const file = buildWeaponWiki(
    [parseLuaData(MELEE), parseLuaData(ARCHWING)],
    new Date('2026-11-15T12:00:00.000Z'),
  );

  it('keys classes by internal name, and by name as a fallback', () => {
    expect(file.weapons['/Lotus/Weapons/Tenno/Melee/LongSword/LongSword']).toMatchObject({
      class: 'Sword',
    });
    // An entry whose internal name isn't a game path is only found by its name.
    expect(file.weapons['KuvaGhoulsaw']).toBeUndefined();
    expect(file.byName['Kuva Ghoulsaw']).toMatchObject({ class: 'Assault Saw' });
  });

  it('skips exalted weapons and the arch-guns’ "(Atmosphere)" entries', () => {
    expect(file.byName['Exalted Blade']).toBeUndefined();
    expect(file.weapons['/Lotus/Weapons/Mausolon']).toMatchObject({ class: 'Archgun' });
    expect(file.byName['Mausolon (Atmosphere)']).toBeUndefined();
  });

  it('notes its source and date', () => {
    expect(file.source).toMatch(/CC BY-SA/);
    expect(file.generatedAt).toBe('2026-11-15T12:00:00.000Z');
  });
});

describe('modEntries', () => {
  it('reads each mod type and the tags it needs or refuses, by internal name', () => {
    const module = parseLuaData(`return {
      Mods = {
        ["Scattered Justice"] = { InternalName = "/Lotus/Upgrades/Mods/Syndicate/HekMod", Type = "Hek", IncompatibilityTags = { "SYNDICATEMODBLOCKED" } },
        ["Crimson Dervish"] = { InternalName = "/Lotus/Weapons/Tenno/Melee/MeleeTrees/CrimsonDervishMeleeTree", Type = "Swords", CompatibilityTags = { "SWORDS_STANCE" } },
        ["No Type"] = { InternalName = "/Lotus/Upgrades/Mods/X" },
      },
    }`);
    expect(modEntries(module)).toEqual({
      '/Lotus/Upgrades/Mods/Syndicate/HekMod': {
        type: 'Hek',
        tags: [],
        notTags: ['SYNDICATEMODBLOCKED'],
      },
      '/Lotus/Weapons/Tenno/Melee/MeleeTrees/CrimsonDervishMeleeTree': {
        type: 'Swords',
        tags: ['SWORDS_STANCE'],
        notTags: [],
      },
    });
  });
});

describe('rivenStats', () => {
  it('reads one list per type, marking spliced stats and the ones that can be negative', () => {
    const page = [
      '<tabber>',
      '|-|Rifle Attribute Ranges=',
      '{| class="wikitable"',
      '! colspan="8" | Normal Attributes',
      '|-',
      '| style="text-align: left | Critical Damage || 121.5% — 148.5% || a || b || c || -97.2% — -118.8% || -64.2% — -78.4% || ',
      '|-',
      '| style="text-align: left | Punch Through || 2.7m — 3.3m || a || b || c ||  —  ||  —  || ',
      '|-',
      '! colspan="8" | Spliced Attributes',
      '|-',
      '| style="text-align: left | Weakpoint Damage || 227.8% — 278.4% || a || b || c ||  —  ||  —  || ',
      '|}',
      '{| class="wikitable"',
      '| style="text-align: left | Laci || x || x || x || x || x || x || ',
      '|}',
      '|-|Kitgun Attribute Ranges=',
      '{| class="wikitable"',
      '| style="text-align: left | Damage || a || a || a || a || a || a || ',
      '|}',
    ].join('\n');
    expect(rivenStats(page)).toEqual({
      Rifle: [
        { name: 'Critical Damage', negative: true, spliced: false },
        { name: 'Punch Through', negative: false, spliced: false },
        { name: 'Weakpoint Damage', negative: false, spliced: true },
      ],
    });
  });
});
