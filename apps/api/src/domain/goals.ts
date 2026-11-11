import type { Goal, GoalResource, GoalStatus, ItemRecipe, ShoppingRow } from '@warframehub/shared';
import {
  buildDeltas,
  craftDeltas,
  partStockName,
  shortfalls,
  type Inventory,
} from './inventory.js';

/**
 * Goal planner logic (SPEC §13), as pure functions:
 * - parts are shared entities like resources (blueprints and finished parts); `owned` is
 *   this goal's share of the finished parts (see `sharePartStock` in ./inventory.ts);
 * - a part you don't have yet needs its own crafting materials (Foundry), which count
 *   as resources for the goal until you own the part;
 * - resources are one shared stock ("I have 12 Orokin Cells"), handed out to active goals
 *   in goal order, and the shopping list adds up what all active goals still need.
 */

export interface GoalInput {
  id: number;
  status: GoalStatus;
  recipe: ItemRecipe;
  /** componentKey → this goal's share of the finished parts. Missing keys mean 0. */
  owned: Map<string, number>;
  /** The whole shared inventory, for the part amounts and what Craft/Build would need. */
  inventory?: Inventory;
  /** componentKey → the user's note. Missing keys mean no note. */
  notes?: Map<string, string>;
  createdAt: Date;
  builtAt: Date | null;
  recipeFetchedAt: Date;
  /** From the imported profile; false when there is none. */
  mastered?: boolean;
}

/** resourceKey → amount. Missing keys mean 0. */
export type Stock = Map<string, number>;

/** One resource a goal needs: its own recipe plus the crafting of parts not owned yet. */
export interface Demand {
  key: string;
  name: string;
  /** Total needed (own recipe + parts). */
  count: number;
  /** The part of `count` that is for crafting parts you don't have yet. */
  forParts: number;
  drops: GoalResource['drops'];
}

function ownedOf(input: GoalInput, key: string, count: number): number {
  return Math.min(input.owned.get(key) ?? 0, count);
}

/**
 * Everything the goal still needs, by resource: its own recipe first (in recipe order),
 * then materials that only parts need (A–Z). A part you own adds nothing. Credits merge
 * into the recipe's own Credits line.
 */
export function demands(input: GoalInput): Demand[] {
  const out = new Map<string, Demand>();
  for (const r of input.recipe.resources) {
    out.set(r.key, { key: r.key, name: r.name, count: r.count, forParts: 0, drops: r.drops });
  }
  const add = (key: string, name: string, amount: number) => {
    const d = out.get(key) ?? { key, name, count: 0, forParts: 0, drops: [] };
    d.count += amount;
    d.forParts += amount;
    out.set(key, d);
  };
  for (const part of input.recipe.parts) {
    const units = part.count - ownedOf(input, part.key, part.count);
    if (units <= 0 || !part.craft) continue;
    if (part.craft.credits > 0) add('credits', 'Credits', units * part.craft.credits);
    for (const i of part.craft.ingredients) add(i.key, i.name, units * i.count);
  }
  const own = input.recipe.resources.map((r) => out.get(r.key)!);
  const partOnly = [...out.values()]
    .filter((d) => !input.recipe.resources.some((r) => r.key === d.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...own, ...partOnly];
}

/**
 * Builds one goal. `share` is how much of each resource this goal may count; for active
 * goals it comes from {@link buildGoals}, which hands the shared stock out in goal order.
 */
export function buildGoal(input: GoalInput, stock: Stock, share: Stock = stock): Goal {
  const { recipe } = input;
  const inv: Inventory = input.inventory ?? {
    resources: stock,
    blueprints: new Map(),
    crafted: new Map(),
  };
  const parts = recipe.parts.map((p) => ({
    ...p,
    owned: ownedOf(input, p.key, p.count),
    note: input.notes?.get(p.key) ?? '',
    blueprints: inv.blueprints.get(p.key) ?? 0,
    crafted: inv.crafted.get(p.key) ?? 0,
    craftShort: p.craft
      ? shortfalls(
          craftDeltas({ key: p.key, name: partStockName(recipe.name, p.name) }, p.craft),
          inv,
        )
      : [],
  }));
  const needs = demands(input);
  const resources: GoalResource[] = needs.map((d) => ({
    key: d.key,
    name: d.name,
    count: d.count,
    drops: d.drops,
    forParts: d.forParts,
    have: Math.min(share.get(d.key) ?? 0, d.count),
    stock: stock.get(d.key) ?? 0,
  }));

  // Progress counts each part unit and each resource of the item's own recipe, so the
  // total doesn't change as you get parts. A resource counts once its whole need
  // (including parts still to craft) is covered. Once every part is owned, forParts is 0.
  const ownIds = new Set(recipe.resources.map((r) => r.key));
  const ownLines = resources.filter((r) => ownIds.has(r.key));
  const total = parts.reduce((n, p) => n + p.count, 0) + ownLines.length;
  const done =
    parts.reduce((n, p) => n + p.owned, 0) + ownLines.filter((r) => r.have >= r.count).length;

  return {
    id: input.id,
    uniqueName: recipe.uniqueName,
    name: recipe.name,
    category: recipe.category,
    type: recipe.type,
    isPrime: recipe.isPrime,
    vaulted: recipe.vaulted,
    masteryReq: recipe.masteryReq,
    buildTime: recipe.buildTime,
    status: input.status,
    parts,
    resources,
    progress: { done, total },
    ready: done === total,
    mastered: input.mastered ?? false,
    buildShort: input.status === 'active' ? shortfalls(buildDeltas(recipe), inv) : [],
    createdAt: input.createdAt.toISOString(),
    builtAt: input.builtAt ? input.builtAt.toISOString() : null,
    recipeFetchedAt: input.recipeFetchedAt.toISOString(),
  };
}

/**
 * Builds every goal, handing the shared stock to active goals in the order given (the
 * user's priority): the first goal takes what it needs, the next gets what's left.
 * Built goals don't take a share; they just show the stock.
 */
export function buildGoals(inputs: GoalInput[], stock: Stock): Goal[] {
  const left = new Map(stock);
  return inputs.map((input) => {
    if (input.status !== 'active') return buildGoal(input, stock);
    const share: Stock = new Map();
    for (const d of demands(input)) {
      const take = Math.min(left.get(d.key) ?? 0, d.count);
      share.set(d.key, take);
      left.set(d.key, (left.get(d.key) ?? 0) - take);
    }
    return buildGoal(input, stock, share);
  });
}

/**
 * Every resource the active goals need, added up across goals, minus the shared stock.
 * Most missing first, then A–Z. Built goals don't count.
 */
export function shoppingList(goals: Goal[], stock: Stock): ShoppingRow[] {
  const rows = new Map<string, ShoppingRow>();
  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    for (const r of goal.resources) {
      const row = rows.get(r.key) ?? {
        key: r.key,
        name: r.name,
        needed: 0,
        have: stock.get(r.key) ?? 0,
        missing: 0,
        goals: [],
      };
      row.needed += r.count;
      row.goals.push({ id: goal.id, name: goal.name, count: r.count });
      rows.set(r.key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({ ...row, missing: Math.max(0, row.needed - row.have) }))
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));
}
