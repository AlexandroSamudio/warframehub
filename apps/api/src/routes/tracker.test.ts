import {
  ApiError,
  ChecklistResponse,
  ClearSectionResponse,
  PutTickResponse,
  TrackerResponse,
} from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { items, sections, ticks } from '../db/schema.js';
import { pruneTicks, type LiveTimes } from '../db/tracker.js';
import { loadSeed } from '../domain/seed.js';

const seed = loadSeed();

/** A test app on an in-memory (or file) database, with a clock the test controls. */
async function setup(file = ':memory:', start = '2026-11-09T12:00:00.000Z') {
  const database = openDatabase(file);
  const { userId } = initDatabase(database.db, seed, new Date(start));
  const state = { now: new Date(start), live: {} as LiveTimes };
  const app = await buildApp({
    db: database.db,
    userId,
    now: () => state.now,
    liveTimes: () => state.live,
  });
  // These tests read the seed's English (Spanish is the default; see checklist.test.ts).
  await app.inject({ method: 'PATCH', url: '/api/settings', payload: { language: 'en' } });
  const itemId = (seedId: string) =>
    database.db.select().from(items).where(eq(items.seedId, seedId)).get()!.id;
  const sectionId = (seedId: string) =>
    database.db.select().from(sections).where(eq(sections.seedId, seedId)).get()!.id;
  return { app, database, userId, state, itemId, sectionId };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** A custom section that resets only on Clear, with one checkbox item in it. */
async function customManualItem(ctx: Ctx): Promise<{ sectionId: number; itemId: number }> {
  const created = ChecklistResponse.parse(
    (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/sections',
        payload: { title: 'By hand', period: 'manual' },
      })
    ).json(),
  );
  const section = created.sections.find((s) => s.slug.startsWith('by-hand'))!;
  const withItem = ChecklistResponse.parse(
    (
      await ctx.app.inject({
        method: 'POST',
        url: '/api/items',
        payload: { sectionId: section.id, title: 'Manual thing', kind: 'check' },
      })
    ).json(),
  );
  const item = withItem.sections.find((s) => s.id === section.id)!.items[0]!;
  return { sectionId: section.id, itemId: item.id };
}

async function tracker(app: FastifyInstance) {
  const res = await app.inject({ method: 'GET', url: '/api/tracker' });
  expect(res.statusCode).toBe(200);
  return TrackerResponse.parse(res.json());
}

async function checkedSlots(ctx: Ctx, itemId: number): Promise<number[]> {
  const body = await tracker(ctx.app);
  const item = body.sections.flatMap((s) => s.items).find((i) => i.id === itemId);
  if (!item) throw new Error(`item ${itemId} not in tracker`);
  return item.checked;
}

function tick(ctx: Ctx, itemId: number, slot = 0, checked = true, extra: object = {}) {
  return ctx.app.inject({
    method: 'PUT',
    url: '/api/ticks',
    payload: { itemId, slot, checked, ...extra },
  });
}

describe('GET /api/tracker', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('returns every default section with period keys, resets and clocks', async () => {
    const body = await tracker(ctx.app);
    expect(body.serverTime).toBe('2026-11-09T12:00:00.000Z');
    expect(body.displayTz).toBe('America/Argentina/Buenos_Aires');
    expect(body.sections.map((s) => s.slug)).toEqual(seed.sections.map((s) => s.slug));

    const daily = body.sections.find((s) => s.slug === 'daily-core')!;
    expect(daily).toMatchObject({
      period: 'daily',
      periodKey: 'daily:2026-11-09',
      nextReset: '2026-11-10T00:00:00.000Z',
      estimated: false,
    });
    const incursions = daily.items.find((i) => i.title === 'Steel Path Incursions')!;
    expect(incursions).toMatchObject({ kind: 'counter', slotCount: 6, checked: [] });

    expect(body.clocks).toEqual([
      { id: 'daily', nextReset: '2026-11-10T00:00:00.000Z', estimated: false },
      { id: 'weekly', nextReset: '2026-11-16T00:00:00.000Z', estimated: false },
      { id: 'sortie', nextReset: '2026-11-09T16:00:00.000Z', estimated: true },
      { id: 'eight_hour', nextReset: '2026-11-09T20:00:00.000Z', estimated: false },
      { id: 'four_day', nextReset: '2026-11-11T00:00:00.000Z', estimated: false },
      { id: 'baro', nextReset: null, estimated: false },
    ]);
  });

  it('uses live Sortie and Baro times when they are available', async () => {
    ctx.state.live = {
      sortieExpiry: new Date('2026-11-09T17:00:00.000Z'),
      baroActivation: new Date('2026-11-13T13:00:00.000Z'),
    };
    const body = await tracker(ctx.app);
    expect(body.clocks.find((c) => c.id === 'sortie')).toEqual({
      id: 'sortie',
      nextReset: '2026-11-09T17:00:00.000Z',
      estimated: false,
    });
    expect(body.sections.find((s) => s.slug === 'baro')!.periodKey).toBe(
      'baro:2026-11-13T13:00:00.000Z',
    );
    // Baro isn't here yet on 9 Nov: the arrival is the API's own, not an estimate.
    expect(body.clocks.find((c) => c.id === 'baro')).toEqual({
      id: 'baro',
      nextReset: '2026-11-13T13:00:00.000Z',
      estimated: false,
    });
  });

  it('while Baro is here, the clock counts to his next visit, marked as estimated', async () => {
    ctx.state.now = new Date('2026-11-14T00:00:00.000Z');
    ctx.state.live = { baroActivation: new Date('2026-11-13T13:00:00.000Z') };
    const body = await tracker(ctx.app);
    expect(body.clocks.find((c) => c.id === 'baro')).toEqual({
      id: 'baro',
      nextReset: '2026-11-27T13:00:00.000Z',
      estimated: true,
    });
  });

  it('leaves out hidden items and sections', async () => {
    ctx.database.db
      .update(items)
      .set({ hidden: true })
      .where(eq(items.seedId, 'daily.core.login'))
      .run();
    ctx.database.db.update(sections).set({ hidden: true }).where(eq(sections.seedId, 'baro')).run();
    const body = await tracker(ctx.app);
    expect(body.sections.some((s) => s.slug === 'baro')).toBe(false);
    expect(
      body.sections.flatMap((s) => s.items).some((i) => i.title === 'Daily login reward'),
    ).toBe(false);
  });
});

describe('PUT /api/ticks and resets (fake clock)', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup(':memory:', '2026-11-09T22:00:00.000Z'); // Monday, 19:00 GMT-3
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('a daily tick stays until 00:00 UTC and clears exactly then', async () => {
    const login = ctx.itemId('daily.core.login');
    const res = await tick(ctx, login);
    expect(res.statusCode).toBe(200);
    expect(PutTickResponse.parse(res.json()).periodKey).toBe('daily:2026-11-09');

    ctx.state.now = new Date('2026-11-09T23:59:59.999Z');
    expect(await checkedSlots(ctx, login)).toEqual([0]);
    ctx.state.now = new Date('2026-11-10T00:00:00.000Z');
    expect(await checkedSlots(ctx, login)).toEqual([]);
  });

  it('a weekly counter keeps its slots all week and clears on Monday 00:00 UTC', async () => {
    const hunhow = ctx.itemId('weekly.kuva.hunhow');
    await tick(ctx, hunhow, 0);
    await tick(ctx, hunhow, 2);

    ctx.state.now = new Date('2026-11-15T23:59:59.999Z'); // Sunday 20:59 GMT-3
    expect(await checkedSlots(ctx, hunhow)).toEqual([0, 2]);
    ctx.state.now = new Date('2026-11-16T00:00:00.000Z'); // Sunday 21:00 GMT-3
    expect(await checkedSlots(ctx, hunhow)).toEqual([]);
  });

  it('an 8-hour tick survives midnight and clears at the next mark (04:00 UTC)', async () => {
    const loid = ctx.itemId('eight-hour.loid');
    await tick(ctx, loid); // 22:00 UTC, in the 20:00 block
    ctx.state.now = new Date('2026-11-10T03:59:59.999Z');
    expect(await checkedSlots(ctx, loid)).toEqual([0]);
    ctx.state.now = new Date('2026-11-10T04:00:00.000Z');
    expect(await checkedSlots(ctx, loid)).toEqual([]);
  });

  it('a Sortie tick clears at the fallback 16:00 UTC, or at the live expiry when known', async () => {
    const sortie = ctx.itemId('sortie.sortie');
    ctx.state.now = new Date('2026-11-10T15:00:00.000Z');
    await tick(ctx, sortie);
    ctx.state.now = new Date('2026-11-10T16:00:00.000Z');
    expect(await checkedSlots(ctx, sortie)).toEqual([]);

    ctx.state.live = { sortieExpiry: new Date('2026-11-11T17:00:00.000Z') };
    await tick(ctx, sortie);
    ctx.state.now = new Date('2026-11-11T16:30:00.000Z');
    expect(await checkedSlots(ctx, sortie)).toEqual([0]);
    ctx.state.now = new Date('2026-11-11T17:00:00.000Z');
    ctx.state.live = { sortieExpiry: new Date('2026-11-12T17:00:00.000Z') };
    expect(await checkedSlots(ctx, sortie)).toEqual([]);
  });

  it('unticking removes the tick, and ticking twice is harmless', async () => {
    const vosfor = ctx.itemId('weekly.vendors.vosfor');
    await tick(ctx, vosfor, 1);
    await tick(ctx, vosfor, 1);
    expect(await checkedSlots(ctx, vosfor)).toEqual([1]);
    await tick(ctx, vosfor, 1, false);
    expect(await checkedSlots(ctx, vosfor)).toEqual([]);
  });

  it('ignores a period key sent by the client', async () => {
    const res = await tick(ctx, ctx.itemId('daily.core.login'), 0, true, {
      periodKey: 'daily:2000-01-01',
    });
    expect(PutTickResponse.parse(res.json()).periodKey).toBe('daily:2026-11-09');
  });

  it.each([['a slot past the end', 'daily.core.sp-incursions', 6, 400, 'bad_slot']])(
    'rejects %s',
    async (_what, seedId, slot, status, code) => {
      const res = await tick(ctx, ctx.itemId(seedId), slot);
      expect(res.statusCode).toBe(status);
      expect(ApiError.parse(res.json()).error.code).toBe(code);
    },
  );

  it('rejects ticking an info row (a note has no checkbox)', async () => {
    const created = ChecklistResponse.parse(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/items',
          payload: { sectionId: ctx.sectionId('weekly.minor'), title: 'A note', kind: 'info' },
        })
      ).json(),
    );
    const note = created.sections.flatMap((x) => x.items).find((i) => i.title === 'A note')!;
    const res = await tick(ctx, note.id);
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('not_tickable');
  });

  it('rejects unknown items and malformed bodies with the standard error shape', async () => {
    const missing = await tick(ctx, 99999);
    expect(missing.statusCode).toBe(404);
    expect(ApiError.parse(missing.json()).error.code).toBe('not_found');

    const bad = await ctx.app.inject({
      method: 'PUT',
      url: '/api/ticks',
      payload: { itemId: 'one', slot: -1 },
    });
    expect(bad.statusCode).toBe(400);
    expect(ApiError.parse(bad.json()).error.code).toBe('bad_request');

    const notJson = await ctx.app.inject({
      method: 'PUT',
      url: '/api/ticks',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(notJson.statusCode).toBe(400);
    expect(ApiError.parse(notJson.json()).error.code).toBe('bad_request');
  });
});

describe('POST /api/sections/:id/clear', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('starts a new period for a manual section, unticking it', async () => {
    const { sectionId, itemId: item } = await customManualItem(ctx);
    await tick(ctx, item);
    ctx.state.now = new Date('2026-12-31T00:00:00.000Z'); // manual ticks never expire by time
    expect(await checkedSlots(ctx, item)).toEqual([0]);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/sections/${sectionId}/clear`,
    });
    expect(res.statusCode).toBe(200);
    expect(ClearSectionResponse.parse(res.json()).periodKey).toBe('manual:1');
    expect(await checkedSlots(ctx, item)).toEqual([]);
  });

  it('refuses non-manual and unknown sections', async () => {
    const daily = await ctx.app.inject({
      method: 'POST',
      url: `/api/sections/${ctx.sectionId('daily.core')}/clear`,
    });
    expect(daily.statusCode).toBe(409);
    expect(ApiError.parse(daily.json()).error.code).toBe('not_manual');

    const missing = await ctx.app.inject({ method: 'POST', url: '/api/sections/99999/clear' });
    expect(missing.statusCode).toBe(404);
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/sections/abc/clear' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ticks survive a server restart', async () => {
    const file = join(dir, 'warframehub.db');
    const first = await setup(file);
    const hunhow = first.itemId('weekly.kuva.hunhow');
    await tick(first, hunhow, 1);
    await first.app.close();
    first.database.close();

    const second = await setup(file, '2026-11-10T12:00:00.000Z');
    expect(await checkedSlots(second, hunhow)).toEqual([1]);
    await second.app.close();
    second.database.close();
  });
});

describe('pruneTicks', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup(':memory:', '2026-11-09T12:00:00.000Z');
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  const count = () => ctx.database.db.select().from(ticks).all().length;

  it('deletes ticks from past periods and keeps current ones', async () => {
    await tick(ctx, ctx.itemId('daily.core.login'));
    await tick(ctx, ctx.itemId('weekly.kuva.palladino'));
    await tick(ctx, ctx.itemId('four-day.ergo-glast')); // 4-day block of 2026-11-07
    await tick(ctx, (await customManualItem(ctx)).itemId);
    expect(count()).toBe(4);

    const nextDay = new Date('2026-11-10T00:00:00.000Z');
    expect(pruneTicks(ctx.database.db, ctx.userId, nextDay)).toBe(1); // only the daily one
    expect(count()).toBe(3);

    const nextWeek = new Date('2026-11-16T00:00:00.000Z');
    expect(pruneTicks(ctx.database.db, ctx.userId, nextWeek)).toBe(2); // weekly + 4-day
    expect(count()).toBe(1); // the manual tick stays until Clear
  });

  it('prunes Sortie ticks by age, so missing live data never deletes current ticks', async () => {
    ctx.state.live = { sortieExpiry: new Date('2026-11-09T17:00:00.000Z') };
    await tick(ctx, ctx.itemId('sortie.sortie'));

    // Live data gone: the fallback key differs, but the tick is only an hour old.
    expect(pruneTicks(ctx.database.db, ctx.userId, new Date('2026-11-09T13:00:00.000Z'))).toBe(0);
    expect(pruneTicks(ctx.database.db, ctx.userId, new Date('2026-11-11T12:00:01.000Z'))).toBe(1);
  });
});
