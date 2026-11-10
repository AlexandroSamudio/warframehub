import type { ItemRecipe } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { buildGoal, shoppingList, type GoalInput } from './goals.js';

const T = new Date('2026-11-10T18:00:00.000Z');

function recipe(
  name: string,
  parts: [string, number][],
  resources: [string, number][],
): ItemRecipe {
  return {
    uniqueName: `/Lotus/${name}`,
    name,
    category: 'warframe',
    type: 'Warframe',
    isPrime: true,
    vaulted: false,
    masteryReq: 0,
    buildTime: 259200,
    parts: parts.map(([n, count]) => ({ key: `${name}/${n}`, name: n, count, drops: [] })),
    resources: resources.map(([n, count]) => ({ key: n.toLowerCase(), name: n, count, drops: [] })),
  };
}

function input(
  id: number,
  r: ItemRecipe,
  owned: [string, number][] = [],
  status: GoalInput['status'] = 'active',
): GoalInput {
  return {
    id,
    status,
    recipe: r,
    owned: new Map(owned.map(([n, c]) => [`${r.name}/${n}`, c])),
    createdAt: T,
    builtAt: status === 'built' ? T : null,
    recipeFetchedAt: T,
  };
}

const nidusPrime = recipe(
  'Nidus Prime',
  [
    ['Blueprint', 1],
    ['Chassis', 1],
    ['Neuroptics', 1],
    ['Systems', 1],
  ],
  [
    ['Credits', 25000],
    ['Orokin Cell', 5],
  ],
);
const boarPrime = recipe(
  'Boar Prime',
  [
    ['Blueprint', 1],
    ['Barrel', 1],
  ],
  [
    ['Credits', 15000],
    ['Orokin Cell', 10],
  ],
);

describe('buildGoal', () => {
  it('counts each part unit and each covered resource', () => {
    const g = buildGoal(input(1, nidusPrime, [['Chassis', 1]]), new Map([['orokin cell', 5]]));
    // 4 parts + 2 resources; Chassis owned, Orokin Cells covered, Credits not.
    expect(g.progress).toEqual({ done: 2, total: 6 });
    expect(g.ready).toBe(false);
    expect(g.parts.find((p) => p.name === 'Chassis')!.owned).toBe(1);
    expect(g.resources.find((r) => r.name === 'Credits')!.have).toBe(0);
  });

  it('is ready when every part is owned and the stock covers this goal', () => {
    const owned: [string, number][] = [
      ['Blueprint', 1],
      ['Chassis', 1],
      ['Neuroptics', 1],
      ['Systems', 1],
    ];
    const stock = new Map([
      ['credits', 30000],
      ['orokin cell', 5],
    ]);
    expect(buildGoal(input(1, nidusPrime, owned), stock)).toMatchObject({
      ready: true,
      progress: { done: 6, total: 6 },
    });
  });

  it('caps an owned count above what the recipe needs (e.g. after a recipe update)', () => {
    const g = buildGoal(input(1, nidusPrime, [['Chassis', 3]]), new Map());
    expect(g.parts.find((p) => p.name === 'Chassis')!.owned).toBe(1);
  });
});

describe('shoppingList', () => {
  it('adds up shared resources across active goals, minus the shared stock', () => {
    const stock = new Map([['orokin cell', 12]]);
    const goals = [buildGoal(input(1, nidusPrime), stock), buildGoal(input(2, boarPrime), stock)];
    const list = shoppingList(goals, stock);
    expect(list.find((r) => r.name === 'Orokin Cell')).toEqual({
      key: 'orokin cell',
      name: 'Orokin Cell',
      needed: 15,
      have: 12,
      missing: 3,
      goals: [
        { id: 1, name: 'Nidus Prime', count: 5 },
        { id: 2, name: 'Boar Prime', count: 10 },
      ],
    });
    // Stock is counted once, not once per goal.
    expect(list.find((r) => r.name === 'Credits')).toMatchObject({ needed: 40000, missing: 40000 });
  });

  it('ignores built goals and lists the most missing first', () => {
    const stock = new Map<string, number>();
    const goals = [
      buildGoal(input(1, nidusPrime), stock),
      buildGoal(input(2, boarPrime, [], 'built'), stock),
    ];
    const list = shoppingList(goals, stock);
    expect(list.map((r) => [r.name, r.needed])).toEqual([
      ['Credits', 25000],
      ['Orokin Cell', 5],
    ]);
  });

  it('a covered resource stays on the list with nothing missing', () => {
    const stock = new Map([['orokin cell', 50]]);
    const list = shoppingList([buildGoal(input(1, nidusPrime), stock)], stock);
    expect(list.find((r) => r.name === 'Orokin Cell')).toMatchObject({ missing: 0, have: 50 });
  });
});
