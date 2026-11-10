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

// ---- goals ------------------------------------------------------------------

export const GoalStatus = z.enum(['active', 'built']);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const GoalPart = RecipeComponent.extend({
  /** How many the user has (0..count). */
  owned: z.int().min(0),
});
export type GoalPart = z.infer<typeof GoalPart>;

export const GoalResource = RecipeComponent.extend({
  /** The user's shared stock of this resource. */
  have: z.int().min(0),
});
export type GoalResource = z.infer<typeof GoalResource>;

export const Goal = z.object({
  id: z.int(),
  uniqueName: z.string(),
  name: z.string(),
  category: ItemCategory,
  type: z.string(),
  isPrime: z.boolean(),
  vaulted: z.boolean().nullable(),
  masteryReq: z.int().min(0).nullable(),
  buildTime: z.int().min(0).nullable(),
  status: GoalStatus,
  parts: z.array(GoalPart),
  resources: z.array(GoalResource),
  /** Parts owned plus resources fully covered, out of all requirements. */
  progress: z.object({ done: z.int().min(0), total: z.int().min(0) }),
  /** Every part owned and enough of every resource for this goal on its own. */
  ready: z.boolean(),
  createdAt: z.iso.datetime(),
  builtAt: z.iso.datetime().nullable(),
  recipeFetchedAt: z.iso.datetime(),
});
export type Goal = z.infer<typeof Goal>;

/** One resource across all active goals, minus the shared stock. */
export const ShoppingRow = z.object({
  key: z.string(),
  name: z.string(),
  needed: z.int().min(0),
  have: z.int().min(0),
  missing: z.int().min(0),
  goals: z.array(z.object({ id: z.int(), name: z.string(), count: z.int().positive() })),
});
export type ShoppingRow = z.infer<typeof ShoppingRow>;

export const StockRow = z.object({ key: z.string(), name: z.string(), amount: z.int().min(0) });
export type StockRow = z.infer<typeof StockRow>;

/** Response of `GET /api/goals` and of every goal change. */
export const GoalsResponse = z.object({
  active: z.array(Goal),
  built: z.array(Goal),
  shoppingList: z.array(ShoppingRow),
  stock: z.array(StockRow),
});
export type GoalsResponse = z.infer<typeof GoalsResponse>;

export const CreateGoalRequest = z.object({ uniqueName: z.string().min(1).max(300) });
export type CreateGoalRequest = z.infer<typeof CreateGoalRequest>;

export const UpdateGoalPartRequest = z.object({
  componentKey: z.string().min(1).max(300),
  owned: z.int().min(0).max(1_000),
});
export type UpdateGoalPartRequest = z.infer<typeof UpdateGoalPartRequest>;

export const SetStockRequest = z.object({
  key: z.string().min(1).max(300),
  amount: z.int().min(0).max(2_000_000_000),
});
export type SetStockRequest = z.infer<typeof SetStockRequest>;

export const ReorderGoalsRequest = z.object({ goalIds: z.array(z.int().positive()).min(1) });
export type ReorderGoalsRequest = z.infer<typeof ReorderGoalsRequest>;
