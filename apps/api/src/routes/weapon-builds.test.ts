import {
  ApiError,
  ImportWeaponBuildResponse,
  ShareBuildResponse,
  WeaponBuild,
  WeaponBuildOptionsResponse,
  WeaponBuildView,
  WeaponDetail,
  WeaponsResponse,
  type WeaponBuildContent,
} from '@warframehub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { encodeShare } from '../build-share.js';
import { openDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';
import { ItemCatalog } from '../sources/items.js';
import { fixture } from '../sources/test-fixtures.js';
import { WarframeCatalog } from '../sources/warframes.js';
import { WeaponCatalog } from '../sources/weapons.js';
import type { FetchFn } from '../sources/worldstate.js';

const START = new Date('2026-11-16T12:00:00.000Z');

const POINT_STRIKE = '/Lotus/Upgrades/Mods/Rifle/WeaponCritChanceMod';
const SERRATION = '/Lotus/Upgrades/Mods/Rifle/WeaponDamageAmountMod';
const VITAL_SENSE = '/Lotus/Upgrades/Mods/Rifle/WeaponCritDamageMod';
const VIGILANTE_SUPPLIES = '/Lotus/Upgrades/Mods/Sets/Vigilante/PrimaryVigilanteSuppliesMod';
const HOLLOW_POINT = '/Lotus/Upgrades/Mods/Pistol/DualStat/CorruptedCritDamagePistol';
const CRIMSON_DERVISH = '/Lotus/Weapons/Tenno/Melee/MeleeTrees/CrimsonDervishMeleeTree';
const RUBEDO_BARREL = '/Lotus/Upgrades/Mods/Archwing/Rifle/ArchwingRifleDamageAmountMod';
const PRIMARY_MERCILESS = '/Lotus/Upgrades/CosmeticEnhancers/Offensive/PrimaryDamageOnKill';
const SECONDARY_DEXTERITY =
  '/Lotus/Upgrades/CosmeticEnhancers/Offensive/SecondaryDamageOnMeleeKill';
const MELEE_EXPOSURE = '/Lotus/Upgrades/CosmeticEnhancers/Offensive/CorrosiveMeleePerAbilityCast';

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
            : path === '/weapons'
              ? fixture('weapons/weapons')
              : [];
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
    warframes: new WarframeCatalog(database.db, { fetch: fetchFn, now }),
    weapons: new WeaponCatalog(database.db, { fetch: fetchFn, now }),
    items: new ItemCatalog(database.db, { fetch: offline, now }),
    circuitWeapons: async () => [],
  });
  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, ...(payload ? { payload } : {}) });
  await call('PATCH', '/api/settings', { language: 'en' });
  return { app, database, call };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

const slot = (uniqueName: string, name: string, rank: number, note = '') => ({
  uniqueName,
  name,
  rank,
  note,
});
const empty = <T>(n: number): (T | null)[] => Array<T | null>(n).fill(null);

function bratonPrime(): Partial<WeaponBuildContent> {
  return {
    variant: 'prime',
    description: 'Crit Braton for the Steel Path.',
    sourceUrl: 'https://overframe.gg/build/1/',
    author: 'Someone',
    patch: 'Update 41',
    forma: 4,
    exilus: slot(VIGILANTE_SUPPLIES, 'Vigilante Supplies', 5),
    slots: [
      slot(SERRATION, 'Serration', 10, 'Base damage'),
      slot(POINT_STRIKE, 'point strike (typed)', 5),
      slot(VITAL_SENSE, 'Vital Sense', 5),
      ...empty<ReturnType<typeof slot>>(5),
    ],
    arcanes: [slot(PRIMARY_MERCILESS, 'Primary Merciless', 5), null],
    incarnon: [
      { tier: 2, perk: 0, note: '' },
      { tier: 4, perk: 1, note: 'Crit damage' },
    ],
    riven: {
      name: 'Bratonata',
      polarity: 'madurai',
      stats: [
        { stat: 'Critical Damage', spliced: false, value: '+180%', negative: false },
        { stat: 'Multishot', spliced: false, value: '+120%', negative: false },
        { stat: 'Zoom', spliced: false, value: '-60%', negative: true },
      ],
      note: '',
    },
  };
}

const create = (ctx: Ctx, content: Partial<WeaponBuildContent>, slug = 'braton', name = 'Crit') =>
  ctx.call('POST', '/api/weapon-builds', { slug, name, content });
const errorOf = (res: { json: () => unknown }) => ApiError.parse(res.json()).error.message;

describe('weapon builds', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  it('gives the edit page what fits this weapon version', async () => {
    const o = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=braton')).json(),
    );
    const names = o.mods.map((m) => m.name);
    expect(names).toContain('Point Strike');
    expect(names).not.toContain('Hollow Point');
    expect(o.stances).toEqual([]);
    expect(o.hasExilus).toBe(true);
    expect(o.arcaneSlots[0]!.map((a) => a.name)).toContain('Primary Merciless');
    expect(o.arcaneSlots[1]).toEqual([]);
    expect(o.rivenStats.map((r) => r.stat)).toContain('Critical Damage');
    expect(o.progenitor).toBe(false);

    const kuva = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=kuva-hek')).json(),
    );
    expect(kuva.progenitor).toBe(true);
    const skana = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=skana')).json(),
    );
    expect(skana.stances.map((s) => s.name)).toContain('Crimson Dervish');
    expect(skana.mods.find((m) => m.name === 'Bright Purity')?.augment).toBe(true);
    const mausolon = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=mausolon')).json(),
    );
    expect(mausolon.hasExilus).toBe(false);
    expect(mausolon.arcaneSlots.map((s) => s.length > 0)).toEqual([true, true]);
    const veritux = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=veritux')).json(),
    );
    expect(veritux.rivenStats).toEqual([]);
    expect(veritux.arcaneSlots).toEqual([[], []]);
  });

  it('saves a build with the data names and shows it on the weapon page and the list', async () => {
    const res = await create(ctx, bratonPrime());
    expect(res.statusCode).toBe(201);
    const saved = WeaponBuild.parse(res.json());
    expect(saved.content.slots[1]!.name).toBe('Point Strike');

    const page = WeaponDetail.parse((await ctx.call('GET', '/api/weapons/braton')).json());
    expect(page.builds).toHaveLength(1);
    const b = page.builds[0]!;
    expect(b.variantName).toBe('Braton Prime');
    expect(b.slots[0]).toMatchObject({ name: 'Serration', polarity: 'madurai' });
    expect(b.slots[0]!.effect).toMatch(/165%/);
    expect(b.arcanes[0]!.name).toBe('Primary Merciless');
    expect(b.incarnon.map((p) => [p.tier, p.name])).toEqual([
      [2, 'Daring Reverie'],
      [4, 'Prelude of Might'],
    ]);
    expect(b.content.riven!.stats).toHaveLength(3);

    const list = WeaponsResponse.parse((await ctx.call('GET', '/api/weapons')).json());
    expect(list.weapons.find((w) => w.slug === 'braton')!.buildCount).toBe(1);
    expect(list.weapons.find((w) => w.slug === 'hek')!.buildCount).toBe(0);
  });

  it('takes a stance on melee, two arcanes on arch-guns, a progenitor bonus on Kuva weapons', async () => {
    const skana = await create(
      ctx,
      {
        variant: 'normal',
        stance: slot(CRIMSON_DERVISH, 'Crimson Dervish', 3),
        arcanes: [slot(MELEE_EXPOSURE, 'Melee Exposure', 5), null],
      },
      'skana',
    );
    expect(skana.statusCode).toBe(201);
    const mausolon = await create(
      ctx,
      {
        variant: 'normal',
        slots: [slot(RUBEDO_BARREL, 'Rubedo-Lined Barrel', 5), ...empty<never>(7)],
        arcanes: [
          slot(PRIMARY_MERCILESS, 'Primary Merciless', 5),
          slot(SECONDARY_DEXTERITY, 'Secondary Dexterity', 5),
        ],
      },
      'mausolon',
    );
    expect(mausolon.statusCode).toBe(201);
    const kuva = await create(
      ctx,
      { variant: 'normal', progenitor: { element: 'toxin', percent: 60 } },
      'kuva-hek',
    );
    expect(kuva.statusCode).toBe(201);
  });

  it('refuses what the game would not allow', async () => {
    const cases: [Partial<WeaponBuildContent>, string, string?][] = [
      [
        { slots: [slot(HOLLOW_POINT, 'Hollow Point', 5), ...empty<never>(7)] },
        "Hollow Point doesn't fit the Braton Prime",
      ],
      [
        { exilus: slot(POINT_STRIKE, 'Point Strike', 5) },
        "Point Strike can't go in the Exilus slot",
      ],
      [{ slots: [slot(POINT_STRIKE, 'Point Strike', 6), ...empty<never>(7)] }, 'Point Strike'],
      [
        {
          slots: [
            slot(SERRATION, 'Serration', 5),
            slot(SERRATION, 'Serration', 5),
            ...empty<never>(6),
          ],
        },
        'twice',
      ],
      [{ stance: slot(CRIMSON_DERVISH, 'Crimson Dervish', 3) }, 'Only melee weapons have a stance'],
      [
        { arcanes: [slot(MELEE_EXPOSURE, 'Melee Exposure', 5), null] },
        "Melee Exposure doesn't go in that arcane slot",
      ],
      [
        { arcanes: [null, slot(PRIMARY_MERCILESS, 'Primary Merciless', 5)] },
        'has no arcane slot there',
      ],
      [{ incarnon: [{ tier: 2, perk: 3, note: '' }] }, 'Evolution 2 has no such perk'],
      [{ progenitor: { element: 'heat', percent: 40 } }, 'Only Kuva, Tenet and Coda weapons'],
      [
        {
          riven: {
            name: '',
            polarity: null,
            stats: ['Damage', 'Multishot', 'Critical Damage', 'Critical Chance'].map((stat) => ({
              stat,
              spliced: false,
              value: '+100%',
              negative: false,
            })),
            note: '',
          },
        },
        'at most 3 positive',
      ],
      [
        {
          riven: {
            name: '',
            polarity: null,
            stats: [{ stat: 'Punch Through', spliced: false, value: '-2m', negative: true }],
            note: '',
          },
        },
        "Punch Through can't be a Riven's negative stat",
      ],
      [
        {
          riven: {
            name: '',
            polarity: null,
            stats: [{ stat: 'Combo Duration', spliced: false, value: '+5s', negative: false }],
            note: '',
          },
        },
        "can't have Combo Duration",
      ],
    ];
    for (const [content, message] of cases) {
      const res = await create(ctx, { variant: 'prime', ...content });
      expect(res.statusCode, message).toBe(400);
      expect(errorOf(res)).toContain(message);
    }
    // No Exilus on arch-guns; no Incarnon on the Hek; no such version.
    const arch = await create(
      ctx,
      { variant: 'normal', exilus: slot(VIGILANTE_SUPPLIES, 'Vigilante Supplies', 5) },
      'mausolon',
    );
    expect(errorOf(arch)).toContain('has no Exilus slot');
    const hek = await create(
      ctx,
      { variant: 'normal', incarnon: [{ tier: 2, perk: 0, note: '' }] },
      'hek',
    );
    expect(errorOf(hek)).toContain('has no Incarnon evolutions');
    const version = await create(ctx, { variant: 'vandal' }, 'hek');
    expect(errorOf(version)).toContain('no such version');
    // A Riven value must look like one.
    const value = await create(ctx, {
      variant: 'prime',
      riven: {
        name: '',
        polarity: null,
        stats: [{ stat: 'Damage', spliced: false, value: 'lots', negative: false }],
        note: '',
      },
    });
    expect(value.statusCode).toBe(400);
  });

  it('shares a build as a code and reads it back on the same weapon only', async () => {
    const saved = WeaponBuild.parse((await create(ctx, bratonPrime())).json());
    const { code } = ShareBuildResponse.parse(
      (await ctx.call('GET', `/api/weapon-builds/${saved.id}/share`)).json(),
    );
    expect(code).toMatch(/^wfhub-weaponbuild1:/);
    const back = ImportWeaponBuildResponse.parse(
      (await ctx.call('POST', '/api/weapon-builds/import', { slug: 'braton', code })).json(),
    );
    expect(back.name).toBe('Crit');
    expect(back.content).toEqual(saved.content);

    const other = await ctx.call('POST', '/api/weapon-builds/import', { slug: 'hek', code });
    expect(errorOf(other)).toContain('That build is for the Braton');
    const warframeCode = encodeShare({ slug: 'mesa', name: 'x', content: {} as never });
    const wrong = await ctx.call('POST', '/api/weapon-builds/import', {
      slug: 'braton',
      code: warframeCode,
    });
    expect(errorOf(wrong)).toContain("That's a Warframe build's code");
    const junk = await ctx.call('POST', '/api/weapon-builds/import', { slug: 'braton', code: 'x' });
    expect(junk.statusCode).toBe(400);
  });

  it('updates, reorders and deletes', async () => {
    const a = WeaponBuild.parse((await create(ctx, bratonPrime(), 'braton', 'A')).json());
    const b = WeaponBuild.parse((await create(ctx, { variant: 'mk1' }, 'braton', 'B')).json());
    const put = await ctx.call('PUT', `/api/weapon-builds/${b.id}`, {
      name: 'B2',
      content: { variant: 'normal', description: 'Plain Braton' },
    });
    expect(WeaponBuild.parse(put.json()).content.variant).toBe('normal');

    const order = await ctx.call('POST', '/api/weapon-builds/reorder', {
      slug: 'braton',
      buildIds: [b.id, a.id],
    });
    expect((order.json() as { name: string }[]).map((x) => x.name)).toEqual(['B2', 'A']);
    expect(
      (await ctx.call('POST', '/api/weapon-builds/reorder', { slug: 'braton', buildIds: [a.id] }))
        .statusCode,
    ).toBe(400);

    expect((await ctx.call('DELETE', `/api/weapon-builds/${a.id}`)).statusCode).toBe(204);
    expect((await ctx.call('GET', `/api/weapon-builds/${a.id}`)).statusCode).toBe(404);
    const view = WeaponBuildView.parse(
      (await ctx.call('GET', `/api/weapon-builds/${b.id}`)).json(),
    );
    expect(view.variantName).toBe('Braton');
  });

  it('shows builds in the game’s Spanish, perks in English', async () => {
    await create(ctx, bratonPrime());
    await ctx.call('PATCH', '/api/settings', { language: 'es' });
    const page = WeaponDetail.parse((await ctx.call('GET', '/api/weapons/braton')).json());
    const b = page.builds[0]!;
    // DE's own Spanish name (names-es.json, from the export).
    expect(b.slots[0]!.name).toBe('Sierra');
    expect(b.content.slots[0]!.name).toBe('Sierra');
    expect(b.incarnon[0]!.name).toBe('Daring Reverie');
    const o = WeaponBuildOptionsResponse.parse(
      (await ctx.call('GET', '/api/weapon-builds/options?slug=braton')).json(),
    );
    const serration = o.mods.find((m) => m.uniqueName === SERRATION)!;
    expect(serration).toMatchObject({ name: 'Sierra', alias: 'Serration' });
  });
});
