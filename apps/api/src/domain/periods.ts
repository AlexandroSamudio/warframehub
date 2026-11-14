import type { PeriodType } from '@warframehub/shared';

/**
 * Reset periods and period keys (SPEC §4).
 *
 * Everything here is a pure function of a UTC timestamp plus optional live data.
 * Only UTC getters are used, so the result never depends on the machine's time zone.
 *
 * A tick is stored against the key of the period it was made in. When the period
 * changes, the key changes and old ticks simply stop matching: no timers needed.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Sortie reset used when there is no usable live `sortie.expiry`.
 * The real reset is about 16:00 or 17:00 UTC depending on the season (SPEC §4.1).
 */
export const SORTIE_FALLBACK_HOUR_UTC = 16;

/**
 * The 8-hour vendors (Loid, Grandmother, Archimedean Yonta) refresh at 04:00, 12:00 and
 * 20:00 UTC (01:00, 09:00, 17:00 GMT-3). Checked in game on 10 Nov 2026; the wiki confirms
 * the 8-hour cycle but gives no times.
 */
export const EIGHT_HOUR_FIRST_UTC_HOUR = 4;

/**
 * Ergo Glast and Eleanor Nightingale change stock every 4 days at 00:00 UTC (21:00 GMT-3).
 * Anchor checked in game on 10 Nov 2026: a reset at 2026-11-11 00:00 UTC. Any reset works
 * as the anchor; dates before it are handled too.
 */
export const FOUR_DAY_ANCHOR = Date.UTC(2026, 10, 11); // months are 0-based: 10 = November
const FOUR_DAYS_MS = 4 * DAY_MS;

/** Live expiries further away than this are treated as bad data. A Sortie lasts about a day. */
const SORTIE_MAX_AHEAD_MS = 25 * HOUR_MS;

/** Live data and per-section state that some period types need. All optional. */
export interface PeriodContext {
  /** `sortie.expiry` from the live API. Ignored if it's in the past or implausibly far ahead. */
  sortieExpiry?: Date | null;
  /** `voidTrader.activation` from the live API: when Baro's current or next visit starts. */
  baroActivation?: Date | null;
  /** The section's manual counter (`manual_counters.counter`). Defaults to 0. */
  manualCounter?: number;
}

/** The key that identifies the period `now` falls in, e.g. `daily:2026-11-09`. */
export function periodKey(period: PeriodType, now: Date, ctx: PeriodContext = {}): string {
  assertValid(now);
  switch (period) {
    case 'daily':
      return `daily:${isoDate(startOfUtcDay(now))}`;
    case 'weekly':
      return `weekly:${isoDate(startOfUtcWeek(now))}`;
    case 'eight_hour': {
      const start = startOfEightHourBlock(now);
      return `eight_hour:${isoDate(start)}T${pad2(start.getUTCHours())}`;
    }
    case 'four_day':
      return `four_day:${isoDate(startOfFourDayBlock(now))}`;
    case 'sortie':
      // Keyed by the UTC date the Sortie ends, so live data and the fallback agree
      // (except between 16:00 and 17:00 UTC when offline) and ticks survive either way.
      return `sortie:${isoDate(sortieEnd(now, ctx))}`;
    case 'baro':
      return ctx.baroActivation && isValid(ctx.baroActivation)
        ? `baro:${ctx.baroActivation.toISOString()}`
        : 'baro:unknown';
    case 'manual':
      return `manual:${ctx.manualCounter ?? 0}`;
  }
}

/**
 * When the current period ends, or `null` if that isn't known
 * (`manual` periods, and `baro` with no usable live data).
 */
export function nextReset(period: PeriodType, now: Date, ctx: PeriodContext = {}): Date | null {
  assertValid(now);
  switch (period) {
    case 'daily':
      return new Date(startOfUtcDay(now).getTime() + DAY_MS);
    case 'weekly':
      return new Date(startOfUtcWeek(now).getTime() + 7 * DAY_MS);
    case 'eight_hour':
      return new Date(startOfEightHourBlock(now).getTime() + 8 * HOUR_MS);
    case 'four_day':
      return new Date(startOfFourDayBlock(now).getTime() + FOUR_DAYS_MS);
    case 'sortie':
      return sortieEnd(now, ctx);
    case 'baro':
      return baroNextArrival(now, ctx)?.at ?? null;
    case 'manual':
      return null;
  }
}

/** Baro comes back every two weeks (SPEC §4.1). */
const BARO_CYCLE_MS = 14 * DAY_MS;

/**
 * When Baro next arrives. While he's away the API says so (`estimated: false`). While he's
 * here it only knows when he leaves, so the next visit is worked out as two weeks after
 * this one's arrival (`estimated: true`). Null with no live data, or when the data is
 * older than one cycle (then it can't be trusted).
 */
export function baroNextArrival(
  now: Date,
  ctx: PeriodContext,
): { at: Date; estimated: boolean } | null {
  const activation = ctx.baroActivation;
  if (!activation || !isValid(activation)) return null;
  if (activation > now) return { at: activation, estimated: false };
  const next = new Date(activation.getTime() + BARO_CYCLE_MS);
  return next > now ? { at: next, estimated: true } : null;
}

/** The live Sortie expiry if it's usable (in the future, within about a day), else null. */
export function liveSortieExpiry(now: Date, ctx: PeriodContext): Date | null {
  const expiry = ctx.sortieExpiry;
  if (!expiry || !isValid(expiry)) return null;
  const ahead = expiry.getTime() - now.getTime();
  return ahead > 0 && ahead <= SORTIE_MAX_AHEAD_MS ? expiry : null;
}

/** When the current Sortie ends: the live expiry if usable, else the next 16:00 UTC. */
function sortieEnd(now: Date, ctx: PeriodContext): Date {
  return liveSortieExpiry(now, ctx) ?? new Date(lastSortieFallbackReset(now).getTime() + DAY_MS);
}

/** The most recent fallback Sortie reset at or before `now`. */
function lastSortieFallbackReset(now: Date): Date {
  const today = new Date(startOfUtcDay(now).getTime() + SORTIE_FALLBACK_HOUR_UTC * HOUR_MS);
  return today <= now ? today : new Date(today.getTime() - DAY_MS);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday 00:00 UTC of the week containing `d`. */
function startOfUtcWeek(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(startOfUtcDay(d).getTime() - daysSinceMonday * DAY_MS);
}

/**
 * 04:00, 12:00 or 20:00 UTC, whichever most recently started. Between 00:00 and 04:00 UTC
 * that is 20:00 of the previous UTC day, so the key carries that date.
 */
function startOfEightHourBlock(d: Date): Date {
  const offset = EIGHT_HOUR_FIRST_UTC_HOUR * HOUR_MS;
  const shifted = new Date(d.getTime() - offset);
  const blockHour = Math.floor(shifted.getUTCHours() / 8) * 8;
  return new Date(startOfUtcDay(shifted).getTime() + blockHour * HOUR_MS + offset);
}

/** 00:00 UTC on the most recent 4-day reset (counted from FOUR_DAY_ANCHOR). */
function startOfFourDayBlock(d: Date): Date {
  const blocks = Math.floor((d.getTime() - FOUR_DAY_ANCHOR) / FOUR_DAYS_MS);
  return new Date(FOUR_DAY_ANCHOR + blocks * FOUR_DAYS_MS);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function assertValid(d: Date): void {
  if (!isValid(d)) throw new RangeError('periods: invalid date');
}
