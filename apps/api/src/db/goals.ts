import {
  ItemRecipe,
  type GoalsResponse,
  type ReorderGoalsRequest,
  type SetPartStockRequest,
  type SetStockRequest,
  type Shortfall,
  type UndoInfo,
  type UpdateGoalPartRequest,
} from '@warframehub/shared';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { buildGoals, shoppingList, type GoalInput, type Stock } from '../domain/goals.js';
import {
  applyDeltas,
  buildDeltas,
  craftDeltas,
  invert,
  partStockName,
  sharePartStock,
  shortfalls,
  type Delta,
  type Inventory,
} from '../domain/inventory.js';
import { isMastered } from '../domain/mastery.js';
import { HttpError } from '../http-error.js';
import type { ItemCatalog } from '../sources/items.js';
import { partCraft } from '../sources/part-recipes.js';
import { partSources } from '../sources/part-sources.js';
import type { Db } from './client.js';
import { profileXp } from './profile.js';
import { goalParts, goals, partStock, resourceStock, undoLog } from './schema.js';

/** Goal planner storage (SPEC §13). Every change answers with the full `GoalsResponse`. */

/**
 * A saved recipe, with each part's crafting materials filled in from the bundled DE data.
 * Goals saved before that data existed get them too, and it's always the current file.
 */
function parseRecipe(json: string): ItemRecipe {
  const recipe = ItemRecipe.parse(JSON.parse(json));
  return {
    ...recipe,
    parts: recipe.parts.map((p) => ({
      ...p,
      craft: partCraft(p.key) ?? p.craft,
      sources: partSources(recipe.name, p.name),
    })),
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

/** How long the last craft or build can be undone. */
export const UNDO_MS = 15 * 60 * 1000;

interface UndoAction {
  kind: 'craft' | 'build';
  /** What was crafted or built (the screen words it, through t()). */
  name: string;
  deltas: Delta[];
  /** Set when the action marked a goal as built. */
  builtGoalId?: number;
}

/** Every amount the user has: resources, part blueprints and finished parts. */
function inventory(db: Db, userId: number): Inventory {
  const parts = db.select().from(partStock).where(eq(partStock.userId, userId)).all();
  return {
    resources: stockMap(db, userId),
    blueprints: new Map(parts.map((p) => [p.partKey, p.blueprints])),
    crafted: new Map(parts.map((p) => [p.partKey, p.crafted])),
  };
}

function lastUndo(db: Db, userId: number, now: Date): (UndoAction & { expiresAt: Date }) | null {
  const row = db.select().from(undoLog).where(eq(undoLog.userId, userId)).get();
  if (!row) return null;
  const expiresAt = new Date(row.createdAt.getTime() + UNDO_MS);
  if (expiresAt <= now) return null;
  return { ...(JSON.parse(row.actionJson) as UndoAction), expiresAt };
}

export function loadGoals(db: Db, userId: number, now: Date = new Date()): GoalsResponse {
  const rows = db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(asc(goals.sortOrder), asc(goals.id))
    .all();
  const ids = rows.map((r) => r.id);
  const notesByGoal = new Map<number, Map<string, string>>();
  if (ids.length > 0) {
    for (const p of db.select().from(goalParts).where(inArray(goalParts.goalId, ids)).all()) {
      const notes = notesByGoal.get(p.goalId) ?? new Map<string, string>();
      notes.set(p.componentKey, p.note);
      notesByGoal.set(p.goalId, notes);
    }
  }
  const inv = inventory(db, userId);
  const stock = inv.resources;
  const xp = profileXp(db, userId);
  const recipes = new Map(rows.map((r) => [r.id, parseRecipe(r.recipeJson)]));
  // Finished parts are shared like resources: the higher goal takes its share first.
  const partShares = sharePartStock(
    rows.map((r) => ({ goalId: r.id, status: r.status, parts: recipes.get(r.id)!.parts })),
    inv.crafted,
  );
  // Rows are in goal order, so the shared stock goes to the higher goal first.
  const inputs: GoalInput[] = rows.map((r) => {
    const recipe = recipes.get(r.id)!;
    return {
      id: r.id,
      status: r.status,
      recipe,
      mastered: isMastered(recipe.category, xp.get(recipe.uniqueName)),
      owned: partShares.get(r.id) ?? new Map(),
      inventory: inv,
      notes: notesByGoal.get(r.id) ?? new Map(),
      createdAt: r.createdAt,
      builtAt: r.builtAt,
      recipeFetchedAt: r.recipeFetchedAt,
    };
  });
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

  const partRows = db
    .select()
    .from(partStock)
    .where(eq(partStock.userId, userId))
    .orderBy(asc(partStock.name))
    .all()
    .map((p) => ({
      key: p.partKey,
      name: p.name,
      blueprints: p.blueprints,
      crafted: p.crafted,
      craftable: partCraft(p.partKey) !== null,
    }));
  const undo = lastUndo(db, userId, now);
  const undoInfo: UndoInfo | null = undo
    ? { kind: undo.kind, name: undo.name, expiresAt: undo.expiresAt.toISOString() }
    : null;

  return {
    active,
    built,
    shoppingList: shoppingList(active, stock),
    stock: stockRows,
    partStock: partRows,
    undo: undoInfo,
  };
}

function getGoal(db: Db, userId: number, id: number) {
  const row = db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', 'noGoal', { id });
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
  if (dup) throw new HttpError(409, 'already_active', 'alreadyGoal', { name });
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
    throw new HttpError(404, 'unknown_item', 'searchFirst');
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
    throw new HttpError(404, 'unknown_part', 'noPart', { name: row.name, part: body.componentKey });
  if (body.owned !== undefined && body.owned > part.count) {
    throw new HttpError(400, 'bad_count', 'badCount', {
      name: row.name,
      count: part.count,
      part: part.name,
    });
  }
  if (body.owned !== undefined) {
    // Ticking on a goal card changes this goal's share, so the shared stock moves by the
    // difference (other goals keep theirs).
    const loaded = loadGoals(db, userId);
    const current = [...loaded.active, ...loaded.built];
    const share = current.find((g) => g.id === goalId)?.parts.find((p) => p.key === part.key);
    const have = inventory(db, userId).crafted.get(part.key) ?? 0;
    writePart(db, userId, part.key, partStockName(row.name, part.name), {
      crafted: Math.max(0, have + body.owned - (share?.owned ?? 0)),
    });
  }
  if (body.note !== undefined) {
    db.insert(goalParts)
      .values({ goalId, componentKey: body.componentKey, owned: 0, note: body.note })
      .onConflictDoUpdate({
        target: [goalParts.goalId, goalParts.componentKey],
        set: { note: body.note },
      })
      .run();
  }
}

type Tx = Pick<Db, 'insert' | 'select' | 'update' | 'delete'>;

function writePart(
  db: Tx,
  userId: number,
  key: string,
  name: string,
  amounts: { blueprints?: number; crafted?: number },
): void {
  db.insert(partStock)
    .values({
      userId,
      partKey: key,
      name,
      blueprints: amounts.blueprints ?? 0,
      crafted: amounts.crafted ?? 0,
    })
    .onConflictDoUpdate({ target: [partStock.userId, partStock.partKey], set: amounts })
    .run();
}

function writeResource(db: Tx, userId: number, key: string, name: string, amount: number): void {
  db.insert(resourceStock)
    .values({ userId, resourceKey: key, name, amount })
    .onConflictDoUpdate({
      target: [resourceStock.userId, resourceStock.resourceKey],
      set: { amount },
    })
    .run();
}

/** A part delta's column: `blueprint` deltas change `blueprints`. */
function partAmount(kind: 'blueprint' | 'crafted', amount: number) {
  return kind === 'blueprint' ? { blueprints: amount } : { crafted: amount };
}

/** The part with this key in any of the user's goals, with its stock name. */
function findPart(db: Db, userId: number, key: string) {
  for (const g of db.select().from(goals).where(eq(goals.userId, userId)).all()) {
    const recipe = parseRecipe(g.recipeJson);
    const part = recipe.parts.find((p) => p.key === key);
    if (part) return { part, name: partStockName(recipe.name, part.name) };
  }
  throw new HttpError(404, 'unknown_part', 'partNotNeeded');
}

/** Sets a part's amounts directly (a drop, a Market buy, a correction). */
export function setPartStock(db: Db, userId: number, body: SetPartStockRequest): void {
  // A part you already have amounts for stays editable after its goal is gone.
  const saved = db
    .select({ name: partStock.name })
    .from(partStock)
    .where(and(eq(partStock.userId, userId), eq(partStock.partKey, body.key)))
    .get();
  const name = saved?.name ?? findPart(db, userId, body.key).name;
  writePart(db, userId, body.key, name, {
    ...(body.blueprints !== undefined ? { blueprints: body.blueprints } : {}),
    ...(body.crafted !== undefined ? { crafted: body.crafted } : {}),
  });
}

function notEnough(what: 'craft' | 'build', short: Shortfall[]): HttpError {
  const list = short.map((s) => ({ count: s.missing, name: s.name }));
  return new HttpError(409, 'not_enough', what === 'craft' ? 'cantCraft' : 'cantBuild', { list });
}

/** Applies amount changes in one go and remembers them for Undo. */
function commit(db: Db, userId: number, action: UndoAction, now: Date, extra?: (tx: Tx) => void) {
  const inv = inventory(db, userId);
  db.transaction((tx) => {
    for (const row of applyDeltas(action.deltas, inv)) {
      if (row.kind === 'resource') writeResource(tx, userId, row.key, row.name, row.amount);
      else writePart(tx, userId, row.key, row.name, partAmount(row.kind, row.amount));
    }
    extra?.(tx);
    const values = { actionJson: JSON.stringify(action), createdAt: now };
    tx.insert(undoLog)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: undoLog.userId, set: values })
      .run();
  });
}

/** One Craft: blueprint and materials out, one finished part in. Blocked when short. */
export function craftPart(db: Db, userId: number, key: string, now: Date): void {
  const { part, name } = findPart(db, userId, key);
  if (!part.craft) {
    throw new HttpError(400, 'not_crafted', 'notCrafted', { name });
  }
  const deltas = craftDeltas({ key, name }, part.craft);
  const short = shortfalls(deltas, inventory(db, userId));
  if (short.length > 0) throw notEnough('craft', short);
  commit(db, userId, { kind: 'craft', name, deltas }, now);
}

/** Puts back the last craft or build (within {@link UNDO_MS}). */
export function undoLast(db: Db, userId: number, now: Date): void {
  const action = lastUndo(db, userId, now);
  if (!action) throw new HttpError(409, 'nothing_to_undo', 'nothingToUndo');
  const goal = action.builtGoalId
    ? db.select().from(goals).where(eq(goals.id, action.builtGoalId)).get()
    : undefined;
  if (goal) assertNoActiveDuplicate(db, userId, goal.uniqueName, goal.name);
  const inv = inventory(db, userId);
  db.transaction((tx) => {
    for (const row of applyDeltas(invert(action.deltas), inv)) {
      if (row.kind === 'resource') writeResource(tx, userId, row.key, row.name, row.amount);
      else writePart(tx, userId, row.key, row.name, partAmount(row.kind, row.amount));
    }
    if (goal && goal.status === 'built') {
      tx.update(goals).set({ status: 'active', builtAt: null }).where(eq(goals.id, goal.id)).run();
    }
    tx.delete(undoLog).where(eq(undoLog.userId, userId)).run();
  });
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
  if (!name) throw new HttpError(404, 'unknown_resource', 'resourceNotNeeded');
  db.insert(resourceStock)
    .values({ userId, resourceKey: body.key, name, amount: body.amount })
    .onConflictDoUpdate({
      target: [resourceStock.userId, resourceStock.resourceKey],
      set: { amount: body.amount },
    })
    .run();
}

/**
 * "Mark as built": uses up the parts (the main blueprint unless reusable) and the item's
 * resources, then moves the goal to the completed list. Blocked when something is short.
 * `useStock: false` only moves it ("already built in game").
 */
export function markBuilt(
  db: Db,
  userId: number,
  goalId: number,
  now: Date,
  useStock = true,
): void {
  const row = getGoal(db, userId, goalId);
  if (row.status === 'built')
    throw new HttpError(409, 'already_built', 'alreadyBuilt', { name: row.name });
  const deltas = useStock ? buildDeltas(parseRecipe(row.recipeJson)) : [];
  const short = shortfalls(deltas, inventory(db, userId));
  if (short.length > 0) throw notEnough('build', short);
  commit(db, userId, { kind: 'build', name: row.name, deltas, builtGoalId: goalId }, now, (tx) =>
    tx.update(goals).set({ status: 'built', builtAt: now }).where(eq(goals.id, goalId)).run(),
  );
}

/** Moves a built goal back to the active list (e.g. marked built by mistake). */
export function reactivate(db: Db, userId: number, goalId: number): void {
  const row = getGoal(db, userId, goalId);
  if (row.status === 'active')
    throw new HttpError(409, 'already_active', 'alreadyActive', { name: row.name });
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
    throw new HttpError(400, 'bad_request', 'goalTwice');
  }
  const owned = db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), inArray(goals.id, body.goalIds)))
    .all();
  if (owned.length !== body.goalIds.length) {
    throw new HttpError(404, 'not_found', 'unknownGoalInOrder');
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
    throw new HttpError(404, 'item_gone', 'itemGone', { name: row.name });
  }
  db.update(goals)
    .set({ recipeJson: JSON.stringify(recipe), name: recipe.name, recipeFetchedAt: now })
    .where(eq(goals.id, goalId))
    .run();
}
