import type { GoalStatus, ItemRecipe, PartCraft, Shortfall } from '@warframehub/shared';

/**
 * Inventory logic (SPEC §13.4), as pure functions. Resources and parts are shared
 * entities with an amount. Crafting a part uses up its blueprint, Credits and materials and
 * adds one finished part; building the item uses up its parts (the main blueprint too,
 * unless it's reusable) and its own resources. Warframe wiki, "Foundry", checked 11 Nov 2026:
 * "Most blueprints may only be used to craft an item once, whereupon it is consumed."
 */

export type DeltaKind = 'resource' | 'blueprint' | 'crafted';

/** One change to one amount. Negative takes out, positive adds. */
export interface Delta {
  kind: DeltaKind;
  key: string;
  name: string;
  amount: number;
}

/** Current amounts. Missing keys mean 0. */
export interface Inventory {
  resources: Map<string, number>;
  blueprints: Map<string, number>;
  crafted: Map<string, number>;
}

const MAP: Record<DeltaKind, keyof Inventory> = {
  resource: 'resources',
  blueprint: 'blueprints',
  crafted: 'crafted',
};

/** "Nidus Prime" + "Chassis" → "Nidus Prime Chassis" (the name the game uses). */
export function partStockName(itemName: string, partName: string): string {
  return `${itemName} ${partName}`;
}

/** Adds deltas for the same kind and key together, keeping the first order. */
function merge(deltas: Delta[]): Delta[] {
  const out = new Map<string, Delta>();
  for (const d of deltas) {
    const id = `${d.kind}:${d.key}`;
    const prev = out.get(id);
    if (prev) prev.amount += d.amount;
    else out.set(id, { ...d });
  }
  return [...out.values()].filter((d) => d.amount !== 0);
}

/** One Craft: blueprint −1, finished part +1, Credits and materials out. */
export function craftDeltas(part: { key: string; name: string }, craft: PartCraft): Delta[] {
  return merge([
    { kind: 'blueprint', key: part.key, name: part.name, amount: -1 },
    { kind: 'crafted', key: part.key, name: part.name, amount: 1 },
    ...(craft.credits > 0
      ? [{ kind: 'resource' as const, key: 'credits', name: 'Credits', amount: -craft.credits }]
      : []),
    ...craft.ingredients.map((i) => ({
      kind: 'resource' as const,
      key: i.key,
      name: i.name,
      amount: -i.count,
    })),
  ]);
}

/** "Mark as built": every part (the main blueprint unless reusable) and the item's resources. */
export function buildDeltas(recipe: ItemRecipe): Delta[] {
  return merge([
    ...recipe.parts
      .filter((p) => !(recipe.blueprintReusable && p.name === 'Blueprint'))
      .map((p) => ({
        kind: 'crafted' as const,
        key: p.key,
        name: partStockName(recipe.name, p.name),
        amount: -p.count,
      })),
    ...recipe.resources.map((r) => ({
      kind: 'resource' as const,
      key: r.key,
      name: r.name,
      amount: -r.count,
    })),
  ]);
}

function amountOf(inv: Inventory, d: Pick<Delta, 'kind' | 'key'>): number {
  return inv[MAP[d.kind]].get(d.key) ?? 0;
}

/** What's short for these deltas. Empty means they can be applied. */
export function shortfalls(deltas: Delta[], inv: Inventory): Shortfall[] {
  const out: Shortfall[] = [];
  for (const d of merge(deltas)) {
    if (d.amount >= 0) continue;
    const missing = -d.amount - amountOf(inv, d);
    if (missing > 0) {
      out.push({
        kind: d.kind === 'resource' ? 'resource' : d.kind === 'blueprint' ? 'blueprint' : 'part',
        key: d.key,
        name: d.name,
        missing,
      });
    }
  }
  return out;
}

/** The deltas that put everything back. */
export function invert(deltas: Delta[]): Delta[] {
  return deltas.map((d) => ({ ...d, amount: -d.amount }));
}

/** New amounts after the deltas (never below 0), as a list of what to write. */
export function applyDeltas(
  deltas: Delta[],
  inv: Inventory,
): { kind: DeltaKind; key: string; name: string; amount: number }[] {
  return merge(deltas).map((d) => ({ ...d, amount: Math.max(0, amountOf(inv, d) + d.amount) }));
}

export interface PartDemand {
  goalId: number;
  status: GoalStatus;
  parts: { key: string; count: number }[];
}

/**
 * Each goal's share of the finished parts, handed out in goal order like resources: the
 * first active goal takes what it needs, the next gets what's left. A built goal used its
 * parts up, so it counts them all.
 */
export function sharePartStock(
  goals: PartDemand[],
  crafted: Map<string, number>,
): Map<number, Map<string, number>> {
  const left = new Map(crafted);
  const out = new Map<number, Map<string, number>>();
  for (const g of goals) {
    const share = new Map<string, number>();
    for (const p of g.parts) {
      if (g.status !== 'active') {
        share.set(p.key, p.count);
        continue;
      }
      const take = Math.min(left.get(p.key) ?? 0, p.count);
      share.set(p.key, take);
      left.set(p.key, (left.get(p.key) ?? 0) - take);
    }
    out.set(g.goalId, share);
  }
  return out;
}
