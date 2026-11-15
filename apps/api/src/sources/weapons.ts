import type {
  WeaponAttack,
  WeaponSlot,
  WeaponStats,
  WeaponTab,
  WeaponVariantKind,
} from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { itemCache } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { ITEMS_BASE } from './items.js';
import { weaponWiki } from './weapon-wiki.js';
import { MIN_REFRESH_GAP_MS, slugOf } from './warframes.js';
import { UnexpectedDataError } from './warframestat.js';
import { FETCH_TIMEOUT_MS, USER_AGENT, type FetchFn } from './worldstate.js';

/**
 * The Weapons section's data (SPEC §15), from warframestat.us's full weapon list
 * (`/weapons`, checked 15 Nov 2026; a trimmed real response is in ./fixtures/weapons).
 * Fetched at most once a week (or on Refresh, once an hour) and kept in `item_cache`.
 * Classes come from the wiki (`weapon-wiki.json`): the item data says only "Melee" for
 * every melee weapon, and "Rifle" for some of them.
 */

const LIST_KEY = 'weapons:all';
const LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---- normaliser ----------------------------------------------------------------

const RawAttack = z.looseObject({
  name: z.string().default(''),
  speed: z.number().nullable().optional(),
  crit_chance: z.number().nullable().optional(),
  crit_mult: z.number().nullable().optional(),
  status_chance: z.number().nullable().optional(),
  shot_type: z.string().nullable().optional(),
  charge_time: z.number().nullable().optional(),
  damage: z.record(z.string(), z.number()).default({}),
});

export const RawWeapon = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  category: z.string(),
  type: z.string().nullable().optional(),
  productCategory: z.string().nullable().optional(),
  masterable: z.boolean().optional(),
  description: z.string().default(''),
  imageName: z.string().optional(),
  masteryReq: z.int().min(0).optional(),
  disposition: z.number().nullable().optional(),
  omegaAttenuation: z.number().nullable().optional(),
  magazineSize: z.number().nullable().optional(),
  reloadTime: z.number().nullable().optional(),
  multishot: z.number().nullable().optional(),
  trigger: z.string().nullable().optional(),
  noise: z.string().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  range: z.number().nullable().optional(),
  attacks: z.array(RawAttack).default([]),
  components: z.array(z.unknown()).nullable().optional(),
  introduced: z.looseObject({ name: z.string() }).nullable().optional(),
  releaseDate: z.string().optional(),
  vaulted: z.boolean().optional(),
  tradable: z.boolean().optional(),
  wikiaUrl: z.string().optional(),
});
export type RawWeapon = z.infer<typeof RawWeapon>;

const SLOTS: Record<string, WeaponSlot> = {
  Primary: 'primary',
  Secondary: 'secondary',
  Melee: 'melee',
  'Arch-Gun': 'archgun',
  'Arch-Melee': 'archmelee',
};

/**
 * The weapon's slot, or null when it isn't listed: Zaw parts, and the Drifter's Sirocco
 * (filed under "OperatorAmps"). The data has no Kitgun or Amp parts as weapons (15 Nov 2026).
 */
export function slotOf(raw: RawWeapon): WeaponSlot | null {
  // Conclave copies of Zaw parts can't be mastered; real weapons can.
  if (raw.masterable === false) return null;
  if (raw.type === 'Zaw Component' || raw.productCategory === 'OperatorAmps') return null;
  return SLOTS[raw.category] ?? null;
}

export function tabOf(slot: WeaponSlot): WeaponTab {
  return slot === 'archgun' || slot === 'archmelee' ? 'arch' : 'weapons';
}

/**
 * "Braton Prime" → prime, "Braton Vandal" → vandal, "Mk1-Braton" → mk1, base "Braton".
 * Every other family (Kuva, Tenet, Prisma, Wraith, Syndicate…) is its own weapon (Alex,
 * 15 Nov 2026).
 */
export function weaponVariantOf(name: string): { kind: WeaponVariantKind; base: string } {
  if (name.endsWith(' Prime')) return { kind: 'prime', base: name.slice(0, -' Prime'.length) };
  if (name.endsWith(' Vandal')) return { kind: 'vandal', base: name.slice(0, -' Vandal'.length) };
  if (/^mk1-/i.test(name)) return { kind: 'mk1', base: name.slice('Mk1-'.length) };
  return { kind: 'normal', base: name };
}

export function attackOf(a: z.infer<typeof RawAttack>): WeaponAttack {
  const damage = Object.entries(a.damage)
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type, amount }));
  return {
    name: a.name,
    critChance: a.crit_chance ?? null,
    critMultiplier: a.crit_mult ?? null,
    statusChance: a.status_chance ?? null,
    speed: a.speed ?? null,
    shotType: a.shot_type ?? null,
    chargeTime: a.charge_time ?? null,
    damage,
    total: Math.round(damage.reduce((sum, d) => sum + d.amount, 0) * 100) / 100,
  };
}

const positive = (n: number | null | undefined) => (n != null && n > 0 ? n : null);

export function statsOf(raw: RawWeapon, slot: WeaponSlot): WeaponStats {
  const melee = slot === 'melee' || slot === 'archmelee';
  const disposition = raw.disposition ?? null;
  return {
    disposition: disposition && disposition >= 1 && disposition <= 5 ? disposition : null,
    omegaAttenuation: positive(raw.omegaAttenuation),
    magazine: melee ? null : positive(raw.magazineSize),
    reload: melee ? null : positive(raw.reloadTime),
    multishot: melee ? null : positive(raw.multishot),
    trigger: melee ? null : (raw.trigger ?? null),
    noise: melee ? null : (raw.noise ?? null),
    accuracy: melee ? null : positive(raw.accuracy),
    range: melee ? positive(raw.range) : null,
  };
}

/** It has an Incarnon form: the data lists an "Incarnon Form…" attack. */
export function hasIncarnon(raw: RawWeapon): boolean {
  return raw.attacks.some((a) => a.name.startsWith('Incarnon'));
}

export interface WeaponGroup {
  slug: string;
  name: string;
  slot: WeaponSlot;
  tab: WeaponTab;
  /** The wiki's class; null for arch weapons or when the wiki doesn't list it. */
  class: string | null;
  /** Normal first, then Prime, Vandal, Mk1. */
  variants: { kind: WeaponVariantKind; raw: RawWeapon }[];
}

const KIND_ORDER: Record<WeaponVariantKind, number> = { normal: 0, prime: 1, vandal: 2, mk1: 3 };

/** More recipe parts wins: the data's stand-ins (e.g. the doppelgänger's Grimoire) have none. */
const partCount = (raw: RawWeapon) => raw.components?.length ?? 0;

/** Groups each weapon's versions under its base name, A–Z. */
export function groupWeapons(raws: RawWeapon[]): WeaponGroup[] {
  const groups = new Map<string, WeaponGroup>();
  for (const raw of raws) {
    const slot = slotOf(raw);
    if (!slot) continue;
    const { kind, base } = weaponVariantOf(raw.name);
    // Two different weapons could share a base name in different slots: keep them apart.
    let slug = slugOf(base);
    const taken = groups.get(slug);
    if (taken && taken.slot !== slot) slug = `${slug}-${slot}`;
    const g = groups.get(slug) ?? {
      slug,
      name: base,
      slot,
      tab: tabOf(slot),
      class: null,
      variants: [],
    };
    const same = g.variants.findIndex((v) => v.kind === kind);
    if (same < 0) g.variants.push({ kind, raw });
    else if (partCount(raw) > partCount(g.variants[same]!.raw)) g.variants[same] = { kind, raw };
    groups.set(slug, g);
  }
  for (const g of groups.values()) {
    g.variants.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const first = g.variants[0]!;
    // "Euphona Prime" has no plain Euphona: the tile keeps its full name.
    if (first.kind !== 'normal') g.name = first.raw.name;
    if (g.tab === 'weapons') {
      g.class =
        g.variants
          .map((v) => weaponWiki(v.raw.uniqueName, v.raw.name)?.class)
          .find((c) => c !== undefined) ?? null;
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every image file name the list mentions: the only ones `GET /api/images` serves. */
export function weaponImageNames(raws: RawWeapon[]): Set<string> {
  const names = new Set<string>();
  for (const raw of raws) if (slotOf(raw) && raw.imageName) names.add(raw.imageName);
  return names;
}

// ---- catalog -----------------------------------------------------------------------

export interface WeaponCatalogOptions {
  fetch?: FetchFn;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface WeaponCatalogState {
  raws: RawWeapon[];
  fetchedAt: Date;
  stale: boolean;
}

export class WeaponCatalog {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;
  private lastAttempt = -Infinity;
  private inFlight: Promise<void> | null = null;
  private memo: { at: number; groups: WeaponGroup[]; images: Set<string> } | null = null;

  constructor(
    private readonly db: Db,
    options: WeaponCatalogOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => {});
  }

  /** The cached list, fetched first when missing or a week old. */
  async state(): Promise<WeaponCatalogState> {
    const row = this.row();
    let stale = false;
    if (!row || this.now().getTime() - row.fetchedAt.getTime() >= LIST_TTL_MS) {
      try {
        await this.fetchAndStore();
      } catch (error) {
        this.onError(error);
        if (!row) throw new HttpError(503, 'weapons_unavailable', 'weaponsUnavailable');
        stale = true;
      }
    }
    return this.read(stale);
  }

  /** Fetches again now (the Refresh button). At most once an hour. */
  async refresh(): Promise<WeaponCatalogState> {
    const next = this.nextRefreshAt();
    if (next) {
      const minutes = Math.max(1, Math.ceil((next.getTime() - this.now().getTime()) / 60_000));
      throw new HttpError(429, 'refresh_too_soon', 'warframesTooSoon', { minutes });
    }
    try {
      await this.fetchAndStore();
    } catch (error) {
      this.onError(error);
      throw new HttpError(503, 'weapons_unavailable', 'weaponsRefreshFailed');
    }
    return this.read(false);
  }

  nextRefreshAt(): Date | null {
    const next = this.lastAttempt + MIN_REFRESH_GAP_MS;
    return next > this.now().getTime() ? new Date(next) : null;
  }

  /** Groups (A–Z) and the image allowlist, worked out once per fetched list. */
  groups(state: WeaponCatalogState): { groups: WeaponGroup[]; images: Set<string> } {
    const at = state.fetchedAt.getTime();
    if (!this.memo || this.memo.at !== at) {
      this.memo = { at, groups: groupWeapons(state.raws), images: weaponImageNames(state.raws) };
    }
    return this.memo;
  }

  /** Image names from whatever is cached, without fetching (for `GET /api/images`). */
  cachedImageNames(): Set<string> {
    const at = this.db
      .select({ fetchedAt: itemCache.fetchedAt })
      .from(itemCache)
      .where(eq(itemCache.key, LIST_KEY))
      .get();
    if (!at) return new Set();
    if (this.memo?.at === at.fetchedAt.getTime()) return this.memo.images;
    return this.groups(this.read(false)).images;
  }

  private read(stale: boolean): WeaponCatalogState {
    const row = this.row()!;
    const raws: RawWeapon[] = [];
    for (const raw of JSON.parse(row.payloadJson) as unknown[]) {
      const parsed = RawWeapon.safeParse(raw);
      if (parsed.success) raws.push(parsed.data);
    }
    return { raws, fetchedAt: row.fetchedAt, stale };
  }

  private row() {
    return this.db.select().from(itemCache).where(eq(itemCache.key, LIST_KEY)).get();
  }

  private fetchAndStore(): Promise<void> {
    // Two pages asking at once share one fetch.
    this.inFlight ??= this.doFetch().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async doFetch(): Promise<void> {
    this.lastAttempt = this.now().getTime();
    const res = await this.fetchFn(`${ITEMS_BASE}/weapons?language=en`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      // The weapon list is large (several MB): give it more time than a small endpoint.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 4),
    });
    if (!res.ok) throw new Error(`warframestat.us answered ${res.status} for /weapons`);
    const list: unknown = await res.json();
    if (!Array.isArray(list)) throw new UnexpectedDataError('weapons: expected a list');
    const kept = list.filter((raw) => {
      const parsed = RawWeapon.safeParse(raw);
      return parsed.success && slotOf(parsed.data) !== null;
    });
    if (kept.length === 0) throw new UnexpectedDataError('weapons: no weapons in the list');
    const fetchedAt = this.now();
    this.db.transaction((tx) => {
      const write = (key: string, value: unknown) => {
        const values = { payloadJson: JSON.stringify(value), fetchedAt };
        tx.insert(itemCache)
          .values({ key, ...values })
          .onConflictDoUpdate({ target: itemCache.key, set: values })
          .run();
      };
      write(LIST_KEY, kept);
      // Each weapon also goes in as an item, so "Add as goal" works without a search.
      for (const raw of kept as { uniqueName: string }[]) write(`item:${raw.uniqueName}`, raw);
    });
  }
}
