import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { fixture } from './test-fixtures.js';
import {
  attackOf,
  groupWeapons,
  hasIncarnon,
  RawWeapon,
  slotOf,
  statsOf,
  WeaponCatalog,
  weaponImageNames,
  weaponVariantOf,
} from './weapons.js';
import type { FetchFn } from './worldstate.js';

/** Real `/weapons` entries saved on 15 Nov 2026 (drops trimmed to 3 per part). */
const raws = (fixture('weapons/weapons') as unknown[]).map((r) => RawWeapon.parse(r));
const byName = (name: string) => raws.find((r) => r.name === name)!;
const groups = groupWeapons(raws);
const group = (slug: string) => groups.find((g) => g.slug === slug);

describe('weaponVariantOf', () => {
  it('splits off Prime, Vandal and Mk1 only', () => {
    expect(weaponVariantOf('Braton Prime')).toEqual({ kind: 'prime', base: 'Braton' });
    expect(weaponVariantOf('Braton Vandal')).toEqual({ kind: 'vandal', base: 'Braton' });
    expect(weaponVariantOf('Mk1-Braton')).toEqual({ kind: 'mk1', base: 'Braton' });
    expect(weaponVariantOf('MK1-Bo')).toEqual({ kind: 'mk1', base: 'Bo' });
    expect(weaponVariantOf('Kuva Hek')).toEqual({ kind: 'normal', base: 'Kuva Hek' });
    expect(weaponVariantOf('Prisma Skana')).toEqual({ kind: 'normal', base: 'Prisma Skana' });
  });
});

describe('slotOf', () => {
  it('keeps the five weapon slots and drops Drifter, Amp and Zaw parts', () => {
    expect(slotOf(byName('Braton'))).toBe('primary');
    expect(slotOf(byName('Grimoire'))).toBe('secondary');
    expect(slotOf(byName('Skana'))).toBe('melee');
    expect(slotOf(byName('Mausolon'))).toBe('archgun');
    expect(slotOf(byName('Veritux'))).toBe('archmelee');
    expect(slotOf(byName('Quatz'))).toBe('secondary');
    expect(slotOf(byName('Sirocco'))).toBeNull(); // the Drifter's sidearm, filed as an Amp
    expect(slotOf(byName('Balla'))).toBeNull(); // a Zaw part
    expect(slotOf(byName('Plague Kripath'))).toBeNull();
  });
});

describe('groupWeapons', () => {
  it('groups Braton with its Prime, Vandal and Mk1, in that order', () => {
    const braton = group('braton')!;
    expect(braton.name).toBe('Braton');
    expect(braton.variants.map((v) => v.raw.name)).toEqual([
      'Braton',
      'Braton Prime',
      'Braton Vandal',
      'Mk1-Braton',
    ]);
    expect(braton.tab).toBe('weapons');
    expect(braton.class).toBe('Rifle');
  });

  it('keeps Kuva, Syndicate and Prisma weapons apart', () => {
    expect(group('hek')!.variants.map((v) => v.raw.name)).toEqual(['Hek']);
    expect(group('kuva-hek')!.variants.map((v) => v.raw.name)).toEqual(['Kuva Hek']);
    expect(group('vaykor-hek')).toBeDefined();
    expect(group('prisma-skana')).toBeDefined();
    expect(group('skana')!.variants).toHaveLength(1);
  });

  it('takes melee classes from the wiki, not the item data', () => {
    // The data calls Ekhein a "Rifle" and every melee weapon "Melee".
    expect(byName('Ekhein').type).toBe('Rifle');
    expect(group('ekhein')!.class).toBe('Hammer');
    expect(group('skana')!.class).toBe('Sword');
    expect(group('bo')!.class).toBe('Staff');
    expect(group('bo')!.variants.map((v) => v.kind)).toEqual(['normal', 'prime', 'mk1']);
    // The wiki splits it into two forms: no single class.
    expect(group('dark-split-sword')!.class).toBeNull();
  });

  it('puts arch weapons in their own tab, without a class', () => {
    const imperator = group('imperator')!;
    expect(imperator.tab).toBe('arch');
    expect(imperator.slot).toBe('archgun');
    expect(imperator.class).toBeNull();
    expect(imperator.variants.map((v) => v.kind)).toEqual(['normal', 'vandal']);
    expect(group('veritux')!.slot).toBe('archmelee');
  });

  it('keeps the real Grimoire, not the stand-in with no recipe', () => {
    const grimoire = group('grimoire')!;
    expect(grimoire.variants).toHaveLength(1);
    expect(grimoire.variants[0]!.raw.uniqueName).toBe('/Lotus/Weapons/Tenno/Grimoire/TnGrimoire');
  });

  it('names a Prime-only weapon by its full name', () => {
    expect(group('euphona')!.name).toBe('Euphona Prime');
  });

  it('lists nothing that is not a weapon', () => {
    expect(groups.map((g) => g.slug)).not.toContain('sirocco');
    expect(groups.map((g) => g.slug)).not.toContain('balla');
  });
});

describe('stats and attacks', () => {
  it('reads every attack, with only the damage types it has', () => {
    const prime = byName('Braton Prime');
    expect(hasIncarnon(prime)).toBe(true);
    expect(hasIncarnon(byName('Hek'))).toBe(false);
    const [normal, incarnon] = prime.attacks.map(attackOf);
    expect(normal).toMatchObject({
      name: 'Normal Attack',
      critChance: 12,
      critMultiplier: 2,
      statusChance: 26,
      shotType: 'Hit-Scan',
      damage: [
        { type: 'impact', amount: 1.75 },
        { type: 'slash', amount: 21 },
        { type: 'puncture', amount: 12.25 },
      ],
      total: 35,
    });
    expect(incarnon!.name).toBe('Incarnon Form');
  });

  it('gives guns their magazine and melee weapons their range', () => {
    const gun = statsOf(byName('Braton Prime'), 'primary');
    expect(gun).toMatchObject({ disposition: 4, magazine: 75, range: null });
    expect(gun.reload).toBeCloseTo(2.15);
    const sword = statsOf(byName('Skana'), 'melee');
    expect(sword).toMatchObject({ magazine: null, reload: null, trigger: null, range: 2.5 });
  });

  it('allows pictures of listed weapons only', () => {
    const images = weaponImageNames(raws);
    expect(images.has('BratonPrime.png')).toBe(true);
    expect(images.has(byName('Sirocco').imageName!)).toBe(false);
  });
});

describe('WeaponCatalog', () => {
  const START = new Date('2026-11-15T12:00:00.000Z');

  function setup() {
    const database = openDatabase(':memory:');
    initDatabase(database.db, loadSeed(), START);
    const calls: string[] = [];
    let online = true;
    let now = START;
    const fetchFn: FetchFn = async (url) => {
      calls.push(new URL(url).pathname);
      if (!online) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(fixture('weapons/weapons')), {
        headers: { 'content-type': 'application/json' },
      });
    };
    const catalog = new WeaponCatalog(database.db, { fetch: fetchFn, now: () => now });
    return {
      catalog,
      calls,
      goOffline: () => (online = false),
      later: (ms: number) => (now = new Date(now.getTime() + ms)),
    };
  }

  it('fetches once, keeps only weapons, and serves the cache for a week', async () => {
    const { catalog, calls, later } = setup();
    const first = await catalog.state();
    expect(calls).toEqual(['/weapons']);
    expect(first.raws.map((r) => r.name)).not.toContain('Sirocco');
    later(6 * 24 * 60 * 60 * 1000);
    await catalog.state();
    expect(calls).toHaveLength(1);
    later(24 * 60 * 60 * 1000);
    await catalog.state();
    expect(calls).toHaveLength(2);
  });

  it('keeps the saved list when the refetch fails, and says so', async () => {
    const { catalog, goOffline, later } = setup();
    await catalog.state();
    goOffline();
    later(8 * 24 * 60 * 60 * 1000);
    const state = await catalog.state();
    expect(state.stale).toBe(true);
    expect(state.raws.length).toBeGreaterThan(0);
  });

  it('fails with 503 when nothing was ever saved and the fetch fails', async () => {
    const { catalog, goOffline } = setup();
    goOffline();
    await expect(catalog.state()).rejects.toMatchObject({ statusCode: 503 });
  });

  it('refreshes at most once an hour', async () => {
    const { catalog, later } = setup();
    await catalog.refresh();
    await expect(catalog.refresh()).rejects.toMatchObject({ statusCode: 429 });
    later(60 * 60 * 1000);
    await expect(catalog.refresh()).resolves.toBeDefined();
  });

  it('knows the cached pictures without fetching', async () => {
    const { catalog, calls } = setup();
    expect(catalog.cachedImageNames().size).toBe(0);
    await catalog.state();
    expect(catalog.cachedImageNames().has('BratonPrime.png')).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
