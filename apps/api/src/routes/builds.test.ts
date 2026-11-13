import {
  ApiError,
  Build,
  BuildOptionsResponse,
  WarframeDetail,
  type BuildContent,
} from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { builds } from '../db/schema.js';
import { loadSeed } from '../domain/seed.js';
import { fixture } from '../sources/test-fixtures.js';
import { WarframeCatalog } from '../sources/warframes.js';
import type { FetchFn } from '../sources/worldstate.js';

const START = new Date('2026-11-13T12:00:00.000Z');

const INTENSIFY = '/Lotus/Upgrades/Mods/Warframe/AvatarAbilityStrengthMod';
const GROWING_POWER = '/Lotus/Upgrades/Mods/Aura/FairyQuest/FairyQuestCritToAbilityAuraMod';
const POWER_DRIFT = '/Lotus/Upgrades/Mods/OrokinChallenge/OrokinChallengeModPower';
const MESAS_WALTZ = '/Lotus/Powersuits/Cowgirl/GunFuPvPAugmentCard';
const LARVA_BURST = '/Lotus/Powersuits/Infestation/InfestTendrilsAugmentCard';
const ENERGIZE = '/Lotus/Upgrades/CosmeticEnhancers/Utility/GolemArcaneRadialEnergyOnEnergyPickup';
const LARVA = '/Lotus/Powersuits/Infestation/Abilities/InfestTendrilsAbility';
const PEACEMAKER = '/Lotus/Powersuits/Cowgirl/Abilities/GunFuAbility';

function fakeUpstream() {
  const state = { online: true };
  const fetchFn: FetchFn = async (url) => {
    if (!state.online) throw new TypeError('fetch failed');
    const path = new URL(url).pathname;
    const body =
      path === '/warframes'
        ? fixture('warframes/warframes')
        : path === '/mods'
          ? fixture('warframes/mods')
          : path === '/items/search/arcane'
            ? fixture('warframes/arcanes')
            : [];
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  };
  return { state, fetchFn };
}

async function setup() {
  const database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const up = fakeUpstream();
  const clock = { now: START };
  const now = () => clock.now;
  const app = await buildApp({
    db: database.db,
    userId,
    now,
    liveTimes: () => ({}),
    warframes: new WarframeCatalog(database.db, { fetch: up.fetchFn, now }),
  });
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { app, database, up, clock, call };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const slot = (uniqueName: string, name: string, rank: number, note = '') => ({
  uniqueName,
  name,
  rank,
  note,
});

function mesaBuild(): Partial<BuildContent> {
  return {
    sourceUrl: 'https://overframe.gg/build/123/',
    author: 'Someone',
    patch: 'Update 41',
    guide: '## How to play\n\nPress **4**.',
    aura: slot(GROWING_POWER, 'Growing Power', 5),
    exilus: slot(MESAS_WALTZ, "Mesa's Waltz", 3, 'Move while shooting'),
    slots: [
      slot(INTENSIFY, 'intensify (typed)', 5, 'Peacemaker damage'),
      // An Exilus mod can also go in a normal slot.
      slot(POWER_DRIFT, 'Power Drift', 5),
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    arcanes: [slot(ENERGIZE, 'Arcane Energize', 5), null],
    shards: [{ stat: 'crimson.ability_strength', tauforged: true, note: '' }],
    helminth: { replacesKey: 3, uniqueName: LARVA, name: 'Larva', note: 'Groups enemies' },
    weapons: [
      { uniqueName: '/Lotus/Weapons/Tenno/Pistols/CowgirlPistol', name: 'Regulators', note: '' },
    ],
  };
}

async function create(
  ctx: Ctx,
  content: Partial<BuildContent>,
  name = 'Steel Path',
  slug = 'mesa',
) {
  return ctx.call('POST', '/api/builds', { slug, name, content });
}
async function detail(ctx: Ctx, slug: string) {
  return WarframeDetail.parse((await ctx.call('GET', `/api/warframes/${slug}`)).json());
}
function errorOf(res: { json: () => unknown }) {
  return ApiError.parse(res.json()).error.message;
}

describe('builds', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('starts with none, owned by the Prime version', async () => {
    const mesa = await detail(ctx, 'mesa');
    expect(mesa.builds).toEqual([]);
    expect(mesa.buildsVariant).toBe('Mesa Prime');
    expect((await detail(ctx, 'excalibur')).buildsVariant).toBe('Excalibur Umbra');
  });

  it('saves a build with the data names and shows it resolved on the Warframe page', async () => {
    const res = await create(ctx, mesaBuild());
    expect(res.statusCode).toBe(201);
    const saved = Build.parse(res.json());
    expect(saved.content.slots[0]!.name).toBe('Intensify');
    expect(saved.createdAt).toBe(START.toISOString());

    const [view] = (await detail(ctx, 'mesa')).builds;
    expect(view!.name).toBe('Steel Path');
    expect(view!.aura).toMatchObject({ name: 'Growing Power', image: expect.any(String) });
    expect(view!.slots[0]).toMatchObject({
      name: 'Intensify',
      rank: 5,
      note: 'Peacemaker damage',
      effect: '+30% Ability Strength',
      polarity: 'madurai',
      maxRank: 5,
    });
    expect(view!.slots[1]).toMatchObject({ name: 'Power Drift' });
    expect(view!.slots[2]).toBeNull();
    expect(view!.arcanes[0]!.effect).toContain('replenish 150 Energy');
    expect(view!.shards[0]).toMatchObject({ color: 'crimson', text: '+15% Ability Strength' });
    expect(view!.helminth).toMatchObject({
      name: 'Larva',
      from: 'Nidus',
      page: expect.stringContaining('wiki'),
    });
    expect(view!.content.guide).toContain('**4**');
  });

  it('fills in defaults for parts left out', async () => {
    const saved = Build.parse((await create(ctx, {})).json());
    expect(saved.content.slots).toEqual(Array(8).fill(null));
    expect(saved.content.arcanes).toEqual([null, null]);
    expect(saved.content).toMatchObject({ aura: null, shards: [], weapons: [], sourceUrl: '' });
  });

  it('serves mod and arcane images once the data lists them', async () => {
    await create(ctx, mesaBuild());
    const [view] = (await detail(ctx, 'mesa')).builds;
    expect(view!.slots[0]!.image).toBe('AbilityStrengthMod.jpg');
  });

  it('gives the edit page what fits this Warframe', async () => {
    const options = BuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/builds/options?slug=mesa')).json(),
    );
    expect(options.buildsVariant).toBe('Mesa Prime');
    expect(options.abilities.map((a) => a.name)).toEqual([
      'Ballistic Battery',
      'Shooting Gallery',
      'Shatter Shield',
      'Peacemaker',
    ]);
    const mods = new Set(options.mods.map((m) => m.uniqueName));
    expect(mods.has(MESAS_WALTZ)).toBe(true);
    expect(mods.has(LARVA_BURST)).toBe(false); // Nidus's augment
    expect(options.arcanes.some((a) => a.name === 'Arcane Energize')).toBe(true);
    expect(options.helminth.some((h) => h.uniqueName === LARVA)).toBe(true);
    expect(options.helminth.some((h) => h.uniqueName === PEACEMAKER)).toBe(false); // her own
  });

  it('refuses what the game would not allow', async () => {
    const cases: [Partial<BuildContent>, string][] = [
      [{ aura: slot(INTENSIFY, 'Intensify', 5) }, "isn't an aura mod"],
      [{ exilus: slot(INTENSIFY, 'Intensify', 5) }, "can't go in the Exilus slot"],
      [{ slots: [slot(GROWING_POWER, 'Growing Power', 5), ...Array(7).fill(null)] }, 'aura slot'],
      [{ slots: [slot(INTENSIFY, 'Intensify', 6), ...Array(7).fill(null)] }, 'up to rank 5'],
      [
        {
          slots: [
            slot(INTENSIFY, 'Intensify', 5),
            slot(INTENSIFY, 'Intensify', 5),
            ...Array(6).fill(null),
          ],
        },
        'twice',
      ],
      [
        { slots: [slot(LARVA_BURST, 'Larva Burst', 3), ...Array(7).fill(null)] },
        'augment for Nidus',
      ],
      [{ slots: [slot('/Lotus/Nope', 'Made Up', 0), ...Array(7).fill(null)] }, 'Unknown mod'],
      [
        { arcanes: [slot(ENERGIZE, 'Arcane Energize', 5), slot(ENERGIZE, 'Arcane Energize', 5)] },
        'twice',
      ],
      [
        { helminth: { replacesKey: 1, uniqueName: PEACEMAKER, name: 'Peacemaker', note: '' } },
        "already one of Mesa's abilities",
      ],
      [{ sourceUrl: 'javascript:alert(1)' }, 'http'],
      [
        { shards: [{ stat: 'crimson.made_up', tauforged: false, note: '' }] },
        'Unknown Archon Shard stat',
      ],
    ];
    for (const [content, message] of cases) {
      const res = await create(ctx, content);
      expect(res.statusCode, message).toBe(400);
      expect(errorOf(res)).toContain(message);
    }
    expect((await create(ctx, {}, '   ')).statusCode).toBe(400); // needs a name
    expect((await create(ctx, {}, 'x', 'no-such-frame')).statusCode).toBe(404);
  });

  it('updates a build whole, and keeps a mod the data no longer lists', async () => {
    const saved = Build.parse((await create(ctx, mesaBuild())).json());
    ctx.clock.now = new Date('2026-11-14T08:00:00.000Z');
    const edited = { ...saved.content, guide: 'New guide' };
    // A mod the saved build had, now missing from the data: still accepted.
    edited.slots = [...saved.content.slots];
    edited.slots[1] = null;
    const res = await ctx.call('PUT', `/api/builds/${saved.id}`, {
      name: 'Renamed',
      content: edited,
    });
    expect(res.statusCode).toBe(200);
    const updated = Build.parse(res.json());
    expect(updated).toMatchObject({ name: 'Renamed', updatedAt: '2026-11-14T08:00:00.000Z' });
    expect(updated.content.guide).toBe('New guide');

    ctx.database.db
      .update(builds)
      .set({
        contentJson: JSON.stringify({
          ...updated.content,
          slots: [slot('/Lotus/Gone', 'Old Mod', 3), ...Array(7).fill(null)],
        }),
      })
      .where(eq(builds.id, saved.id))
      .run();
    const old = Build.parse((await ctx.call('GET', `/api/builds/${saved.id}`)).json());
    expect(
      (await ctx.call('PUT', `/api/builds/${saved.id}`, { name: 'Renamed', content: old.content }))
        .statusCode,
    ).toBe(200);
    const [view] = (await detail(ctx, 'mesa')).builds;
    expect(view!.slots[0]).toMatchObject({ name: 'Old Mod', effect: null, image: null });
  });

  it('reorders and deletes', async () => {
    const a = Build.parse((await create(ctx, {}, 'A')).json());
    const b = Build.parse((await create(ctx, {}, 'B')).json());
    await create(ctx, {}, 'Nidus one', 'nidus');
    expect((await detail(ctx, 'mesa')).builds.map((x) => x.name)).toEqual(['A', 'B']);

    const res = await ctx.call('POST', '/api/builds/reorder', {
      slug: 'mesa',
      buildIds: [b.id, a.id],
    });
    expect(res.statusCode).toBe(200);
    expect((await detail(ctx, 'mesa')).builds.map((x) => x.name)).toEqual(['B', 'A']);
    expect(
      (await ctx.call('POST', '/api/builds/reorder', { slug: 'mesa', buildIds: [b.id] }))
        .statusCode,
    ).toBe(400);

    expect((await ctx.call('DELETE', `/api/builds/${a.id}`)).statusCode).toBe(204);
    expect((await detail(ctx, 'mesa')).builds.map((x) => x.name)).toEqual(['B']);
    expect((await ctx.call('GET', `/api/builds/${a.id}`)).statusCode).toBe(404);
    expect((await detail(ctx, 'nidus')).builds.map((x) => x.name)).toEqual(['Nidus one']);
  });
});
