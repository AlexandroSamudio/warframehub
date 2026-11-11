import type { ItemCategory } from '@warframehub/shared';

/**
 * Affinity needed to reach rank 30 from unranked (Warframe wiki, "Affinity", checked
 * 11 Nov 2026): a Warframe or companion needs 1000 × rank² (900,000 at rank 30), a weapon
 * half of that (450,000). The profile keeps counting past rank 30, so "at least" is right.
 */
export const RANK_30_XP = { warframe: 900_000, weapon: 450_000 } as const;

export function rank30Xp(category: ItemCategory): number {
  return category === 'warframe' ? RANK_30_XP.warframe : RANK_30_XP.weapon;
}

/** Whether the profile's XP for an item means it has been taken to rank 30. */
export function isMastered(category: ItemCategory, xp: number | undefined): boolean {
  return xp !== undefined && xp >= rank30Xp(category);
}
