import { and, eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadSeed, SeedFile } from '../domain/seed.js';
import { openDatabase, type OpenDatabase } from './client.js';
import { applySeed, initDatabase } from './init.js';
import { items, manualCounters, sections, seedMeta, settings, users } from './schema.js';

const NOW = new Date('2026-11-10T03:00:00.000Z');
const LATER = new Date('2026-11-20T03:00:00.000Z');

const shipped = loadSeed();
const clone = (seed: SeedFile): SeedFile => structuredClone(seed);
const totalItems = (seed: SeedFile) => seed.sections.reduce((n, s) => n + s.items.length, 0);

describe('shipped seed (apps/api/seed/checklist.json)', () => {
  it('parses and covers every period type used in v1', () => {
    expect(shipped.seedVersion).toBeGreaterThanOrEqual(1);
    expect(new Set(shipped.sections.map((s) => s.period))).toEqual(
      new Set(['daily', 'weekly', 'eight_hour', 'sortie', 'baro', 'manual']),
    );
  });

  it('flags exactly the still-unconfirmed items with "verify"', () => {
    const flagged = shipped.sections.flatMap((s) =>
      s.items.filter((i) => i.verify).map((i) => i.seedId),
    );
    expect(flagged.sort()).toEqual(
      [
        // Still to confirm in game (SPEC §12). The rest were confirmed on 10 Nov 2026.
        'daily.quick.todays-special',
      ].sort(),
    );
  });

  it('has the counters and sub-ticks from SPEC Appendix A', () => {
    const byId = new Map(shipped.sections.flatMap((s) => s.items).map((i) => [i.seedId, i]));
    expect(byId.get('daily.core.sp-incursions')).toMatchObject({
      kind: 'counter',
      slots: { count: 6 },
    });
    expect(byId.get('weekly.kuva.hunhow')).toMatchObject({ kind: 'counter', slots: { count: 3 } });
    expect(byId.get('weekly.endgame.search-pulses')).toMatchObject({
      kind: 'counter',
      slots: { count: 5 },
    });
    expect(byId.get('weekly.vendors.vosfor')).toMatchObject({
      kind: 'subticks',
      slots: { labels: ['Vendetta', 'Radiation', 'Ignition'] },
    });
  });

  it('rejects duplicate seed ids and missing slots', () => {
    const dup = clone(shipped);
    dup.sections[0]!.items.push({ ...dup.sections[0]!.items[0]! });
    expect(SeedFile.safeParse(dup).success).toBe(false);

    const noSlots = JSON.parse(JSON.stringify(shipped));
    delete noSlots.sections[0].items[2].slots; // Steel Path Incursions counter
    expect(SeedFile.safeParse(noSlots).success).toBe(false);
  });
});

describe('seed v2 (facts confirmed in game, 10 Nov 2026)', () => {
  const byId = new Map(shipped.sections.flatMap((s) => s.items).map((i) => [i.seedId, i]));

  it('has the confirmed vendor facts', () => {
    expect(byId.get('weekly.vendors.chipper')).toMatchObject({
      title: 'Bird 3: 1 Archon Shard',
      description: '30,000 Cavia standing',
      verify: false,
    });
    expect(byId.get('weekly.vendors.vosfor')).toMatchObject({
      description: 'Loid, Sanctum Anatomica',
      verify: false,
    });
    expect(byId.get('weekly.vendors.acrithis')).toMatchObject({ description: '', verify: false });
    expect(byId.get('weekly.endgame.descendia-sp')).toMatchObject({
      description: '25 Steel Essence at floor 21',
      verify: false,
    });
  });

  it('upgrading from v1 updates unedited items and keeps edited ones', () => {
    const database = openDatabase(':memory:');
    const v1 = clone(shipped);
    v1.seedVersion = 1;
    const chipper = v1.sections
      .flatMap((s) => s.items)
      .find((i) => i.seedId === 'weekly.vendors.chipper')!;
    chipper.title = 'Chipper: 1 Archon Shard';
    chipper.verify = true;
    const descendia = v1.sections
      .flatMap((s) => s.items)
      .find((i) => i.seedId === 'weekly.endgame.descendia-sp')!;
    descendia.verify = true;
    const { userId } = initDatabase(database.db, v1, NOW);
    database.db
      .update(items)
      .set({ title: 'My Descendia note', edited: true })
      .where(eq(items.seedId, 'weekly.endgame.descendia-sp'))
      .run();

    const result = applySeed(database.db, userId, shipped, LATER);
    expect(result).toMatchObject({ applied: true, fromVersion: 1, toVersion: shipped.seedVersion });
    const row = (id: string) => database.db.select().from(items).where(eq(items.seedId, id)).get()!;
    expect(row('weekly.vendors.chipper')).toMatchObject({
      title: 'Bird 3: 1 Archon Shard',
      verify: false,
    });
    expect(row('weekly.endgame.descendia-sp')).toMatchObject({
      title: 'My Descendia note',
      verify: true,
    });
    database.close();
  });
});

describe('database init', () => {
  let database: OpenDatabase;
  beforeEach(() => {
    database = openDatabase(':memory:');
  });
  afterEach(() => {
    database.close();
  });

  it('first start creates the local user, default settings and the default checklist', () => {
    const { db } = database;
    const { userId, seed } = initDatabase(db, shipped, NOW);

    expect(db.select().from(users).all()).toEqual([{ id: userId, name: 'Local', createdAt: NOW }]);
    const tz = db
      .select()
      .from(settings)
      .where(and(eq(settings.userId, userId), eq(settings.key, 'display_tz')))
      .get();
    expect(JSON.parse(tz!.valueJson)).toBe('America/Argentina/Buenos_Aires');

    expect(seed).toMatchObject({
      applied: true,
      fromVersion: null,
      toVersion: shipped.seedVersion,
    });
    expect(db.select().from(sections).all()).toHaveLength(shipped.sections.length);
    expect(db.select().from(items).all()).toHaveLength(totalItems(shipped));
    expect(db.select().from(seedMeta).get()).toEqual({
      userId,
      seedVersion: shipped.seedVersion,
      appliedAt: NOW,
    });

    const incursions = db
      .select()
      .from(items)
      .where(eq(items.seedId, 'daily.core.sp-incursions'))
      .get();
    expect(incursions).toMatchObject({
      kind: 'counter',
      slotsJson: '{"count":6}',
      origin: 'default',
      edited: false,
      hidden: false,
    });
  });

  it('manual sections get a counter starting at 0', () => {
    const { db } = database;
    const { userId } = initDatabase(db, shipped, NOW);
    const fourDay = db.select().from(sections).where(eq(sections.seedId, 'four-day')).get()!;
    expect(fourDay.period).toBe('manual');
    expect(
      db.select().from(manualCounters).where(eq(manualCounters.sectionId, fourDay.id)).get(),
    ).toEqual({ userId, sectionId: fourDay.id, counter: 0 });
  });

  it('a second start with the same seed changes nothing', () => {
    const { db } = database;
    initDatabase(db, shipped, NOW);
    const again = initDatabase(db, shipped, LATER);
    expect(again.seed.applied).toBe(false);
    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(items).all()).toHaveLength(totalItems(shipped));
    expect(db.select().from(seedMeta).get()!.appliedAt).toEqual(NOW);
  });
});

describe('seed update (SPEC §5.1)', () => {
  let database: OpenDatabase;
  let userId: number;
  beforeEach(() => {
    database = openDatabase(':memory:');
    userId = initDatabase(database.db, shipped, NOW).userId;
  });
  afterEach(() => {
    database.close();
  });

  const item = (seedId: string) =>
    database.db.select().from(items).where(eq(items.seedId, seedId)).get()!;

  function nextVersion(change: (seed: SeedFile) => void): SeedFile {
    const seed = clone(shipped);
    seed.seedVersion++;
    change(seed);
    return seed;
  }

  it('updates unedited defaults but never overwrites edited ones', () => {
    const { db } = database;
    db.update(items)
      .set({ title: 'My Palladino note', edited: true })
      .where(eq(items.seedId, 'weekly.kuva.palladino'))
      .run();

    const v2 = nextVersion((seed) => {
      for (const s of seed.sections) {
        for (const i of s.items) {
          if (i.seedId === 'weekly.kuva.palladino') i.title = 'Palladino (new text)';
          if (i.seedId === 'weekly.kuva.yonta') i.description = 'New description';
        }
      }
    });
    const result = applySeed(db, userId, v2, LATER);

    expect(result).toMatchObject({
      applied: true,
      fromVersion: shipped.seedVersion,
      toVersion: shipped.seedVersion + 1,
    });
    expect(result.items.updated).toBe(1);
    expect(item('weekly.kuva.palladino').title).toBe('My Palladino note');
    expect(item('weekly.kuva.yonta')).toMatchObject({
      description: 'New description',
      updatedAt: LATER,
    });
  });

  it('adds new defaults, including new sections', () => {
    const v2 = nextVersion((seed) => {
      seed.sections.push({
        seedId: 'weekly.extra',
        slug: 'weekly-extra',
        title: 'Weekly: Extra',
        period: 'weekly',
        items: [
          {
            seedId: 'weekly.extra.one',
            title: 'One',
            description: '',
            verify: true,
            kind: 'check',
          },
        ],
      });
    });
    const result = applySeed(database.db, userId, v2, LATER);
    expect(result.sections.added).toBe(1);
    expect(result.items.added).toBe(1);
    expect(item('weekly.extra.one')).toMatchObject({ origin: 'default', verify: true });
  });

  it('hides unedited defaults removed from the seed, keeps edited ones visible', () => {
    const { db } = database;
    db.update(items).set({ edited: true }).where(eq(items.seedId, 'weekly.minor.maroo')).run();

    const v2 = nextVersion((seed) => {
      const minor = seed.sections.find((s) => s.seedId === 'weekly.minor')!;
      minor.items = minor.items.filter(
        (i) => i.seedId !== 'weekly.minor.darvo' && i.seedId !== 'weekly.minor.maroo',
      );
    });
    const result = applySeed(db, userId, v2, LATER);

    expect(result.items.hidden).toBe(1);
    expect(item('weekly.minor.darvo').hidden).toBe(true);
    expect(item('weekly.minor.maroo').hidden).toBe(false);
    expect(db.select().from(items).all()).toHaveLength(totalItems(shipped)); // nothing deleted
  });

  it('moves an unedited item to another section when the seed does', () => {
    const v2 = nextVersion((seed) => {
      const passes = seed.sections.find((s) => s.seedId === 'weekly.passes')!;
      const minor = seed.sections.find((s) => s.seedId === 'weekly.minor')!;
      const [calendar] = passes.items.splice(1, 1);
      minor.items.push(calendar!);
    });
    applySeed(database.db, userId, v2, LATER);
    const minorId = database.db
      .select()
      .from(sections)
      .where(eq(sections.seedId, 'weekly.minor'))
      .get()!.id;
    expect(item('weekly.passes.calendar-1999').sectionId).toBe(minorId);
  });

  it('never touches custom items or sections', () => {
    const { db } = database;
    const custom = db
      .insert(sections)
      .values({
        userId,
        slug: 'weekly-extra',
        title: 'My section',
        period: 'weekly',
        sortOrder: 99,
        origin: 'custom',
      })
      .returning()
      .get();
    db.insert(items)
      .values({
        userId,
        sectionId: custom.id,
        title: 'My item',
        kind: 'check',
        sortOrder: 0,
        origin: 'custom',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    // The new default section wants the slug the custom one already uses.
    const v2 = nextVersion((seed) => {
      seed.sections.push({
        seedId: 'weekly.extra',
        slug: 'weekly-extra',
        title: 'Weekly: Extra',
        period: 'weekly',
        items: [],
      });
    });
    applySeed(db, userId, v2, LATER);

    expect(db.select().from(sections).where(eq(sections.id, custom.id)).get()).toEqual(custom);
    expect(db.select().from(items).where(eq(items.title, 'My item')).get()).toMatchObject({
      hidden: false,
      sectionId: custom.id,
    });
    expect(db.select().from(sections).where(eq(sections.seedId, 'weekly.extra')).get()!.slug).toBe(
      'weekly-extra-2',
    );
  });

  it('does not apply an older seed version', () => {
    const old = clone(shipped);
    old.sections[0]!.items[0]!.title = 'Should not appear';
    expect(applySeed(database.db, userId, old, LATER).applied).toBe(false);
    expect(item('daily.core.login').title).toBe('Daily login reward');
  });
});

describe('database file', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is created on first start and keeps data across restarts', () => {
    const file = join(dir, 'warframehub.db');
    const first = openDatabase(file);
    initDatabase(first.db, shipped, NOW);
    first.db.update(items).set({ edited: true }).where(eq(items.seedId, 'sortie.sortie')).run();
    first.close();

    const second = openDatabase(file); // migrations run again and must be a no-op
    const { seed } = initDatabase(second.db, shipped, LATER);
    expect(seed.applied).toBe(false);
    expect(
      second.db.select().from(items).where(eq(items.seedId, 'sortie.sortie')).get()!.edited,
    ).toBe(true);
    second.close();
  });
});
