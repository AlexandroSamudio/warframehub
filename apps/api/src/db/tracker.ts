import {
  ItemSlots,
  slotCount,
  type ClearSectionResponse,
  type ClockId,
  type PeriodType,
  type PutTickRequest,
  type PutTickResponse,
  type ResetClock,
  type TrackerItem,
  type TrackerResponse,
  type TrackerSection,
} from '@warframehub/shared';
import { and, asc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { liveSortieExpiry, nextReset, periodKey, type PeriodContext } from '../domain/periods.js';
import { HttpError } from '../http-error.js';
import type { Db } from './client.js';
import { DEFAULT_SETTINGS } from './init.js';
import { items, manualCounters, sections, settings, ticks } from './schema.js';

/** Live reset times from the world state (Phase 3). Empty means "use the fallbacks". */
export interface LiveTimes {
  sortieExpiry?: Date | null;
  baroActivation?: Date | null;
}

const CLOCKS: ClockId[] = ['daily', 'weekly', 'sortie', 'eight_hour', 'baro'];

/**
 * Sortie and Baro keys depend on live data, which can come and go, so their old
 * ticks are pruned by age instead of by key (a key mismatch may just mean the
 * live data is missing right now).
 */
const PRUNE_BY_AGE_MS: Partial<Record<PeriodType, number>> = {
  sortie: 2 * 24 * 60 * 60 * 1000,
  baro: 30 * 24 * 60 * 60 * 1000,
};

function isEstimated(period: PeriodType, now: Date, live: LiveTimes): boolean {
  if (period === 'sortie') return liveSortieExpiry(now, live) === null;
  return false;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function manualCounterMap(db: Db, userId: number): Map<number, number> {
  return new Map(
    db
      .select()
      .from(manualCounters)
      .where(eq(manualCounters.userId, userId))
      .all()
      .map((row) => [row.sectionId, row.counter]),
  );
}

function contextFor(
  sectionId: number,
  live: LiveTimes,
  counters: Map<number, number>,
): PeriodContext {
  return { ...live, manualCounter: counters.get(sectionId) ?? 0 };
}

function parseSlots(json: string | null): ItemSlots | null {
  if (json === null) return null;
  const parsed = ItemSlots.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : null;
}

function displayTz(db: Db, userId: number): string {
  const row = db
    .select({ valueJson: settings.valueJson })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, 'display_tz')))
    .get();
  const value: unknown = row ? JSON.parse(row.valueJson) : DEFAULT_SETTINGS.display_tz;
  return typeof value === 'string' ? value : String(DEFAULT_SETTINGS.display_tz);
}

/** Everything the Tracker screen needs (SPEC §6 `GET /api/tracker`). Hidden rows are left out. */
export function loadTracker(
  db: Db,
  userId: number,
  now: Date,
  live: LiveTimes = {},
): TrackerResponse {
  const counters = manualCounterMap(db, userId);
  const sectionRows = db
    .select()
    .from(sections)
    .where(and(eq(sections.userId, userId), eq(sections.hidden, false)))
    .orderBy(asc(sections.sortOrder), asc(sections.id))
    .all();
  const itemRows = db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.hidden, false)))
    .orderBy(asc(items.sortOrder), asc(items.id))
    .all();

  const keyBySection = new Map(
    sectionRows.map((s) => [s.id, periodKey(s.period, now, contextFor(s.id, live, counters))]),
  );
  const keys = [...new Set(keyBySection.values())];
  const tickRows =
    keys.length === 0
      ? []
      : db
          .select({ itemId: ticks.itemId, slot: ticks.slot, periodKey: ticks.periodKey })
          .from(ticks)
          .where(and(eq(ticks.userId, userId), inArray(ticks.periodKey, keys)))
          .all();
  const checkedByItemKey = new Map<string, number[]>();
  for (const t of tickRows) {
    const k = `${t.itemId}|${t.periodKey}`;
    checkedByItemKey.set(k, [...(checkedByItemKey.get(k) ?? []), t.slot]);
  }

  const itemsBySection = new Map<number, TrackerItem[]>();
  for (const row of itemRows) {
    const key = keyBySection.get(row.sectionId);
    if (key === undefined) continue; // section is hidden
    const slots = parseSlots(row.slotsJson);
    const count = slotCount(row.kind, slots);
    const checked = (checkedByItemKey.get(`${row.id}|${key}`) ?? [])
      .filter((slot) => slot < count)
      .sort((a, b) => a - b);
    const list = itemsBySection.get(row.sectionId) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      slots,
      slotCount: count,
      checked,
      verify: row.verify,
      linkUrl: row.linkUrl,
    });
    itemsBySection.set(row.sectionId, list);
  }

  const trackerSections: TrackerSection[] = sectionRows.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    period: s.period,
    periodKey: keyBySection.get(s.id) as string,
    nextReset: toIso(nextReset(s.period, now, contextFor(s.id, live, counters))),
    estimated: isEstimated(s.period, now, live),
    items: itemsBySection.get(s.id) ?? [],
  }));

  const clocks: ResetClock[] = CLOCKS.map((id) => ({
    id,
    nextReset: toIso(nextReset(id, now, live)),
    estimated: isEstimated(id, now, live),
  }));

  return {
    serverTime: now.toISOString(),
    displayTz: displayTz(db, userId),
    clocks,
    sections: trackerSections,
  };
}

/** Sets or clears one tick in the item's current period (SPEC §6 `PUT /api/ticks`). */
export function setTick(
  db: Db,
  userId: number,
  input: PutTickRequest,
  now: Date,
  live: LiveTimes = {},
): PutTickResponse {
  const row = db
    .select({
      kind: items.kind,
      slotsJson: items.slotsJson,
      sectionId: items.sectionId,
      period: sections.period,
    })
    .from(items)
    .innerJoin(sections, eq(sections.id, items.sectionId))
    .where(and(eq(items.id, input.itemId), eq(items.userId, userId)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', `No item ${input.itemId}`);

  const count = slotCount(row.kind, parseSlots(row.slotsJson));
  if (count === 0) throw new HttpError(400, 'not_tickable', 'Info rows have no checkbox');
  if (input.slot >= count) {
    throw new HttpError(400, 'bad_slot', `Item ${input.itemId} has ${count} slot(s)`);
  }

  const key = periodKey(
    row.period,
    now,
    contextFor(row.sectionId, live, manualCounterMap(db, userId)),
  );
  if (input.checked) {
    db.insert(ticks)
      .values({ userId, itemId: input.itemId, slot: input.slot, periodKey: key, checkedAt: now })
      .onConflictDoNothing()
      .run();
  } else {
    db.delete(ticks)
      .where(
        and(
          eq(ticks.userId, userId),
          eq(ticks.itemId, input.itemId),
          eq(ticks.slot, input.slot),
          eq(ticks.periodKey, key),
        ),
      )
      .run();
  }
  return { ...input, periodKey: key };
}

/** Starts a new period for a `manual` section, which unticks everything in it. */
export function clearSection(
  db: Db,
  userId: number,
  sectionId: number,
  now: Date,
): ClearSectionResponse {
  const section = db
    .select({ period: sections.period })
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.userId, userId)))
    .get();
  if (!section) throw new HttpError(404, 'not_found', `No section ${sectionId}`);
  if (section.period !== 'manual') {
    throw new HttpError(409, 'not_manual', 'Only manual sections can be cleared by hand');
  }
  const row = db
    .insert(manualCounters)
    .values({ userId, sectionId, counter: 1 })
    .onConflictDoUpdate({
      target: [manualCounters.userId, manualCounters.sectionId],
      set: { counter: sql`${manualCounters.counter} + 1` },
    })
    .returning({ counter: manualCounters.counter })
    .get();
  return { sectionId, periodKey: periodKey('manual', now, { manualCounter: row.counter }) };
}

/**
 * Deletes ticks from past periods (SPEC §4.2: no history is kept).
 * Run at startup and once a day. Returns the number of rows deleted.
 */
export function pruneTicks(db: Db, userId: number, now: Date, live: LiveTimes = {}): number {
  const counters = manualCounterMap(db, userId);
  const sectionRows = db
    .select({ id: sections.id, period: sections.period })
    .from(sections)
    .where(eq(sections.userId, userId))
    .all();

  let deleted = 0;
  db.transaction((tx) => {
    for (const s of sectionRows) {
      const itemIds = tx.select({ id: items.id }).from(items).where(eq(items.sectionId, s.id));
      const maxAge = PRUNE_BY_AGE_MS[s.period];
      const stale =
        maxAge === undefined
          ? ne(ticks.periodKey, periodKey(s.period, now, contextFor(s.id, live, counters)))
          : lt(ticks.checkedAt, new Date(now.getTime() - maxAge));
      deleted += tx
        .delete(ticks)
        .where(and(eq(ticks.userId, userId), inArray(ticks.itemId, itemIds), stale))
        .run().changes;
    }
  });
  return deleted;
}
