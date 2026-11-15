import { FavoriteResponse, WarframeDetail, WarframesResponse } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { fixture } from '../sources/test-fixtures.js';
import { WarframeCatalog } from '../sources/warframes.js';
import type { FetchFn } from '../sources/worldstate.js';

const START = new Date('2026-11-15T12:00:00.000Z');

async function setup() {
  const database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const fetchFn: FetchFn = async (url) => {
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
  const now = () => START;
  const app = await buildApp({
    db: database.db,
    userId,
    now,
    liveTimes: () => ({}),
    warframes: new WarframeCatalog(database.db, { fetch: fetchFn, now }),
  });
  await app.inject({ method: 'PATCH', url: '/api/settings', payload: { language: 'en' } });
  const list = async () =>
    WarframesResponse.parse((await app.inject({ method: 'GET', url: '/api/warframes' })).json());
  const favorite = (slug: string, value: boolean) =>
    app.inject({
      method: 'PUT',
      url: `/api/warframes/${slug}/favorite`,
      payload: { favorite: value },
    });
  return { app, list, favorite };
}

describe('favorite Warframes', () => {
  it('starts with none, and a star shows in the list and on the page', async () => {
    const { app, list, favorite } = await setup();
    expect((await list()).warframes.some((w) => w.favorite)).toBe(false);

    const res = await favorite('mesa', true);
    expect(res.statusCode).toBe(200);
    expect(FavoriteResponse.parse(res.json())).toEqual({ slug: 'mesa', favorite: true });

    const after = await list();
    expect(after.warframes.filter((w) => w.favorite).map((w) => w.slug)).toEqual(['mesa']);
    const page = WarframeDetail.parse(
      (await app.inject({ method: 'GET', url: '/api/warframes/mesa' })).json(),
    );
    expect(page.favorite).toBe(true);
    const other = WarframeDetail.parse(
      (await app.inject({ method: 'GET', url: '/api/warframes/nidus' })).json(),
    );
    expect(other.favorite).toBe(false);
  });

  it('can be removed, and starring twice is harmless', async () => {
    const { list, favorite } = await setup();
    await favorite('mesa', true);
    expect((await favorite('mesa', true)).statusCode).toBe(200);
    expect((await list()).warframes.filter((w) => w.favorite)).toHaveLength(1);
    await favorite('mesa', false);
    expect((await list()).warframes.some((w) => w.favorite)).toBe(false);
  });

  it('refuses a Warframe that does not exist, and a bad body', async () => {
    const { app, favorite } = await setup();
    expect((await favorite('no-such-frame', true)).statusCode).toBe(404);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/warframes/mesa/favorite',
      payload: { favorite: 'yes' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
