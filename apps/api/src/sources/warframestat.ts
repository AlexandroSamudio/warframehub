import type {
  Archimedea,
  ArchimedeaKind,
  Circuit,
  Arbitration,
  ArchonHunt,
  ArchonShard,
  DailyDeal,
  Freshness,
  Nightwave,
  NightwaveChallenge,
  Sortie,
  SteelPath,
  VoidTrader,
  WorldEvent,
  WorldstateEndpoint,
} from '@warframehub/shared';
import { z } from 'zod';
import { nextReset } from '../domain/periods.js';

/**
 * warframestat.us (WFCD) responses → the small shapes in `@warframehub/shared` (SPEC §7).
 * Only this folder knows the upstream format. Fixtures in ./fixtures are real responses
 * saved on 10 Nov 2026.
 */

export const WARFRAMESTAT_BASE = 'https://api.warframestat.us/pc';

/** Which Archon shard each Archon drops (Warframe wiki, "Archon Hunt", checked 10 Nov 2026). */
const ARCHON_SHARDS: Record<string, ArchonShard> = {
  'Archon Amar': 'Crimson',
  'Archon Nira': 'Amber',
  'Archon Boreal': 'Azure',
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface Normalised<T> {
  data: T | null;
  freshness: Freshness;
}

/** Thrown when a response doesn't look like what we expect (shown as "check in game"). */
export class UnexpectedDataError extends Error {
  override name = 'UnexpectedDataError';
}

// ---- helpers -------------------------------------------------------------

/** Parses an upstream date. Rejects junk like "+275760-09-13…" or the 1970 epoch placeholder. */
function date(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2013 || d.getUTCFullYear() > 2100) {
    throw new UnexpectedDataError(`bad date "${value}"`);
  }
  return d;
}

function iso(value: string): string {
  return date(value).toISOString();
}

function covers(activation: string, expiry: string, now: Date): boolean {
  return date(activation) <= now && now < date(expiry);
}

function parse<T extends z.ZodType>(schema: T, raw: unknown, what: string): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new UnexpectedDataError(`${what}: ${result.error.message}`);
  return result.data;
}

const Dates = { activation: z.string(), expiry: z.string() };

// ---- endpoints -----------------------------------------------------------

const RawSortie = z.looseObject({
  ...Dates,
  boss: z.string(),
  faction: z.string(),
  variants: z.array(
    z.looseObject({
      missionType: z.string(),
      node: z.string(),
      modifier: z.string(),
      modifierDescription: z.string().default(''),
    }),
  ),
});

export function normaliseSortie(raw: unknown, now: Date): Normalised<Sortie> {
  const r = parse(RawSortie, raw, 'sortie');
  return {
    freshness: covers(r.activation, r.expiry, now) ? 'live' : 'outdated',
    data: {
      boss: r.boss,
      faction: r.faction,
      activation: iso(r.activation),
      expiry: iso(r.expiry),
      missions: r.variants.map((v) => ({
        missionType: v.missionType,
        node: v.node,
        modifier: v.modifier,
        modifierDescription: v.modifierDescription,
      })),
    },
  };
}

const RawArchonHunt = z.looseObject({
  ...Dates,
  boss: z.string(),
  faction: z.string(),
  missions: z.array(z.looseObject({ type: z.string(), node: z.string() })),
});

export function normaliseArchonHunt(raw: unknown, now: Date): Normalised<ArchonHunt> {
  const r = parse(RawArchonHunt, raw, 'archonHunt');
  return {
    freshness: covers(r.activation, r.expiry, now) ? 'live' : 'outdated',
    data: {
      boss: r.boss,
      shard: ARCHON_SHARDS[r.boss] ?? null,
      faction: r.faction,
      activation: iso(r.activation),
      expiry: iso(r.expiry),
      missions: r.missions.map((m) => ({ type: m.type, node: m.node })),
    },
  };
}

const RawReward = z.looseObject({ name: z.string(), cost: z.int() });
const RawSteelPath = z.looseObject({
  ...Dates,
  currentReward: RawReward,
  rotation: z.array(RawReward).default([]),
});

/**
 * Teshin's weekly item. `currentReward` is known to lag (SPEC §7), so when its dates
 * don't cover now we step through the API's own 8-week `rotation` list by the number
 * of weeks that have passed and label the result "estimated".
 */
export function normaliseSteelPath(raw: unknown, now: Date): Normalised<SteelPath> {
  const r = parse(RawSteelPath, raw, 'steelPath');
  const current = { name: r.currentReward.name, cost: r.currentReward.cost };
  const base = {
    currentReward: current,
    activation: iso(r.activation),
    expiry: iso(r.expiry),
  };
  if (covers(r.activation, r.expiry, now)) {
    return { freshness: 'live', data: { ...base, estimatedReward: null } };
  }

  const weeks = Math.floor((now.getTime() - date(r.activation).getTime()) / WEEK_MS);
  const index = r.rotation.findIndex((item) => item.name === current.name);
  if (weeks >= 1 && index >= 0 && r.rotation.length > 0) {
    const next = r.rotation[(index + weeks) % r.rotation.length]!;
    return {
      freshness: 'estimated',
      data: { ...base, estimatedReward: { name: next.name, cost: next.cost } },
    };
  }
  return { freshness: 'outdated', data: { ...base, estimatedReward: null } };
}

const RawDailyDeals = z.array(
  z.looseObject({
    ...Dates,
    item: z.string(),
    originalPrice: z.int(),
    salePrice: z.int(),
    discount: z.number(),
    sold: z.int(),
    total: z.int(),
  }),
);

export function normaliseDailyDeals(raw: unknown, now: Date): Normalised<DailyDeal[]> {
  const deals = parse(RawDailyDeals, raw, 'dailyDeals');
  if (deals.length === 0) return { freshness: 'unavailable', data: null };
  return {
    freshness: deals.some((d) => covers(d.activation, d.expiry, now)) ? 'live' : 'outdated',
    data: deals.map((d) => ({
      item: d.item,
      originalPrice: d.originalPrice,
      salePrice: d.salePrice,
      discount: d.discount,
      sold: d.sold,
      total: d.total,
      activation: iso(d.activation),
      expiry: iso(d.expiry),
    })),
  };
}

const RawVoidTrader = z.looseObject({ ...Dates, location: z.string() });

/** Baro's current visit, or his next one while he's away. Live until that visit ends. */
export function normaliseVoidTrader(raw: unknown, now: Date): Normalised<VoidTrader> {
  const r = parse(RawVoidTrader, raw, 'voidTrader');
  return {
    freshness: now < date(r.expiry) ? 'live' : 'outdated',
    data: { location: r.location, activation: iso(r.activation), expiry: iso(r.expiry) },
  };
}

const RawNightwave = z.looseObject({
  ...Dates,
  season: z.int().nullable().default(null),
  activeChallenges: z
    .array(
      z.looseObject({
        ...Dates,
        title: z.string(),
        desc: z.string().default(''),
        reputation: z.int(),
        isDaily: z.boolean().default(false),
        isElite: z.boolean().default(false),
      }),
    )
    .default([]),
});

/** Nightwave is known to lag (SPEC §7): it's "outdated" unless a challenge covers now. */
export function normaliseNightwave(raw: unknown, now: Date): Normalised<Nightwave> {
  const r = parse(RawNightwave, raw, 'nightwave');
  const challenges: NightwaveChallenge[] = r.activeChallenges.map((c) => ({
    title: c.title,
    description: c.desc,
    reputation: c.reputation,
    kind: c.isElite ? 'elite' : c.isDaily ? 'daily' : 'weekly',
    expiry: iso(c.expiry),
  }));
  const current = r.activeChallenges.some((c) => covers(c.activation, c.expiry, now));
  return {
    freshness: current ? 'live' : 'outdated',
    data: {
      season: r.season,
      activation: iso(r.activation),
      expiry: iso(r.expiry),
      challenges,
    },
  };
}

const RawEvents = z.array(
  z.looseObject({
    ...Dates,
    description: z.string(),
    tooltip: z.string().default(''),
    node: z.string().optional(),
  }),
);

export function normaliseEvents(raw: unknown, now: Date): Normalised<WorldEvent[]> {
  const events = parse(RawEvents, raw, 'events');
  return {
    freshness: 'live',
    data: events
      .filter((e) => now < date(e.expiry))
      .map((e) => ({
        name: e.description,
        description: e.tooltip,
        node: e.node ?? null,
        activation: iso(e.activation),
        expiry: iso(e.expiry),
      })),
  };
}

const RawArbitration = z.looseObject({
  ...Dates,
  node: z.string(),
  type: z.string(),
  enemy: z.string(),
  expired: z.boolean().default(false),
});

/** The arbitration endpoint often returns a placeholder (SolNode000, 1970); that's "check in game". */
export function normaliseArbitration(raw: unknown, now: Date): Normalised<Arbitration> {
  const r = parse(RawArbitration, raw, 'arbitration');
  if (r.expired || /^SolNode\d+$/.test(r.node) || r.type === 'Unknown') {
    return { freshness: 'unavailable', data: null };
  }
  return {
    freshness: covers(r.activation, r.expiry, now) ? 'live' : 'outdated',
    data: {
      node: r.node,
      missionType: r.type,
      enemy: r.enemy,
      activation: iso(r.activation),
      expiry: iso(r.expiry),
    },
  };
}

const RawDuviriCycle = z.looseObject({
  ...Dates,
  choices: z
    .array(z.looseObject({ categoryKey: z.string(), choices: z.array(z.string()) }))
    .default([]),
});

/**
 * The Circuit's weekly choices. They live in `duviriCycle` next to Duviri's 2-hour mood
 * cycle; if that cycle is current, the feed (and so the choices) is current too.
 * Checked against the wiki's rotation tables on 10 Nov 2026 (week 9 / week B).
 */
export function normaliseCircuit(raw: unknown, now: Date): Normalised<Circuit> {
  const r = parse(RawDuviriCycle, raw, 'duviriCycle');
  const pick = (key: string) => r.choices.find((c) => c.categoryKey === key)?.choices ?? [];
  const normal = pick('EXC_NORMAL');
  const steelPath = pick('EXC_HARD');
  if (normal.length === 0 && steelPath.length === 0)
    return { freshness: 'unavailable', data: null };
  return {
    freshness: covers(r.activation, r.expiry, now) ? 'live' : 'outdated',
    data: { normal, steelPath, expiry: (nextReset('weekly', now) as Date).toISOString() },
  };
}

/** Upstream type codes (spaced out, e.g. "C T_ L A B"), checked against the wiki on 10 Nov 2026. */
const ARCHIMEDEA_KINDS: Record<string, ArchimedeaKind> = {
  CT_LAB: 'deep', // Albrecht's Laboratories, against The Murmur
  CT_HEX: 'temporal', // Höllvania, against Scaldra and Techrot
};

/** warframestat.us calls The Murmur "Man in the Wall"; the game and wiki say The Murmur. */
const FACTION_NAMES: Record<string, string> = { 'Man in the Wall': 'The Murmur' };

const RawEffect = z.looseObject({ name: z.string(), description: z.string().default('') });
const RawArchimedeas = z.array(
  z.looseObject({
    ...Dates,
    type: z.string(),
    missions: z
      .array(
        z.looseObject({
          faction: z.string(),
          missionType: z.string(),
          deviation: RawEffect.nullable().optional(),
          risks: z.array(RawEffect.extend({ isHard: z.boolean().default(false) })).default([]),
        }),
      )
      .default([]),
    personalModifiers: z.array(RawEffect).default([]),
  }),
);

export function normaliseArchimedeas(raw: unknown, now: Date): Normalised<Archimedea[]> {
  const list = parse(RawArchimedeas, raw, 'archimedeas');
  const known = list
    .map((a) => ({ a, kind: ARCHIMEDEA_KINDS[a.type.replace(/\s+/g, '')] }))
    .filter((x): x is { a: (typeof list)[number]; kind: ArchimedeaKind } => x.kind !== undefined);
  if (known.length === 0) return { freshness: 'unavailable', data: null };

  const data: Archimedea[] = known
    .map(({ a, kind }) => ({
      kind,
      activation: iso(a.activation),
      expiry: iso(a.expiry),
      missions: a.missions.map((m) => ({
        missionType: m.missionType,
        faction: FACTION_NAMES[m.faction] ?? m.faction,
        deviation: m.deviation
          ? { name: m.deviation.name, description: m.deviation.description }
          : null,
        risks: m.risks.map((r) => ({ name: r.name, description: r.description, elite: r.isHard })),
      })),
      personalModifiers: a.personalModifiers.map((p) => ({
        name: p.name,
        description: p.description,
      })),
    }))
    .sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'deep' ? -1 : 1));
  return {
    freshness: known.some(({ a }) => covers(a.activation, a.expiry, now)) ? 'live' : 'outdated',
    data,
  };
}

export const NORMALISERS: {
  [K in WorldstateEndpoint]: (raw: unknown, now: Date) => Normalised<unknown>;
} = {
  archonHunt: normaliseArchonHunt,
  sortie: normaliseSortie,
  steelPath: normaliseSteelPath,
  dailyDeals: normaliseDailyDeals,
  voidTrader: normaliseVoidTrader,
  nightwave: normaliseNightwave,
  events: normaliseEvents,
  arbitration: normaliseArbitration,
  duviriCycle: normaliseCircuit,
  archimedeas: normaliseArchimedeas,
};

/**
 * How long a fresh copy is kept before asking warframestat.us again (SPEC §7):
 * the data's own expiry (at most 1 hour) when it has one, otherwise 10 minutes.
 * If the data's expiry has already passed (upstream lagging), wait 5 minutes.
 */
export function cacheTtlMs(endpoint: WorldstateEndpoint, raw: unknown, now: Date): number {
  const MIN = 60_000;
  if (endpoint === 'nightwave' || endpoint === 'events' || endpoint === 'arbitration') {
    return 10 * MIN;
  }
  const first = Array.isArray(raw) ? raw[0] : raw;
  const expiry =
    first && typeof first === 'object' && 'expiry' in first ? new Date(String(first.expiry)) : null;
  if (!expiry || Number.isNaN(expiry.getTime())) return 10 * MIN;
  const left = expiry.getTime() - now.getTime();
  if (left <= 0) return 5 * MIN;
  return Math.min(Math.max(left, 30_000), 60 * MIN);
}
