import type { SeedText } from '../domain/seed-text.js';
import {
  slotsMatchKind,
  type ChecklistResponse,
  type CreateItemRequest,
  type CreateSectionRequest,
  type EditableItem,
  type ReorderItemsRequest,
  type ReorderSectionsRequest,
  type UpdateItemRequest,
  type UpdateSectionRequest,
} from '@warframehub/shared';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { HttpError } from '../http-error.js';
import type { Db } from './client.js';
import { freeSlug, SEED_NOTICE_KEY } from './init.js';
import { items, manualCounters, sections, settings } from './schema.js';
import { parseSlots, userLanguage } from './tracker.js';

/**
 * Edit mode (SPEC §6, §8.1). Rules from SPEC §5.1:
 * - changing a default's text marks it `edited`, so seed updates leave it alone;
 * - moving a default marks it `reordered`, so seed updates keep the user's order;
 * - deleting a default only hides it ("Restore defaults" brings it back);
 * - custom sections and items are really deleted.
 */

/** The whole checklist, hidden rows included. */
export function loadChecklist(db: Db, userId: number, text?: SeedText): ChecklistResponse {
  const lang = userLanguage(db, userId);
  const sectionRows = db
    .select()
    .from(sections)
    .where(eq(sections.userId, userId))
    .orderBy(asc(sections.sortOrder), asc(sections.id))
    .all();
  const itemRows = db
    .select()
    .from(items)
    .where(eq(items.userId, userId))
    .orderBy(asc(items.sortOrder), asc(items.id))
    .all();

  const bySection = new Map<number, EditableItem[]>();
  for (const row of itemRows) {
    const list = bySection.get(row.sectionId) ?? [];
    list.push({
      id: row.id,
      sectionId: row.sectionId,
      ...(text ? text.item(row, lang) : { title: row.title, description: row.description }),
      kind: row.kind,
      slots: parseSlots(row.slotsJson),
      verify: row.verify,
      linkUrl: row.linkUrl,
      hidden: row.hidden,
      origin: row.origin,
      edited: row.edited,
    });
    bySection.set(row.sectionId, list);
  }
  return {
    sections: sectionRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: text ? text.sectionTitle(s, lang) : s.title,
      period: s.period,
      hidden: s.hidden,
      origin: s.origin,
      edited: s.edited,
      items: bySection.get(s.id) ?? [],
    })),
  };
}

function getSection(db: Db, userId: number, id: number) {
  const row = db
    .select()
    .from(sections)
    .where(and(eq(sections.id, id), eq(sections.userId, userId)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', 'noSection', { id });
  return row;
}

function getItem(db: Db, userId: number, id: number) {
  const row = db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', 'noItem', { id });
  return row;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'section';
}

function ensureManualCounter(db: Db, userId: number, sectionId: number): void {
  db.insert(manualCounters).values({ userId, sectionId, counter: 0 }).onConflictDoNothing().run();
}

// ---- sections ------------------------------------------------------------

export function createSection(db: Db, userId: number, body: CreateSectionRequest): number {
  const last = db
    .select({ value: max(sections.sortOrder) })
    .from(sections)
    .where(eq(sections.userId, userId))
    .get();
  const row = db
    .insert(sections)
    .values({
      userId,
      slug: freeSlug(db, userId, slugify(body.title), null),
      title: body.title,
      period: body.period,
      sortOrder: (last?.value ?? -1) + 1,
      origin: 'custom',
    })
    .returning({ id: sections.id })
    .get();
  if (body.period === 'manual') ensureManualCounter(db, userId, row.id);
  return row.id;
}

export function updateSection(
  db: Db,
  userId: number,
  id: number,
  body: UpdateSectionRequest,
  text?: SeedText,
): void {
  const row = getSection(db, userId, id);
  // The Spanish title sent back unchanged is not an edit: keep the stored English.
  if (text && body.title === text.sectionTitle(row, userLanguage(db, userId))) {
    body = { ...body, title: row.title };
  }
  const contentChanged =
    (body.title !== undefined && body.title !== row.title) ||
    (body.period !== undefined && body.period !== row.period);
  db.update(sections)
    .set({
      ...body,
      ...(contentChanged && row.origin === 'default' ? { edited: true } : {}),
    })
    .where(eq(sections.id, id))
    .run();
  if (body.period === 'manual') ensureManualCounter(db, userId, id);
}

/** Custom sections are deleted with their items; default ones are hidden. */
export function deleteSection(db: Db, userId: number, id: number): void {
  const row = getSection(db, userId, id);
  if (row.origin === 'default') {
    db.update(sections).set({ hidden: true }).where(eq(sections.id, id)).run();
    return;
  }
  const defaults = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.sectionId, id), eq(items.origin, 'default')))
    .all();
  if (defaults.length > 0) {
    throw new HttpError(409, 'has_default_items', 'hasDefaultItems');
  }
  db.delete(sections).where(eq(sections.id, id)).run(); // items, ticks, counters cascade
}

export function reorderSections(db: Db, userId: number, body: ReorderSectionsRequest): void {
  const owned = db
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.userId, userId), inArray(sections.id, body.sectionIds)))
    .all();
  if (owned.length !== new Set(body.sectionIds).size) {
    throw new HttpError(404, 'not_found', 'unknownSectionInOrder');
  }
  db.transaction((tx) => {
    body.sectionIds.forEach((id, sortOrder) => {
      tx.update(sections).set({ sortOrder, reordered: true }).where(eq(sections.id, id)).run();
    });
  });
}

// ---- items ---------------------------------------------------------------

export function createItem(db: Db, userId: number, body: CreateItemRequest, now: Date): number {
  getSection(db, userId, body.sectionId);
  const last = db
    .select({ value: max(items.sortOrder) })
    .from(items)
    .where(eq(items.sectionId, body.sectionId))
    .get();
  const row = db
    .insert(items)
    .values({
      userId,
      sectionId: body.sectionId,
      title: body.title,
      description: body.description ?? '',
      kind: body.kind,
      slotsJson: body.slots ? JSON.stringify(body.slots) : null,
      verify: body.verify ?? false,
      linkUrl: body.linkUrl ?? null,
      sortOrder: (last?.value ?? -1) + 1,
      origin: 'custom',
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: items.id })
    .get();
  return row.id;
}

const CONTENT_KEYS = ['title', 'description', 'kind', 'slots', 'verify', 'linkUrl'] as const;

export function updateItem(
  db: Db,
  userId: number,
  id: number,
  body: UpdateItemRequest,
  now: Date,
  text?: SeedText,
): void {
  const row = getItem(db, userId, id);
  // Spanish seed text sent back unchanged is not an edit: keep the stored English.
  if (text) {
    const shown = text.item(row, userLanguage(db, userId));
    if (body.title === shown.title) body = { ...body, title: row.title };
    if (body.description === shown.description) body = { ...body, description: row.description };
  }
  const current = {
    title: row.title,
    description: row.description,
    kind: row.kind,
    slots: parseSlots(row.slotsJson),
    verify: row.verify,
    linkUrl: row.linkUrl,
  };
  const next = { ...current };
  for (const key of CONTENT_KEYS) {
    if (body[key] !== undefined) Object.assign(next, { [key]: body[key] });
  }
  // Changing the kind without new slots: drop slots that no longer fit.
  if (
    body.kind !== undefined &&
    body.slots === undefined &&
    !slotsMatchKind(next.kind, next.slots)
  ) {
    next.slots = null;
  }
  if (!slotsMatchKind(next.kind, next.slots)) {
    throw new HttpError(400, 'bad_slots', 'badSlots', { kind: next.kind });
  }
  const contentChanged = CONTENT_KEYS.some(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]),
  );

  db.update(items)
    .set({
      title: next.title,
      description: next.description,
      kind: next.kind,
      slotsJson: next.slots ? JSON.stringify(next.slots) : null,
      verify: next.verify,
      linkUrl: next.linkUrl,
      ...(body.hidden !== undefined ? { hidden: body.hidden } : {}),
      ...(contentChanged && row.origin === 'default' ? { edited: true } : {}),
      updatedAt: now,
    })
    .where(eq(items.id, id))
    .run();
}

/** Custom items are deleted (with their ticks); default ones are hidden. */
export function deleteItem(db: Db, userId: number, id: number, now: Date): void {
  const row = getItem(db, userId, id);
  if (row.origin === 'default') {
    db.update(items).set({ hidden: true, updatedAt: now }).where(eq(items.id, id)).run();
    return;
  }
  db.delete(items).where(eq(items.id, id)).run();
}

/**
 * Sets the order of one section. Items from other sections in the list move into it;
 * their ticks stay, and count again once the new section's period matches.
 */
export function reorderItems(db: Db, userId: number, body: ReorderItemsRequest, now: Date): void {
  getSection(db, userId, body.sectionId);
  if (new Set(body.itemIds).size !== body.itemIds.length) {
    throw new HttpError(400, 'bad_request', 'itemTwice');
  }
  const owned =
    body.itemIds.length === 0
      ? []
      : db
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.userId, userId), inArray(items.id, body.itemIds)))
          .all();
  if (owned.length !== body.itemIds.length) {
    throw new HttpError(404, 'not_found', 'unknownItemInOrder');
  }
  db.transaction((tx) => {
    body.itemIds.forEach((id, sortOrder) => {
      tx.update(items)
        .set({ sectionId: body.sectionId, sortOrder, reordered: true, updatedAt: now })
        .where(eq(items.id, id))
        .run();
    });
  });
}

export function dismissSeedNotice(db: Db, userId: number): void {
  db.delete(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, SEED_NOTICE_KEY)))
    .run();
}
