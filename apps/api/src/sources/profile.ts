import { Profile, ProfileResponse } from '@warframehub/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { profileCache, settings } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { UnexpectedDataError } from './warframestat.js';
import { FETCH_TIMEOUT_MS, USER_AGENT, type FetchFn } from './worldstate.js';

/**
 * DE's public profile (SPEC §13.2):
 * `https://api.warframe.com/cdn/getProfileViewingData.php?playerId=<accountId>`.
 * No login. A real response (saved 11 Nov 2026, with the name, ID and clan removed) is in
 * ./fixtures/profile. Too many or invalid requests can block the user's IP from logging into
 * the game, so: one call per press of Refresh, never automatic, never retried, and at least an
 * hour between calls (failed ones count too).
 */
export const PROFILE_URL = 'https://api.warframe.com/cdn/getProfileViewingData.php';
export const MIN_REFRESH_GAP_MS = 60 * 60 * 1000;

const ACCOUNT_KEY = 'profile.account_id';
const ATTEMPT_KEY = 'profile.last_attempt';

// ---- normaliser ------------------------------------------------------------

const RawProfile = z.looseObject({
  Results: z
    .array(
      z.looseObject({
        DisplayName: z.string(),
        PlayerLevel: z.int().min(0),
        LoadOutInventory: z.looseObject({
          XPInfo: z.array(z.looseObject({ ItemType: z.string(), XP: z.number() })).default([]),
        }),
        Missions: z.array(z.looseObject({ Completes: z.number().optional() })).default([]),
        Affiliations: z
          .array(
            z.looseObject({
              Tag: z.string(),
              Standing: z.number().optional(),
              Title: z.number().optional(),
            }),
          )
          .default([]),
        PlayerSkills: z.record(z.string(), z.number()).default({}),
      }),
    )
    .min(1),
  Stats: z
    .looseObject({
      MissionsCompleted: z.number().optional(),
      TimePlayedSec: z.number().optional(),
    })
    .default({}),
});

/** DE's profile JSON → the small `Profile` we keep. Throws `UnexpectedDataError` on junk. */
export function normaliseProfile(raw: unknown): Profile {
  const parsed = RawProfile.safeParse(raw);
  if (!parsed.success) throw new UnexpectedDataError(`profile: ${parsed.error.message}`);
  const r = parsed.data.Results[0]!;
  const whole = (n: number | undefined) => Math.max(0, Math.round(n ?? 0));
  return Profile.parse({
    displayName: r.DisplayName,
    masteryRank: r.PlayerLevel,
    items: r.LoadOutInventory.XPInfo.map((i) => ({ uniqueName: i.ItemType, xp: whole(i.XP) })),
    syndicates: r.Affiliations.map((a) => ({
      tag: a.Tag,
      standing: Math.round(a.Standing ?? 0),
      rank: Math.round(a.Title ?? 0),
    })),
    // LPS_* are intrinsic levels; LPP_* are the points behind them.
    intrinsics: Object.entries(r.PlayerSkills)
      .filter(([tag]) => tag.startsWith('LPS_'))
      .map(([tag, level]) => ({ tag, level: whole(level) })),
    missionsCompleted: whole(parsed.data.Stats.MissionsCompleted),
    nodesCompleted: r.Missions.filter((m) => (m.Completes ?? 0) > 0).length,
    timePlayedSeconds: whole(parsed.data.Stats.TimePlayedSec),
  });
}

// ---- service ---------------------------------------------------------------

export interface ProfileServiceOptions {
  fetch?: FetchFn;
  now?: () => Date;
  /** Called with the reason when an upstream call fails. Never receives the account ID. */
  onError?: (error: unknown) => void;
}

export class ProfileService {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly db: Db,
    private readonly userId: number,
    options: ProfileServiceOptions = {},
  ) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? (() => {});
  }

  /** What the Profile screen shows. The account ID is never part of it. */
  current(): ProfileResponse {
    const cached = this.db
      .select()
      .from(profileCache)
      .where(eq(profileCache.userId, this.userId))
      .get();
    let profile: Profile | null = null;
    if (cached) {
      const parsed = Profile.safeParse(JSON.parse(cached.payloadJson));
      profile = parsed.success ? parsed.data : null;
    }
    const last = this.setting(ATTEMPT_KEY);
    const next = typeof last === 'number' ? last + MIN_REFRESH_GAP_MS : null;
    return ProfileResponse.parse({
      accountSet: typeof this.setting(ACCOUNT_KEY) === 'string',
      profile,
      fetchedAt: cached && profile ? cached.fetchedAt.toISOString() : null,
      nextRefreshAt:
        next !== null && next > this.now().getTime() ? new Date(next).toISOString() : null,
    });
  }

  /** Saves the account ID. Drops the old profile, but keeps the refresh wait. */
  setAccount(accountId: string): ProfileResponse {
    this.db.transaction((tx) => {
      this.write(tx, ACCOUNT_KEY, accountId);
      tx.delete(profileCache).where(eq(profileCache.userId, this.userId)).run();
    });
    return this.current();
  }

  /** Forgets the ID and the imported profile. */
  forget(): ProfileResponse {
    this.db.transaction((tx) => {
      tx.delete(settings)
        .where(and(eq(settings.userId, this.userId), eq(settings.key, ACCOUNT_KEY)))
        .run();
      tx.delete(profileCache).where(eq(profileCache.userId, this.userId)).run();
    });
    return this.current();
  }

  /** One call to DE. Refuses inside the hour, never retries, keeps the old copy on failure. */
  async refresh(): Promise<ProfileResponse> {
    const accountId = this.setting(ACCOUNT_KEY);
    if (typeof accountId !== 'string') {
      throw new HttpError(409, 'no_account', 'noAccount');
    }
    const nextRefreshAt = this.current().nextRefreshAt;
    if (nextRefreshAt) {
      const minutes = Math.max(
        1,
        Math.ceil((Date.parse(nextRefreshAt) - this.now().getTime()) / 60_000),
      );
      throw new HttpError(429, 'refresh_too_soon', 'profileTooSoon', { minutes });
    }
    // Counted before the call: a failed or invalid request is the risky kind, too.
    this.write(this.db, ATTEMPT_KEY, this.now().getTime());
    let profile: Profile;
    try {
      const res = await this.fetchFn(`${PROFILE_URL}?playerId=${encodeURIComponent(accountId)}`, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`DE answered ${res.status}`);
      profile = normaliseProfile(await res.json());
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'profile fetch failed');
      throw new HttpError(502, 'profile_unavailable', 'profileUnavailable');
    }
    const values = { payloadJson: JSON.stringify(profile), fetchedAt: this.now() };
    this.db
      .insert(profileCache)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: profileCache.userId, set: values })
      .run();
    return this.current();
  }

  private setting(key: string): unknown {
    const row = this.db
      .select({ valueJson: settings.valueJson })
      .from(settings)
      .where(and(eq(settings.userId, this.userId), eq(settings.key, key)))
      .get();
    return row ? JSON.parse(row.valueJson) : undefined;
  }

  private write(db: Pick<Db, 'insert'>, key: string, value: unknown): void {
    const valueJson = JSON.stringify(value);
    db.insert(settings)
      .values({ userId: this.userId, key, valueJson })
      .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { valueJson } })
      .run();
  }
}
