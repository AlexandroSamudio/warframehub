import { z } from 'zod';
import { GoalStatus, ItemRecipe } from './goals.js';
import { CatalogFreshness } from './warframes.js';

/**
 * The Weapons section (SPEC §15): every Primary, Secondary and Melee weapon, and the
 * arch-guns and arch-melee, one page each with its Prime, Vandal and Mk1 versions. Data
 * from warframestat.us (`/weapons`) and the wiki's classes, normalised by
 * `apps/api/src/sources/weapons.ts`.
 */

/** A version of a weapon: Braton, Braton Prime, Braton Vandal, Mk1-Braton. */
export const WeaponVariantKind = z.enum(['normal', 'prime', 'vandal', 'mk1']);
export type WeaponVariantKind = z.infer<typeof WeaponVariantKind>;

/** The list's two tabs: Primary/Secondary/Melee, and arch-guns and arch-melee. */
export const WeaponTab = z.enum(['weapons', 'arch']);
export type WeaponTab = z.infer<typeof WeaponTab>;

export const WeaponSlot = z.enum(['primary', 'secondary', 'melee', 'archgun', 'archmelee']);
export type WeaponSlot = z.infer<typeof WeaponSlot>;

/** Damage of one type, e.g. { type: "slash", amount: 21 }. Only types above zero. */
export const WeaponDamage = z.object({ type: z.string(), amount: z.number() });
export type WeaponDamage = z.infer<typeof WeaponDamage>;

/** One way the weapon attacks: "Normal Attack", "Incarnon Form", "Heavy Slam Attack"… */
export const WeaponAttack = z.object({
  /** As the data names it (English; the page translates the common ones). */
  name: z.string(),
  /** Percent, e.g. 12 for 12 %. */
  critChance: z.number().nullable(),
  critMultiplier: z.number().nullable(),
  statusChance: z.number().nullable(),
  /** Fire rate (shots per second) or, for melee, attack speed. */
  speed: z.number().nullable(),
  /** "Hit-Scan", "Projectile", "AoE"… */
  shotType: z.string().nullable(),
  /** Seconds to charge, for charged attacks. */
  chargeTime: z.number().nullable(),
  damage: z.array(WeaponDamage),
  /** The sum of `damage`. */
  total: z.number(),
});
export type WeaponAttack = z.infer<typeof WeaponAttack>;

export const WeaponStats = z.object({
  /** Riven disposition, 1 (weak) to 5 (strong). */
  disposition: z.int().min(1).max(5).nullable(),
  /** The exact Riven multiplier behind the dots, e.g. 1.2. */
  omegaAttenuation: z.number().nullable(),
  magazine: z.number().nullable(),
  /** Seconds. */
  reload: z.number().nullable(),
  multishot: z.number().nullable(),
  /** "Auto", "Semi", "Charge", "Held"… */
  trigger: z.string().nullable(),
  /** "Alarming" or "Silent". */
  noise: z.string().nullable(),
  accuracy: z.number().nullable(),
  /** Melee range in metres. */
  range: z.number().nullable(),
});
export type WeaponStats = z.infer<typeof WeaponStats>;

/** One Incarnon perk: its name and what it does, with this version's numbers (wiki, English). */
export const IncarnonPerk = z.object({ name: z.string(), lines: z.array(z.string()) });
export type IncarnonPerk = z.infer<typeof IncarnonPerk>;

export const IncarnonTier = z.object({
  tier: z.int().min(1).max(5),
  /** What unlocks the tier; null for an adapter's first tier (installing it unlocks it). */
  challenge: z.string().nullable(),
  /** You pick one per tier in the game. */
  perks: z.array(IncarnonPerk),
});
export type IncarnonTier = z.infer<typeof IncarnonTier>;

/** A version's Incarnon evolutions (SPEC §15): from a Genesis adapter, or its own. */
export const WeaponEvolutions = z.object({
  kind: z.enum(['genesis', 'native']),
  /** The wiki page they come from (credit and "more"). */
  page: z.url(),
  tiers: z.array(IncarnonTier),
});
export type WeaponEvolutions = z.infer<typeof WeaponEvolutions>;

export const WeaponVariant = z.object({
  uniqueName: z.string(),
  name: z.string(),
  kind: WeaponVariantKind,
  description: z.string(),
  /** File name for `GET /api/images/:file`, or null. */
  image: z.string().nullable(),
  masteryReq: z.int().min(0).nullable(),
  stats: WeaponStats,
  attacks: z.array(WeaponAttack),
  /** It has an Incarnon form (its own, or from a Genesis adapter). */
  incarnon: z.boolean(),
  /** Its evolution tiers and perks, when the wiki data has them. */
  evolutions: WeaponEvolutions.nullable(),
  released: z.object({ date: z.string(), update: z.string().nullable() }).nullable(),
  vaulted: z.boolean().nullable(),
  tradable: z.boolean().nullable(),
  wikiUrl: z.url().nullable(),
  /** Parts, drops and resources: the same recipe the goal planner uses. Null if none. */
  recipe: ItemRecipe.nullable(),
  /** Your imported profile shows it at rank 30. */
  mastered: z.boolean(),
  /** It's one of your goals (active or built), or null. */
  goal: z.object({ id: z.int(), status: GoalStatus }).nullable(),
});
export type WeaponVariant = z.infer<typeof WeaponVariant>;

export const WeaponListItem = z.object({
  /** "braton", "kuva-hek": the page's address. */
  slug: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  tab: WeaponTab,
  slot: WeaponSlot,
  /** The wiki's class ("Rifle", "Polearm"); null for arch weapons or when unknown. */
  class: z.string().nullable(),
  variants: z.array(z.object({ kind: WeaponVariantKind, name: z.string(), mastered: z.boolean() })),
  /** The highest disposition among its versions (what a Riven is worth on it). */
  disposition: z.int().min(1).max(5).nullable(),
  /** The lowest Mastery Rank any version needs. */
  masteryReq: z.int().min(0).nullable(),
  /** Some version has an Incarnon form. */
  incarnon: z.boolean(),
  /** Its Incarnon Genesis is one of this week's Steel Path Circuit picks. */
  inCircuit: z.boolean(),
  /** You starred it. */
  favorite: z.boolean(),
});
export type WeaponListItem = z.infer<typeof WeaponListItem>;

/** `GET /api/weapons`, A–Z. */
export const WeaponsResponse = z.object({
  weapons: z.array(WeaponListItem),
  /** Your Mastery Rank from the imported profile, or null when none was imported. */
  masteryRank: z.int().min(0).nullable(),
  ...CatalogFreshness,
});
export type WeaponsResponse = z.infer<typeof WeaponsResponse>;

/** `GET /api/weapons/:slug`: normal first, then Prime, Vandal, Mk1. */
export const WeaponDetail = z.object({
  slug: z.string(),
  name: z.string(),
  tab: WeaponTab,
  slot: WeaponSlot,
  class: z.string().nullable(),
  variants: z.array(WeaponVariant).min(1),
  /** Its Incarnon Genesis is one of this week's Steel Path Circuit picks. */
  inCircuit: z.boolean(),
  /** When this week's Circuit picks change (the weekly reset), when `inCircuit`. */
  circuitEndsAt: z.iso.datetime().nullable(),
  favorite: z.boolean(),
  ...CatalogFreshness,
});
export type WeaponDetail = z.infer<typeof WeaponDetail>;
