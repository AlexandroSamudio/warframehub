import { z } from 'zod';
import { GoalStatus, ItemRecipe } from './goals.js';

/**
 * The Warframes section (SPEC §14): every Warframe, one page each, with its Prime and
 * Umbra versions. Data from warframestat.us, normalised by
 * `apps/api/src/sources/warframes.ts`.
 */

/** A version of a Warframe: Nidus, Nidus Prime, Excalibur Umbra. */
export const VariantKind = z.enum(['normal', 'prime', 'umbra']);
export type VariantKind = z.infer<typeof VariantKind>;

export const WarframeAbility = z.object({
  uniqueName: z.string(),
  name: z.string(),
  /** 1–4 in the game's order. */
  key: z.int().min(1).max(4),
  description: z.string(),
  /** File name for `GET /api/images/:file`, or null. */
  image: z.string().nullable(),
});
export type WarframeAbility = z.infer<typeof WarframeAbility>;

export const WarframeAugment = z.object({
  name: z.string(),
  /** The ability it changes ("Larva"), "Passive", or null when the data doesn't say. */
  ability: z.string().nullable(),
  /** What it does at max rank, as the game words it. */
  effect: z.string(),
  polarity: z.string().nullable(),
  rarity: z.string().nullable(),
});
export type WarframeAugment = z.infer<typeof WarframeAugment>;

export const WarframeStats = z.object({
  /** Base values as the data gives them (unranked). */
  health: z.number(),
  shield: z.number(),
  armor: z.number(),
  energy: z.number(),
  sprint: z.number(),
});
export type WarframeStats = z.infer<typeof WarframeStats>;

export const WarframeVariant = z.object({
  uniqueName: z.string(),
  name: z.string(),
  kind: VariantKind,
  description: z.string(),
  passive: z.string().nullable(),
  image: z.string().nullable(),
  abilities: z.array(WarframeAbility),
  stats: WarframeStats,
  /** Slot polarities, e.g. ["madurai", "vazarin"]. */
  polarities: z.array(z.string()),
  aura: z.string().nullable(),
  masteryReq: z.int().min(0).nullable(),
  released: z.object({ date: z.string(), update: z.string().nullable() }).nullable(),
  vaulted: z.boolean().nullable(),
  wikiUrl: z.url().nullable(),
  /** Parts, drops and resources: the same recipe the goal planner uses. Null if none. */
  recipe: ItemRecipe.nullable(),
  /** Your imported profile shows it at rank 30. */
  mastered: z.boolean(),
  /** It's one of your goals (active or built), or null. */
  goal: z.object({ id: z.int(), status: GoalStatus }).nullable(),
});
export type WarframeVariant = z.infer<typeof WarframeVariant>;

export const WarframeListItem = z.object({
  /** "nidus", "excalibur": the page's address. */
  slug: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  variants: z.array(z.object({ kind: VariantKind, name: z.string(), mastered: z.boolean() })),
});
export type WarframeListItem = z.infer<typeof WarframeListItem>;

const Freshness = {
  /** When the list was fetched from warframestat.us. */
  fetchedAt: z.iso.datetime(),
  /** True when the last fetch failed and this is the saved copy. */
  stale: z.boolean(),
  /** When Refresh works again, or null when it works now. */
  nextRefreshAt: z.iso.datetime().nullable(),
};

/** `GET /api/warframes`, A–Z. */
export const WarframesResponse = z.object({ warframes: z.array(WarframeListItem), ...Freshness });
export type WarframesResponse = z.infer<typeof WarframesResponse>;

/** `GET /api/warframes/:slug`: normal first, then Prime, then Umbra. */
export const WarframeDetail = z.object({
  slug: z.string(),
  name: z.string(),
  variants: z.array(WarframeVariant).min(1),
  /** Augment mods for this Warframe (all versions share them). */
  augments: z.array(WarframeAugment),
  ...Freshness,
});
export type WarframeDetail = z.infer<typeof WarframeDetail>;
