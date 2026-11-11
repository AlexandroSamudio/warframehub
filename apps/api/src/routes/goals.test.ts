import { ApiError, GoalsResponse, ItemSearchResponse, type Goal } from '@warframehub/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { ItemCatalog } from '../sources/items.js';
import { fakeItemsApi, itemsFixture } from '../sources/test-fixtures.js';

const START = new Date('2026-11-10T18:00:00.000Z');

async function setup(file = ':memory:') {
  const database = openDatabase(file);
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const api = fakeItemsApi();
  const clock = { now: START };
  const now = () => clock.now;
  const app = await buildApp({
    db: database.db,
    userId,
    now,
    liveTimes: () => ({}),
    items: new ItemCatalog(database.db, { fetch: api.fetchFn, now, sleep: async () => {} }),
  });
  return { app, database, api, clock };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

async function call(
  ctx: Ctx,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return ctx.app.inject({ method, url, ...(payload ? { payload } : {}) });
}
async function goals(ctx: Ctx) {
  return GoalsResponse.parse((await call(ctx, 'GET', '/api/goals')).json());
}
/** Searches, then adds the named result as a goal. */
async function add(ctx: Ctx, query: string, name: string): Promise<Goal> {
  const search = ItemSearchResponse.parse(
    (await call(ctx, 'GET', `/api/goals/search?q=${query}`)).json(),
  );
  const hit = search.results.find((r) => r.name === name)!;
  const res = await call(ctx, 'POST', '/api/goals', { uniqueName: hit.uniqueName });
  expect(res.statusCode).toBe(201);
  return GoalsResponse.parse(res.json()).active.find((g) => g.name === name)!;
}
const part = (g: Goal, name: string) => g.parts.find((p) => p.name === name)!;
const resource = (g: Goal, name: string) => g.resources.find((r) => r.name === name)!;

describe('goals', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('starts empty', async () => {
    expect(await goals(ctx)).toEqual({ active: [], built: [], shoppingList: [], stock: [] });
  });

  it('adds a goal from search results, without a second request', async () => {
    const g = await add(ctx, 'nidus', 'Nidus Prime');
    expect(g).toMatchObject({ status: 'active', isPrime: true, vaulted: true, ready: false });
    expect(g.parts.map((p) => [p.name, p.owned])).toEqual([
      ['Blueprint', 0],
      ['Chassis', 0],
      ['Neuroptics', 0],
      ['Systems', 0],
    ]);
    expect(ctx.api.state.calls).toHaveLength(2); // just the one search (Warframes + weapons)
  });

  it('refuses unknown items and active duplicates', async () => {
    const unknown = await call(ctx, 'POST', '/api/goals', { uniqueName: '/Lotus/Nope' });
    expect(unknown.statusCode).toBe(404);
    expect(ApiError.parse(unknown.json()).error.code).toBe('unknown_item');

    const g = await add(ctx, 'boar', 'Boar');
    const dup = await call(ctx, 'POST', '/api/goals', { uniqueName: g.uniqueName });
    expect(dup.statusCode).toBe(409);
    expect(ApiError.parse(dup.json()).error.code).toBe('already_active');
  });

  it('ticks parts per goal and checks the count', async () => {
    const g = await add(ctx, 'nidus', 'Nidus Prime');
    const chassis = part(g, 'Chassis');
    const res = await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: chassis.key,
      owned: 1,
    });
    const after = GoalsResponse.parse(res.json()).active[0]!;
    expect(part(after, 'Chassis').owned).toBe(1);
    expect(after.progress.done).toBe(1);

    const tooMany = await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: chassis.key,
      owned: 2,
    });
    expect(ApiError.parse(tooMany.json()).error.code).toBe('bad_count');
    const unknown = await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: '/Lotus/Nope',
      owned: 1,
    });
    expect(ApiError.parse(unknown.json()).error.code).toBe('unknown_part');
  });

  it('shares resource stock across goals in the shopping list', async () => {
    const nidus = await add(ctx, 'nidus', 'Nidus Prime'); // 5 Orokin Cells
    await add(ctx, 'boar', 'Boar Prime'); // 10 Orokin Cells
    const cell = resource(nidus, 'Orokin Cell');
    const res = await call(ctx, 'PUT', '/api/resources', { key: cell.key, amount: 12 });
    const body = GoalsResponse.parse(res.json());

    expect(body.stock).toEqual([{ key: cell.key, name: 'Orokin Cell', amount: 12 }]);
    expect(body.shoppingList.find((r) => r.name === 'Orokin Cell')).toMatchObject({
      needed: 15,
      have: 12,
      missing: 3,
    });
    // The 12 cells are shared in goal order: Nidus Prime takes its 5, Boar Prime gets 7 of 10.
    const [first, second] = body.active;
    expect(resource(first!, 'Orokin Cell')).toMatchObject({ have: 5, stock: 12 });
    expect(resource(second!, 'Orokin Cell')).toMatchObject({ have: 7, stock: 12 });

    // Reordering changes who gets the cells first.
    const reordered = GoalsResponse.parse(
      (await call(ctx, 'POST', '/api/goals/reorder', { goalIds: [second!.id, first!.id] })).json(),
    );
    expect(reordered.active.map((g) => [g.name, resource(g, 'Orokin Cell').have])).toEqual([
      ['Boar Prime', 10],
      ['Nidus Prime', 2],
    ]);

    const unknown = await call(ctx, 'PUT', '/api/resources', { key: '/Lotus/Nope', amount: 1 });
    expect(ApiError.parse(unknown.json()).error.code).toBe('unknown_resource');
  });

  it('marks a goal built, keeps it in "built", and can bring it back', async () => {
    const g = await add(ctx, 'boar', 'Boar');
    ctx.clock.now = new Date('2026-11-11T10:00:00.000Z');
    const built = GoalsResponse.parse((await call(ctx, 'POST', `/api/goals/${g.id}/built`)).json());
    expect(built.active).toEqual([]);
    expect(built.built[0]).toMatchObject({
      name: 'Boar',
      status: 'built',
      builtAt: '2026-11-11T10:00:00.000Z',
    });
    expect(built.shoppingList).toEqual([]); // built goals need nothing

    const again = await call(ctx, 'POST', `/api/goals/${g.id}/built`);
    expect(ApiError.parse(again.json()).error.code).toBe('already_built');

    const back = GoalsResponse.parse(
      (await call(ctx, 'POST', `/api/goals/${g.id}/reactivate`)).json(),
    );
    expect(back.active.map((x) => x.name)).toEqual(['Boar']);
  });

  it('will not reactivate a goal that is already active again', async () => {
    const first = await add(ctx, 'boar', 'Boar');
    await call(ctx, 'POST', `/api/goals/${first.id}/built`);
    await add(ctx, 'boar', 'Boar'); // building a second one
    const res = await call(ctx, 'POST', `/api/goals/${first.id}/reactivate`);
    expect(res.statusCode).toBe(409);
  });

  it('deletes a goal but keeps the shared stock', async () => {
    const g = await add(ctx, 'boar', 'Boar');
    await call(ctx, 'PUT', '/api/resources', { key: resource(g, 'Plastids').key, amount: 300 });
    const res = GoalsResponse.parse((await call(ctx, 'DELETE', `/api/goals/${g.id}`)).json());
    expect(res.active).toEqual([]);
    expect(res.stock.map((s) => [s.name, s.amount])).toEqual([['Plastids', 300]]);
    expect((await call(ctx, 'DELETE', `/api/goals/${g.id}`)).statusCode).toBe(404);
  });

  it('reorders active goals', async () => {
    const a = await add(ctx, 'nidus', 'Nidus');
    const b = await add(ctx, 'boar', 'Boar');
    const res = GoalsResponse.parse(
      (await call(ctx, 'POST', '/api/goals/reorder', { goalIds: [b.id, a.id] })).json(),
    );
    expect(res.active.map((g) => g.name)).toEqual(['Boar', 'Nidus']);
    expect(
      (await call(ctx, 'POST', '/api/goals/reorder', { goalIds: [a.id, a.id] })).statusCode,
    ).toBe(400);
  });

  it('"Update recipe" replaces the recipe and keeps part counts', async () => {
    const g = await add(ctx, 'boar', 'Boar');
    await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: part(g, 'Blueprint').key,
      owned: 1,
    });

    // Upstream now asks for 1000 Plastids instead of 900.
    const changed = itemsFixture('weapons_search_boar').map((item) =>
      item.name !== 'Boar'
        ? item
        : {
            ...item,
            components: (item.components as Record<string, unknown>[]).map((c) =>
              c.name === 'Plastids' ? { ...c, itemCount: 1000 } : c,
            ),
          },
    );
    ctx.api.state.override.set('weapons/boar', changed);
    ctx.clock.now = new Date('2026-11-10T19:00:00.000Z');
    const res = GoalsResponse.parse((await call(ctx, 'POST', `/api/goals/${g.id}/refresh`)).json());
    const updated = res.active[0]!;
    expect(resource(updated, 'Plastids').count).toBe(1000);
    expect(part(updated, 'Blueprint').owned).toBe(1);
    expect(updated.recipeFetchedAt).toBe('2026-11-10T19:00:00.000Z');
  });

  it('"Update recipe" offline, or for an item no longer listed, keeps the saved recipe', async () => {
    const g = await add(ctx, 'boar', 'Boar');
    ctx.api.state.online = false;
    const offline = await call(ctx, 'POST', `/api/goals/${g.id}/refresh`);
    expect(offline.statusCode).toBe(503);
    expect(ApiError.parse(offline.json()).error.code).toBe('items_unavailable');

    ctx.api.state.online = true;
    ctx.api.state.override.set('weapons/boar', []);
    const gone = await call(ctx, 'POST', `/api/goals/${g.id}/refresh`);
    expect(ApiError.parse(gone.json()).error.code).toBe('item_gone');
    expect(resource((await goals(ctx)).active[0]!, 'Plastids').count).toBe(900);
  });

  it('each part mentions its crafting materials, and they count until you own the part', async () => {
    const g = await add(ctx, 'nidus', 'Nidus Prime');
    const chassis = part(g, 'Chassis');
    expect(chassis.craft!.credits).toBe(15000);
    expect(chassis.craft!.ingredients.map((i) => `${i.name} ×${i.count}`)).toEqual(
      expect.arrayContaining([
        'Tellurium ×2',
        'Plastids ×450',
        'Polymer Bundle ×1425',
        'Alloy Plate ×5500',
      ]),
    );
    expect(part(g, 'Blueprint').craft).toBeNull(); // the frame's own recipe is the resources

    // 25,000 own + 15,000 for each of the three crafted parts.
    expect(resource(g, 'Credits')).toMatchObject({ count: 70000, forParts: 45000 });
    expect(resource(g, 'Alloy Plate')).toMatchObject({ count: 5500, forParts: 5500 });

    const after = GoalsResponse.parse(
      (
        await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
          componentKey: chassis.key,
          owned: 1,
        })
      ).json(),
    ).active[0]!;
    expect(resource(after, 'Credits')).toMatchObject({ count: 55000, forParts: 30000 });
    expect(after.resources.find((r) => r.name === 'Alloy Plate')).toBeUndefined();
    expect(after.progress.total).toBe(g.progress.total);
  });

  it('names the quest the wiki says a Blueprint comes from, and keeps the part note separate', async () => {
    const g = await add(ctx, 'nidus', 'Nidus');
    const blueprint = part(g, 'Blueprint');
    expect(blueprint.drops).toEqual([]);
    expect(blueprint.sources).toEqual([
      {
        kind: 'quest',
        title: 'The Glast Gambit',
        url: 'https://wiki.warframe.com/wiki/The_Glast_Gambit',
      },
    ]);
    expect(part(g, 'Chassis').sources).toEqual([]);

    // A note doesn't remove the wiki source; the screen shows the note instead.
    const noted = GoalsResponse.parse(
      (
        await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
          componentKey: blueprint.key,
          note: 'Done',
        })
      ).json(),
    ).active[0]!;
    expect(part(noted, 'Blueprint')).toMatchObject({ note: 'Done' });
    expect(part(noted, 'Blueprint').sources).toHaveLength(1);
  });

  it('can set the stock of a material only a part needs', async () => {
    const g = await add(ctx, 'nidus', 'Nidus Prime');
    const plastids = resource(g, 'Plastids');
    const res = await call(ctx, 'PUT', '/api/resources', { key: plastids.key, amount: 200 });
    expect(res.statusCode).toBe(200);
    const body = GoalsResponse.parse(res.json());
    expect(resource(body.active[0]!, 'Plastids')).toMatchObject({ have: 200, stock: 200 });
    expect(body.shoppingList.find((r) => r.name === 'Plastids')).toMatchObject({ missing: 250 });
  });

  it('saves a note on a part, alone or with the count, and keeps it', async () => {
    const g = await add(ctx, 'nidus', 'Nidus');
    const blueprint = part(g, 'Blueprint');
    const noted = GoalsResponse.parse(
      (
        await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
          componentKey: blueprint.key,
          note: '  Quest reward  ',
        })
      ).json(),
    ).active[0]!;
    expect(part(noted, 'Blueprint')).toMatchObject({ note: 'Quest reward', owned: 0 });

    const ticked = GoalsResponse.parse(
      (
        await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
          componentKey: blueprint.key,
          owned: 1,
        })
      ).json(),
    ).active[0]!;
    expect(part(ticked, 'Blueprint')).toMatchObject({ note: 'Quest reward', owned: 1 });

    const cleared = GoalsResponse.parse(
      (
        await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
          componentKey: blueprint.key,
          note: '',
        })
      ).json(),
    ).active[0]!;
    expect(part(cleared, 'Blueprint').note).toBe('');

    const empty = await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: blueprint.key,
    });
    expect(empty.statusCode).toBe(400);
    const long = await call(ctx, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: blueprint.key,
      note: 'x'.repeat(201),
    });
    expect(long.statusCode).toBe(400);
  });

  it('existing goals still load offline (they keep their own recipe copy)', async () => {
    await add(ctx, 'nidus', 'Nidus');
    ctx.api.state.online = false;
    expect((await goals(ctx)).active.map((g) => g.name)).toEqual(['Nidus']);
  });
});

describe('restart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-goals-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('goals, part counts and stock survive a restart', async () => {
    const file = join(dir, 'warframehub.db');
    const first = await setup(file);
    const g = await add(first, 'nidus', 'Nidus Prime');
    await call(first, 'PATCH', `/api/goals/${g.id}/parts`, {
      componentKey: part(g, 'Systems').key,
      owned: 1,
    });
    await call(first, 'PUT', '/api/resources', { key: resource(g, 'Orokin Cell').key, amount: 4 });
    await first.app.close();
    first.database.close();

    const second = await setup(file);
    second.api.state.online = false; // no network needed
    const body = await goals(second);
    expect(part(body.active[0]!, 'Systems').owned).toBe(1);
    expect(body.stock).toEqual([
      { key: resource(g, 'Orokin Cell').key, name: 'Orokin Cell', amount: 4 },
    ]);
    await second.app.close();
    second.database.close();
  });
});
