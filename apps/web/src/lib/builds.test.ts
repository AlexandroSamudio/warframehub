import type { ModOption } from '@warframehub/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emptyContent,
  fitsSlot,
  formatSaved,
  modChoices,
  rememberedTab,
  rememberTab,
  shardGroups,
  sourceHost,
} from './builds.ts';

function mod(name: string, extra: Partial<ModOption> = {}): ModOption {
  return {
    uniqueName: `/mods/${name}`,
    name,
    polarity: 'madurai',
    rarity: 'Rare',
    image: null,
    maxRank: 5,
    aura: false,
    exilus: false,
    augmentFor: null,
    effects: [],
    ...extra,
  };
}

const MODS = [
  mod('Flow'),
  mod('Primed Flow', { maxRank: 10 }),
  mod('Growing Power', { aura: true }),
  mod('Power Drift', { exilus: true }),
  mod('Streamline'),
];

describe('slots', () => {
  it('puts auras only in the aura slot, and Exilus mods in Exilus or normal slots', () => {
    expect(fitsSlot(MODS[2]!, 'aura')).toBe(true);
    expect(fitsSlot(MODS[2]!, 'slot')).toBe(false);
    expect(fitsSlot(MODS[0]!, 'aura')).toBe(false);
    expect(fitsSlot(MODS[3]!, 'exilus')).toBe(true);
    expect(fitsSlot(MODS[3]!, 'slot')).toBe(true);
    expect(fitsSlot(MODS[0]!, 'exilus')).toBe(false);
  });

  it('offers what fits, not already used, names starting with the query first', () => {
    const used = new Set(['/mods/Streamline']);
    expect(modChoices(MODS, 'slot', used, '').map((m) => m.name)).toEqual([
      'Flow',
      'Primed Flow',
      'Power Drift',
    ]);
    expect(modChoices(MODS, 'slot', used, 'flow').map((m) => m.name)).toEqual([
      'Flow',
      'Primed Flow',
    ]);
    // "f" starts Flow, and is only inside Primed Flow and Power Drift.
    expect(modChoices(MODS, 'slot', used, 'f').map((m) => m.name)).toEqual([
      'Flow',
      'Primed Flow',
      'Power Drift',
    ]);
    expect(modChoices(MODS, 'slot', used, 'pow').map((m) => m.name)).toEqual(['Power Drift']);
  });

  it('also finds mods by their effect, after name matches', () => {
    const mods = [
      mod('Intensify', { effects: ['+5%', '+30% Ability Strength'] }),
      mod('Strength Drift', { effects: ['+15% Ability Strength'] }),
      mod('Flow', { effects: ['+150% Energy Max'] }),
    ];
    expect(modChoices(mods, 'slot', new Set(), 'strength').map((m) => m.name)).toEqual([
      'Strength Drift',
      'Intensify',
    ]);
  });

  it("lists this Warframe's augments first when nothing is typed", () => {
    const mods = [mod('Flow'), mod("Mesa's Waltz", { augmentFor: 'Mesa' }), mod('Intensify')];
    expect(modChoices(mods, 'slot', new Set(), '').map((m) => m.name)).toEqual([
      "Mesa's Waltz",
      'Flow',
      'Intensify',
    ]);
    expect(modChoices(MODS, 'aura', new Set(), '').map((m) => m.name)).toEqual(['Growing Power']);
  });
});

describe('display', () => {
  it('names the source by its host', () => {
    expect(sourceHost('https://www.overframe.gg/build/1/')).toBe('overframe.gg');
    expect(sourceHost('https://youtu.be/abc')).toBe('youtu.be');
  });

  it('shows the saved date in the given zone', () => {
    expect(formatSaved('2026-11-14T01:00:00.000Z', 'America/Argentina/Buenos_Aires')).toBe(
      '13 Nov 2026',
    );
    expect(formatSaved('2026-11-14T01:00:00.000Z', 'UTC')).toBe('14 Nov 2026');
  });

  it('starts a build with 8 empty slots and 2 empty arcanes', () => {
    const c = emptyContent();
    expect(c.slots).toHaveLength(8);
    expect(c.arcanes).toEqual([null, null]);
  });

  it('groups every shard stat under its colour', () => {
    const groups = shardGroups();
    expect(groups.map((g) => g.stats.length)).toEqual([5, 5, 5, 4, 4, 4]);
  });
});

describe('remembered tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('remembers the last build per Warframe', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(rememberedTab('mesa')).toBeNull();
    rememberTab('mesa', 4);
    expect(rememberedTab('mesa')).toBe(4);
    expect(rememberedTab('nidus')).toBeNull();
  });

  it('works without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberTab('mesa', 4)).not.toThrow();
    expect(rememberedTab('mesa')).toBeNull();
  });
});

describe('search in both languages', () => {
  it('finds a Spanish-named mod by its English name too', () => {
    const mods = [
      mod('Intensificación', { alias: 'Intensify' }),
      mod('Flujo', { alias: 'Flow' }),
      mod('Flujo primordial', { alias: 'Primed Flow' }),
    ];
    const names = (q: string) => modChoices(mods, 'slot', new Set(), q).map((m) => m.name);
    expect(names('intens')).toEqual(['Intensificación']);
    expect(names('flujo')).toEqual(['Flujo', 'Flujo primordial']);
    expect(names('flow')).toEqual(['Flujo', 'Flujo primordial']);
  });
});
