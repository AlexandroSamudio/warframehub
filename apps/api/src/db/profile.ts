import { Profile } from '@warframehub/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { profileCache } from './schema.js';

/** uniqueName → XP from the imported profile. Empty when nothing was imported. */
export function profileXp(db: Db, userId: number): Map<string, number> {
  const row = db.select().from(profileCache).where(eq(profileCache.userId, userId)).get();
  const parsed = row ? Profile.safeParse(JSON.parse(row.payloadJson)) : null;
  return new Map(parsed?.success ? parsed.data.items.map((i) => [i.uniqueName, i.xp]) : []);
}

/** Your Mastery Rank from the imported profile, or null when nothing was imported. */
export function profileMasteryRank(db: Db, userId: number): number | null {
  const row = db.select().from(profileCache).where(eq(profileCache.userId, userId)).get();
  const parsed = row ? Profile.safeParse(JSON.parse(row.payloadJson)) : null;
  return parsed?.success ? parsed.data.masteryRank : null;
}
