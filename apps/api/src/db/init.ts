import { and, eq, ne, or } from 'drizzle-orm';
import type { SeedFile, SeedItem } from '../domain/seed.js';
import type { Db } from './client.js';
import { items, manualCounters, sections, seedMeta, settings, users } from './schema.js';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  display_tz: 'America/Argentina/Buenos_Aires',
  platform: 'pc',
};

/** Settings key for the "removed from the defaults" notice (SPEC §5.1). */
export const SEED_NOTICE_KEY = 'seed_notice';

export interface SeedNotice {
  seedVersion: number;
  removedTitles: string[];
}

/** Returns the local user's id, creating the user (with default settings) on first start. */
export function ensureLocalUser(db: Db, now: Date): number {
  const existing = db.select({ id: users.id }).from(users).orderBy(users.id).limit(1).get();
  if (existing) return existing.id;

  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({ name: 'Local', createdAt: now })
      .returning({ id: users.id })
      .get();
    tx.insert(settings)
      .values(
        Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
          userId: user.id,
          key,
          valueJson: JSON.stringify(value),
        })),
      )
      .run();
    return user.id;
  });
}

export interface SeedResult {
  applied: boolean;
  fromVersion: number | null;
  toVersion: number;
  sections: { added: number; updated: number; hidden: number };
  items: { added: number; updated: number; hidden: number };
  /** Titles of defaults hidden because the seed no longer has them. */
  removedTitles: string[];
}

/**
 * Copies the default checklist into a user's sections and items, or merges a newer
 * seed version into what they already have (SPEC §5.1):
 * - new default sections/items are added;
 * - unedited defaults get the new text, kind and slots;
 * - defaults the user hasn't moved get the new section and order;
 * - edited defaults keep the user's text, moved ones keep the user's order;
 * - unedited defaults no longer in the seed are hidden, never deleted, and recorded
 *   for a notice (edited ones stay as the user left them);
 * - custom sections/items are never touched.
 *
 * Does nothing if this seed version (or a newer one) was already applied.
 */
export function applySeed(db: Db, userId: number, seed: SeedFile, now: Date): SeedResult {
  const meta = db.select().from(seedMeta).where(eq(seedMeta.userId, userId)).get();
  const result = emptyResult(meta?.seedVersion ?? null, seed.seedVersion);
  if (meta && meta.seedVersion >= seed.seedVersion) return result;

  db.transaction((tx) => {
    merge(tx, userId, seed, now, result);
    // A first import has nothing to report; later updates leave a notice for the UI.
    if (meta && result.removedTitles.length > 0) {
      writeNotice(tx, userId, {
        seedVersion: seed.seedVersion,
        removedTitles: result.removedTitles,
      });
    }
  });
  result.applied = true;
  return result;
}

/**
 * "Restore defaults" (SPEC §6): every default section and item gets the seed's text,
 * order and visibility back. Custom sections and items are kept as they are.
 */
export function restoreDefaults(db: Db, userId: number, seed: SeedFile, now: Date): SeedResult {
  const meta = db.select().from(seedMeta).where(eq(seedMeta.userId, userId)).get();
  const result = emptyResult(meta?.seedVersion ?? null, seed.seedVersion);
  db.transaction((tx) => {
    const reset = { edited: false, reordered: false, hidden: false };
    tx.update(sections)
      .set(reset)
      .where(and(eq(sections.userId, userId), eq(sections.origin, 'default')))
      .run();
    tx.update(items)
      .set(reset)
      .where(and(eq(items.userId, userId), eq(items.origin, 'default')))
      .run();
    merge(tx, userId, seed, now, result);
    // Items the seed dropped are hidden again by the merge; nothing new to tell the user.
    tx.delete(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, SEED_NOTICE_KEY)))
      .run();
  });
  result.applied = true;
  result.removedTitles = [];
  return result;
}

function emptyResult(fromVersion: number | null, toVersion: number): SeedResult {
  return {
    applied: false,
    fromVersion,
    toVersion,
    sections: { added: 0, updated: 0, hidden: 0 },
    items: { added: 0, updated: 0, hidden: 0 },
    removedTitles: [],
  };
}

function merge(tx: Tx, userId: number, seed: SeedFile, now: Date, result: SeedResult): void {
  const sectionIds = mergeSections(tx, userId, seed, result);
  mergeItems(tx, userId, seed, sectionIds, now, result);
  tx.insert(seedMeta)
    .values({ userId, seedVersion: seed.seedVersion, appliedAt: now })
    .onConflictDoUpdate({
      target: seedMeta.userId,
      set: { seedVersion: seed.seedVersion, appliedAt: now },
    })
    .run();
}

function writeNotice(tx: Tx, userId: number, notice: SeedNotice): void {
  tx.insert(settings)
    .values({ userId, key: SEED_NOTICE_KEY, valueJson: JSON.stringify(notice) })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { valueJson: JSON.stringify(notice) },
    })
    .run();
}

/** Returns the section id for each seed section id. */
function mergeSections(
  tx: Tx,
  userId: number,
  seed: SeedFile,
  result: SeedResult,
): Map<string, number> {
  const existing = new Map(
    tx
      .select()
      .from(sections)
      .where(and(eq(sections.userId, userId), eq(sections.origin, 'default')))
      .all()
      .filter((row) => row.seedId !== null)
      .map((row) => [row.seedId as string, row]),
  );
  const ids = new Map<string, number>();

  seed.sections.forEach((s, sortOrder) => {
    const row = existing.get(s.seedId);
    if (!row) {
      const inserted = tx
        .insert(sections)
        .values({
          userId,
          slug: freeSlug(tx, userId, s.slug, null),
          title: s.title,
          period: s.period,
          sortOrder,
          origin: 'default',
          seedId: s.seedId,
        })
        .returning({ id: sections.id })
        .get();
      ids.set(s.seedId, inserted.id);
      result.sections.added++;
    } else {
      ids.set(s.seedId, row.id);
      const update: Partial<typeof sections.$inferInsert> = {};
      if (!row.edited) {
        if (row.slug !== s.slug) update.slug = freeSlug(tx, userId, s.slug, row.id);
        if (row.title !== s.title) update.title = s.title;
        if (row.period !== s.period) update.period = s.period;
      }
      if (!row.reordered && row.sortOrder !== sortOrder) update.sortOrder = sortOrder;
      if (Object.keys(update).length > 0) {
        tx.update(sections).set(update).where(eq(sections.id, row.id)).run();
        result.sections.updated++;
      }
    }
    if (s.period === 'manual') {
      tx.insert(manualCounters)
        .values({ userId, sectionId: ids.get(s.seedId) as number, counter: 0 })
        .onConflictDoNothing()
        .run();
    }
  });

  const inSeed = new Set(seed.sections.map((s) => s.seedId));
  for (const [seedId, row] of existing) {
    if (!inSeed.has(seedId) && !row.hidden && !row.edited && !holdsUserItems(tx, row.id)) {
      tx.update(sections).set({ hidden: true }).where(eq(sections.id, row.id)).run();
      result.sections.hidden++;
      result.removedTitles.push(row.title);
    }
  }
  return ids;
}

/**
 * A removed default section stays visible while it holds something of the user's
 * (a visible custom item, or a visible default they edited), so that item doesn't vanish.
 */
function holdsUserItems(tx: Tx, sectionId: number): boolean {
  return (
    tx
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.sectionId, sectionId),
          eq(items.hidden, false),
          or(eq(items.origin, 'custom'), eq(items.edited, true)),
        ),
      )
      .limit(1)
      .all().length > 0
  );
}

function mergeItems(
  tx: Tx,
  userId: number,
  seed: SeedFile,
  sectionIds: Map<string, number>,
  now: Date,
  result: SeedResult,
): void {
  const existing = new Map(
    tx
      .select()
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.origin, 'default')))
      .all()
      .filter((row) => row.seedId !== null)
      .map((row) => [row.seedId as string, row]),
  );
  const inSeed = new Set<string>();

  for (const s of seed.sections) {
    const sectionId = sectionIds.get(s.seedId) as number;
    s.items.forEach((item, sortOrder) => {
      inSeed.add(item.seedId);
      const content = itemContent(item);
      const placement = { sectionId, sortOrder };
      const row = existing.get(item.seedId);
      if (!row) {
        tx.insert(items)
          .values({
            ...content,
            ...placement,
            userId,
            origin: 'default',
            seedId: item.seedId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        result.items.added++;
        return;
      }
      const update: Partial<typeof items.$inferInsert> = {};
      if (!row.edited) {
        for (const key of Object.keys(content) as (keyof typeof content)[]) {
          if (row[key] !== content[key]) Object.assign(update, { [key]: content[key] });
        }
      }
      if (!row.reordered) {
        if (row.sectionId !== sectionId) update.sectionId = sectionId;
        if (row.sortOrder !== sortOrder) update.sortOrder = sortOrder;
      }
      if (Object.keys(update).length > 0) {
        tx.update(items)
          .set({ ...update, updatedAt: now })
          .where(eq(items.id, row.id))
          .run();
        result.items.updated++;
      }
    });
  }

  for (const [seedId, row] of existing) {
    if (!inSeed.has(seedId) && !row.hidden && !row.edited) {
      tx.update(items).set({ hidden: true, updatedAt: now }).where(eq(items.id, row.id)).run();
      result.items.hidden++;
      result.removedTitles.push(row.title);
    }
  }
}

function itemContent(item: SeedItem) {
  return {
    title: item.title,
    description: item.description,
    kind: item.kind,
    slotsJson: 'slots' in item ? JSON.stringify(item.slots) : null,
    verify: item.verify,
    linkUrl: item.linkUrl ?? null,
  };
}

/** `slug`, or `slug-2`, `slug-3`… if another section already uses it. */
export function freeSlug(
  tx: Tx | Db,
  userId: number,
  slug: string,
  exceptId: number | null,
): string {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? slug : `${slug}-${n}`;
    const conditions = [eq(sections.userId, userId), eq(sections.slug, candidate)];
    if (exceptId !== null) conditions.push(ne(sections.id, exceptId));
    const taken = tx
      .select({ id: sections.id })
      .from(sections)
      .where(and(...conditions))
      .get();
    if (!taken) return candidate;
  }
}

/** Run at startup, after `openDatabase`: creates the local user if needed and applies the seed. */
export function initDatabase(
  db: Db,
  seed: SeedFile,
  now: Date,
): { userId: number; seed: SeedResult } {
  const userId = ensureLocalUser(db, now);
  return { userId, seed: applySeed(db, userId, seed, now) };
}
