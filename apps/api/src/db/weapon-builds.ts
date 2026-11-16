import {
  INCARNON_CHOICE_TIERS,
  RIVEN_MAX_NEGATIVE,
  RIVEN_MAX_POSITIVE,
  WeaponBuildContent,
  type BuildSlot,
  type ReorderWeaponBuildsRequest,
  type ResolvedSlot,
  type WeaponArcaneOption,
  type WeaponBuild,
  type WeaponBuildView,
  type WeaponVariantKind,
} from '@warframehub/shared';
import { and, asc, count, eq, max } from 'drizzle-orm';
import { HttpError } from '../http-error.js';
import type { MessageParams, ServerMessageKey } from '../i18n.js';
import { incarnonOf } from '../sources/incarnon.js';
import type { IncarnonEntry } from '../sources/wiki-incarnon.js';
import type { RivenStatEntry } from '../sources/wiki-weapons.js';
import { loadWeaponWiki, weaponWiki } from '../sources/weapon-wiki.js';
import {
  arcaneSlotKinds,
  hasExilus,
  hasProgenitor,
  modFit,
  rivenTypeOf,
  type StoredWeaponMod,
  type WeaponFit,
} from '../sources/weapon-mods.js';
import type { CatalogState } from '../sources/warframes.js';
import type { RawWeapon, WeaponGroup } from '../sources/weapons.js';
import type { Db } from './client.js';
import { weaponBuilds } from './schema.js';

/** Weapon builds (SPEC §15.1): stored whole, checked against the game data when saved. */

type Row = typeof weaponBuilds.$inferSelect;

function toBuild(row: Row): WeaponBuild {
  return {
    id: row.id,
    slug: row.weaponSlug,
    name: row.name,
    // Parsed again so older rows pick up new defaults.
    content: WeaponBuildContent.parse(JSON.parse(row.contentJson)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listWeaponBuilds(db: Db, userId: number, slug: string): WeaponBuild[] {
  return db
    .select()
    .from(weaponBuilds)
    .where(and(eq(weaponBuilds.userId, userId), eq(weaponBuilds.weaponSlug, slug)))
    .orderBy(asc(weaponBuilds.sortOrder), asc(weaponBuilds.id))
    .all()
    .map(toBuild);
}

/** How many builds each weapon has, by slug (for the list's "n builds" mark). */
export function weaponBuildCounts(db: Db, userId: number): Map<string, number> {
  const rows = db
    .select({ slug: weaponBuilds.weaponSlug, n: count() })
    .from(weaponBuilds)
    .where(eq(weaponBuilds.userId, userId))
    .groupBy(weaponBuilds.weaponSlug)
    .all();
  return new Map(rows.map((r) => [r.slug, r.n]));
}

function getRow(db: Db, userId: number, id: number): Row {
  const row = db
    .select()
    .from(weaponBuilds)
    .where(and(eq(weaponBuilds.userId, userId), eq(weaponBuilds.id, id)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', 'noBuild', { id });
  return row;
}

export function getWeaponBuild(db: Db, userId: number, id: number): WeaponBuild {
  return toBuild(getRow(db, userId, id));
}

// ---- what a build of one version may hold -------------------------------------------

export interface WeaponBuildRules {
  group: WeaponGroup;
  variant: { kind: WeaponVariantKind; raw: RawWeapon };
  /** Mods and stances that fit this version, with whether each is its own. */
  mods: Map<string, StoredWeaponMod & { augment: boolean }>;
  /** Every weapon mod, to name ones that don't fit or left the data. */
  allMods: Map<string, StoredWeaponMod>;
  /** Per arcane slot, the arcanes it takes (empty: no such slot). */
  arcaneSlots: Map<string, WeaponArcaneOption>[];
  allArcanes: Map<string, WeaponArcaneOption>;
  exilus: boolean;
  /** The Riven stats it can have, or null when it takes no Riven. */
  riven: RivenStatEntry[] | null;
  progenitor: boolean;
  evolutions: IncarnonEntry | null;
}

/** The weapon's facts for the fit check (wiki class, tags and family). */
export function fitOf(group: WeaponGroup, raw: RawWeapon): WeaponFit {
  const wiki = weaponWiki(raw.uniqueName, raw.name);
  return {
    name: raw.name,
    slot: group.slot,
    class: wiki?.class ?? group.class,
    tags: wiki?.tags ?? [],
    family: wiki?.family ?? null,
  };
}

/** The version a new build starts on: the Prime if there is one, else the first. */
export function defaultVariant(group: WeaponGroup): WeaponVariantKind {
  return (group.variants.find((v) => v.kind === 'prime') ?? group.variants[0]!).kind;
}

export function weaponBuildRules(
  state: CatalogState,
  group: WeaponGroup,
  kind: WeaponVariantKind,
): WeaponBuildRules {
  const variant = group.variants.find((v) => v.kind === kind);
  if (!variant) bad('variantNotHere', { weapon: group.name });
  const fit = fitOf(group, variant.raw);
  const mods = new Map<string, StoredWeaponMod & { augment: boolean }>();
  for (const m of state.weaponMods) {
    const f = modFit(m, fit);
    if (f.fits) mods.set(m.uniqueName, { ...m, augment: f.augment });
  }
  const kinds = arcaneSlotKinds(fit);
  const rivenType = rivenTypeOf(fit);
  return {
    group,
    variant,
    mods,
    allMods: new Map(state.weaponMods.map((m) => [m.uniqueName, m])),
    arcaneSlots: kinds.map(
      (k) =>
        new Map(
          state.weaponArcanes.filter((a) => k.includes(a.kind)).map((a) => [a.uniqueName, a]),
        ),
    ),
    allArcanes: new Map(state.weaponArcanes.map((a) => [a.uniqueName, a])),
    exilus: hasExilus(group.slot),
    riven: rivenType ? (loadWeaponWiki().riven[rivenType] ?? []) : null,
    progenitor: hasProgenitor(variant.raw.name),
    evolutions: incarnonOf(variant.raw.name),
  };
}

// ---- checks ------------------------------------------------------------------------

function bad(key: ServerMessageKey, params: MessageParams = {}): never {
  throw new HttpError(400, 'bad_request', key, params);
}

function refsOf(content: WeaponBuildContent): Set<string> {
  const refs = new Set<string>();
  for (const s of [content.exilus, ...content.slots, ...content.arcanes, content.stance]) {
    if (s) refs.add(s.uniqueName);
  }
  return refs;
}

/**
 * Checks a build against the game data and returns it with the data's names. A mod or
 * arcane the data no longer lists is kept if the saved build already had it.
 */
export function checkWeaponContent(
  content: WeaponBuildContent,
  rules: WeaponBuildRules,
  previous: WeaponBuildContent | null,
): WeaponBuildContent {
  const kept = previous ? refsOf(previous) : new Set<string>();
  const used = new Set<string>();
  const once = (s: BuildSlot) => {
    if (used.has(s.uniqueName)) bad('inBuildTwice', { name: s.name });
    used.add(s.uniqueName);
  };

  const mod = (slot: BuildSlot | null, where: 'exilus' | 'slot' | 'stance'): BuildSlot | null => {
    if (!slot) return null;
    once(slot);
    const data = rules.mods.get(slot.uniqueName);
    if (!data) {
      if (kept.has(slot.uniqueName)) return slot;
      const known = rules.allMods.get(slot.uniqueName);
      if (known) bad('modNotFit', { name: known.name, weapon: rules.variant.raw.name });
      return bad('unknownMod', { name: slot.name });
    }
    if (where === 'stance' && !data.stance) bad('notStance', { name: data.name });
    if (where !== 'stance' && data.stance) bad('onlyStance', { name: data.name });
    if (where === 'exilus' && !data.exilus) bad('notExilus', { name: data.name });
    if (slot.rank > data.maxRank) bad('maxRank', { name: data.name, max: data.maxRank });
    return { ...slot, name: data.name };
  };

  if (content.exilus && !rules.exilus) bad('noExilusSlot', { weapon: rules.group.name });
  if (content.stance && rules.group.slot !== 'melee') bad('noStanceSlot');

  const arcanes = content.arcanes.map((slot, i) => {
    if (!slot) return null;
    once(slot);
    const fits = rules.arcaneSlots[i];
    if (!fits || fits.size === 0) return bad('noArcaneSlot', { weapon: rules.group.name });
    const data = fits.get(slot.uniqueName);
    if (!data) {
      if (kept.has(slot.uniqueName)) return slot;
      const known = rules.allArcanes.get(slot.uniqueName);
      if (known) bad('arcaneNotFit', { name: known.name });
      return bad('unknownArcane', { name: slot.name });
    }
    if (slot.rank > data.maxRank) bad('maxRank', { name: data.name, max: data.maxRank });
    return { ...slot, name: data.name };
  });

  // Incarnon: one pick per tier 2–5, a perk that tier has.
  if (content.incarnon.length > 0) {
    const evo = rules.evolutions;
    if (!evo) bad('noIncarnon', { weapon: rules.variant.raw.name });
    const tiers = new Set<number>();
    for (const pick of content.incarnon) {
      if (tiers.has(pick.tier)) bad('incarnonTwice', { tier: pick.tier });
      tiers.add(pick.tier);
      const tier = evo.tiers.find((t) => t.tier === pick.tier);
      if (!tier || !INCARNON_CHOICE_TIERS.includes(pick.tier as 2) || !tier.perks[pick.perk]) {
        bad('incarnonPick', { tier: pick.tier });
      }
    }
  }

  // Riven: up to 3 positive and 1 negative stat, from this weapon type's list.
  if (content.riven) {
    const list = rules.riven;
    if (!list) bad('noRiven', { weapon: rules.group.name });
    const stats = content.riven.stats;
    if (stats.filter((s) => !s.negative).length > RIVEN_MAX_POSITIVE) bad('rivenPositive');
    if (stats.filter((s) => s.negative).length > RIVEN_MAX_NEGATIVE) bad('rivenNegative');
    const seen = new Set<string>();
    for (const s of stats) {
      const known = list.find((r) => r.name === s.stat && r.spliced === s.spliced);
      if (!known) bad('rivenStat', { stat: s.stat });
      if (s.negative && !known.negative) bad('rivenNotNegative', { stat: s.stat });
      const key = `${s.stat}|${s.spliced}`;
      if (seen.has(key)) bad('inBuildTwice', { name: s.stat });
      seen.add(key);
    }
  }

  if (content.progenitor && !rules.progenitor) {
    bad('noProgenitor', { weapon: rules.variant.raw.name });
  }

  return {
    ...content,
    exilus: mod(content.exilus, 'exilus'),
    slots: content.slots.map((s) => mod(s, 'slot')),
    stance: mod(content.stance, 'stance'),
    arcanes,
    incarnon: [...content.incarnon].sort((a, b) => a.tier - b.tier),
  };
}

// ---- changes -----------------------------------------------------------------------

export function createWeaponBuild(
  db: Db,
  userId: number,
  slug: string,
  name: string,
  content: WeaponBuildContent,
  now: Date,
): WeaponBuild {
  const last = db
    .select({ value: max(weaponBuilds.sortOrder) })
    .from(weaponBuilds)
    .where(and(eq(weaponBuilds.userId, userId), eq(weaponBuilds.weaponSlug, slug)))
    .get();
  const row = db
    .insert(weaponBuilds)
    .values({
      userId,
      weaponSlug: slug,
      name,
      sortOrder: (last?.value ?? -1) + 1,
      contentJson: JSON.stringify(content),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return toBuild(row);
}

export function updateWeaponBuild(
  db: Db,
  userId: number,
  id: number,
  name: string,
  content: WeaponBuildContent,
  now: Date,
): WeaponBuild {
  getRow(db, userId, id);
  const row = db
    .update(weaponBuilds)
    .set({ name, contentJson: JSON.stringify(content), updatedAt: now })
    .where(eq(weaponBuilds.id, id))
    .returning()
    .get();
  return toBuild(row);
}

export function deleteWeaponBuild(db: Db, userId: number, id: number): void {
  getRow(db, userId, id);
  db.delete(weaponBuilds).where(eq(weaponBuilds.id, id)).run();
}

/** Sets the order of one weapon's builds. Every one of its builds must be listed once. */
export function reorderWeaponBuilds(
  db: Db,
  userId: number,
  body: ReorderWeaponBuildsRequest,
): void {
  if (new Set(body.buildIds).size !== body.buildIds.length) bad('buildTwice');
  const rows = db
    .select({ id: weaponBuilds.id })
    .from(weaponBuilds)
    .where(and(eq(weaponBuilds.userId, userId), eq(weaponBuilds.weaponSlug, body.slug)))
    .all();
  const mine = new Set(rows.map((r) => r.id));
  if (body.buildIds.some((id) => !mine.has(id))) {
    throw new HttpError(404, 'not_found', 'unknownBuildInOrder');
  }
  if (mine.size !== body.buildIds.length) bad('listEveryBuild');
  db.transaction((tx) => {
    body.buildIds.forEach((id, sortOrder) => {
      tx.update(weaponBuilds)
        .set({ sortOrder })
        .where(and(eq(weaponBuilds.userId, userId), eq(weaponBuilds.id, id)))
        .run();
    });
  });
}

// ---- shown on the weapon page --------------------------------------------------------

function resolveSlot(
  slot: BuildSlot | null,
  data: StoredWeaponMod | WeaponArcaneOption | undefined,
): ResolvedSlot | null {
  if (!slot) return null;
  if (!data) {
    return { ...slot, effect: null, polarity: null, rarity: null, image: null, maxRank: null };
  }
  return {
    ...slot,
    name: data.name,
    effect: data.effects[Math.min(slot.rank, data.effects.length - 1)] ?? null,
    polarity: 'polarity' in data ? data.polarity : null,
    rarity: data.rarity,
    image: data.image,
    maxRank: data.maxRank,
  };
}

/** A saved build with what the data says about its parts now. */
export function resolveWeaponBuild(
  build: WeaponBuild,
  state: CatalogState,
  group: WeaponGroup,
): WeaponBuildView {
  const c = build.content;
  const mods = new Map(state.weaponMods.map((m) => [m.uniqueName, m]));
  const arcanes = new Map(state.weaponArcanes.map((a) => [a.uniqueName, a]));
  const variant = group.variants.find((v) => v.kind === c.variant) ?? group.variants[0]!;
  const evo = incarnonOf(variant.raw.name);
  const mod = (s: BuildSlot | null) => resolveSlot(s, s ? mods.get(s.uniqueName) : undefined);
  return {
    ...build,
    variantName: variant.raw.name,
    exilus: mod(c.exilus),
    slots: c.slots.map(mod),
    stance: mod(c.stance),
    arcanes: c.arcanes.map((s) => resolveSlot(s, s ? arcanes.get(s.uniqueName) : undefined)),
    incarnon: c.incarnon.map((p) => {
      const perk = evo?.tiers.find((t) => t.tier === p.tier)?.perks[p.perk];
      return { ...p, name: perk?.name ?? null, lines: perk?.lines ?? [] };
    }),
  };
}
