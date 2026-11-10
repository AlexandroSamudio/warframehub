import { ApiError, TrackerResponse, WorldstateResponse } from '@warframehub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type OpenDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { fixture } from './test-fixtures.js';
import { WorldstateService, type FetchFn } from './worldstate.js';

const SAVED_AT = '2026-11-10T13:29:12.000Z';

/** A fake warframestat.us that serves the saved fixtures and can be switched off. */
function fakeUpstream() {
  const state = { online: true, calls: [] as string[], userAgents: [] as string[] };
  const fetchFn: FetchFn = async (url, init) => {
    const endpoint = new URL(url).pathname.split('/').pop()!;
    state.calls.push(endpoint);
    state.userAgents.push(new Headers(init.headers).get('user-agent') ?? '');
    if (!state.online) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(fixture(endpoint)), {
      headers: { 'content-type': 'application/json' },
    });
  };
  return { state, fetchFn };
}

describe('WorldstateService', () => {
  let database: OpenDatabase;
  let clock: { now: Date };
  let upstream: ReturnType<typeof fakeUpstream>;
  let service: WorldstateService;

  beforeEach(() => {
    database = openDatabase(':memory:');
    clock = { now: new Date(SAVED_AT) };
    upstream = fakeUpstream();
    service = new WorldstateService(database.db, {
      fetch: upstream.fetchFn,
      now: () => clock.now,
    });
  });
  afterEach(() => {
    database.close();
  });

  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };

  it('fetches every endpoint once, with a descriptive User-Agent, then serves the cache', async () => {
    await service.ensureFresh();
    expect(upstream.state.calls.sort()).toEqual(
      [
        'archimedeas',
        'archonHunt',
        'arbitration',
        'dailyDeals',
        'duviriCycle',
        'events',
        'nightwave',
        'sortie',
        'steelPath',
        'voidTrader',
      ].sort(),
    );
    expect(upstream.state.userAgents[0]).toMatch(/^warframehub\/\d+\.\d+\.\d+ \(\+https:\/\//);

    advance(60_000);
    await service.ensureFresh();
    expect(upstream.state.calls).toHaveLength(10); // nothing expired yet

    const cards = service.cards();
    expect(cards.archonHunt).toMatchObject({
      freshness: 'live',
      stale: false,
      fetchedAt: SAVED_AT,
    });
    expect(cards.arbitration.freshness).toBe('unavailable');
  });

  it('refetches an endpoint only after its cached copy expires', async () => {
    await service.ensureFresh();
    upstream.state.calls = [];
    advance(10 * 60_000); // nightwave, events, arbitration: 10 minutes
    await service.ensureFresh();
    expect(upstream.state.calls.sort()).toEqual(['arbitration', 'events', 'nightwave']);
  });

  it('joins concurrent requests into one fetch per endpoint', async () => {
    await Promise.all([service.ensureFresh(['sortie']), service.ensureFresh(['sortie'])]);
    expect(upstream.state.calls).toEqual(['sortie']);
  });

  it('with the network off, serves the last good copy marked stale', async () => {
    await service.ensureFresh();
    upstream.state.online = false;
    advance(2 * 60 * 60_000); // everything has expired
    await service.ensureFresh();

    const cards = service.cards();
    expect(cards.sortie).toMatchObject({ stale: true, fetchedAt: SAVED_AT });
    expect(cards.sortie.data!.boss).toBe('Lephantis');
    expect(cards.events.stale).toBe(true);
  });

  it('waits 2 minutes before retrying a failed endpoint', async () => {
    upstream.state.online = false;
    await service.ensureFresh(['sortie']);
    await service.ensureFresh(['sortie']);
    expect(upstream.state.calls).toEqual(['sortie']);
    advance(2 * 60_000);
    await service.ensureFresh(['sortie']);
    expect(upstream.state.calls).toEqual(['sortie', 'sortie']);
  });

  it('never fetched and offline: every card is "check in game"', async () => {
    upstream.state.online = false;
    await service.ensureFresh();
    for (const card of Object.values(service.cards())) {
      expect(card).toEqual({ freshness: 'unavailable', fetchedAt: null, stale: false, data: null });
    }
  });

  it('manual refresh ignores the cache but is limited to once a minute', async () => {
    await service.ensureFresh();
    upstream.state.calls = [];
    await service.refreshAll();
    expect(upstream.state.calls).toHaveLength(10);
    advance(59_000);
    await expect(service.refreshAll()).rejects.toMatchObject({ statusCode: 429 });
    advance(1_000);
    await expect(service.refreshAll()).resolves.toBeUndefined();
  });

  it('gives the tracker the live Sortie expiry and Baro arrival', async () => {
    expect(service.liveTimes()).toEqual({});
    await service.ensureFresh(['sortie', 'voidTrader']);
    expect(service.liveTimes()).toEqual({
      sortieExpiry: new Date('2026-11-10T17:00:00.000Z'),
      baroActivation: new Date('2026-11-13T14:00:00.000Z'),
    });
  });
});

describe('worldstate routes', () => {
  let database: OpenDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let upstream: ReturnType<typeof fakeUpstream>;
  let clock: { now: Date };

  beforeEach(async () => {
    database = openDatabase(':memory:');
    clock = { now: new Date(SAVED_AT) };
    const { userId } = initDatabase(database.db, loadSeed(), clock.now);
    upstream = fakeUpstream();
    const now = () => clock.now;
    app = await buildApp({
      db: database.db,
      userId,
      now,
      worldstate: new WorldstateService(database.db, { fetch: upstream.fetchFn, now }),
    });
  });
  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('GET /api/worldstate returns normalised cards', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/worldstate' });
    expect(res.statusCode).toBe(200);
    const body = WorldstateResponse.parse(res.json());
    expect(body.cards.archonHunt.data!.shard).toBe('Crimson');
    expect(body.cards.steelPath.freshness).toBe('live');
  });

  it('POST /api/worldstate/refresh is rate-limited with the standard error', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/worldstate/refresh' })).statusCode).toBe(
      200,
    );
    const again = await app.inject({ method: 'POST', url: '/api/worldstate/refresh' });
    expect(again.statusCode).toBe(429);
    expect(ApiError.parse(again.json()).error.code).toBe('rate_limited');
  });

  it('the tracker uses the live Sortie and Baro times', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tracker' });
    const body = TrackerResponse.parse(res.json());
    expect(body.clocks.find((c) => c.id === 'sortie')).toEqual({
      id: 'sortie',
      nextReset: '2026-11-10T17:00:00.000Z',
      estimated: false,
    });
    expect(body.clocks.find((c) => c.id === 'baro')!.nextReset).toBe('2026-11-13T14:00:00.000Z');
    expect(body.sections.find((s) => s.slug === 'baro')!.periodKey).toBe(
      'baro:2026-11-13T14:00:00.000Z',
    );
    expect(body.sections.find((s) => s.slug === 'sortie')!.periodKey).toBe('sortie:2026-11-10');
  });

  it('a Sortie tick made offline still counts once live data is back', async () => {
    upstream.state.online = false;
    const offline = TrackerResponse.parse(
      (await app.inject({ method: 'GET', url: '/api/tracker' })).json(),
    );
    const sortieItem = offline.sections.find((s) => s.slug === 'sortie')!.items[0]!;
    await app.inject({
      method: 'PUT',
      url: '/api/ticks',
      payload: { itemId: sortieItem.id, slot: 0, checked: true },
    });

    upstream.state.online = true;
    clock.now = new Date(clock.now.getTime() + 3 * 60_000); // past the 2-minute retry wait
    const online = TrackerResponse.parse(
      (await app.inject({ method: 'GET', url: '/api/tracker' })).json(),
    );
    expect(online.clocks.find((c) => c.id === 'sortie')!.estimated).toBe(false);
    expect(online.sections.find((s) => s.slug === 'sortie')!.items[0]!.checked).toEqual([0]);
  });
});
