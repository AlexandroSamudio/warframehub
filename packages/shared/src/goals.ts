import { z } from 'zod';

/**
 * Goal planner: item data (SPEC §13). Recipes come from warframestat.us item search
 * and are normalised by `apps/api/src/sources/items.ts`.
 */

/** Only Warframes and weapons can be goals for now (Alex, 10 Nov 2026). */
export const ItemCategory = z.enum(['warframe', 'primary', 'secondary', 'melee']);
export type ItemCategory = z.infer<typeof ItemCategory>;

export const ItemDrop = z.object({
  /** e.g. "Eris/Oestrus (Infested Salvage), Rotation C" or "Axi N12 Relic (Radiant)". */
  location: z.string(),
  /** Percent, e.g. 14.29. Null when the data has no chance. */
  chance: z.number().nullable(),
  rarity: z.string().nullable(),
  /** True when the drop is from a Void relic (Prime parts). */
  relic: z.boolean(),
});
export type ItemDrop = z.infer<typeof ItemDrop>;

export const RecipeComponent = z.object({
  /** Stable id: the upstream `uniqueName` (`credits` for the credit cost). */
  key: z.string(),
  name: z.string(),
  count: z.int().positive(),
  /** Best chance first. Empty when the data has none (quest, market, vendor). */
  drops: z.array(ItemDrop),
});
export type RecipeComponent = z.infer<typeof RecipeComponent>;

export const ItemRecipe = z.object({
  uniqueName: z.string(),
  name: z.string(),
  category: ItemCategory,
  /** Upstream type, e.g. "Warframe", "Shotgun", "Rifle". */
  type: z.string(),
  isPrime: z.boolean(),
  /** Null when the data doesn't say (non-Prime items). */
  vaulted: z.boolean().nullable(),
  masteryReq: z.int().min(0).nullable(),
  /** Build time in seconds, or null when unknown. */
  buildTime: z.int().min(0).nullable(),
  /** Blueprint and built parts (Chassis, Barrel…). Owned per goal. */
  parts: z.array(RecipeComponent),
  /** Resources (Kuva, Plastids, Credits…). Amounts are shared across goals. */
  resources: z.array(RecipeComponent),
});
export type ItemRecipe = z.infer<typeof ItemRecipe>;

/** One row in the "add a goal" search. */
export const ItemSearchResult = ItemRecipe.pick({
  uniqueName: true,
  name: true,
  category: true,
  type: true,
  isPrime: true,
  vaulted: true,
});
export type ItemSearchResult = z.infer<typeof ItemSearchResult>;

/** Response of `GET /api/goals/search?q=`. */
export const ItemSearchResponse = z.object({
  query: z.string(),
  results: z.array(ItemSearchResult),
  /** When these results were fetched from warframestat.us. */
  fetchedAt: z.iso.datetime(),
  /** True when the live search failed and these are cached results. */
  stale: z.boolean(),
});
export type ItemSearchResponse = z.infer<typeof ItemSearchResponse>;
