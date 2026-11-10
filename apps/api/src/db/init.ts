import { and, eq, ne } from 'drizzle-orm';
import type { SeedFile, SeedItem } from '../domain/seed.js';
import type { Db } from './client.js';
import { items, manualCounters, sections, seedMeta, settings, users } from './schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  display_tz: 'America/Argentina/Buenos_Aires',
  platform: 'pc',
};

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
}

/**
 * Copies the default checklist into a user's sections and items, or merges a newer
 * seed version into what they already have (SPEC §5.1):
 * - new default sections/items are added;
 * - unedited defaults get the new text, kind, slots and order;
 * - edited defaults are never touched;
 * - unedited defaults no longer in the seed are hidden, never deleted
 *   (edited ones stay as the user left them);
 * - custom sections/items are never touched.
 *
 * Does nothing if this seed version (or a newer one) was already applied.
 */
export function applySeed(db: Db, userId: number, seed: SeedFile, now: Date): SeedResult {
  const meta = db.select().from(seedMeta).where(eq(seedMeta.userId, userId)).get();
  const result: SeedResult = {
    applied: false,
    fromVersion: meta?.seedVersion ?? null,
    toVersion: seed.seedVersion,
    sections: { added: 0, updated: 0, hidden: 0 },
    items: { added: 0, updated: 0, hidden: 0 },
  };
  if (meta && meta.seedVersion >= seed.seedVersion) return result;

  db.transaction((tx) => {
    const sectionIds = mergeSections(tx, userId, seed, result);
    mergeItems(tx, userId, seed, sectionIds, now, result);
    tx.insert(seedMeta)
      .values({ userId, seedVersion: seed.seedVersion, appliedAt: now })
      .onConflictDoUpdate({
        target: seedMeta.userId,
        set: { seedVersion: seed.seedVersion, appliedAt: now },
      })
      .run();
  });
  result.applied = true;
  return result;
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
      const changed =
        row.slug !== s.slug ||
        row.title !== s.title ||
        row.period !== s.period ||
        row.sortOrder !== sortOrder;
      if (!row.edited && changed) {
        tx.update(sections)
          .set({
            slug: row.slug === s.slug ? row.slug : freeSlug(tx, userId, s.slug, row.id),
            title: s.title,
            period: s.period,
            sortOrder,
          })
          .where(eq(sections.id, row.id))
          .run();
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
    if (!inSeed.has(seedId) && !row.hidden && !row.edited) {
      tx.update(sections).set({ hidden: true }).where(eq(sections.id, row.id)).run();
      result.sections.hidden++;
    }
  }
  return ids;
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
      const values = itemValues(item, sectionId, sortOrder);
      const row = existing.get(item.seedId);
      if (!row) {
        tx.insert(items)
          .values({
            ...values,
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
      const changed = (Object.keys(values) as (keyof typeof values)[]).some(
        (key) => row[key] !== values[key],
      );
      if (!row.edited && changed) {
        tx.update(items)
          .set({ ...values, updatedAt: now })
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
    }
  }
}

function itemValues(item: SeedItem, sectionId: number, sortOrder: number) {
  return {
    sectionId,
    title: item.title,
    description: item.description,
    kind: item.kind,
    slotsJson: 'slots' in item ? JSON.stringify(item.slots) : null,
    verify: item.verify,
    linkUrl: item.linkUrl ?? null,
    sortOrder,
  };
}

/** `slug`, or `slug-2`, `slug-3`… if a custom section already uses it. */
function freeSlug(tx: Tx, userId: number, slug: string, exceptId: number | null): string {
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
