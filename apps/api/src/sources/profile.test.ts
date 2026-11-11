import { ApiError, ProfileResponse } from '@warframehub/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { ItemCatalog } from './items.js';
import { MIN_REFRESH_GAP_MS, normaliseProfile, ProfileService } from './profile.js';
import { fakeItemsApi, fixture } from './test-fixtures.js';
import { UnexpectedDataError } from './warframestat.js';
import type { FetchFn } from './worldstate.js';

const START = new Date('2026-11-11T12:00:00.000Z');
const ID = 'a1b2c3d4e5f60718293a4b5c';
const profileFixture = () => fixture('profile/profile');

describe('normaliseProfile', () => {
  it('keeps what the Profile screen needs from a real response', () => {
    const p = normaliseProfile(profileFixture());
    expect(p.masteryRank).toBe(17);
    expect(p.displayName).toBe('Tenno');
    expect(p.items).toHaveLength(25);
    expect(p.items[2]).toEqual({
      uniqueName: '/Lotus/Powersuits/Excalibur/Excalibur',
      xp: 2691015,
    });
    expect(p.syndicates[0]).toEqual({ tag: 'CetusSyndicate', standing: 319307, rank: 5 });
    expect(p.intrinsics).toContainEqual({ tag: 'LPS_TACTICAL', level: 5 });
    expect(p.intrinsics.some((i) => i.tag.startsWith('LPP_'))).toBe(false);
    expect(p.missionsCompleted).toBe(4107);
    expect(p.nodesCompleted).toBe(15);
    expect(p.timePlayedSeconds).toBe(2533244);
  });

  it('does not keep the account ID or clan', () => {
    expect(JSON.stringify(normaliseProfile(profileFixture()))).not.toMatch(/\$oid|AccountId|Guild/);
  });

  it('rejects junk', () => {
    expect(() => normaliseProfile({})).toThrow(UnexpectedDataError);
    expect(() => normaliseProfile({ Results: [] })).toThrow(UnexpectedDataError);
    expect(() => normaliseProfile('No account or guild ID specified')).toThrow(UnexpectedDataError);
  });
});

/** A fake DE that serves the fixture and can fail. Never touches the network. */
function fakeDe() {
  const state = { calls: [] as string[], status: 200, body: profileFixture() as unknown };
  const fetchFn: FetchFn = async (url) => {
    state.calls.push(url);
    return new Response(JSON.stringify(state.body), { status: state.status });
  };
  return { state, fetchFn };
}

async function setup(file = ':memory:') {
  const database = openDatabase(file);
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const de = fakeDe();
  const clock = { now: START };
  const now = () => clock.now;
  const warnings: unknown[] = [];
  const profile = new ProfileService(database.db, userId, {
    fetch: de.fetchFn,
    now,
    onError: (reason) => warnings.push(reason),
  });
  const app = await buildApp({ db: database.db, userId, now, liveTimes: () => ({}), profile });
  const call = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { app, database, de, clock, call, warnings };
}
type Ctx = Awaited<ReturnType<typeof setup>>;
const body = async (res: ReturnType<Ctx['call']>) => ProfileResponse.parse((await res).json());

describe('profile routes', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('starts empty, with no call to DE', async () => {
    expect(await body(ctx.call('GET', '/api/profile'))).toEqual({
      accountSet: false,
      profile: null,
      fetchedAt: null,
      nextRefreshAt: null,
    });
    expect(ctx.de.state.calls).toHaveLength(0);
  });

  it('rejects a malformed account ID without saving it', async () => {
    const res = await ctx.call('PUT', '/api/profile/account', { accountId: 'TheGalaxy3' });
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('bad_request');
    expect((await body(ctx.call('GET', '/api/profile'))).accountSet).toBe(false);
  });

  it('refresh needs an account ID', async () => {
    const res = await ctx.call('POST', '/api/profile/refresh');
    expect(res.statusCode).toBe(409);
    expect(ctx.de.state.calls).toHaveLength(0);
  });

  it('saves the ID, fetches once, and never sends the ID back', async () => {
    const saved = await ctx.call('PUT', '/api/profile/account', { accountId: ID.toUpperCase() });
    expect(JSON.stringify(saved.json())).not.toContain(ID);
    expect(ctx.de.state.calls).toHaveLength(0); // saving the ID doesn't call DE

    const res = await ctx.call('POST', '/api/profile/refresh');
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).not.toContain(ID);
    const b = ProfileResponse.parse(res.json());
    expect(b.accountSet).toBe(true);
    expect(b.profile?.masteryRank).toBe(17);
    expect(b.fetchedAt).toBe(START.toISOString());
    expect(ctx.de.state.calls).toEqual([
      `https://api.warframe.com/cdn/getProfileViewingData.php?playerId=${ID}`,
    ]);
  });

  it('refuses a second refresh inside the hour, then allows it', async () => {
    await ctx.call('PUT', '/api/profile/account', { accountId: ID });
    await ctx.call('POST', '/api/profile/refresh');
    ctx.clock.now = new Date(START.getTime() + 10 * 60_000);
    const early = await ctx.call('POST', '/api/profile/refresh');
    expect(early.statusCode).toBe(429);
    expect(ApiError.parse(early.json()).error.message).toContain('50 minutes');
    expect(ctx.de.state.calls).toHaveLength(1);
    expect((await body(ctx.call('GET', '/api/profile'))).nextRefreshAt).toBe(
      new Date(START.getTime() + MIN_REFRESH_GAP_MS).toISOString(),
    );

    ctx.clock.now = new Date(START.getTime() + MIN_REFRESH_GAP_MS);
    expect((await ctx.call('POST', '/api/profile/refresh')).statusCode).toBe(200);
    expect(ctx.de.state.calls).toHaveLength(2);
  });

  it('a failed call keeps the old copy, counts toward the wait, and is not retried', async () => {
    await ctx.call('PUT', '/api/profile/account', { accountId: ID });
    await ctx.call('POST', '/api/profile/refresh');
    ctx.clock.now = new Date(START.getTime() + MIN_REFRESH_GAP_MS);
    ctx.de.state.status = 503;
    const res = await ctx.call('POST', '/api/profile/refresh');
    expect(res.statusCode).toBe(502);
    expect(ApiError.parse(res.json()).error.code).toBe('profile_unavailable');
    expect(ctx.de.state.calls).toHaveLength(2); // exactly one call, no retry
    expect(JSON.stringify(ctx.warnings)).not.toContain(ID);

    const b = await body(ctx.call('GET', '/api/profile'));
    expect(b.profile?.masteryRank).toBe(17); // old copy kept
    expect(b.nextRefreshAt).not.toBeNull(); // the failed call counted
  });

  it('unexpected data is an error, not a saved profile', async () => {
    await ctx.call('PUT', '/api/profile/account', { accountId: ID });
    ctx.de.state.body = { Results: [] };
    expect((await ctx.call('POST', '/api/profile/refresh')).statusCode).toBe(502);
    expect((await body(ctx.call('GET', '/api/profile'))).profile).toBeNull();
  });

  it('a new ID drops the old profile but keeps the wait; forget clears everything', async () => {
    await ctx.call('PUT', '/api/profile/account', { accountId: ID });
    await ctx.call('POST', '/api/profile/refresh');
    const changed = await body(
      ctx.call('PUT', '/api/profile/account', { accountId: 'f'.repeat(24) }),
    );
    expect(changed.profile).toBeNull();
    expect(changed.nextRefreshAt).not.toBeNull();

    const gone = await body(ctx.call('DELETE', '/api/profile'));
    expect(gone.accountSet).toBe(false);
    expect(gone.profile).toBeNull();
  });
});

describe('restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-profile-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('the ID, the profile and the wait survive a restart without calling DE', async () => {
    const file = join(dir, 'warframehub.db');
    const first = await setup(file);
    await first.call('PUT', '/api/profile/account', { accountId: ID });
    await first.call('POST', '/api/profile/refresh');
    await first.app.close();
    first.database.close();

    const second = await setup(file);
    const b = await body(second.call('GET', '/api/profile'));
    expect(b.accountSet).toBe(true);
    expect(b.profile?.masteryRank).toBe(17);
    expect(b.nextRefreshAt).not.toBeNull();
    expect(second.de.state.calls).toHaveLength(0);
    await second.app.close();
    second.database.close();
  });
});

describe('goals and the imported profile', () => {
  it('marks a goal mastered once the profile shows rank 30 XP for it', async () => {
    const database = openDatabase(':memory:');
    const { userId } = initDatabase(database.db, loadSeed(), START);
    const de = fakeDe();
    const raw = structuredClone(profileFixture()) as {
      Results: { LoadOutInventory: { XPInfo: { ItemType: string; XP: number }[] } }[];
    };
    raw.Results[0]!.LoadOutInventory.XPInfo.push(
      { ItemType: '/Lotus/Powersuits/Infestation/InfestationPrime', XP: 900_000 }, // Nidus Prime
      { ItemType: '/Lotus/Weapons/Tenno/Shotgun/PrimeBoar', XP: 449_999 }, // Boar Prime, one short
    );
    de.state.body = raw;
    const items = fakeItemsApi();
    const now = () => START;
    const app = await buildApp({
      db: database.db,
      userId,
      now,
      liveTimes: () => ({}),
      items: new ItemCatalog(database.db, { fetch: items.fetchFn, now, sleep: async () => {} }),
      profile: new ProfileService(database.db, userId, { fetch: de.fetchFn, now }),
    });
    const add = async (q: string, name: string) => {
      const found = (await app.inject({ method: 'GET', url: `/api/goals/search?q=${q}` })).json();
      const hit = found.results.find((r: { name: string }) => r.name === name);
      await app.inject({
        method: 'POST',
        url: '/api/goals',
        payload: { uniqueName: hit.uniqueName },
      });
    };
    await add('nidus', 'Nidus Prime');
    await add('boar', 'Boar Prime');
    const mastered = async () =>
      Object.fromEntries(
        (await app.inject({ method: 'GET', url: '/api/goals' }))
          .json()
          .active.map((g: { name: string; mastered: boolean }) => [g.name, g.mastered]),
      );
    expect(await mastered()).toEqual({ 'Nidus Prime': false, 'Boar Prime': false }); // nothing imported

    await app.inject({ method: 'PUT', url: '/api/profile/account', payload: { accountId: ID } });
    await app.inject({ method: 'POST', url: '/api/profile/refresh' });
    expect(await mastered()).toEqual({ 'Nidus Prime': true, 'Boar Prime': false });

    await app.inject({ method: 'DELETE', url: '/api/profile' });
    expect(await mastered()).toEqual({ 'Nidus Prime': false, 'Boar Prime': false });
    await app.close();
    database.close();
  });
});
