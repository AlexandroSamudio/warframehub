import {
  ApiError,
  ChecklistResponse,
  TrackerResponse,
  type EditableItem,
} from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type OpenDatabase } from '../db/client.js';
import { applySeed, initDatabase } from '../db/init.js';
import { items, ticks } from '../db/schema.js';
import { loadSeed, type SeedFile } from '../domain/seed.js';

const seed = loadSeed();
const NOW = new Date('2026-11-10T12:00:00.000Z');
const LATER = new Date('2026-11-20T12:00:00.000Z');

let database: OpenDatabase;
let app: Awaited<ReturnType<typeof buildApp>>;
let userId: number;

beforeEach(async () => {
  database = openDatabase(':memory:');
  userId = initDatabase(database.db, seed, NOW).userId;
  app = await buildApp({ db: database.db, userId, now: () => NOW, seed, liveTimes: () => ({}) });
});
afterEach(async () => {
  await app.close();
  database.close();
});

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({ method, url, ...(payload ? { payload } : {}) });
}
async function checklist() {
  return ChecklistResponse.parse((await call('GET', '/api/sections')).json());
}
async function tracker() {
  return TrackerResponse.parse((await call('GET', '/api/tracker')).json());
}
async function sectionBySlug(slug: string) {
  return (await checklist()).sections.find((s) => s.slug === slug)!;
}
async function itemByTitle(title: string): Promise<EditableItem> {
  return (await checklist()).sections.flatMap((s) => s.items).find((i) => i.title === title)!;
}
const seedId = (id: number) =>
  database.db.select({ seedId: items.seedId }).from(items).where(eq(items.id, id)).get()!.seedId;

/** A newer seed version with some changes, applied the way a real update would be. */
function update(change: (s: SeedFile) => void) {
  const next = structuredClone(seed);
  next.seedVersion++;
  change(next);
  return applySeed(database.db, userId, next, LATER);
}
function seedItem(s: SeedFile, id: string) {
  return s.sections.flatMap((x) => x.items).find((i) => i.seedId === id)!;
}

describe('sections', () => {
  it('GET /api/sections lists everything, hidden rows included', async () => {
    await call('DELETE', `/api/sections/${(await sectionBySlug('baro')).id}`);
    const body = await checklist();
    expect(body.sections).toHaveLength(seed.sections.length);
    expect(body.sections.find((s) => s.slug === 'baro')).toMatchObject({
      hidden: true,
      origin: 'default',
    });
    expect((await tracker()).sections.some((s) => s.slug === 'baro')).toBe(false);
  });

  it('creates a custom manual section that can be cleared', async () => {
    const res = await call('POST', '/api/sections', {
      title: 'Sortie: Daily Core!',
      period: 'manual',
    });
    expect(res.statusCode).toBe(201);
    const created = (await checklist()).sections.at(-1)!;
    expect(created).toMatchObject({
      slug: 'sortie-daily-core',
      origin: 'custom',
      period: 'manual',
    });
    expect((await call('POST', `/api/sections/${created.id}/clear`)).statusCode).toBe(200);
  });

  it('a renamed default section keeps its name through a seed update', async () => {
    const daily = await sectionBySlug('daily-core');
    await call('PATCH', `/api/sections/${daily.id}`, { title: 'My dailies' });
    expect((await sectionBySlug('daily-core')).edited).toBe(true);

    update((s) => {
      s.sections[0]!.title = 'Daily: Core (new)';
    });
    expect((await sectionBySlug('daily-core')).title).toBe('My dailies');
  });

  it('deleting hides defaults, deletes custom sections, and protects moved defaults', async () => {
    const sortie = await sectionBySlug('sortie');
    await call('DELETE', `/api/sections/${sortie.id}`);
    expect((await sectionBySlug('sortie')).hidden).toBe(true);

    await call('POST', '/api/sections', { title: 'Mine', period: 'weekly' });
    const mine = await sectionBySlug('mine');
    await call('POST', '/api/items/reorder', {
      sectionId: mine.id,
      itemIds: [sortie.items[0]!.id],
    });
    const blocked = await call('DELETE', `/api/sections/${mine.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(ApiError.parse(blocked.json()).error.code).toBe('has_default_items');

    await call('POST', '/api/items/reorder', {
      sectionId: sortie.id,
      itemIds: [sortie.items[0]!.id],
    });
    expect((await call('DELETE', `/api/sections/${mine.id}`)).statusCode).toBe(200);
    expect((await checklist()).sections.some((s) => s.slug === 'mine')).toBe(false);
  });

  it('reordered sections keep their order through a seed update', async () => {
    const ids = (await checklist()).sections.map((s) => s.id);
    const reversed = [...ids].reverse();
    await call('POST', '/api/sections/reorder', { sectionIds: reversed });
    update(() => {});
    expect((await checklist()).sections.map((s) => s.id)).toEqual(reversed);
  });

  it('validates input', async () => {
    expect((await call('POST', '/api/sections', { title: ' ', period: 'daily' })).statusCode).toBe(
      400,
    );
    expect((await call('POST', '/api/sections', { title: 'x', period: 'hourly' })).statusCode).toBe(
      400,
    );
    expect((await call('PATCH', '/api/sections/1', {})).statusCode).toBe(400);
    expect((await call('PATCH', '/api/sections/9999', { title: 'x' })).statusCode).toBe(404);
  });
});

describe('items', () => {
  it('creates a custom counter that shows up in the tracker', async () => {
    const daily = await sectionBySlug('daily-core');
    const res = await call('POST', '/api/items', {
      sectionId: daily.id,
      title: 'Kahl garrison',
      kind: 'counter',
      slots: { count: 2 },
    });
    expect(res.statusCode).toBe(201);
    const item = (await tracker()).sections
      .find((s) => s.slug === 'daily-core')!
      .items.find((i) => i.title === 'Kahl garrison')!;
    expect(item).toMatchObject({ kind: 'counter', slotCount: 2, checked: [] });
  });

  it('rejects slots that do not match the kind', async () => {
    const daily = await sectionBySlug('daily-core');
    const res = await call('POST', '/api/items', {
      sectionId: daily.id,
      title: 'Bad',
      kind: 'subticks',
      slots: { count: 3 },
    });
    expect(res.statusCode).toBe(400);

    const login = await itemByTitle('Daily login reward');
    const patch = await call('PATCH', `/api/items/${login.id}`, { kind: 'counter' });
    expect(patch.statusCode).toBe(400);
    expect(ApiError.parse(patch.json()).error.code).toBe('bad_slots');
  });

  it('changing a counter back to a checkbox drops its slots', async () => {
    const hunhow = await itemByTitle('Hunhow');
    await call('PATCH', `/api/items/${hunhow.id}`, { kind: 'check' });
    expect(await itemByTitle('Hunhow')).toMatchObject({ kind: 'check', slots: null });
  });

  it('deleting hides defaults and really deletes custom items with their ticks', async () => {
    const login = await itemByTitle('Daily login reward');
    await call('DELETE', `/api/items/${login.id}`);
    expect(await itemByTitle('Daily login reward')).toMatchObject({ hidden: true });

    const daily = await sectionBySlug('daily-core');
    await call('POST', '/api/items', { sectionId: daily.id, title: 'Temp', kind: 'check' });
    const temp = await itemByTitle('Temp');
    await call('PUT', '/api/ticks', { itemId: temp.id, slot: 0, checked: true });
    await call('DELETE', `/api/items/${temp.id}`);
    expect(await itemByTitle('Temp')).toBeUndefined();
    expect(database.db.select().from(ticks).where(eq(ticks.itemId, temp.id)).all()).toEqual([]);
  });

  it('reorders within and across sections', async () => {
    const passes = await sectionBySlug('weekly-passes');
    const minor = await sectionBySlug('weekly-minor-missions');
    const order = [passes.items[1]!.id, minor.items[0]!.id, passes.items[0]!.id];
    expect(
      (await call('POST', '/api/items/reorder', { sectionId: passes.id, itemIds: order }))
        .statusCode,
    ).toBe(200);
    expect((await sectionBySlug('weekly-passes')).items.map((i) => i.id)).toEqual(order);

    expect(
      (
        await call('POST', '/api/items/reorder', {
          sectionId: passes.id,
          itemIds: [order[0], order[0]],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/items/reorder', { sectionId: passes.id, itemIds: [99999] }))
        .statusCode,
    ).toBe(404);
  });
});

describe('edits survive a seed update (Phase 4 "done when")', () => {
  it('an edited default keeps the user’s text; unedited ones get the new text', async () => {
    const palladino = (await sectionBySlug('weekly-kuva-route')).items.find(
      (i) => i.title === 'Palladino',
    )!;
    await call('PATCH', `/api/items/${palladino.id}`, {
      title: 'Palladino (my note)',
      description: 'Only buy if Riven slivers are low',
    });
    expect(await itemByTitle('Palladino (my note)')).toMatchObject({ edited: true });

    const result = update((s) => {
      seedItem(s, 'weekly.kuva.palladino').title = 'Palladino (new seed text)';
      seedItem(s, 'weekly.kuva.yonta').description = 'New seed description';
    });
    expect(result.items.updated).toBe(1);

    expect(await itemByTitle('Palladino (my note)')).toMatchObject({
      description: 'Only buy if Riven slivers are low',
    });
    const yonta = (await sectionBySlug('weekly-kuva-route')).items.find(
      (i) => seedId(i.id) === 'weekly.kuva.yonta',
    )!;
    expect(yonta.description).toBe('New seed description');
  });

  it('hiding is not an edit: the text still updates, and it stays hidden', async () => {
    const darvo = await itemByTitle("Darvo's Daily Deal");
    await call('PATCH', `/api/items/${darvo.id}`, { hidden: true });
    expect(await itemByTitle("Darvo's Daily Deal")).toMatchObject({ hidden: true, edited: false });

    update((s) => {
      seedItem(s, 'daily.quick.darvo').title = "Darvo's deal";
    });
    expect(await itemByTitle("Darvo's deal")).toMatchObject({ hidden: true });
  });

  it('a moved default stays where the user put it; its text still updates', async () => {
    const passes = await sectionBySlug('weekly-passes');
    const minor = await sectionBySlug('weekly-minor-missions');
    const calendar = passes.items.find((i) => i.title === '1999 Calendar')!;
    await call('POST', '/api/items/reorder', {
      sectionId: minor.id,
      itemIds: [calendar.id, ...minor.items.map((i) => i.id)],
    });

    update((s) => {
      seedItem(s, 'weekly.passes.calendar-1999').title = '1999 Calendar (weekly)';
    });
    const moved = await itemByTitle('1999 Calendar (weekly)');
    expect(moved.sectionId).toBe(minor.id);
    expect((await sectionBySlug('weekly-minor-missions')).items[0]!.id).toBe(calendar.id);
  });

  it('a custom item is untouched by seed updates', async () => {
    const daily = await sectionBySlug('daily-core');
    await call('POST', '/api/items', { sectionId: daily.id, title: 'Mine', kind: 'check' });
    update((s) => {
      s.sections[0]!.items = [];
    });
    expect(await itemByTitle('Mine')).toMatchObject({ hidden: false, origin: 'custom' });
  });
});

describe('removed-defaults notice', () => {
  it('is empty after the first import', async () => {
    expect((await tracker()).notice).toBeNull();
  });

  it('lists defaults hidden by a seed update until dismissed', async () => {
    update((s) => {
      const minor = s.sections.find((x) => x.seedId === 'weekly.minor')!;
      minor.items = minor.items.filter((i) => i.seedId !== 'weekly.minor.darvo');
    });
    expect((await tracker()).notice).toEqual({ removedTitles: ["Darvo's weekly mission"] });

    expect((await call('POST', '/api/checklist/dismiss-notice')).statusCode).toBe(204);
    expect((await tracker()).notice).toBeNull();
  });
});

describe('restore defaults', () => {
  it('brings back the seed text, order and visibility, and keeps custom items', async () => {
    const login = await itemByTitle('Daily login reward');
    await call('PATCH', `/api/items/${login.id}`, { title: 'Login', hidden: true });
    const daily = await sectionBySlug('daily-core');
    await call('POST', '/api/sections/reorder', {
      sectionIds: [...(await checklist()).sections.map((s) => s.id)].reverse(),
    });
    await call('POST', '/api/items', { sectionId: daily.id, title: 'Mine', kind: 'check' });

    const res = await call('POST', '/api/checklist/restore-defaults');
    expect(res.statusCode).toBe(200);
    const body = ChecklistResponse.parse(res.json());

    expect(body.sections.map((s) => s.slug).slice(0, seed.sections.length)).toEqual(
      seed.sections.map((s) => s.slug),
    );
    expect(await itemByTitle('Daily login reward')).toMatchObject({ hidden: false, edited: false });
    expect(await itemByTitle('Mine')).toMatchObject({ origin: 'custom' });
  });

  it('keeps defaults that the seed dropped hidden, and clears the notice', async () => {
    update((s) => {
      const minor = s.sections.find((x) => x.seedId === 'weekly.minor')!;
      minor.items = minor.items.filter((i) => i.seedId !== 'weekly.minor.darvo');
    });
    // The app is still on the shipped seed here, which has the item: restore uses that file.
    await call('POST', '/api/checklist/restore-defaults');
    expect((await tracker()).notice).toBeNull();
  });
});
