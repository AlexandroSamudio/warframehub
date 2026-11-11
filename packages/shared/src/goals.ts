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

/** One material a part needs to craft (from DE's public export). */
export const CraftIngredient = z.object({
  /** The item's `uniqueName`, the same id the resources use, so stock is shared. */
  key: z.string(),
  name: z.string(),
  count: z.int().positive(),
});
export type CraftIngredient = z.infer<typeof CraftIngredient>;

/** What it takes to craft a part (a Chassis, Neuroptics, Systems…) in the Foundry. */
export const PartCraft = z.object({
  credits: z.int().min(0),
  ingredients: z.array(CraftIngredient),
});
export type PartCraft = z.infer<typeof PartCraft>;

/** Where a part with no drop data comes from, read from the Warframe wiki. */
export const PartSource = z.object({
  kind: z.literal('quest'),
  /** The quest's name, e.g. "The Glast Gambit". */
  title: z.string(),
  /** Its page on the Warframe wiki. */
  url: z.url(),
});
export type PartSource = z.infer<typeof PartSource>;

/** A part of a recipe. `craft` is null when it isn't crafted (e.g. Prime weapon parts drop finished). */
export const RecipePart = RecipeComponent.extend({
  craft: PartCraft.nullable().default(null),
  /** Quest rewards the wiki names for this part. Empty when none is known. */
  sources: z.array(PartSource).default([]),
});
export type RecipePart = z.infer<typeof RecipePart>;

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
  parts: z.array(RecipePart),
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

export const GoalPart = RecipePart.extend({
  /** How many the user has (0..count). */
  owned: z.int().min(0),
  /** The user's own note, e.g. where this part comes from when no drop table lists it. */
  note: z.string(),
});
export type GoalPart = z.infer<typeof GoalPart>;

export const GoalResource = RecipeComponent.extend({
  /**
   * How much of `count` is for crafting parts you don't have yet. The rest is the item's
   * own recipe. It drops as you get the parts.
   */
  forParts: z.int().min(0),
  /**
   * This goal's share of the stock. Active goals get the shared stock in goal order
   * (the user's priority), so two goals never count the same Orokin Cells.
   */
  have: z.int().min(0),
  /** The whole shared stock of this resource (what the amount field edits). */
  stock: z.int().min(0),
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

/** Change how many you have, your note, or both. */
export const UpdateGoalPartRequest = z
  .object({
    componentKey: z.string().min(1).max(300),
    owned: z.int().min(0).max(1_000).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((body) => body.owned !== undefined || body.note !== undefined, {
    message: 'send owned, note, or both',
  });
export type UpdateGoalPartRequest = z.infer<typeof UpdateGoalPartRequest>;

export const SetStockRequest = z.object({
  key: z.string().min(1).max(300),
  amount: z.int().min(0).max(2_000_000_000),
});
export type SetStockRequest = z.infer<typeof SetStockRequest>;

export const ReorderGoalsRequest = z.object({ goalIds: z.array(z.int().positive()).min(1) });
export type ReorderGoalsRequest = z.infer<typeof ReorderGoalsRequest>;
