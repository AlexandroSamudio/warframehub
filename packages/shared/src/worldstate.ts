import { z } from 'zod';

/**
 * Normalised live rotations (SPEC §7). The API converts warframestat.us responses into
 * these small shapes, so a change upstream only touches `apps/api/src/sources/`.
 */

const Iso = z.iso.datetime();

export const ArchonShard = z.enum(['Crimson', 'Amber', 'Azure']);
export type ArchonShard = z.infer<typeof ArchonShard>;

export const SortieMission = z.object({
  missionType: z.string(),
  node: z.string(),
  modifier: z.string(),
  modifierDescription: z.string(),
});
export const Sortie = z.object({
  boss: z.string(),
  faction: z.string(),
  activation: Iso,
  expiry: Iso,
  missions: z.array(SortieMission),
});
export type Sortie = z.infer<typeof Sortie>;

export const ArchonHunt = z.object({
  boss: z.string(),
  /** Shard colour this Archon drops (wiki: Amar = Crimson, Nira = Amber, Boreal = Azure). */
  shard: ArchonShard.nullable(),
  faction: z.string(),
  activation: Iso,
  expiry: Iso,
  missions: z.array(z.object({ type: z.string(), node: z.string() })),
});
export type ArchonHunt = z.infer<typeof ArchonHunt>;

export const SteelPathReward = z.object({ name: z.string(), cost: z.int() });
export const SteelPath = z.object({
  /** What the API reports as this week's Teshin item. Can lag behind the game (SPEC §7). */
  currentReward: SteelPathReward,
  activation: Iso,
  expiry: Iso,
  /**
   * The item expected from the 8-week rotation order when `currentReward` is out of date,
   * otherwise null. Shown with an "estimated" label.
   */
  estimatedReward: SteelPathReward.nullable(),
});
export type SteelPath = z.infer<typeof SteelPath>;

export const DailyDeal = z.object({
  item: z.string(),
  originalPrice: z.int(),
  salePrice: z.int(),
  discount: z.number(),
  sold: z.int(),
  total: z.int(),
  activation: Iso,
  expiry: Iso,
});
export type DailyDeal = z.infer<typeof DailyDeal>;

export const VoidTrader = z.object({
  location: z.string(),
  activation: Iso,
  expiry: Iso,
});
export type VoidTrader = z.infer<typeof VoidTrader>;

export const NightwaveChallenge = z.object({
  title: z.string(),
  description: z.string(),
  reputation: z.int(),
  kind: z.enum(['daily', 'weekly', 'elite']),
  expiry: Iso,
});
export type NightwaveChallenge = z.infer<typeof NightwaveChallenge>;

export const Nightwave = z.object({
  season: z.int().nullable(),
  activation: Iso,
  expiry: Iso,
  challenges: z.array(NightwaveChallenge),
});
export type Nightwave = z.infer<typeof Nightwave>;

export const WorldEvent = z.object({
  name: z.string(),
  description: z.string(),
  node: z.string().nullable(),
  activation: Iso,
  expiry: Iso,
});
export type WorldEvent = z.infer<typeof WorldEvent>;

export const Arbitration = z.object({
  node: z.string(),
  missionType: z.string(),
  enemy: z.string(),
  activation: Iso,
  expiry: Iso,
});
export type Arbitration = z.infer<typeof Arbitration>;

/**
 * Freshness badge (SPEC §8.1):
 * - `live`: the data's own activation/expiry covers now
 * - `estimated`: worked out by us (e.g. Teshin's item from the rotation order)
 * - `outdated`: shown as "may be outdated": the data doesn't cover now, or the last fetch failed
 * - `unavailable`: shown as "check in game": no usable data
 */
export const Freshness = z.enum(['live', 'estimated', 'outdated', 'unavailable']);
export type Freshness = z.infer<typeof Freshness>;

function card<T extends z.ZodType>(data: T) {
  return z.object({
    freshness: Freshness,
    /** When the data was fetched from warframestat.us, or null if never. */
    fetchedAt: Iso.nullable(),
    /** True when the latest fetch failed and this is the last good copy. */
    stale: z.boolean(),
    data: data.nullable(),
  });
}

export const WorldstateCards = z.object({
  archonHunt: card(ArchonHunt),
  sortie: card(Sortie),
  steelPath: card(SteelPath),
  dailyDeals: card(z.array(DailyDeal)),
  voidTrader: card(VoidTrader),
  nightwave: card(Nightwave),
  events: card(z.array(WorldEvent)),
  arbitration: card(Arbitration),
});
export type WorldstateCards = z.infer<typeof WorldstateCards>;
export type WorldstateEndpoint = keyof WorldstateCards;
export const WORLDSTATE_ENDPOINTS = Object.keys(WorldstateCards.shape) as WorldstateEndpoint[];

/** Response of `GET /api/worldstate` and `POST /api/worldstate/refresh`. */
export const WorldstateResponse = z.object({
  serverTime: Iso,
  cards: WorldstateCards,
});
export type WorldstateResponse = z.infer<typeof WorldstateResponse>;
