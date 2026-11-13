import type {
  ArcaneOption,
  ModOption,
  VariantKind,
  WarframeAbility,
  WarframeAugment,
} from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { itemCache } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { normaliseArcanes, normaliseMods } from './build-data.js';
import { ITEMS_BASE } from './items.js';
import { UnexpectedDataError } from './warframestat.js';
import { FETCH_TIMEOUT_MS, USER_AGENT, type FetchFn } from './worldstate.js';

/**
 * The Warframes section's data (SPEC §14), from warframestat.us: the full Warframe list
 * (`/warframes`) and the augment mods from the full mod list (`/mods`). Checked on
 * 11 Nov 2026; trimmed real responses are in ./fixtures/warframes. Both are fetched at most
 * once a week (or on Refresh, once an hour) and kept in `item_cache`. Builds (SPEC §14.1)
 * also keep the Warframe mods and the arcanes (`/items/search/arcane?by=category`, added
 * 13 Nov 2026; the older `/arcanes` endpoint is out of date).
 */

const LIST_KEY = 'warframes:all';
const AUGMENTS_KEY = 'warframes:augments';
const MODS_KEY = 'warframes:mods';
const ARCANES_KEY = 'warframes:arcanes';
const LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_REFRESH_GAP_MS = 60 * 60 * 1000;

// ---- normaliser ----------------------------------------------------------------

const RawAbility = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  description: z.string().default(''),
  imageName: z.string().optional(),
});

export const RawWarframe = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  category: z.string(),
  productCategory: z.string().nullable().optional(),
  description: z.string().default(''),
  passiveDescription: z.string().nullable().optional(),
  imageName: z.string().optional(),
  abilities: z.array(RawAbility).default([]),
  health: z.number().default(0),
  shield: z.number().default(0),
  armor: z.number().default(0),
  power: z.number().default(0),
  sprintSpeed: z.number().default(0),
  polarities: z.array(z.string()).default([]),
  aura: z.string().nullable().optional(),
  masteryReq: z.int().min(0).optional(),
  introduced: z.looseObject({ name: z.string() }).nullable().optional(),
  releaseDate: z.string().optional(),
  vaulted: z.boolean().optional(),
  wikiaUrl: z.string().optional(),
});
export type RawWarframe = z.infer<typeof RawWarframe>;

/**
 * Real Warframes only: `category: "Warframes"` also holds Necramechs (`MechSuits`),
 * Helminth and "Orion & Sirius"; `productCategory: "Suits"` leaves those out.
 */
export function isWarframe(raw: RawWarframe): boolean {
  return raw.category === 'Warframes' && raw.productCategory === 'Suits';
}

/** "Nidus Prime" → prime, "Excalibur Umbra" → umbra, base name "Nidus" / "Excalibur". */
export function variantOf(name: string): { kind: VariantKind; base: string } {
  if (name.endsWith(' Prime')) return { kind: 'prime', base: name.slice(0, -' Prime'.length) };
  if (name.endsWith(' Umbra')) return { kind: 'umbra', base: name.slice(0, -' Umbra'.length) };
  return { kind: 'normal', base: name };
}

export function slugOf(base: string): string {
  return base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function abilitiesOf(raw: RawWarframe): WarframeAbility[] {
  return raw.abilities.slice(0, 4).map((a, i) => ({
    uniqueName: a.uniqueName,
    name: a.name,
    key: i + 1,
    description: a.description,
    image: a.imageName ?? null,
    numbers: null,
  }));
}

export interface WarframeGroup {
  slug: string;
  name: string;
  /** Normal first, then Prime, then Umbra. */
  variants: { kind: VariantKind; raw: RawWarframe }[];
}

const KIND_ORDER: Record<VariantKind, number> = { normal: 0, prime: 1, umbra: 2 };

/** Every Warframe's name and base name ("Excalibur Umbra", "Excalibur"), for augments. */
export function warframeNames(raws: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const raw of raws) {
    const parsed = RawWarframe.safeParse(raw);
    if (!parsed.success || !isWarframe(parsed.data)) continue;
    names.add(parsed.data.name);
    names.add(variantOf(parsed.data.name).base);
  }
  return names;
}

/** Groups the versions of each Warframe under its base name, A–Z. */
export function groupWarframes(raws: RawWarframe[]): WarframeGroup[] {
  const groups = new Map<string, WarframeGroup>();
  for (const raw of raws) {
    if (!isWarframe(raw)) continue;
    const { kind, base } = variantOf(raw.name);
    const slug = slugOf(base);
    const g = groups.get(slug) ?? { slug, name: base, variants: [] };
    g.variants.push({ kind, raw });
    groups.set(slug, g);
  }
  for (const g of groups.values())
    g.variants.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const RawMod = z.looseObject({
  name: z.string(),
  isAugment: z.boolean().optional(),
  compatName: z.string().nullable().optional(),
  polarity: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  levelStats: z.array(z.looseObject({ stats: z.array(z.string()) })).default([]),
});

/** Strips the game's colour tags ("<DT_POISON_COLOR>Toxin" → "Toxin"). */
export function plainText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Augment mods, keyed by the Warframe they belong to (`compatName`). The ability comes from
 * the mod's own text ("Larva Augment: …"); when the text doesn't say, it stays null.
 */
export function augmentsOf(rawMods: unknown[]): Record<string, WarframeAugment[]> {
  const out: Record<string, WarframeAugment[]> = {};
  for (const raw of rawMods) {
    const parsed = RawMod.safeParse(raw);
    if (!parsed.success) continue; // one odd mod doesn't spoil the list
    const m = parsed.data;
    if (!m.isAugment || !m.compatName) continue;
    const text = plainText(m.levelStats.at(-1)?.stats.join(' ') ?? '');
    const match = /^(.+?) Augment:\s*(.*)$/.exec(text);
    (out[m.compatName] ??= []).push({
      name: m.name,
      ability: match ? match[1]! : null,
      effect: match ? match[2]! : text,
      polarity: m.polarity ?? null,
      rarity: m.rarity ?? null,
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Every image file name the data mentions: the only ones `GET /api/images` serves.
 * Portraits and ability icons, plus mod and arcane images for builds (`extra`).
 */
export function imageNames(
  raws: RawWarframe[],
  extra: { image: string | null }[] = [],
): Set<string> {
  const names = new Set<string>();
  for (const raw of raws) {
    if (!isWarframe(raw)) continue;
    if (raw.imageName) names.add(raw.imageName);
    for (const a of raw.abilities) if (a.imageName) names.add(a.imageName);
  }
  for (const item of extra) if (item.image) names.add(item.image);
  return names;
}

// ---- catalog -----------------------------------------------------------------------

export interface WarframeCatalogOptions {
  fetch?: FetchFn;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface CatalogState {
  raws: RawWarframe[];
  augments: Record<string, WarframeAugment[]>;
  /** Mods and arcanes a build can use (empty until the first fetch that has them). */
  mods: ModOption[];
  arcanes: ArcaneOption[];
  fetchedAt: Date;
  stale: boolean;
}

export class WarframeCatalog {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;
  private lastAttempt = -Infinity;
  private inFlight: Promise<void> | null = null;
  private memo: {
    at: number;
    raws: RawWarframe[];
    groups: WarframeGroup[];
    images: Set<string>;
  } | null = null;

  constructor(
    private readonly db: Db,
    options: WarframeCatalogOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => {});
  }

  /** The cached data, fetched first when missing or a week old. */
  async state(): Promise<CatalogState> {
    const row = this.row(LIST_KEY);
    // A list saved before builds existed has no mods yet: fetch once more for them.
    const old =
      !row || this.now().getTime() - row.fetchedAt.getTime() >= LIST_TTL_MS || !this.row(MODS_KEY);
    let stale = false;
    if (old) {
      try {
        await this.fetchAndStore();
      } catch (error) {
        this.onError(error);
        if (!row) {
          throw new HttpError(
            503,
            'warframes_unavailable',
            "Can't reach warframestat.us to load the Warframes. Try again when you're online.",
          );
        }
        stale = true;
      }
    }
    return this.read(stale);
  }

  /** Fetches again now (the Refresh button). At most once an hour. */
  async refresh(): Promise<CatalogState> {
    const next = this.nextRefreshAt();
    if (next) {
      const minutes = Math.max(1, Math.ceil((next.getTime() - this.now().getTime()) / 60_000));
      throw new HttpError(
        429,
        'refresh_too_soon',
        `Refreshed recently. Try again in ${minutes} min.`,
      );
    }
    try {
      await this.fetchAndStore();
    } catch (error) {
      this.onError(error);
      throw new HttpError(
        503,
        'warframes_unavailable',
        "Can't reach warframestat.us right now. The saved list is kept.",
      );
    }
    return this.read(false);
  }

  nextRefreshAt(): Date | null {
    const next = this.lastAttempt + MIN_REFRESH_GAP_MS;
    return next > this.now().getTime() ? new Date(next) : null;
  }

  /** Groups (A–Z) and the image allowlist, worked out once per fetched list. */
  groups(state: CatalogState): { groups: WarframeGroup[]; images: Set<string> } {
    const at = state.fetchedAt.getTime();
    if (!this.memo || this.memo.at !== at) {
      this.memo = {
        at,
        raws: state.raws,
        groups: groupWarframes(state.raws),
        images: imageNames(state.raws, [...state.mods, ...state.arcanes]),
      };
    }
    return this.memo;
  }

  /**
   * Image names from whatever is cached, without fetching (for `GET /api/images`). The
   * list is only parsed again when a newer one was fetched.
   */
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

  private read(stale: boolean): CatalogState {
    const list = this.row(LIST_KEY)!;
    const aug = this.row(AUGMENTS_KEY);
    const mods = this.row(MODS_KEY);
    const arcanes = this.row(ARCANES_KEY);
    return {
      raws: this.parseList(list.payloadJson),
      augments: aug ? (JSON.parse(aug.payloadJson) as Record<string, WarframeAugment[]>) : {},
      mods: mods ? (JSON.parse(mods.payloadJson) as ModOption[]) : [],
      arcanes: arcanes ? (JSON.parse(arcanes.payloadJson) as ArcaneOption[]) : [],
      fetchedAt: list.fetchedAt,
      stale,
    };
  }

  private parseList(json: string): RawWarframe[] {
    const out: RawWarframe[] = [];
    for (const raw of JSON.parse(json) as unknown[]) {
      const parsed = RawWarframe.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }

  private row(key: string) {
    return this.db.select().from(itemCache).where(eq(itemCache.key, key)).get();
  }

  private fetchAndStore(): Promise<void> {
    // Two pages asking at once share one fetch.
    this.inFlight ??= this.doFetch().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async doFetch(): Promise<void> {
    this.lastAttempt = this.now().getTime();
    const [list, mods, arcanes] = await Promise.all([
      this.fetchJson(`${ITEMS_BASE}/warframes?language=en`),
      this.fetchJson(`${ITEMS_BASE}/mods?language=en`),
      // Arcanes are extra: if they fail, the saved ones are kept and the rest still updates.
      this.fetchJson(`${ITEMS_BASE}/items/search/arcane?by=category&language=en`).catch(
        (error: unknown) => {
          this.onError(error);
          return null;
        },
      ),
    ]);
    if (!Array.isArray(list) || !Array.isArray(mods)) {
      throw new UnexpectedDataError('warframes: expected two lists');
    }
    const kept = list.filter((raw) => {
      const parsed = RawWarframe.safeParse(raw);
      return parsed.success && isWarframe(parsed.data);
    });
    if (kept.length === 0) throw new UnexpectedDataError('warframes: no Warframes in the list');
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
      write(AUGMENTS_KEY, augmentsOf(mods));
      write(MODS_KEY, normaliseMods(mods, warframeNames(kept)));
      if (Array.isArray(arcanes)) {
        const list = normaliseArcanes(arcanes);
        if (list.length > 0) write(ARCANES_KEY, list);
      }
      // Each Warframe also goes in as an item, so "Add as goal" works without a search.
      for (const raw of kept as { uniqueName: string }[]) write(`item:${raw.uniqueName}`, raw);
    });
  }

  private async fetchJson(url: string): Promise<unknown> {
    const res = await this.fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      // The mod list is large (about 6 MB): give it more time than a small endpoint.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 4),
    });
    if (!res.ok) throw new Error(`warframestat.us answered ${res.status} for ${url}`);
    return res.json();
  }
}
