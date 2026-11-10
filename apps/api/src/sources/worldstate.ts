import {
  WORLDSTATE_ENDPOINTS,
  type WorldstateCards,
  type WorldstateEndpoint,
} from '@warframehub/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { worldstateCache } from '../db/schema.js';
import type { LiveTimes } from '../db/tracker.js';
import { HttpError } from '../http-error.js';
import { APP_VERSION } from '../version.js';
import {
  cacheTtlMs,
  NORMALISERS,
  normaliseSortie,
  normaliseVoidTrader,
  WARFRAMESTAT_BASE,
} from './warframestat.js';

const SOURCE = 'warframestat';
const USER_AGENT = `warframehub/${APP_VERSION} (+https://github.com/AlexandroSamudio/warframehub)`;
const FETCH_TIMEOUT_MS = 8_000;
/** After a failed fetch, wait this long before trying that endpoint again. */
const RETRY_AFTER_FAILURE_MS = 2 * 60_000;
/** Manual refresh is limited to once a minute (SPEC §7). */
const MANUAL_REFRESH_INTERVAL_MS = 60_000;

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface WorldstateOptions {
  fetch?: FetchFn;
  now?: () => Date;
  /** Called when a fetch fails, for logging. */
  onError?: (endpoint: WorldstateEndpoint, error: unknown) => void;
}

/**
 * Live rotations with a SQLite cache (SPEC §7). There is no polling: an endpoint is fetched
 * only when someone asks and its cached copy has expired. If a fetch fails, the last good
 * copy is served and marked stale.
 */
export class WorldstateService {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;
  private readonly onError: (endpoint: WorldstateEndpoint, error: unknown) => void;
  private readonly inFlight = new Map<WorldstateEndpoint, Promise<void>>();
  private readonly retryAfter = new Map<WorldstateEndpoint, number>();
  private lastManualRefresh = -Infinity;

  constructor(
    private readonly db: Db,
    options: WorldstateOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => {});
  }

  /** Makes sure each endpoint's cached copy is fresh, fetching only the expired ones. */
  async ensureFresh(
    endpoints: readonly WorldstateEndpoint[] = WORLDSTATE_ENDPOINTS,
  ): Promise<void> {
    await Promise.all(endpoints.map((e) => this.refreshIfNeeded(e, false)));
  }

  /** Forces a fetch of every endpoint (`POST /api/worldstate/refresh`). Once a minute at most. */
  async refreshAll(): Promise<void> {
    const now = this.now().getTime();
    const wait = this.lastManualRefresh + MANUAL_REFRESH_INTERVAL_MS - now;
    if (wait > 0) {
      throw new HttpError(429, 'rate_limited', `Try again in ${Math.ceil(wait / 1000)} s`);
    }
    this.lastManualRefresh = now;
    await Promise.all(WORLDSTATE_ENDPOINTS.map((e) => this.refreshIfNeeded(e, true)));
  }

  /** Normalised cards from whatever is cached right now. Never touches the network. */
  cards(): WorldstateCards {
    const now = this.now();
    const out: Record<string, unknown> = {};
    for (const endpoint of WORLDSTATE_ENDPOINTS) {
      const row = this.row(endpoint);
      if (!row) {
        out[endpoint] = { freshness: 'unavailable', fetchedAt: null, stale: false, data: null };
        continue;
      }
      const base = { fetchedAt: row.fetchedAt.toISOString(), stale: row.lastError !== null };
      try {
        const normalised = NORMALISERS[endpoint](JSON.parse(row.payloadJson), now);
        out[endpoint] = { ...base, ...normalised };
      } catch (error) {
        this.onError(endpoint, error);
        out[endpoint] = { ...base, freshness: 'unavailable', data: null };
      }
    }
    return out as WorldstateCards;
  }

  /** Sortie expiry and Baro's arrival from the cache, for period keys (SPEC §4.1). */
  liveTimes(): LiveTimes {
    const now = this.now();
    const live: LiveTimes = {};
    const sortie = this.row('sortie');
    if (sortie) {
      try {
        const data = normaliseSortie(JSON.parse(sortie.payloadJson), now).data;
        if (data) live.sortieExpiry = new Date(data.expiry);
      } catch {
        // unusable: the period logic falls back to 16:00 UTC
      }
    }
    const baro = this.row('voidTrader');
    if (baro) {
      try {
        const data = normaliseVoidTrader(JSON.parse(baro.payloadJson), now).data;
        if (data) live.baroActivation = new Date(data.activation);
      } catch {
        // unusable: Baro's key stays "baro:unknown"
      }
    }
    return live;
  }

  private row(endpoint: WorldstateEndpoint) {
    return this.db
      .select()
      .from(worldstateCache)
      .where(and(eq(worldstateCache.source, SOURCE), eq(worldstateCache.endpoint, endpoint)))
      .get();
  }

  private refreshIfNeeded(endpoint: WorldstateEndpoint, force: boolean): Promise<void> {
    const running = this.inFlight.get(endpoint);
    if (running) return running;

    const now = this.now().getTime();
    if (!force) {
      const row = this.row(endpoint);
      if (row && row.expiresAt.getTime() > now) return Promise.resolve();
      if ((this.retryAfter.get(endpoint) ?? 0) > now) return Promise.resolve();
    }

    const task = this.fetchAndStore(endpoint).finally(() => this.inFlight.delete(endpoint));
    this.inFlight.set(endpoint, task);
    return task;
  }

  private async fetchAndStore(endpoint: WorldstateEndpoint): Promise<void> {
    try {
      const res = await this.fetchFn(`${WARFRAMESTAT_BASE}/${endpoint}?language=en`, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`warframestat.us returned ${res.status} for ${endpoint}`);
      const raw: unknown = await res.json();
      const fetchedAt = this.now();
      const expiresAt = new Date(fetchedAt.getTime() + cacheTtlMs(endpoint, raw, fetchedAt));
      const values = {
        fetchedAt,
        expiresAt,
        payloadJson: JSON.stringify(raw),
        lastError: null,
      };
      this.db
        .insert(worldstateCache)
        .values({ source: SOURCE, endpoint, ...values })
        .onConflictDoUpdate({
          target: [worldstateCache.source, worldstateCache.endpoint],
          set: values,
        })
        .run();
      this.retryAfter.delete(endpoint);
    } catch (error) {
      this.onError(endpoint, error);
      this.retryAfter.set(endpoint, this.now().getTime() + RETRY_AFTER_FAILURE_MS);
      const message = error instanceof Error ? error.message : String(error);
      this.db
        .update(worldstateCache)
        .set({ lastError: message.slice(0, 500) })
        .where(and(eq(worldstateCache.source, SOURCE), eq(worldstateCache.endpoint, endpoint)))
        .run();
    }
  }
}
