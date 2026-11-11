import type { Goal, GoalResource, GoalsResponse, ItemDrop } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  farmQueue,
  formatAmount,
  formatChance,
  formatMaterials,
  groupDrops,
  materialList,
  splitResources,
  joinNames,
  parseAmount,
  progressPercent,
  relicNames,
} from './goals.ts';

const T = '2026-11-10T18:00:00.000Z';
const drop = (location: string, chance: number | null, rarity: string | null = null): ItemDrop => ({
  location,
  chance,
  rarity,
  relic: / Relic\b/.test(location),
});

function goal(
  id: number,
  name: string,
  parts: [string, number, number, ItemDrop[]?][],
  vaulted: boolean | null = null,
): Goal {
  return {
    id,
    uniqueName: `/Lotus/${name}`,
    name,
    category: 'warframe',
    type: 'Warframe',
    isPrime: vaulted !== null,
    vaulted,
    masteryReq: 0,
    buildTime: null,
    status: 'active',
    parts: parts.map(([n, count, owned, drops]) => ({
      key: `${name}/${n}`,
      name: n,
      count,
      owned,
      drops: drops ?? [],
      craft: null,
      note: '',
      sources: [],
      blueprints: 0,
      crafted: owned,
      craftShort: [],
    })),
    resources: [],
    progress: { done: 0, total: 1 },
    ready: false,
    mastered: false,
    buildShort: [],
    createdAt: T,
    builtAt: null,
    recipeFetchedAt: T,
  };
}

describe('farmQueue', () => {
  it('puts farmable parts first (best chance first) and vaulted parts apart', () => {
    const data: GoalsResponse = {
      active: [
        goal(1, 'Nidus Prime', [['Chassis', 1, 0, [drop('Axi N12 Relic (Radiant)', 10)]]], true),
        goal(2, 'Boar', [['Blueprint', 1, 0, [drop('Duviri/Endless: Tier 6 (Normal)', 1.03)]]]),
        goal(3, 'Nidus', [
          ['Blueprint', 1, 0],
          ['Chassis', 1, 1],
          ['Systems', 1, 0, [drop('Eris/Oestrus (Infested Salvage), Rotation C', 14.29)]],
        ]),
      ],
      built: [],
      shoppingList: [
        { key: 'credits', name: 'Credits', needed: 40000, have: 10000, missing: 30000, goals: [] },
        { key: 'orokin', name: 'Orokin Cell', needed: 5, have: 5, missing: 0, goals: [] },
      ],
      stock: [],
      partStock: [],
      undo: null,
    };
    const q = farmQueue(data);
    expect(q.farmNow.map((p) => `${p.goalName} ${p.name}`)).toEqual([
      'Nidus Systems', // 14.29%
      'Boar Blueprint', // 1.03%
    ]);
    // No drop data: not farmable, so the user keeps a note on where it comes from.
    expect(q.other.map((p) => `${p.goalName} ${p.name}`)).toEqual(['Nidus Blueprint']);
    expect(q.vaulted.map((p) => `${p.goalName} ${p.name}`)).toEqual(['Nidus Prime Chassis']);
    expect(q.resources.map((r) => r.name)).toEqual(['Credits']);
  });
});

describe('formatMaterials', () => {
  it('lists Credits first, then the materials A-Z, with thousands separators', () => {
    expect(
      formatMaterials({
        credits: 15000,
        ingredients: [
          { key: 'p', name: 'Plastids', count: 1400 },
          { key: 'a', name: 'Alloy Plate', count: 5500 },
        ],
      }),
    ).toBe('15,000 Credits · 5,500 Alloy Plate · 1,400 Plastids');
    expect(
      formatMaterials({ credits: 0, ingredients: [{ key: 'x', name: 'Rubedo', count: 3 }] }),
    ).toBe('3 Rubedo');
  });
});

describe('materialList and splitResources', () => {
  it('lists materials as quantity + name pairs, Credits first', () => {
    expect(
      materialList({
        credits: 15000,
        ingredients: [
          { key: 'p', name: 'Plastids', count: 1400 },
          { key: 'a', name: 'Alloy Plate', count: 5500 },
        ],
      }),
    ).toEqual([
      { count: 15000, name: 'Credits' },
      { count: 5500, name: 'Alloy Plate' },
      { count: 1400, name: 'Plastids' },
    ]);
  });

  it("splits resources into the item's own and parts-only, most missing first", () => {
    const r = (name: string, count: number, forParts: number, have = 0): GoalResource => ({
      key: name,
      name,
      count,
      forParts,
      have,
      stock: have,
      drops: [],
    });
    const { forItem, forPartsOnly } = splitResources([
      r('Kuva', 2000, 0),
      r('Credits', 70000, 45000),
      r('Circuits', 3500, 3500),
      r('Plastids', 1000, 1000, 1000),
      r('Orokin Cell', 6, 6),
    ]);
    expect(forItem.map((x) => x.name)).toEqual(['Credits', 'Kuva']); // 70,000 missing, then 2,000
    expect(forPartsOnly.map((x) => x.name)).toEqual(['Circuits', 'Orokin Cell', 'Plastids']);
  });
});

describe('groupDrops', () => {
  it('turns one row per relic refinement into one row per relic', () => {
    const groups = groupDrops([
      drop('Axi N12 Relic (Radiant)', 10, 'Uncommon'),
      drop('Axi N12 Relic (Flawless)', 6, 'Rare'),
      drop('Axi N12 Relic (Exceptional)', 4, 'Rare'),
      drop('Axi N12 Relic (Intact)', 2, 'Rare'),
      drop('Lith N7 Relic (Radiant)', 10),
      drop('Lith N7 Relic', 2),
    ]);
    expect(groups).toEqual([
      {
        kind: 'relic',
        relic: 'Axi N12',
        chances: { Intact: 2, Exceptional: 4, Flawless: 6, Radiant: 10 },
        best: 10,
      },
      {
        kind: 'relic',
        relic: 'Lith N7',
        chances: { Intact: 2, Exceptional: null, Flawless: null, Radiant: 10 },
        best: 10,
      },
    ]);
  });

  it('keeps missions and enemies as they are, best chance first', () => {
    const groups = groupDrops([
      drop('Eris/Oestrus, Rotation A', 7.69, 'Rare'),
      drop('Eris/Oestrus, Rotation C', 14.29, 'Uncommon'),
    ]);
    expect(groups.map((g) => (g.kind === 'place' ? g.location : g.relic))).toEqual([
      'Eris/Oestrus, Rotation C',
      'Eris/Oestrus, Rotation A',
    ]);
  });

  it('lists relic names for the compact vaulted rows', () => {
    expect(
      relicNames([drop('Lith N7 Relic (Radiant)', 10), drop('Axi N12 Relic (Radiant)', 10)]),
    ).toEqual(['Axi N12', 'Lith N7']);
  });
});

describe('formatting', () => {
  it('formats and parses amounts', () => {
    expect(formatAmount(2500000)).toBe('2,500,000');
    expect(parseAmount('2,500,000')).toBe(2500000);
    expect(parseAmount(' 12 ')).toBe(12);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(parseAmount('1.5')).toBeNull();
  });

  it('formats chances', () => {
    expect(formatChance(14.29)).toBe('14.29%');
    expect(formatChance(7.5)).toBe('7.5%');
    expect(formatChance(100)).toBe('100%');
    expect(formatChance(null)).toBe('');
  });

  it('turns progress into a percentage', () => {
    expect(progressPercent({ progress: { done: 3, total: 6 } })).toBe(50);
    expect(progressPercent({ progress: { done: 0, total: 0 } })).toBe(0);
  });

  it('joins goal names in plain English', () => {
    expect(joinNames(['Nidus Prime'])).toBe('Nidus Prime');
    expect(joinNames(['Nidus Prime', 'Boar Prime'])).toBe('Nidus Prime and Boar Prime');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
