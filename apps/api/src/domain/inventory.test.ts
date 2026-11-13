import type { ItemRecipe } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  applyDeltas,
  buildDeltas,
  craftDeltas,
  invert,
  sharePartStock,
  shortfalls,
  type Inventory,
} from './inventory.js';

const CHASSIS = { key: '/P/NidusPrimeChassis', name: 'Nidus Prime Chassis' };
const CRAFT = {
  credits: 15_000,
  ingredients: [
    { key: '/R/Rubedo', name: 'Rubedo', count: 50 },
    { key: '/R/Plastids', name: 'Plastids', count: 300 },
  ],
};

function inv(parts: Partial<Record<keyof Inventory, [string, number][]>> = {}): Inventory {
  return {
    resources: new Map(parts.resources ?? []),
    blueprints: new Map(parts.blueprints ?? []),
    crafted: new Map(parts.crafted ?? []),
  };
}

const RECIPE: ItemRecipe = {
  image: null,
  uniqueName: '/W/NidusPrime',
  name: 'Nidus Prime',
  category: 'warframe',
  type: 'Warframe',
  isPrime: true,
  vaulted: false,
  masteryReq: 0,
  buildTime: 259_200,
  blueprintReusable: false,
  parts: [
    {
      key: '/P/NidusPrimeBlueprint',
      name: 'Blueprint',
      count: 1,
      drops: [],
      craft: null,
      sources: [],
    },
    { key: CHASSIS.key, name: 'Chassis', count: 1, drops: [], craft: CRAFT, sources: [] },
  ],
  resources: [
    { key: '/R/OrokinCell', name: 'Orokin Cell', count: 5, drops: [] },
    { key: 'credits', name: 'Credits', count: 25_000, drops: [] },
  ],
};

describe('craftDeltas', () => {
  it('uses the blueprint, Credits and materials, and adds one part', () => {
    expect(craftDeltas(CHASSIS, CRAFT)).toEqual([
      { kind: 'blueprint', key: CHASSIS.key, name: CHASSIS.name, amount: -1 },
      { kind: 'crafted', key: CHASSIS.key, name: CHASSIS.name, amount: 1 },
      { kind: 'resource', key: 'credits', name: 'Credits', amount: -15_000 },
      { kind: 'resource', key: '/R/Rubedo', name: 'Rubedo', amount: -50 },
      { kind: 'resource', key: '/R/Plastids', name: 'Plastids', amount: -300 },
    ]);
  });
});

describe('shortfalls', () => {
  const enough = inv({
    blueprints: [[CHASSIS.key, 1]],
    resources: [
      ['credits', 15_000],
      ['/R/Rubedo', 50],
      ['/R/Plastids', 300],
    ],
  });

  it('is empty with exactly enough', () => {
    expect(shortfalls(craftDeltas(CHASSIS, CRAFT), enough)).toEqual([]);
  });

  it('names what is short and by how much', () => {
    const short = inv({ resources: [['/R/Rubedo', 32]] });
    expect(shortfalls(craftDeltas(CHASSIS, CRAFT), short)).toEqual([
      { kind: 'blueprint', key: CHASSIS.key, name: CHASSIS.name, missing: 1 },
      { kind: 'resource', key: 'credits', name: 'Credits', missing: 15_000 },
      { kind: 'resource', key: '/R/Rubedo', name: 'Rubedo', missing: 18 },
      { kind: 'resource', key: '/R/Plastids', name: 'Plastids', missing: 300 },
    ]);
  });
});

describe('buildDeltas', () => {
  it('uses every part, the main blueprint and the item resources', () => {
    expect(buildDeltas(RECIPE).map((d) => [d.kind, d.name, d.amount])).toEqual([
      ['crafted', 'Nidus Prime Blueprint', -1],
      ['crafted', 'Nidus Prime Chassis', -1],
      ['resource', 'Orokin Cell', -5],
      ['resource', 'Credits', -25_000],
    ]);
  });

  it('keeps a reusable main blueprint', () => {
    const names = buildDeltas({ ...RECIPE, blueprintReusable: true }).map((d) => d.name);
    expect(names).not.toContain('Nidus Prime Blueprint');
    expect(names).toContain('Nidus Prime Chassis');
  });
});

describe('applyDeltas and invert', () => {
  it('undoing a craft puts every amount back', () => {
    const start = inv({
      blueprints: [[CHASSIS.key, 2]],
      crafted: [[CHASSIS.key, 0]],
      resources: [
        ['credits', 20_000],
        ['/R/Rubedo', 60],
        ['/R/Plastids', 300],
      ],
    });
    const deltas = craftDeltas(CHASSIS, CRAFT);
    const after = applyDeltas(deltas, start);
    expect(after.map((r) => [r.kind, r.key, r.amount])).toEqual([
      ['blueprint', CHASSIS.key, 1],
      ['crafted', CHASSIS.key, 1],
      ['resource', 'credits', 5_000],
      ['resource', '/R/Rubedo', 10],
      ['resource', '/R/Plastids', 0],
    ]);
    const mid = inv({
      blueprints: [[CHASSIS.key, 1]],
      crafted: [[CHASSIS.key, 1]],
      resources: [
        ['credits', 5_000],
        ['/R/Rubedo', 10],
        ['/R/Plastids', 0],
      ],
    });
    expect(applyDeltas(invert(deltas), mid).map((r) => r.amount)).toEqual([2, 0, 20_000, 60, 300]);
  });

  it('never goes below 0', () => {
    expect(applyDeltas(craftDeltas(CHASSIS, CRAFT), inv())[0]!.amount).toBe(0);
  });
});

describe('sharePartStock', () => {
  it('hands finished parts out in goal order; built goals count all theirs', () => {
    const shares = sharePartStock(
      [
        { goalId: 1, status: 'active', parts: [{ key: 'k', count: 1 }] },
        { goalId: 2, status: 'active', parts: [{ key: 'k', count: 2 }] },
        { goalId: 3, status: 'built', parts: [{ key: 'k', count: 1 }] },
      ],
      new Map([['k', 2]]),
    );
    expect(shares.get(1)!.get('k')).toBe(1);
    expect(shares.get(2)!.get('k')).toBe(1);
    expect(shares.get(3)!.get('k')).toBe(1);
  });
});
