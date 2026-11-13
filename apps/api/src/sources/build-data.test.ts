import { describe, expect, it } from 'vitest';
import {
  buildsVariant,
  effectText,
  helminthOptions,
  normaliseArcanes,
  normaliseMods,
} from './build-data.js';
import { fixture } from './test-fixtures.js';
import { groupWarframes, RawWarframe, warframeNames } from './warframes.js';

const MODS = () => fixture('warframes/mods') as unknown[];
const ARCANES = () => fixture('warframes/arcanes') as unknown[];
const groups = () =>
  groupWarframes((fixture('warframes/warframes') as unknown[]).map((r) => RawWarframe.parse(r)));
const group = (slug: string) => groups().find((g) => g.slug === slug)!;

describe('effect text', () => {
  it('turns escaped line breaks into lines, strips tags and drops repeats', () => {
    expect(
      effectText(['On Energy Pickup:\\n+1 Arcane Revive', '<LOWER_IS_BETTER>+1 Arcane Revive']),
    ).toBe('On Energy Pickup:\n+1 Arcane Revive');
  });
});

describe('mods for builds', () => {
  const mods = normaliseMods(MODS(), warframeNames(fixture('warframes/warframes') as unknown[]));
  const named = (name: string) => mods.filter((m) => m.name === name);

  it('keeps one Intensify: the normal mod, not the Flawed or stray Expert copies', () => {
    expect(named('Intensify')).toHaveLength(1);
    expect(named('Intensify')[0]).toMatchObject({
      uniqueName: '/Lotus/Upgrades/Mods/Warframe/AvatarAbilityStrengthMod',
      maxRank: 5,
      polarity: 'madurai',
    });
    expect(named('Intensify')[0]!.effects.at(-1)).toBe('+30% Ability Strength');
  });

  it('keeps Primed, Umbral and Archon mods, which have their own names', () => {
    expect(named('Primed Flow')[0]!.maxRank).toBe(10);
    expect(named('Umbral Intensify')).toHaveLength(1);
    expect(named('Archon Intensify')).toHaveLength(1);
  });

  it('marks auras and Exilus mods', () => {
    expect(named('Growing Power')[0]).toMatchObject({ aura: true, exilus: false });
    expect(named('Power Drift')[0]).toMatchObject({ aura: false, exilus: true });
    expect(named("Mesa's Waltz")[0]).toMatchObject({ exilus: true, augmentFor: 'Mesa' });
  });

  it('leaves out Conclave-only, Parazon and weapon mods', () => {
    expect(named('Adept Surge')).toEqual([]);
    expect(named('Intruder')).toEqual([]);
    expect(named('Serration')).toEqual([]);
  });

  it('keeps one Health Conversion and one Adaptation', () => {
    expect(named('Health Conversion')[0]!.uniqueName).toContain('/Mods/Warframe/');
    expect(named('Adaptation')[0]!.uniqueName).toContain('/Mods/Warframe/');
  });

  it('is A-Z', () => {
    const names = mods.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('arcanes for builds', () => {
  const arcanes = normaliseArcanes(ARCANES());

  it('keeps Warframe arcanes once, with their ranks', () => {
    expect(arcanes.map((a) => a.name)).toEqual([
      'Arcane Avenger',
      'Arcane Defense',
      'Arcane Energize',
      'Arcane Grace',
      'Arcane Steadfast',
      'Molt Augmented',
    ]);
    const energize = arcanes.find((a) => a.name === 'Arcane Energize')!;
    expect(energize.maxRank).toBe(5);
    expect(energize.effects[5]).toContain('replenish 150 Energy');
  });
});

describe('which version owns the builds', () => {
  it('is the Prime when there is one', () => {
    expect(buildsVariant(group('mesa')).raw.name).toBe('Mesa Prime');
    expect(buildsVariant(group('nidus')).raw.name).toBe('Nidus Prime');
  });

  it('is Excalibur Umbra, since Excalibur Prime cannot be had', () => {
    expect(buildsVariant(group('excalibur')).raw.name).toBe('Excalibur Umbra');
  });

  it('is the normal version when there is no Prime', () => {
    const mesa = group('mesa');
    const normalOnly = { ...mesa, variants: mesa.variants.filter((v) => v.kind === 'normal') };
    expect(buildsVariant(normalOnly).raw.name).toBe('Mesa');
  });
});

describe('Helminth abilities', () => {
  const options = helminthOptions(groups());

  it("lists subsumable Warframe abilities with their Warframe, and Helminth's own", () => {
    expect(options.find((o) => o.name === 'Larva')).toMatchObject({ from: 'Nidus' });
    expect(options.find((o) => o.name === 'Shooting Gallery')).toMatchObject({ from: 'Mesa' });
    expect(options.find((o) => o.name === 'Peacemaker')).toBeUndefined();
    expect(options.find((o) => o.name === 'Empower')).toMatchObject({ from: 'Helminth' });
    expect(options.filter((o) => o.from === 'Helminth').length).toBeGreaterThanOrEqual(10);
  });
});
