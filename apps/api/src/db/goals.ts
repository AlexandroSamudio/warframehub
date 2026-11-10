import {
  ItemRecipe,
  type GoalsResponse,
  type ReorderGoalsRequest,
  type SetStockRequest,
  type UpdateGoalPartRequest,
} from '@warframehub/shared';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { buildGoals, shoppingList, type GoalInput, type Stock } from '../domain/goals.js';
import { HttpError } from '../http-error.js';
import type { ItemCatalog } from '../sources/items.js';
import { partCraft } from '../sources/part-recipes.js';
import type { Db } from './client.js';
import { goalParts, goals, resourceStock } from './schema.js';

/** Goal planner storage (SPEC §13). Every change answers with the full `GoalsResponse`. */

/**
 * A saved recipe, with each part's crafting materials filled in from the bundled DE data.
 * Goals saved before that data existed get them too, and it's always the current file.
 */
function parseRecipe(json: string): ItemRecipe {
  const recipe = ItemRecipe.parse(JSON.parse(json));
  return {
    ...recipe,
    parts: recipe.parts.map((p) => ({ ...p, craft: partCraft(p.key) ?? p.craft })),
  };
}

function stockMap(db: Db, userId: number): Stock {
  return new Map(
    db
      .select()
      .from(resourceStock)
      .where(eq(resourceStock.userId, userId))
      .all()
      .map((r) => [r.resourceKey, r.amount]),
  );
}

export function loadGoals(db: Db, userId: number): GoalsResponse {
  const rows = db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(asc(goals.sortOrder), asc(goals.id))
    .all();
  const ids = rows.map((r) => r.id);
  const ownedByGoal = new Map<number, Map<string, number>>();
  const notesByGoal = new Map<number, Map<string, string>>();
  if (ids.length > 0) {
    for (const p of db.select().from(goalParts).where(inArray(goalParts.goalId, ids)).all()) {
      const owned = ownedByGoal.get(p.goalId) ?? new Map<string, number>();
      owned.set(p.componentKey, p.owned);
      ownedByGoal.set(p.goalId, owned);
      const notes = notesByGoal.get(p.goalId) ?? new Map<string, string>();
      notes.set(p.componentKey, p.note);
      notesByGoal.set(p.goalId, notes);
    }
  }
  const stock = stockMap(db, userId);
  // Rows are in goal order, so the shared stock goes to the higher goal first.
  const inputs: GoalInput[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    recipe: parseRecipe(r.recipeJson),
    owned: ownedByGoal.get(r.id) ?? new Map(),
    notes: notesByGoal.get(r.id) ?? new Map(),
    createdAt: r.createdAt,
    builtAt: r.builtAt,
    recipeFetchedAt: r.recipeFetchedAt,
  }));
  const all = buildGoals(inputs, stock);

  const active = all.filter((g) => g.status === 'active');
  // Built goals: most recently built first.
  const built = all
    .filter((g) => g.status === 'built')
    .sort((a, b) => (b.builtAt ?? '').localeCompare(a.builtAt ?? ''));
  const stockRows = db
    .select()
    .from(resourceStock)
    .where(eq(resourceStock.userId, userId))
    .orderBy(asc(resourceStock.name))
    .all()
    .map((r) => ({ key: r.resourceKey, name: r.name, amount: r.amount }));

  return { active, built, shoppingList: shoppingList(active, stock), stock: stockRows };
}

function getGoal(db: Db, userId: number, id: number) {
  const row = db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', `No goal ${id}`);
  return row;
}

function assertNoActiveDuplicate(db: Db, userId: number, uniqueName: string, name: string) {
  const dup = db
    .select({ id: goals.id })
    .from(goals)
    .where(
      and(eq(goals.userId, userId), eq(goals.uniqueName, uniqueName), eq(goals.status, 'active')),
    )
    .get();
  if (dup) throw new HttpError(409, 'already_active', `${name} is already one of your goals`);
}

function nextSortOrder(db: Db, userId: number): number {
  const last = db
    .select({ value: max(goals.sortOrder) })
    .from(goals)
    .where(eq(goals.userId, userId))
    .get();
  return (last?.value ?? -1) + 1;
}

export function createGoal(
  db: Db,
  userId: number,
  catalog: ItemCatalog,
  uniqueName: string,
  now: Date,
): void {
  const recipe = catalog.get(uniqueName);
  if (!recipe) {
    throw new HttpError(
      404,
      'unknown_item',
      'Search for the item first, then add it from the results',
    );
  }
  assertNoActiveDuplicate(db, userId, uniqueName, recipe.name);
  db.insert(goals)
    .values({
      userId,
      uniqueName,
      name: recipe.name,
      recipeJson: JSON.stringify(recipe),
      recipeFetchedAt: now,
      status: 'active',
      sortOrder: nextSortOrder(db, userId),
      createdAt: now,
    })
    .run();
}

/** Changes how many of a part you have, your note on it, or both. */
export function updatePart(
  db: Db,
  userId: number,
  goalId: number,
  body: UpdateGoalPartRequest,
): void {
  const row = getGoal(db, userId, goalId);
  const part = parseRecipe(row.recipeJson).parts.find((p) => p.key === body.componentKey);
  if (!part)
    throw new HttpError(404, 'unknown_part', `${row.name} has no part ${body.componentKey}`);
  if (body.owned !== undefined && body.owned > part.count) {
    throw new HttpError(400, 'bad_count', `${row.name} needs only ${part.count} × ${part.name}`);
  }
  db.insert(goalParts)
    .values({
      goalId,
      componentKey: body.componentKey,
      owned: body.owned ?? 0,
      note: body.note ?? '',
    })
    .onConflictDoUpdate({
      target: [goalParts.goalId, goalParts.componentKey],
      set: {
        ...(body.owned !== undefined ? { owned: body.owned } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
    })
    .run();
}

/** Sets the shared stock of one resource. Its name comes from a goal that needs it. */
export function setStock(db: Db, userId: number, body: SetStockRequest): void {
  const existing = db
    .select({ name: resourceStock.name })
    .from(resourceStock)
    .where(and(eq(resourceStock.userId, userId), eq(resourceStock.resourceKey, body.key)))
    .get();
  let name = existing?.name;
  if (!name) {
    for (const g of db.select().from(goals).where(eq(goals.userId, userId)).all()) {
      const recipe = parseRecipe(g.recipeJson);
      // The item's own resources, or a material that one of its parts needs to craft.
      const r =
        recipe.resources.find((x) => x.key === body.key) ??
        recipe.parts.flatMap((p) => p.craft?.ingredients ?? []).find((x) => x.key === body.key);
      if (r) {
        name = r.name;
        break;
      }
    }
  }
  if (!name) throw new HttpError(404, 'unknown_resource', 'None of your goals needs that resource');
  db.insert(resourceStock)
    .values({ userId, resourceKey: body.key, name, amount: body.amount })
    .onConflictDoUpdate({
      target: [resourceStock.userId, resourceStock.resourceKey],
      set: { amount: body.amount },
    })
    .run();
}

/** "Mark as built": moves the goal to the completed list. Stock amounts are left alone. */
export function markBuilt(db: Db, userId: number, goalId: number, now: Date): void {
  const row = getGoal(db, userId, goalId);
  if (row.status === 'built')
    throw new HttpError(409, 'already_built', `${row.name} is already built`);
  db.update(goals).set({ status: 'built', builtAt: now }).where(eq(goals.id, goalId)).run();
}

/** Moves a built goal back to the active list (e.g. marked built by mistake). */
export function reactivate(db: Db, userId: number, goalId: number): void {
  const row = getGoal(db, userId, goalId);
  if (row.status === 'active')
    throw new HttpError(409, 'already_active', `${row.name} is already active`);
  assertNoActiveDuplicate(db, userId, row.uniqueName, row.name);
  db.update(goals)
    .set({ status: 'active', builtAt: null, sortOrder: nextSortOrder(db, userId) })
    .where(eq(goals.id, goalId))
    .run();
}

/** Deletes a goal and its part counts. The shared resource stock stays. */
export function deleteGoal(db: Db, userId: number, goalId: number): void {
  getGoal(db, userId, goalId);
  db.delete(goals).where(eq(goals.id, goalId)).run();
}

export function reorderGoals(db: Db, userId: number, body: ReorderGoalsRequest): void {
  if (new Set(body.goalIds).size !== body.goalIds.length) {
    throw new HttpError(400, 'bad_request', 'A goal is listed twice');
  }
  const owned = db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), inArray(goals.id, body.goalIds)))
    .all();
  if (owned.length !== body.goalIds.length) {
    throw new HttpError(404, 'not_found', 'Unknown goal in the new order');
  }
  db.transaction((tx) => {
    body.goalIds.forEach((id, sortOrder) => {
      tx.update(goals).set({ sortOrder }).where(eq(goals.id, id)).run();
    });
  });
}

/**
 * "Update recipe": fetches the item again and replaces the goal's recipe copy.
 * Part counts are kept by part key (and capped to the new counts when shown).
 */
export async function refreshRecipe(
  db: Db,
  userId: number,
  catalog: ItemCatalog,
  goalId: number,
  now: Date,
): Promise<void> {
  const row = getGoal(db, userId, goalId);
  const recipe = await catalog.refresh(row.uniqueName, row.name);
  if (!recipe) {
    throw new HttpError(
      404,
      'item_gone',
      `warframestat.us no longer lists ${row.name}; the saved recipe is kept`,
    );
  }
  db.update(goals)
    .set({ recipeJson: JSON.stringify(recipe), name: recipe.name, recipeFetchedAt: now })
    .where(eq(goals.id, goalId))
    .run();
}
