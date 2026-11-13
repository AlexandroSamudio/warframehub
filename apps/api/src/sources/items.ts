import type {
  ItemCategory,
  ItemDrop,
  ItemRecipe,
  ItemSearchResponse,
  ItemSearchResult,
  RecipeComponent,
  RecipePart,
} from '@warframehub/shared';
import { and, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { itemCache } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { partCraft } from './part-recipes.js';
import { UnexpectedDataError } from './warframestat.js';
import { FETCH_TIMEOUT_MS, USER_AGENT, type FetchFn } from './worldstate.js';

/**
 * Goal planner item data (SPEC §13), from warframestat.us item search:
 * `/warframes/search/{q}` and `/weapons/search/{q}` (not under `/pc`).
 * Checked on 10 Nov 2026; real responses are saved in ./fixtures/items.
 */
export const ITEMS_BASE = 'https://api.warframestat.us';

const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
/** At most one upstream search per second. */
const MIN_SEARCH_GAP_MS = 1_000;
const MAX_RESULTS = 20;
export const MIN_QUERY_LENGTH = 2;

// ---- normaliser ------------------------------------------------------------

const RawDrop = z.looseObject({
  location: z.string(),
  chance: z.number().nullable().optional(),
  rarity: z.string().nullable().optional(),
});

const RawComponent = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  itemCount: z.int().positive(),
  category: z.string().optional(),
  drops: z.array(RawDrop).optional(),
});

const RawItem = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  category: z.string(),
  type: z.string().default(''),
  isPrime: z.boolean().default(false),
  vaulted: z.boolean().optional(),
  masteryReq: z.int().min(0).optional(),
  buildPrice: z.int().min(0).optional(),
  consumeOnBuild: z.boolean().optional(),
  buildTime: z.int().min(0).optional(),
  imageName: z.string().optional(),
  components: z.array(RawComponent).default([]),
});
type RawItem = z.infer<typeof RawItem>;

/**
 * Which upstream items count as Warframes or weapons. Necramechs come back with
 * category "Warframes" (type "Necramech") and Archwings with "Archwing", so Warframes
 * also need type "Warframe". Arch-guns, Arch-melee and the rest are left out.
 */
function categoryOf(item: RawItem): ItemCategory | null {
  if (item.category === 'Warframes') return item.type === 'Warframe' ? 'warframe' : null;
  if (item.category === 'Primary') return 'primary';
  if (item.category === 'Secondary') return 'secondary';
  if (item.category === 'Melee') return 'melee';
  return null;
}

function drops(raw: z.infer<typeof RawDrop>[] = []): ItemDrop[] {
  return raw
    .map((d) => ({
      location: d.location,
      chance: typeof d.chance === 'number' ? d.chance : null,
      rarity: d.rarity ?? null,
      relic: /\bRelic\b/.test(d.location),
    }))
    .sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1) || a.location.localeCompare(b.location));
}

/** Parts and resources in the order the game lists them: Blueprint first, then A–Z. */
function byGameOrder(a: { name: string }, b: { name: string }): number {
  if (a.name === 'Blueprint') return -1;
  if (b.name === 'Blueprint') return 1;
  return a.name.localeCompare(b.name);
}

/**
 * One upstream item → our recipe, or null if it isn't a Warframe or weapon.
 * Component category "Components" is a part (Blueprint, Chassis, Barrel…); anything
 * else ("Misc") is a resource. The credit cost becomes a "Credits" resource.
 */
export function normaliseItem(raw: unknown): ItemRecipe | null {
  const parsed = RawItem.safeParse(raw);
  if (!parsed.success) throw new UnexpectedDataError(`item: ${parsed.error.message}`);
  const item = parsed.data;
  const category = categoryOf(item);
  if (!category) return null;

  const parts: RecipePart[] = [];
  const resources: RecipeComponent[] = [];
  for (const c of item.components) {
    const component = {
      key: c.uniqueName,
      name: c.name,
      count: c.itemCount,
      drops: drops(c.drops),
    };
    if (c.category === 'Components') {
      parts.push({ ...component, craft: partCraft(c.uniqueName), sources: [] });
    } else resources.push(component);
  }
  if (item.buildPrice && item.buildPrice > 0) {
    resources.push({ key: 'credits', name: 'Credits', count: item.buildPrice, drops: [] });
  }

  return {
    uniqueName: item.uniqueName,
    name: item.name,
    category,
    type: item.type,
    isPrime: item.isPrime,
    vaulted: item.vaulted ?? null,
    masteryReq: item.masteryReq ?? null,
    buildTime: item.buildTime ?? null,
    blueprintReusable: item.consumeOnBuild === false,
    parts: parts.sort(byGameOrder),
    resources: resources.sort(byGameOrder),
    image: item.imageName ?? null,
  };
}

/** Exact name first, then names starting with the query, then the rest; A–Z within each. */
export function rankResults(query: string, items: ItemSearchResult[]): ItemSearchResult[] {
  const q = query.toLowerCase();
  const rank = (name: string) => {
    const n = name.toLowerCase();
    return n === q ? 0 : n.startsWith(q) ? 1 : 2;
  };
  return [...items]
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS);
}

export function toSearchResult(r: ItemRecipe): ItemSearchResult {
  return {
    uniqueName: r.uniqueName,
    name: r.name,
    category: r.category,
    type: r.type,
    isPrime: r.isPrime,
    vaulted: r.vaulted,
    image: r.image,
  };
}

// ---- catalog ---------------------------------------------------------------

export interface ItemCatalogOptions {
  fetch?: FetchFn;
  now?: () => Date;
  /** Waits between upstream searches (injectable so tests don't sleep). */
  sleep?: (ms: number) => Promise<void>;
  onError?: (query: string, error: unknown) => void;
}

interface CachedSearch {
  uniqueNames: string[];
}

/**
 * Item search with a SQLite cache. A query is fetched from warframestat.us at most
 * once a day; every item it returns is cached by uniqueName, so adding a goal from
 * the results needs no second request. Offline, cached results are served as stale.
 */
export class ItemCatalog {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onError: (query: string, error: unknown) => void;
  /** Upstream searches run one after another, at least MIN_SEARCH_GAP_MS apart. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastUpstream = -Infinity;

  constructor(
    private readonly db: Db,
    options: ItemCatalogOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onError = options.onError ?? (() => {});
  }

  async search(rawQuery: string): Promise<ItemSearchResponse> {
    const query = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
    if (query.length < MIN_QUERY_LENGTH) {
      throw new HttpError(400, 'query_too_short', 'queryTooShort', { min: MIN_QUERY_LENGTH });
    }
    const key = `search:${query}`;
    const cached = this.row(key);
    if (cached && this.now().getTime() - cached.fetchedAt.getTime() < SEARCH_TTL_MS) {
      return this.fromCache(query, cached, false);
    }
    try {
      await this.fetchAndStore(query);
      return this.fromCache(query, this.row(key)!, false);
    } catch (error) {
      this.onError(query, error);
      if (cached) return this.fromCache(query, cached, true);
      throw new HttpError(503, 'items_unavailable', 'itemsUnavailable');
    }
  }

  /**
   * Fetches an item again ("Update recipe"), ignoring the day-long search cache.
   * Returns the new recipe, or null if warframestat.us no longer lists it.
   */
  async refresh(uniqueName: string, name: string): Promise<ItemRecipe | null> {
    const query = name.trim().toLowerCase().replace(/\s+/g, ' ');
    try {
      await this.fetchAndStore(query);
    } catch (error) {
      this.onError(query, error);
      throw new HttpError(503, 'items_unavailable', 'recipeUnavailable');
    }
    const { uniqueNames } = JSON.parse(this.row(`search:${query}`)!.payloadJson) as CachedSearch;
    return uniqueNames.includes(uniqueName) ? this.get(uniqueName) : null;
  }

  /**
   * Is this picture named by an item the app has seen (a weapon picked for a build)? For
   * the image allowlist: only names the cached data mentions are ever downloaded.
   */
  knowsImage(name: string): boolean {
    if (!/^[\w.-]+$/.test(name)) return false;
    const needle = `%"imageName":"${name}"%`;
    return (
      this.db
        .select({ key: itemCache.key })
        .from(itemCache)
        .where(and(like(itemCache.key, 'item:%'), like(itemCache.payloadJson, needle)))
        .get() !== undefined
    );
  }

  /** A cached recipe, or null if this item was never seen in a search. */
  get(uniqueName: string): ItemRecipe | null {
    const row = this.row(`item:${uniqueName}`);
    if (!row) return null;
    try {
      return normaliseItem(JSON.parse(row.payloadJson));
    } catch {
      return null;
    }
  }

  private row(key: string) {
    return this.db.select().from(itemCache).where(eq(itemCache.key, key)).get();
  }

  private fromCache(
    query: string,
    row: { payloadJson: string; fetchedAt: Date },
    stale: boolean,
  ): ItemSearchResponse {
    const { uniqueNames } = JSON.parse(row.payloadJson) as CachedSearch;
    const keys = uniqueNames.map((u) => `item:${u}`);
    const rows =
      keys.length === 0
        ? []
        : this.db.select().from(itemCache).where(inArray(itemCache.key, keys)).all();
    const results: ItemSearchResult[] = [];
    for (const r of rows) {
      try {
        const recipe = normaliseItem(JSON.parse(r.payloadJson));
        if (recipe) results.push(toSearchResult(recipe));
      } catch {
        // a cached item that no longer parses is left out
      }
    }
    return {
      query,
      results: rankResults(query, results),
      fetchedAt: row.fetchedAt.toISOString(),
      stale,
    };
  }

  private fetchAndStore(query: string): Promise<void> {
    const task = this.queue.then(async () => {
      const wait = this.lastUpstream + MIN_SEARCH_GAP_MS - this.now().getTime();
      if (wait > 0) await this.sleep(wait);
      this.lastUpstream = this.now().getTime();
      const [warframes, weapons] = await Promise.all([
        this.fetchList(`${ITEMS_BASE}/warframes/search/${encodeURIComponent(query)}?language=en`),
        this.fetchList(`${ITEMS_BASE}/weapons/search/${encodeURIComponent(query)}?language=en`),
      ]);
      const fetchedAt = this.now();
      const kept: { uniqueName: string; raw: unknown }[] = [];
      for (const raw of [...warframes, ...weapons]) {
        try {
          const recipe = normaliseItem(raw);
          if (recipe) kept.push({ uniqueName: recipe.uniqueName, raw });
        } catch (error) {
          this.onError(query, error); // one odd item doesn't spoil the search
        }
      }
      this.db.transaction((tx) => {
        for (const { uniqueName, raw } of kept) {
          const values = { payloadJson: JSON.stringify(raw), fetchedAt };
          tx.insert(itemCache)
            .values({ key: `item:${uniqueName}`, ...values })
            .onConflictDoUpdate({ target: itemCache.key, set: values })
            .run();
        }
        const search = {
          payloadJson: JSON.stringify({
            uniqueNames: kept.map((k) => k.uniqueName),
          } satisfies CachedSearch),
          fetchedAt,
        };
        tx.insert(itemCache)
          .values({ key: `search:${query}`, ...search })
          .onConflictDoUpdate({ target: itemCache.key, set: search })
          .run();
      });
    });
    this.queue = task.catch(() => {});
    return task;
  }

  private async fetchList(url: string): Promise<unknown[]> {
    const res = await this.fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`warframestat.us returned ${res.status} for ${url}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new UnexpectedDataError(`expected a list from ${url}`);
    return body;
  }
}
