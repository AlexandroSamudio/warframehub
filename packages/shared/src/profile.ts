import { z } from 'zod';

/** A Warframe account ID: 24 hex characters (the `user_id` on warframe.com/api/user-data). */
export const AccountId = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, 'An account ID is 24 letters and digits');

export const SetAccountRequest = z.object({
  accountId: AccountId.transform((s) => s.toLowerCase()),
});
export type SetAccountRequest = z.infer<typeof SetAccountRequest>;

export const ProfileItemXp = z.object({
  /** The game's internal path, e.g. `/Lotus/Powersuits/Excalibur/Excalibur`. */
  uniqueName: z.string(),
  xp: z.number().int().min(0),
});
export type ProfileItemXp = z.infer<typeof ProfileItemXp>;

export const ProfileSyndicate = z.object({
  /** e.g. `CetusSyndicate`. */
  tag: z.string(),
  standing: z.number().int(),
  rank: z.number().int(),
});
export type ProfileSyndicate = z.infer<typeof ProfileSyndicate>;

export const ProfileIntrinsic = z.object({
  /** e.g. `LPS_TACTICAL` (Railjack) or `LPS_DRIFT_COMBAT` (Duviri). */
  tag: z.string(),
  level: z.number().int().min(0),
});
export type ProfileIntrinsic = z.infer<typeof ProfileIntrinsic>;

/** What we keep from DE's public profile (SPEC §13.2). No account ID, no clan, no email. */
export const Profile = z.object({
  displayName: z.string(),
  masteryRank: z.number().int().min(0),
  /** Every Warframe and weapon the account has ranked, with its XP. */
  items: z.array(ProfileItemXp),
  syndicates: z.array(ProfileSyndicate),
  intrinsics: z.array(ProfileIntrinsic),
  missionsCompleted: z.number().int().min(0),
  /** Star-chart nodes with at least one completion. */
  nodesCompleted: z.number().int().min(0),
  timePlayedSeconds: z.number().int().min(0),
});
export type Profile = z.infer<typeof Profile>;

export const ProfileResponse = z.object({
  /** Whether an account ID is saved. The ID itself is never sent back. */
  accountSet: z.boolean(),
  profile: Profile.nullable(),
  /** When the profile was last fetched (ISO UTC), or null. */
  fetchedAt: z.iso.datetime().nullable(),
  /** The earliest time the Refresh button works again (ISO UTC), or null when it works now. */
  nextRefreshAt: z.iso.datetime().nullable(),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;
