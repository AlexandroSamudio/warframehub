import type { Goal, GoalsResponse } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { inventoryEmpty, inventoryView } from './inventory.ts';

const T = '2026-11-11T12:00:00.000Z';

function part(
  name: string,
  opts: { craft?: boolean; owned?: number; blueprints?: number; crafted?: number } = {},
) {
  return {
    key: `/P/${name}`,
    name,
    count: 1,
    drops: [],
    craft: opts.craft ? { credits: 15_000, ingredients: [] } : null,
    sources: [],
    owned: opts.owned ?? 0,
    note: '',
    blueprints: opts.blueprints ?? 0,
    crafted: opts.crafted ?? 0,
    craftShort: [],
  };
}

function goal(id: number, name: string, parts: ReturnType<typeof part>[]): Goal {
  return {
    id,
    uniqueName: `/W/${name}`,
    name,
    category: 'warframe',
    type: 'Warframe',
    isPrime: false,
    vaulted: null,
    masteryReq: null,
    buildTime: null,
    status: 'active',
    parts,
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

const row = (key: string, name: string, needed: number, have: number) => ({
  key,
  name,
  needed,
  have,
  missing: Math.max(0, needed - have),
  goals: [],
});

const DATA: GoalsResponse = {
  active: [
    goal(1, 'Nidus', [part('Blueprint'), part('Chassis', { craft: true, blueprints: 1 })]),
    goal(2, 'Boar', [part('Barrel', { owned: 1, crafted: 1 })]),
  ],
  built: [],
  shoppingList: [row('r', 'Rubedo', 50, 32), row('c', 'Credits', 70_000, 0)],
  stock: [
    { key: 'r', name: 'Rubedo', amount: 32 },
    { key: 'k', name: 'Kuva', amount: 1_000 },
    { key: 'z', name: 'Zero', amount: 0 },
  ],
  partStock: [
    { key: '/P/Chassis', name: 'Nidus Chassis', blueprints: 1, crafted: 0, craftable: true },
    { key: '/P/Old', name: 'Old Neuroptics', blueprints: 0, crafted: 1, craftable: true },
  ],
  undo: null,
};

describe('inventoryView', () => {
  it('lists needed resources A-Z and parts by goal', () => {
    const v = inventoryView(DATA);
    expect(v.resources.map((r) => r.name)).toEqual(['Credits', 'Rubedo']);
    expect(
      v.parts.map((g) => [g.goalName, g.rows.map((p) => [p.name, p.twoStep, p.done])]),
    ).toEqual([
      [
        'Nidus',
        [
          ['Nidus Blueprint', false, false],
          ['Nidus Chassis', true, false],
        ],
      ],
      ['Boar', [['Boar Barrel', false, true]]],
    ]);
  });

  it('says what to do next for each part', () => {
    const v = inventoryView(DATA);
    expect(v.parts.flatMap((g) => g.rows.map((p) => [p.name, p.next]))).toEqual([
      ['Nidus Blueprint', { kind: 'toGo', n: 1 }],
      ['Nidus Chassis', { kind: 'craft' }],
      ['Boar Barrel', { kind: 'done' }],
    ]);
  });

  it('keeps saved amounts no goal needs apart (and skips zeros)', () => {
    const v = inventoryView(DATA);
    expect(v.idleResources.map((r) => r.name)).toEqual(['Kuva']);
    expect(v.idleParts.map((p) => p.name)).toEqual(['Old Neuroptics']);
  });

  it('filters every group by name, case-insensitively', () => {
    const v = inventoryView(DATA, ' CHASS ');
    expect(v.resources).toEqual([]);
    expect(v.parts.map((g) => g.rows.map((p) => p.name))).toEqual([['Nidus Chassis']]);
    expect(v.idleResources).toEqual([]);
    expect(inventoryView(DATA, 'kuva').idleResources.map((r) => r.name)).toEqual(['Kuva']);
  });
});

describe('inventoryEmpty', () => {
  it('is true only with no goals and nothing saved', () => {
    expect(inventoryEmpty(DATA)).toBe(false);
    expect(
      inventoryEmpty({
        active: [],
        built: [],
        shoppingList: [],
        stock: [],
        partStock: [],
        undo: null,
      }),
    ).toBe(true);
  });
});
