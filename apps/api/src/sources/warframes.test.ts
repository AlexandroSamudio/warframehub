import { ApiError, GoalsResponse, WarframeDetail, WarframesResponse } from '@warframehub/shared';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { ImageCache } from './images.js';
import { fixture } from './test-fixtures.js';
import {
  augmentsOf,
  groupWarframes,
  imageNames,
  plainText,
  RawWarframe,
  slugOf,
  variantOf,
  WarframeCatalog,
} from './warframes.js';
import type { FetchFn } from './worldstate.js';

const START = new Date('2026-11-11T12:00:00.000Z');
const LIST = () => fixture('warframes/warframes') as unknown[];
const MODS = () => fixture('warframes/mods') as unknown[];
const raws = () => LIST().map((r) => RawWarframe.parse(r));

describe('normalising', () => {
  it('names versions and slugs', () => {
    expect(variantOf('Nidus Prime')).toEqual({ kind: 'prime', base: 'Nidus' });
    expect(variantOf('Excalibur Umbra')).toEqual({ kind: 'umbra', base: 'Excalibur' });
    expect(variantOf('Mesa')).toEqual({ kind: 'normal', base: 'Mesa' });
    expect(slugOf('Nezha')).toBe('nezha');
    expect(slugOf('Orion & Sirius')).toBe('orion-sirius');
  });

  it('groups versions A-Z and leaves out Necramechs, Helminth, Archwings and pets', () => {
    const groups = groupWarframes(raws());
    expect(groups.map((g) => [g.slug, g.variants.map((v) => v.raw.name)])).toEqual([
      ['excalibur', ['Excalibur', 'Excalibur Prime', 'Excalibur Umbra']],
      ['mesa', ['Mesa', 'Mesa Prime']],
      ['nidus', ['Nidus', 'Nidus Prime']],
    ]);
  });

  it('links augments to their ability from the mod text', () => {
    const nidus = augmentsOf(MODS()).Nidus!;
    expect(nidus.find((a) => a.name === 'Larva Burst')).toMatchObject({ ability: 'Larva' });
    expect(nidus.find((a) => a.name === 'Abundant Mutation')).toMatchObject({
      ability: 'Passive',
      effect: expect.stringContaining('Mutation'),
    });
    expect(augmentsOf(MODS()).Vitality).toBeUndefined(); // not an augment
  });

  it('strips colour tags', () => {
    expect(plainText('deal 300 <DT_POISON_COLOR>Toxin  damage')).toBe('deal 300 Toxin damage');
  });

  it('only lists images the data mentions', () => {
    const names = imageNames(raws());
    expect(names.has('Nidus.png')).toBe(true);
    expect([...names].some((n) => n.startsWith('Bonewidow'))).toBe(false);
  });
});

/** A fake warframestat.us + CDN. Counts calls; can go offline. */
function fakeUpstream() {
  const state = { online: true, calls: [] as string[] };
  const fetchFn: FetchFn = async (url) => {
    state.calls.push(url);
    if (!state.online) throw new TypeError('fetch failed');
    const u = new URL(url);
    if (u.hostname === 'cdn.warframestat.us') {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'content-type': 'image/png' },
      });
    }
    const body = u.pathname === '/warframes' ? LIST() : u.pathname === '/mods' ? MODS() : [];
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  };
  return { state, fetchFn };
}

async function setup(dir: string) {
  const database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const up = fakeUpstream();
  const clock = { now: START };
  const now = () => clock.now;
  const catalog = new WarframeCatalog(database.db, { fetch: up.fetchFn, now });
  const app = await buildApp({
    db: database.db,
    userId,
    now,
    liveTimes: () => ({}),
    warframes: catalog,
    images: new ImageCache({
      dir: join(dir, 'images'),
      fetch: up.fetchFn,
      allowed: (n) => catalog.cachedImageNames().has(n),
    }),
  });
  const get = (url: string) => app.inject({ method: 'GET', url });
  return { app, database, up, clock, get };
}

describe('Warframes routes', () => {
  let dir: string;
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-wf-'));
    ctx = await setup(dir);
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every Warframe once, fetching the list and the mods once', async () => {
    const body = WarframesResponse.parse((await ctx.get('/api/warframes')).json());
    expect(body.warframes.map((w) => w.name)).toEqual(['Excalibur', 'Mesa', 'Nidus']);
    expect(body.warframes[2]!.variants.map((v) => v.kind)).toEqual(['normal', 'prime']);
    await ctx.get('/api/warframes');
    expect(ctx.up.state.calls.filter((c) => !c.includes('cdn.'))).toHaveLength(2);
  });

  it('gives a page with abilities, stats, augments and the goal recipe', async () => {
    const d = WarframeDetail.parse((await ctx.get('/api/warframes/nidus')).json());
    const [nidus, prime] = d.variants;
    expect(nidus!.abilities.map((a) => [a.key, a.name])).toEqual([
      [1, 'Virulence'],
      [2, 'Larva'],
      [3, 'Parasitic Link'],
      [4, 'Ravenous'],
    ]);
    expect(nidus!.stats).toMatchObject({ health: 675, armor: 350, energy: 100 });
    expect(nidus!.polarities).toEqual(['madurai', 'vazarin']);
    expect(nidus!.recipe?.parts.map((p) => p.name)).toEqual([
      'Blueprint',
      'Chassis',
      'Neuroptics',
      'Systems',
    ]);
    expect(nidus!.recipe?.parts[0]!.sources[0]?.title).toBe('The Glast Gambit');
    expect(prime!.kind).toBe('prime');
    expect(d.augments.map((a) => a.name)).toContain('Larva Burst');
    expect(nidus!.goal).toBeNull();
    expect((await ctx.get('/api/warframes/nope')).statusCode).toBe(404);
  });

  it('lets you add a Warframe as a goal without searching first', async () => {
    const d = WarframeDetail.parse((await ctx.get('/api/warframes/mesa')).json());
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/goals',
      payload: { uniqueName: d.variants[1]!.uniqueName },
    });
    expect(res.statusCode).toBe(201);
    expect(GoalsResponse.parse(res.json()).active.map((g) => g.name)).toEqual(['Mesa Prime']);
    const again = WarframeDetail.parse((await ctx.get('/api/warframes/mesa')).json());
    expect(again.variants[1]!.goal).toMatchObject({ status: 'active' });
  });

  it('keeps the saved list when offline, and says so', async () => {
    await ctx.get('/api/warframes');
    ctx.up.state.online = false;
    ctx.clock.now = new Date(START.getTime() + 8 * 24 * 60 * 60 * 1000); // a week later
    const body = WarframesResponse.parse((await ctx.get('/api/warframes')).json());
    expect(body.stale).toBe(true);
    expect(body.warframes).toHaveLength(3);
  });

  it('is unavailable offline with nothing saved', async () => {
    ctx.up.state.online = false;
    const res = await ctx.get('/api/warframes');
    expect(res.statusCode).toBe(503);
    expect(ApiError.parse(res.json()).error.code).toBe('warframes_unavailable');
  });

  it('refreshes at most once an hour', async () => {
    await ctx.get('/api/warframes');
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/api/warframes/refresh' })).statusCode,
    ).toBe(429); // the first load counts
    ctx.clock.now = new Date(START.getTime() + 60 * 60 * 1000);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/warframes/refresh' });
    expect(res.statusCode).toBe(200);
    expect(WarframesResponse.parse(res.json()).nextRefreshAt).not.toBeNull();
  });

  it('downloads an allowed image once, then serves it from disk', async () => {
    await ctx.get('/api/warframes');
    const first = await ctx.get('/api/images/Nidus.png');
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/png');
    expect(readdirSync(join(dir, 'images'))).toEqual(['Nidus.png']);
    ctx.up.state.online = false;
    expect((await ctx.get('/api/images/Nidus.png')).statusCode).toBe(200);
    expect(ctx.up.state.calls.filter((c) => c.includes('cdn.'))).toHaveLength(1);
  });

  it('refuses images the data does not list, and odd names', async () => {
    await ctx.get('/api/warframes');
    expect((await ctx.get('/api/images/Unknown.png')).statusCode).toBe(404);
    expect((await ctx.get('/api/images/..%2Fwarframehub.db')).statusCode).toBe(404);
    expect(ctx.up.state.calls.filter((c) => c.includes('cdn.'))).toHaveLength(0);
  });
});
