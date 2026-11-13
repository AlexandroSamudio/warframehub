import { z } from 'zod';

/**
 * Builds (SPEC §14.1): builds Alex saves from Overframe, YouTube or anywhere else, each with
 * its mods, arcanes, Archon Shards, Helminth ability, weapons and a written guide. Not a
 * build editor: no capacity or stat maths. A build belongs to one Warframe (by slug) and is
 * shown on the version that owns the builds (`WarframeDetail.buildsVariant`).
 */

// ---- Archon Shards -----------------------------------------------------------------

export const ShardColor = z.enum(['crimson', 'amber', 'azure', 'emerald', 'topaz', 'violet']);
export type ShardColor = z.infer<typeof ShardColor>;

export interface ShardStat {
  key: string;
  color: ShardColor;
  /** The stat as the wiki words it, normal and Tauforged. */
  normal: string;
  tauforged: string;
}

/**
 * Every Archon Shard stat a Warframe can take. Checked against the Warframe wiki's
 * "Archon Shard" page (Shard Buffs table) on 13 Nov 2026. Patch-sensitive: check again after
 * shard changes.
 */
export const SHARD_STATS: readonly ShardStat[] = [
  {
    key: 'crimson.melee_crit_damage',
    color: 'crimson',
    normal: '+25% Melee Critical Damage',
    tauforged: '+37.5% Melee Critical Damage',
  },
  {
    key: 'crimson.primary_status_chance',
    color: 'crimson',
    normal: '+25% Primary Status Chance',
    tauforged: '+37.5% Primary Status Chance',
  },
  {
    key: 'crimson.secondary_crit_chance',
    color: 'crimson',
    normal: '+25% Secondary Critical Chance',
    tauforged: '+37.5% Secondary Critical Chance',
  },
  {
    key: 'crimson.ability_strength',
    color: 'crimson',
    normal: '+10% Ability Strength',
    tauforged: '+15% Ability Strength',
  },
  {
    key: 'crimson.ability_duration',
    color: 'crimson',
    normal: '+10% Ability Duration',
    tauforged: '+15% Ability Duration',
  },
  {
    key: 'amber.energy_on_spawn',
    color: 'amber',
    normal: '+30% Maximum Energy filled on spawn',
    tauforged: '+45% Maximum Energy filled on spawn',
  },
  {
    key: 'amber.health_orbs',
    color: 'amber',
    normal: '+100% Health Orb effectiveness',
    tauforged: '+150% Health Orb effectiveness',
  },
  {
    key: 'amber.energy_orbs',
    color: 'amber',
    normal: '+50% Energy Orb effectiveness',
    tauforged: '+75% Energy Orb effectiveness',
  },
  {
    key: 'amber.casting_speed',
    color: 'amber',
    normal: '+25% Casting Speed',
    tauforged: '+37.5% Casting Speed',
  },
  {
    key: 'amber.parkour_velocity',
    color: 'amber',
    normal: '+15% Parkour Velocity',
    tauforged: '+22.5% Parkour Velocity',
  },
  { key: 'azure.health', color: 'azure', normal: '+150 Max Health', tauforged: '+225 Max Health' },
  {
    key: 'azure.shield',
    color: 'azure',
    normal: '+150 Shield Capacity',
    tauforged: '+225 Shield Capacity',
  },
  { key: 'azure.energy', color: 'azure', normal: '+50 Energy Max', tauforged: '+75 Energy Max' },
  { key: 'azure.armor', color: 'azure', normal: '+150 Armor', tauforged: '+225 Armor' },
  {
    key: 'azure.health_regen',
    color: 'azure',
    normal: '+5 Health regenerated/s',
    tauforged: '+7.5 Health regenerated/s',
  },
  {
    key: 'emerald.toxin_damage',
    color: 'emerald',
    normal: 'Toxin Status Effects deal +30% more damage',
    tauforged: 'Toxin Status Effects deal +45% more damage',
  },
  {
    key: 'emerald.toxin_health',
    color: 'emerald',
    normal: '+2 Health each time enemies take Toxin Status damage',
    tauforged: '+3 Health each time enemies take Toxin Status damage',
  },
  {
    key: 'emerald.corrosion_ability_damage',
    color: 'emerald',
    normal: '+10% Ability Damage on enemies with Corrosion Status',
    tauforged: '+15% Ability Damage on enemies with Corrosion Status',
  },
  {
    key: 'emerald.corrosion_stacks',
    color: 'emerald',
    normal: '+2 max Corrosion Status stacks',
    tauforged: '+3 max Corrosion Status stacks',
  },
  {
    key: 'topaz.blast_health',
    color: 'topaz',
    normal: '+1 Max Health per Blast kill (max 300)',
    tauforged: '+2 Max Health per Blast kill (max 450)',
  },
  {
    key: 'topaz.blast_shield',
    color: 'topaz',
    normal: '+5 Shield regenerated per Blast kill',
    tauforged: '+7.5 Shield regenerated per Blast kill',
  },
  {
    key: 'topaz.heat_secondary_crit',
    color: 'topaz',
    normal: '+1% Secondary Critical Chance per Heat kill (max 50%)',
    tauforged: '+1.5% Secondary Critical Chance per Heat kill (max 75%)',
  },
  {
    key: 'topaz.radiation_ability_damage',
    color: 'topaz',
    normal: '+10% Ability Damage on enemies with Radiation Status',
    tauforged: '+15% Ability Damage on enemies with Radiation Status',
  },
  {
    key: 'violet.electricity_ability_damage',
    color: 'violet',
    normal: '+10% Ability Damage on enemies with Electricity Status',
    tauforged: '+15% Ability Damage on enemies with Electricity Status',
  },
  {
    key: 'violet.primary_electricity',
    color: 'violet',
    normal: '+30% Primary Electricity Damage, +10% per Crimson, Azure or Violet shard',
    tauforged: '+45% Primary Electricity Damage, +15% per Crimson, Azure or Violet shard',
  },
  {
    key: 'violet.melee_crit_damage',
    color: 'violet',
    normal: '+25% Melee Critical Damage (doubled over 500 max Energy)',
    tauforged: '+37.5% Melee Critical Damage (doubled over 500 max Energy)',
  },
  {
    key: 'violet.orb_conversion',
    color: 'violet',
    normal: 'Health pickups give +20% Energy, Energy pickups give +20% Health',
    tauforged: 'Health pickups give +30% Energy, Energy pickups give +30% Health',
  },
];

export const SHARD_SLOTS = 5;

/**
 * The game's shard pictures on warframestat.us's image CDN (item search "archon shard",
 * checked 13 Nov 2026). Tauforged shards have their own glowing picture.
 */
export const SHARD_IMAGES: Record<ShardColor, { normal: string; tauforged: string }> = {
  crimson: { normal: 'ArchonShardAmar.png', tauforged: 'ArchonShardAmarMythicGlow.png' },
  amber: { normal: 'ArchonShardNira.png', tauforged: 'ArchonShardNiraMythicGlow.png' },
  azure: { normal: 'ArchonShardBoreal.png', tauforged: 'ArchonShardBorealMythicGlow.png' },
  emerald: { normal: 'ArchonShardGreen.png', tauforged: 'ArchonShardMythicGreenGlow.png' },
  topaz: { normal: 'ArchonShardOrange.png', tauforged: 'ArchonShardOrangeMythicGlow.png' },
  violet: { normal: 'ArchonShardViolet.png', tauforged: 'ArchonShardVioletMythicGlow.png' },
};

export function shardImage(color: ShardColor, tauforged: boolean): string {
  return SHARD_IMAGES[color][tauforged ? 'tauforged' : 'normal'];
}

/**
 * Polarities with a symbol on the Warframe wiki (`Madurai_Pol.svg`…, checked 13 Nov 2026),
 * served by `GET /api/polarities/:name`. "universal" and "aura" have none: shown as words.
 */
export const POLARITY_SYMBOLS = [
  'madurai',
  'vazarin',
  'naramon',
  'zenurik',
  'unairu',
  'penjaga',
  'umbra',
] as const;

export function hasPolaritySymbol(polarity: string): boolean {
  return (POLARITY_SYMBOLS as readonly string[]).includes(polarity);
}

export function shardStat(key: string): ShardStat | undefined {
  return SHARD_STATS.find((s) => s.key === key);
}

// ---- a build as saved -------------------------------------------------------------

const Note = z.string().trim().max(500).default('');
const RefName = z.string().trim().min(1).max(120);
const UniqueName = z.string().min(1).max(300);

/** A mod or arcane in a slot. The name is kept so the build still reads if the data drops it. */
export const BuildSlot = z.object({
  uniqueName: UniqueName,
  name: RefName,
  rank: z.int().min(0).max(10),
  note: Note,
});
export type BuildSlot = z.infer<typeof BuildSlot>;

export const BuildShard = z.object({
  stat: z.string().refine((key) => shardStat(key) !== undefined, 'Unknown Archon Shard stat'),
  tauforged: z.boolean().default(false),
  note: Note,
});
export type BuildShard = z.infer<typeof BuildShard>;

export const BuildHelminth = z.object({
  /** The ability it replaces, 1–4. */
  replacesKey: z.int().min(1).max(4),
  uniqueName: UniqueName,
  name: RefName,
  note: Note,
});
export type BuildHelminth = z.infer<typeof BuildHelminth>;

export const BuildWeapon = z.object({ uniqueName: UniqueName, name: RefName, note: Note });
export type BuildWeapon = z.infer<typeof BuildWeapon>;

export const MOD_SLOTS = 8;
export const ARCANE_SLOTS = 2;
export const MAX_BUILD_WEAPONS = 6;

/** An http(s) link, or empty. The app never fetches it. */
const SourceUrl = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .max(500)
      .pipe(
        z.url({
          protocol: /^https?$/,
          error: 'The source link must start with http:// or https://',
        }),
      ),
  ])
  .default('');

/** Everything in a build besides its name and place. Stored as one JSON document. */
export const BuildContent = z.object({
  sourceUrl: SourceUrl,
  author: z.string().trim().max(80).default(''),
  /** The update it was made for, e.g. "Update 41" or "Nov 2026". */
  patch: z.string().trim().max(40).default(''),
  /** How to play it: a small Markdown subset (headings, lists, bold, italic, links). */
  guide: z.string().max(20_000).default(''),
  aura: BuildSlot.nullable().default(null),
  exilus: BuildSlot.nullable().default(null),
  slots: z.array(BuildSlot.nullable()).length(MOD_SLOTS).default(Array(MOD_SLOTS).fill(null)),
  arcanes: z
    .array(BuildSlot.nullable())
    .length(ARCANE_SLOTS)
    .default(Array(ARCANE_SLOTS).fill(null)),
  shards: z.array(BuildShard).max(SHARD_SLOTS).default([]),
  helminth: BuildHelminth.nullable().default(null),
  weapons: z.array(BuildWeapon).max(MAX_BUILD_WEAPONS).default([]),
});
export type BuildContent = z.infer<typeof BuildContent>;

const BuildName = z.string().trim().min(1, 'Give the build a name').max(60);

/** `POST /api/builds`. */
export const CreateBuildRequest = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: BuildName,
  content: BuildContent,
});
export type CreateBuildRequest = z.infer<typeof CreateBuildRequest>;

/** `PUT /api/builds/:id`: the whole build again. */
export const UpdateBuildRequest = z.object({ name: BuildName, content: BuildContent });
export type UpdateBuildRequest = z.infer<typeof UpdateBuildRequest>;

/** `POST /api/builds/reorder`: every build of one Warframe, in the new order. */
export const ReorderBuildsRequest = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  buildIds: z.array(z.int().positive()).min(1),
});
export type ReorderBuildsRequest = z.infer<typeof ReorderBuildsRequest>;

/** A build as saved (`GET /api/builds/:id`, for the edit page). */
export const Build = z.object({
  id: z.int().positive(),
  slug: z.string(),
  name: z.string(),
  content: BuildContent,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Build = z.infer<typeof Build>;

// ---- a build as shown -------------------------------------------------------------

/** A slot with what the game data says about it now; null fields when the data lacks it. */
export const ResolvedSlot = BuildSlot.extend({
  /** The effect at the chosen rank, lines separated by "\n". */
  effect: z.string().nullable(),
  polarity: z.string().nullable(),
  rarity: z.string().nullable(),
  /** File name for `GET /api/images/:file`. */
  image: z.string().nullable(),
  maxRank: z.int().min(0).nullable(),
});
export type ResolvedSlot = z.infer<typeof ResolvedSlot>;

export const ResolvedShard = BuildShard.extend({
  color: ShardColor,
  text: z.string(),
  /** The shard's picture (the glowing one when Tauforged). */
  image: z.string(),
});
export type ResolvedShard = z.infer<typeof ResolvedShard>;

export const ResolvedHelminth = BuildHelminth.extend({
  image: z.string().nullable(),
  /** The Warframe it comes from ("Rhino"), "Helminth" for its own, or null if unknown. */
  from: z.string().nullable(),
  /** The wiki page of the subsumed ability, when known. */
  page: z.url().nullable(),
});
export type ResolvedHelminth = z.infer<typeof ResolvedHelminth>;

/** A build on the Warframe page: the saved build plus the data it points to. */
export const BuildView = Build.extend({
  aura: ResolvedSlot.nullable(),
  exilus: ResolvedSlot.nullable(),
  slots: z.array(ResolvedSlot.nullable()),
  arcanes: z.array(ResolvedSlot.nullable()),
  shards: z.array(ResolvedShard),
  helminth: ResolvedHelminth.nullable(),
  /** The weapons with their pictures, from the item data the search saved. */
  weapons: z.array(BuildWeapon.extend({ image: z.string().nullable() })),
});
export type BuildView = z.infer<typeof BuildView>;

// ---- the edit page's choices ------------------------------------------------------

export const ModOption = z.object({
  uniqueName: z.string(),
  name: z.string(),
  polarity: z.string().nullable(),
  rarity: z.string().nullable(),
  image: z.string().nullable(),
  maxRank: z.int().min(0),
  /** Goes in the aura slot (and only there). */
  aura: z.boolean(),
  /** Can also go in the Exilus slot. */
  exilus: z.boolean(),
  /** The Warframe this augment belongs to, or null for a general mod. */
  augmentFor: z.string().nullable(),
  /** The effect at each rank, 0 first. */
  effects: z.array(z.string()),
});
export type ModOption = z.infer<typeof ModOption>;

export const ArcaneOption = z.object({
  uniqueName: z.string(),
  name: z.string(),
  rarity: z.string().nullable(),
  image: z.string().nullable(),
  maxRank: z.int().min(0),
  effects: z.array(z.string()),
});
export type ArcaneOption = z.infer<typeof ArcaneOption>;

export const HelminthOption = z.object({
  uniqueName: z.string(),
  name: z.string(),
  /** The Warframe it comes from, or "Helminth" for Helminth's own abilities. */
  from: z.string(),
  image: z.string().nullable(),
});
export type HelminthOption = z.infer<typeof HelminthOption>;

/** `GET /api/builds/options?slug=`: what the edit page can pick for this Warframe. */
export const BuildOptionsResponse = z.object({
  slug: z.string(),
  /** The version the builds belong to, e.g. "Mesa Prime". */
  buildsVariant: z.string(),
  /** Its abilities, for "Helminth replaces…". */
  abilities: z.array(z.object({ key: z.int().min(1).max(4), name: z.string() })),
  mods: z.array(ModOption),
  arcanes: z.array(ArcaneOption),
  helminth: z.array(HelminthOption),
});
export type BuildOptionsResponse = z.infer<typeof BuildOptionsResponse>;
