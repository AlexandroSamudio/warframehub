import type { GoalsResponse, PartStockRow, ShoppingRow, StockRow } from '@warframehub/shared';

/** One part on the Inventory screen. Its amounts are the shared stock. */
export interface InventoryPart {
  key: string;
  /** "Nidus Prime Chassis" */
  name: string;
  /** Has a recipe: Blueprints + Crafted. Otherwise one "Have" amount (`crafted`). */
  twoStep: boolean;
  blueprints: number;
  crafted: number;
  /** How many the goal needs. */
  count: number;
  /** The goal has all it needs of this part. */
  done: boolean;
  /** What to do next: nothing, craft it (blueprint in stock), or get `toGo` more. */
  next: { kind: 'done' } | { kind: 'craft' } | { kind: 'toGo'; n: number };
}

export interface InventoryView {
  /** Every resource an active goal needs, A–Z. */
  resources: ShoppingRow[];
  /** Parts, grouped by active goal in goal order. */
  parts: { goalId: number; goalName: string; rows: InventoryPart[] }[];
  /** Saved amounts no active goal uses. */
  idleResources: StockRow[];
  idleParts: PartStockRow[];
}

const matches = (name: string, q: string) => q === '' || name.toLowerCase().includes(q);

/**
 * The Inventory screen (brief .impeccable/surfaces/inventory.md): every entity once.
 * `filter` matches names case-insensitively; groups with no match are left out.
 * Rows are A–Z, not "most short first", so nothing moves while you type an amount.
 */
export function inventoryView(data: GoalsResponse, filter = ''): InventoryView {
  const q = filter.trim().toLowerCase();
  const stock = new Map(data.partStock.map((p) => [p.key, p]));

  const resources = data.shoppingList
    .filter((r) => matches(r.name, q))
    .sort((a, b) => a.name.localeCompare(b.name));

  const usedParts = new Set<string>();
  const parts = data.active
    .map((g) => ({
      goalId: g.id,
      goalName: g.name,
      rows: g.parts
        .map((p) => {
          usedParts.add(p.key);
          return {
            key: p.key,
            name: stock.get(p.key)?.name ?? `${g.name} ${p.name}`,
            twoStep: p.craft !== null,
            blueprints: p.blueprints,
            crafted: p.crafted,
            count: p.count,
            done: p.owned >= p.count,
            next:
              p.owned >= p.count
                ? { kind: 'done' as const }
                : p.craft !== null && p.blueprints > 0
                  ? { kind: 'craft' as const }
                  : { kind: 'toGo' as const, n: p.count - p.owned },
          };
        })
        .filter((p) => matches(p.name, q)),
    }))
    .filter((g) => g.rows.length > 0);

  const needed = new Set(data.shoppingList.map((r) => r.key));
  const idleResources = data.stock
    .filter((s) => !needed.has(s.key) && s.amount > 0 && matches(s.name, q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const idleParts = data.partStock
    .filter((p) => !usedParts.has(p.key) && p.blueprints + p.crafted > 0 && matches(p.name, q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { resources, parts, idleResources, idleParts };
}

/** Nothing at all to show (before filtering). */
export function inventoryEmpty(data: GoalsResponse): boolean {
  const v = inventoryView(data);
  return (
    v.resources.length === 0 &&
    v.parts.length === 0 &&
    v.idleResources.length === 0 &&
    v.idleParts.length === 0
  );
}
