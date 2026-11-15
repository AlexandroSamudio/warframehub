import { describe, expect, it } from 'vitest';
import { parseLuaData } from './wiki-lua.js';
import { buildWeaponWiki } from './wiki-weapons.js';

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
    expect(file.weapons['/Lotus/Weapons/Tenno/Melee/LongSword/LongSword']).toEqual({
      class: 'Sword',
    });
    // An entry whose internal name isn't a game path is only found by its name.
    expect(file.weapons['KuvaGhoulsaw']).toBeUndefined();
    expect(file.byName['Kuva Ghoulsaw']).toEqual({ class: 'Assault Saw' });
  });

  it('skips exalted weapons and the arch-guns’ "(Atmosphere)" entries', () => {
    expect(file.byName['Exalted Blade']).toBeUndefined();
    expect(file.weapons['/Lotus/Weapons/Mausolon']).toEqual({ class: 'Archgun' });
    expect(file.byName['Mausolon (Atmosphere)']).toBeUndefined();
  });

  it('notes its source and date', () => {
    expect(file.source).toMatch(/CC BY-SA/);
    expect(file.generatedAt).toBe('2026-11-15T12:00:00.000Z');
  });
});
