import { ApiError, ItemSearchResponse } from '@warframehub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type OpenDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { ItemCatalog, normaliseItem, rankResults, toSearchResult } from './items.js';
import { fakeItemsApi, itemsFixture } from './test-fixtures.js';
import { UnexpectedDataError } from './warframestat.js';

const byName = (file: string, name: string) => itemsFixture(file).find((i) => i.name === name)!;

describe('normaliseItem', () => {
  it('Nidus: parts and resources split, Credits added, drops best first', () => {
    const r = normaliseItem(byName('warframes_search_nidus', 'Nidus'))!;
    expect(r).toMatchObject({
      name: 'Nidus',
      category: 'warframe',
      type: 'Warframe',
      isPrime: false,
      masteryReq: 0,
      buildTime: 259200,
    });
    expect(r.parts.map((p) => p.name)).toEqual(['Blueprint', 'Chassis', 'Neuroptics', 'Systems']);
    expect(r.resources.map((x) => [x.name, x.count])).toEqual([
      ['Credits', 25000],
      ['Kuva', 2000],
    ]);
    const chassis = r.parts.find((p) => p.name === 'Chassis')!;
    expect(chassis.drops[0]).toEqual({
      location: 'Eris/Oestrus (Infested Salvage), Rotation C',
      chance: 14.29,
      rarity: 'Uncommon',
      relic: false,
    });
    const chances = chassis.drops.map((d) => d.chance ?? -1);
    expect(chances).toEqual([...chances].sort((a, b) => b - a));
    // The Nidus Blueprint isn't in any drop table (quest reward).
    expect(r.parts[0]!.drops).toEqual([]);
  });

  it('Nidus Prime: Prime, vaulted, parts drop from relics', () => {
    const r = normaliseItem(byName('warframes_search_nidus', 'Nidus Prime'))!;
    expect(r).toMatchObject({ isPrime: true, vaulted: true });
    const chassis = r.parts.find((p) => p.name === 'Chassis')!;
    expect(chassis.drops.length).toBeGreaterThan(0);
    expect(chassis.drops.every((d) => d.relic)).toBe(true);
    expect(chassis.drops[0]!.location).toMatch(/^(Lith|Meso|Neo|Axi) \w+ Relic/);
    expect(r.resources.map((x) => [x.name, x.count])).toEqual([
      ['Credits', 25000],
      ['Orokin Cell', 5],
    ]);
  });

  it('Boar: a weapon with one part and several resources', () => {
    const r = normaliseItem(byName('weapons_search_boar', 'Boar'))!;
    expect(r).toMatchObject({ category: 'primary', type: 'Shotgun' });
    expect(r.parts.map((p) => p.name)).toEqual(['Blueprint']);
    expect(r.resources.map((x) => [x.name, x.count])).toEqual([
      ['Alloy Plate', 900],
      ['Credits', 15000],
      ['Morphics', 6],
      ['Plastids', 900],
      ['Salvage', 750],
    ]);
  });

  it('Boar Prime: Barrel, Blueprint, Receiver, Stock', () => {
    const r = normaliseItem(byName('weapons_search_boar', 'Boar Prime'))!;
    expect(r.parts.map((p) => p.name)).toEqual(['Blueprint', 'Barrel', 'Receiver', 'Stock']);
  });

  it.each([
    ['an Archwing', 'warframes_search_amesha', 'Amesha'],
    ['a Necramech (category "Warframes", type "Necramech")', 'warframes_search_voidrig', 'Voidrig'],
    ['an Arch-gun', 'weapons_search_imperator', 'Imperator'],
  ])('leaves out %s', (_what, file, name) => {
    expect(normaliseItem(byName(file, name))).toBeNull();
  });

  it('throws UnexpectedDataError for junk', () => {
    expect(() => normaliseItem({ name: 'x' })).toThrow(UnexpectedDataError);
  });
});

describe('rankResults', () => {
  it('puts the exact name first, then names starting with the query', () => {
    const results = itemsFixture('warframes_search_nidus')
      .map(normaliseItem)
      .filter((r) => r !== null)
      .map(toSearchResult);
    expect(rankResults('nidus prime', results).map((r) => r.name)).toEqual([
      'Nidus Prime',
      'Nidus',
    ]);
    expect(rankResults('nidus', results).map((r) => r.name)).toEqual(['Nidus', 'Nidus Prime']);
  });
});

describe('ItemCatalog', () => {
  let database: OpenDatabase;
  let api: ReturnType<typeof fakeItemsApi>;
  let clock: { now: Date };
  let sleeps: number[];
  let catalog: ItemCatalog;

  beforeEach(() => {
    database = openDatabase(':memory:');
    api = fakeItemsApi();
    clock = { now: new Date('2026-11-10T17:30:00.000Z') };
    sleeps = [];
    catalog = new ItemCatalog(database.db, {
      fetch: api.fetchFn,
      now: () => clock.now,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock.now = new Date(clock.now.getTime() + ms);
      },
    });
  });
  afterEach(() => {
    database.close();
  });

  it('searches Warframes and weapons together, with a descriptive User-Agent', async () => {
    const res = await catalog.search('  Nidus ');
    expect(res).toMatchObject({ query: 'nidus', stale: false });
    expect(res.results.map((r) => r.name)).toEqual(['Nidus', 'Nidus Prime']);
    expect(api.state.calls.sort()).toEqual(['/warframes/search/nidus', '/weapons/search/nidus']);
    expect(api.state.userAgents[0]).toMatch(/^warframehub\/\d+\.\d+\.\d+ \(\+https:\/\//);
  });

  it('keeps only Warframes and weapons in the results', async () => {
    expect((await catalog.search('voidrig')).results).toEqual([]);
    expect((await catalog.search('imperator')).results).toEqual([]);
  });

  it('serves a repeated query from the cache for a day', async () => {
    await catalog.search('boar');
    api.state.calls = [];
    clock.now = new Date(clock.now.getTime() + 23 * 60 * 60 * 1000);
    await catalog.search('BOAR');
    expect(api.state.calls).toEqual([]);
    clock.now = new Date(clock.now.getTime() + 60 * 60 * 1000);
    await catalog.search('boar');
    expect(api.state.calls).toHaveLength(2);
  });

  it('waits a second between upstream searches', async () => {
    await catalog.search('nidus');
    await catalog.search('boar');
    expect(sleeps).toEqual([1000]);
  });

  it('caches every result item, so a goal can be added without another request', async () => {
    const res = await catalog.search('boar');
    api.state.calls = [];
    const boarPrime = res.results.find((r) => r.name === 'Boar Prime')!;
    expect(catalog.get(boarPrime.uniqueName)!.parts.map((p) => p.name)).toContain('Receiver');
    expect(catalog.get('/Lotus/Nope')).toBeNull();
    expect(api.state.calls).toEqual([]);
  });

  it('offline: serves the cached results as stale, or says why it cannot search', async () => {
    await catalog.search('nidus');
    api.state.online = false;
    clock.now = new Date(clock.now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const stale = await catalog.search('nidus');
    expect(stale).toMatchObject({ stale: true });
    expect(stale.results).toHaveLength(2);

    await expect(catalog.search('boar')).rejects.toMatchObject({
      statusCode: 503,
      code: 'items_unavailable',
    });
  });

  it('refuses a query shorter than 2 letters', async () => {
    await expect(catalog.search(' n ')).rejects.toMatchObject({
      statusCode: 400,
      code: 'query_too_short',
    });
    expect(api.state.calls).toEqual([]);
  });
});

describe('GET /api/goals/search', () => {
  let database: OpenDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    database = openDatabase(':memory:');
    const { userId } = initDatabase(database.db, loadSeed(), new Date('2026-11-10T17:30:00Z'));
    const api = fakeItemsApi();
    app = await buildApp({
      db: database.db,
      userId,
      liveTimes: () => ({}),
      items: new ItemCatalog(database.db, { fetch: api.fetchFn, sleep: async () => {} }),
    });
  });
  afterEach(async () => {
    await app.close();
    database.close();
  });

  it('returns search results in the shared shape', async () => {
    const res = await app.inject({ url: '/api/goals/search?q=boar' });
    expect(res.statusCode).toBe(200);
    const body = ItemSearchResponse.parse(res.json());
    expect(body.results.map((r) => [r.name, r.category, r.isPrime])).toEqual([
      ['Boar', 'primary', false],
      ['Boar Prime', 'primary', true],
    ]);
  });

  it('a too-short query is a 400 in the standard error shape', async () => {
    const res = await app.inject({ url: '/api/goals/search?q=b' });
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('query_too_short');
  });
});
