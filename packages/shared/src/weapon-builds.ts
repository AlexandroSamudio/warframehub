import { z } from 'zod';
import {
  ArcaneOption,
  BuildForma,
  BuildName,
  BuildSlot,
  Note,
  ResolvedSlot,
  SourceUrl,
} from './builds.js';

/**
 * Weapon builds (SPEC §15.1): a personal library of weapon setups, like Warframe builds but
 * without a guide, and with what weapons have: the Exilus and 8 mods, arcanes, a stance,
 * Incarnon perk picks, a Riven and the Kuva/Tenet/Coda bonus. One build is for one version
 * of the weapon (Braton Prime, Mk1-Braton…).
 */

/** A weapon version, as `WeaponVariantKind` in weapons.ts (kept here so neither file imports the other). */
const VariantKind = z.enum(['normal', 'prime', 'vandal', 'mk1']);

export const WEAPON_MOD_SLOTS = 8;
/** Arch-guns take a Primary and a Secondary arcane; other weapons one; arch-melee none. */
export const WEAPON_ARCANE_SLOTS = 2;
/** Incarnon tiers 2–5 are a choice (tier 1 is the form itself). */
export const INCARNON_CHOICE_TIERS = [2, 3, 4, 5] as const;

/**
 * Rivens (wiki, "Riven Mods", checked 16 Nov 2026): Madurai, Naramon or Vazarin; 2–3
 * positive stats and at most one negative.
 */
export const RIVEN_POLARITIES = ['madurai', 'naramon', 'vazarin'] as const;
export const RIVEN_MAX_POSITIVE = 3;
export const RIVEN_MAX_NEGATIVE = 1;

/**
 * Kuva, Tenet and Coda weapons have one bonus element at 25–60% of base damage (wiki, "Kuva
 * Weapons", "Tenet Weapons", "Coda Weapons", checked 16 Nov 2026).
 */
export const PROGENITOR_ELEMENTS = [
  'impact',
  'heat',
  'cold',
  'electricity',
  'toxin',
  'magnetic',
  'radiation',
] as const;
export const PROGENITOR_MIN = 25;
export const PROGENITOR_MAX = 60;

export const RivenStat = z.object({
  /** The stat's English name as the wiki lists it ("Critical Damage"). */
  stat: z.string().trim().min(1).max(60),
  spliced: z.boolean().default(false),
  /** As shown on the Riven: "+180%", "x1.5", "3.2m". */
  value: z
    .string()
    .trim()
    .max(16)
    .regex(/^[+\-−]?[x×]?\d+([.,]\d+)?\s*(%|m|s|x)?$/i, 'rivenValue'),
  negative: z.boolean().default(false),
});
export type RivenStat = z.infer<typeof RivenStat>;

export const BuildRiven = z.object({
  /** The Riven's name ("Vexi-critacron"), optional. */
  name: z.string().trim().max(40).default(''),
  polarity: z.enum(RIVEN_POLARITIES).nullable().default(null),
  stats: z.array(RivenStat).max(RIVEN_MAX_POSITIVE + RIVEN_MAX_NEGATIVE),
  note: Note,
});
export type BuildRiven = z.infer<typeof BuildRiven>;

export const ProgenitorBonus = z.object({
  element: z.enum(PROGENITOR_ELEMENTS),
  percent: z.int().min(PROGENITOR_MIN).max(PROGENITOR_MAX),
});
export type ProgenitorBonus = z.infer<typeof ProgenitorBonus>;

/** The perk picked in one Incarnon tier (its index in that tier), with a note. */
export const IncarnonPick = z.object({
  tier: z.int().min(2).max(5),
  perk: z.int().min(0).max(5),
  note: Note,
});
export type IncarnonPick = z.infer<typeof IncarnonPick>;

/** Everything in a weapon build besides its name and place. Stored as one JSON document. */
export const WeaponBuildContent = z.object({
  /** Which version of the weapon it's for. */
  variant: VariantKind,
  sourceUrl: SourceUrl,
  author: z.string().trim().max(80).default(''),
  /** The update it was made for, e.g. "Update 41". */
  patch: z.string().trim().max(40).default(''),
  /** What the build is for (plain text). */
  description: z.string().trim().max(300).default(''),
  forma: BuildForma,
  exilus: BuildSlot.nullable().default(null),
  slots: z
    .array(BuildSlot.nullable())
    .length(WEAPON_MOD_SLOTS)
    .default(Array(WEAPON_MOD_SLOTS).fill(null)),
  arcanes: z
    .array(BuildSlot.nullable())
    .length(WEAPON_ARCANE_SLOTS)
    .default(Array(WEAPON_ARCANE_SLOTS).fill(null)),
  stance: BuildSlot.nullable().default(null),
  incarnon: z.array(IncarnonPick).max(INCARNON_CHOICE_TIERS.length).default([]),
  riven: BuildRiven.nullable().default(null),
  progenitor: ProgenitorBonus.nullable().default(null),
});
export type WeaponBuildContent = z.infer<typeof WeaponBuildContent>;

const Slug = z.string().regex(/^[a-z0-9-]{1,60}$/);

/** `POST /api/weapon-builds`. */
export const CreateWeaponBuildRequest = z.object({
  slug: Slug,
  name: BuildName,
  content: WeaponBuildContent,
});
export type CreateWeaponBuildRequest = z.infer<typeof CreateWeaponBuildRequest>;

/** `PUT /api/weapon-builds/:id`: the whole build again. */
export const UpdateWeaponBuildRequest = z.object({ name: BuildName, content: WeaponBuildContent });
export type UpdateWeaponBuildRequest = z.infer<typeof UpdateWeaponBuildRequest>;

/** `POST /api/weapon-builds/reorder`: every build of one weapon, in the new order. */
export const ReorderWeaponBuildsRequest = z.object({
  slug: Slug,
  buildIds: z.array(z.int().positive()).min(1),
});
export type ReorderWeaponBuildsRequest = z.infer<typeof ReorderWeaponBuildsRequest>;

/** `POST /api/weapon-builds/import`: read a pasted code for this weapon (nothing is saved). */
export const ImportWeaponBuildRequest = z.object({
  slug: Slug,
  code: z.string().min(1).max(120_000),
});
export type ImportWeaponBuildRequest = z.infer<typeof ImportWeaponBuildRequest>;

export const ImportWeaponBuildResponse = z.object({
  name: z.string(),
  content: WeaponBuildContent,
});
export type ImportWeaponBuildResponse = z.infer<typeof ImportWeaponBuildResponse>;

/** A weapon build as saved (`GET /api/weapon-builds/:id`, for the edit page). */
export const WeaponBuild = z.object({
  id: z.int().positive(),
  slug: z.string(),
  name: z.string(),
  content: WeaponBuildContent,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WeaponBuild = z.infer<typeof WeaponBuild>;

/** A build as shown: its parts with what the game data says about them now. */
export const WeaponBuildView = WeaponBuild.extend({
  /** The version's name ("Braton Prime"). */
  variantName: z.string(),
  exilus: ResolvedSlot.nullable(),
  slots: z.array(ResolvedSlot.nullable()),
  arcanes: z.array(ResolvedSlot.nullable()),
  stance: ResolvedSlot.nullable(),
  /** The picked perks by name, tier order (English: the wiki's text). */
  incarnon: z.array(
    IncarnonPick.extend({ name: z.string().nullable(), lines: z.array(z.string()) }),
  ),
});
export type WeaponBuildView = z.infer<typeof WeaponBuildView>;

// ---- the edit page's choices --------------------------------------------------------

export const WeaponModOption = z.object({
  uniqueName: z.string(),
  name: z.string(),
  polarity: z.string().nullable(),
  rarity: z.string().nullable(),
  image: z.string().nullable(),
  maxRank: z.int().min(0),
  /** Can go in the Exilus slot. */
  exilus: z.boolean(),
  /** A melee stance (its own slot). */
  stance: z.boolean(),
  /** Made for this weapon only (an augment or a weapon-specific mod). */
  augment: z.boolean(),
  /** The effect at each rank, 0 first. */
  effects: z.array(z.string()),
  alias: z.string().nullable().optional(),
});
export type WeaponModOption = z.infer<typeof WeaponModOption>;

/** Which arcane slot an arcane fits. */
export const WeaponArcaneKind = z.enum(['primary', 'secondary', 'melee', 'bow', 'shotgun']);
export type WeaponArcaneKind = z.infer<typeof WeaponArcaneKind>;

export const WeaponArcaneOption = ArcaneOption.extend({ kind: WeaponArcaneKind });
export type WeaponArcaneOption = z.infer<typeof WeaponArcaneOption>;

export const RivenStatOption = z.object({
  stat: z.string(),
  spliced: z.boolean(),
  /** It can be the negative stat. */
  negative: z.boolean(),
});
export type RivenStatOption = z.infer<typeof RivenStatOption>;

/** `GET /api/weapon-builds/options?slug=`: what a build of this weapon can hold. */
export const WeaponBuildOptionsResponse = z.object({
  mods: z.array(WeaponModOption),
  stances: z.array(WeaponModOption),
  /** One list per arcane slot: [first slot, second slot]; empty when there's no slot. */
  arcaneSlots: z.array(z.array(WeaponArcaneOption)).length(WEAPON_ARCANE_SLOTS),
  hasExilus: z.boolean(),
  /** The Riven stats for this weapon's type; empty when it takes no Riven. */
  rivenStats: z.array(RivenStatOption),
  /** Kuva, Tenet or Coda: it has a progenitor bonus. */
  progenitor: z.boolean(),
});
export type WeaponBuildOptionsResponse = z.infer<typeof WeaponBuildOptionsResponse>;
