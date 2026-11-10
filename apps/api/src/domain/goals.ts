import type { Goal, GoalStatus, ItemRecipe, ShoppingRow } from '@warframehub/shared';

/**
 * Goal planner logic (SPEC §13), as pure functions:
 * - parts are owned per goal (a Nidus Chassis only counts for that Nidus);
 * - resources are one shared stock ("I have 12 Orokin Cells"), so a goal is ready when
 *   the stock covers that goal on its own, and the shopping list adds up what all
 *   active goals still need.
 */

export interface GoalInput {
  id: number;
  status: GoalStatus;
  recipe: ItemRecipe;
  /** componentKey → how many the user has. Missing keys mean 0. */
  owned: Map<string, number>;
  createdAt: Date;
  builtAt: Date | null;
  recipeFetchedAt: Date;
}

/** resourceKey → amount. Missing keys mean 0. */
export type Stock = Map<string, number>;

/**
 * Builds one goal. `share` is how much of each resource this goal may count; for active
 * goals it comes from {@link buildGoals}, which hands the shared stock out in goal order.
 */
export function buildGoal(input: GoalInput, stock: Stock, share: Stock = stock): Goal {
  const { recipe } = input;
  const parts = recipe.parts.map((p) => ({
    ...p,
    owned: Math.min(input.owned.get(p.key) ?? 0, p.count),
  }));
  const resources = recipe.resources.map((r) => ({
    ...r,
    have: Math.min(share.get(r.key) ?? 0, r.count),
    stock: stock.get(r.key) ?? 0,
  }));

  // Each part unit counts once; each resource counts once when the stock covers it.
  const total = parts.reduce((n, p) => n + p.count, 0) + resources.length;
  const done =
    parts.reduce((n, p) => n + p.owned, 0) + resources.filter((r) => r.have >= r.count).length;

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
    for (const r of input.recipe.resources) {
      const take = Math.min(left.get(r.key) ?? 0, r.count);
      share.set(r.key, take);
      left.set(r.key, (left.get(r.key) ?? 0) - take);
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
