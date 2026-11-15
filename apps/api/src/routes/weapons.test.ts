import { FavoriteResponse, WeaponDetail, WeaponsResponse } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { profileCache } from '../db/schema.js';
import { loadSeed } from '../domain/seed.js';
import { ItemCatalog } from '../sources/items.js';
import { fixture } from '../sources/test-fixtures.js';
import { WeaponCatalog } from '../sources/weapons.js';
import type { FetchFn } from '../sources/worldstate.js';

const START = new Date('2026-11-15T12:00:00.000Z');

async function setup() {
  const database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const fetchFn: FetchFn = async (url) => {
    const body = new URL(url).pathname === '/weapons' ? fixture('weapons/weapons') : [];
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  };
  const offline: FetchFn = async () => {
    throw new TypeError('fetch failed');
  };
  const now = () => START;
  const app = await buildApp({
    db: database.db,
    userId,
    now,
    liveTimes: () => ({}),
    weapons: new WeaponCatalog(database.db, { fetch: fetchFn, now }),
    // Goals must come from the weapon list's saved items, never a search.
    items: new ItemCatalog(database.db, { fetch: offline, now }),
  });
  const language = (lang: 'en' | 'es') =>
    app.inject({ method: 'PATCH', url: '/api/settings', payload: { language: lang } });
  await language('en');
  const list = async () =>
    WeaponsResponse.parse((await app.inject({ method: 'GET', url: '/api/weapons' })).json());
  const page = async (slug: string) =>
    WeaponDetail.parse((await app.inject({ method: 'GET', url: `/api/weapons/${slug}` })).json());
  const favorite = (slug: string, value: boolean) =>
    app.inject({
      method: 'PUT',
      url: `/api/weapons/${slug}/favorite`,
      payload: { favorite: value },
    });
  const profile = (items: { uniqueName: string; xp: number }[], masteryRank = 12) =>
    database.db
      .insert(profileCache)
      .values({
        userId,
        fetchedAt: START,
        payloadJson: JSON.stringify({
          displayName: 'Tenno',
          masteryRank,
          items,
          syndicates: [],
          intrinsics: [],
          missionsCompleted: 0,
          nodesCompleted: 0,
          timePlayedSeconds: 0,
        }),
      })
      .run();
  return { app, list, page, favorite, profile, language };
}

describe('GET /api/weapons', () => {
  it('lists each weapon once with its tab, slot, class and versions', async () => {
    const { list } = await setup();
    const { weapons, masteryRank } = await list();
    expect(masteryRank).toBeNull(); // no profile imported
    const braton = weapons.find((w) => w.slug === 'braton')!;
    expect(braton).toMatchObject({
      name: 'Braton',
      tab: 'weapons',
      slot: 'primary',
      class: 'Rifle',
      image: 'Braton.png',
      incarnon: true,
      favorite: false,
    });
    expect(braton.variants.map((v) => v.kind)).toEqual(['normal', 'prime', 'vandal', 'mk1']);
    // The best Riven disposition and the lowest Mastery Rank among the versions.
    expect(braton.disposition).toBe(4);
    expect(braton.masteryReq).toBe(0);
    expect(weapons.find((w) => w.slug === 'mausolon')).toMatchObject({
      tab: 'arch',
      slot: 'archgun',
      class: null,
    });
    expect(weapons.map((w) => w.slug)).not.toContain('sirocco');
    expect(weapons.map((w) => w.name)).toEqual([...weapons.map((w) => w.name)].sort());
  });

  it('marks versions mastered from the profile, and returns your Mastery Rank', async () => {
    const { list, profile } = await setup();
    profile([{ uniqueName: '/Lotus/Weapons/Tenno/Rifle/BratonPrime', xp: 450_000 }], 14);
    const { weapons, masteryRank } = await list();
    expect(masteryRank).toBe(14);
    const braton = weapons.find((w) => w.slug === 'braton')!;
    expect(braton.variants.filter((v) => v.mastered).map((v) => v.name)).toEqual(['Braton Prime']);
  });

  it('gives the names in Spanish', async () => {
    const { list, page, language } = await setup();
    await language('es');
    const hek = (await list()).weapons.find((w) => w.slug === 'kuva-hek')!;
    expect(hek.name).toBe('Hek Kuva');
    const braton = await page('braton');
    expect(braton.variants[1]!.description).toMatch(/^Una clásica arma orokin/);
  });
});

describe('GET /api/weapons/:slug', () => {
  it('returns each version with its stats, attacks, recipe and details', async () => {
    const { page } = await setup();
    const braton = await page('braton');
    expect(braton.variants.map((v) => v.name)).toEqual([
      'Braton',
      'Braton Prime',
      'Braton Vandal',
      'Mk1-Braton',
    ]);
    const prime = braton.variants[1]!;
    expect(prime.stats).toMatchObject({ disposition: 4, magazine: 75, range: null });
    expect(prime.attacks.map((a) => a.name)).toEqual([
      'Normal Attack',
      'Incarnon Form',
      'Incarnon Form AoE',
    ]);
    expect(prime.incarnon).toBe(true);
    expect(prime.masteryReq).toBe(8);
    expect(prime.recipe!.parts.map((p) => p.name)).toContain('Barrel');
    expect(prime.wikiUrl).toMatch(/^https:\/\//);
    expect(prime.goal).toBeNull();
  });

  it('gives melee weapons their range and no magazine', async () => {
    const { page } = await setup();
    const skana = await page('skana');
    expect(skana.class).toBe('Sword');
    expect(skana.variants[0]!.stats).toMatchObject({ magazine: null, range: 2.5 });
    expect(skana.variants[0]!.attacks.map((a) => a.name)).toContain('Heavy Slam Attack');
  });

  it('gives an arch-gun a recipe, so it can be a goal', async () => {
    const { app, page } = await setup();
    const mausolon = await page('mausolon');
    expect(mausolon.variants[0]!.recipe).not.toBeNull();
    const res = await app.inject({
      method: 'POST',
      url: '/api/goals',
      payload: { uniqueName: mausolon.variants[0]!.uniqueName },
    });
    expect(res.statusCode).toBe(201);
    expect((await page('mausolon')).variants[0]!.goal).toMatchObject({ status: 'active' });
  });

  it('answers 404 for a weapon that does not exist', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/weapons/no-such-gun' });
    expect(res.statusCode).toBe(404);
  });
});

describe('favorite weapons', () => {
  it('stars and unstars, shown in the list and on the page', async () => {
    const { list, page, favorite } = await setup();
    const res = await favorite('hek', true);
    expect(FavoriteResponse.parse(res.json())).toEqual({ slug: 'hek', favorite: true });
    expect((await favorite('hek', true)).statusCode).toBe(200);
    expect((await list()).weapons.filter((w) => w.favorite).map((w) => w.slug)).toEqual(['hek']);
    expect((await page('hek')).favorite).toBe(true);
    await favorite('hek', false);
    expect((await list()).weapons.some((w) => w.favorite)).toBe(false);
  });

  it('refuses a weapon that does not exist, and a bad body', async () => {
    const { app, favorite } = await setup();
    expect((await favorite('no-such-gun', true)).statusCode).toBe(404);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/weapons/hek/favorite',
      payload: { favorite: 'yes' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
