import {
  BuildContent,
  shardImage,
  shardStat,
  type ArcaneOption,
  type Build,
  type BuildSlot,
  type BuildView,
  type HelminthOption,
  type ModOption,
  type ReorderBuildsRequest,
  type ResolvedSlot,
} from '@warframehub/shared';
import { and, asc, eq, max } from 'drizzle-orm';
import { HttpError } from '../http-error.js';
import type { MessageParams, ServerMessageKey } from '../i18n.js';
import { abilityStats } from '../sources/ability-stats.js';
import type { CatalogState, WarframeGroup } from '../sources/warframes.js';
import type { Db } from './client.js';
import { builds, itemCache } from './schema.js';

/** Builds (SPEC §14.1): stored whole, checked against the game data when saved. */

type BuildRow = typeof builds.$inferSelect;

function toBuild(row: BuildRow): Build {
  return {
    id: row.id,
    slug: row.warframeSlug,
    name: row.name,
    // Parsed again so older rows pick up new defaults.
    content: BuildContent.parse(JSON.parse(row.contentJson)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function listBuilds(db: Db, userId: number, slug: string): Build[] {
  return db
    .select()
    .from(builds)
    .where(and(eq(builds.userId, userId), eq(builds.warframeSlug, slug)))
    .orderBy(asc(builds.sortOrder), asc(builds.id))
    .all()
    .map(toBuild);
}

function getRow(db: Db, userId: number, id: number): BuildRow {
  const row = db
    .select()
    .from(builds)
    .where(and(eq(builds.userId, userId), eq(builds.id, id)))
    .get();
  if (!row) throw new HttpError(404, 'not_found', 'noBuild', { id });
  return row;
}

export function getBuild(db: Db, userId: number, id: number): Build {
  return toBuild(getRow(db, userId, id));
}

// ---- checks ------------------------------------------------------------------------

/** What a build for one Warframe may hold. */
export interface BuildRules {
  group: WarframeGroup;
  mods: Map<string, ModOption>;
  arcanes: Map<string, ArcaneOption>;
  helminth: Map<string, HelminthOption>;
}

export function buildRules(
  state: CatalogState,
  group: WarframeGroup,
  helminth: HelminthOption[],
): BuildRules {
  return {
    group,
    mods: new Map(state.mods.map((m) => [m.uniqueName, m])),
    arcanes: new Map(state.arcanes.map((a) => [a.uniqueName, a])),
    helminth: new Map(helminth.map((h) => [h.uniqueName, h])),
  };
}

/** The augments for this Warframe: their `compatName` is its name or a version's name. */
export function augmentFits(mod: ModOption, group: WarframeGroup): boolean {
  if (!mod.augmentFor) return true;
  return mod.augmentFor === group.name || group.variants.some((v) => v.raw.name === mod.augmentFor);
}

function bad(key: ServerMessageKey, params: MessageParams = {}): never {
  throw new HttpError(400, 'bad_request', key, params);
}

/** Every mod, arcane and Helminth ability a build points to. */
function refsOf(content: BuildContent): Set<string> {
  const refs = new Set<string>();
  for (const slot of [content.aura, content.exilus, ...content.slots, ...content.arcanes]) {
    if (slot) refs.add(slot.uniqueName);
  }
  if (content.helminth) refs.add(content.helminth.uniqueName);
  return refs;
}

/**
 * Checks a build against the game data and returns it with the data's names. A mod the
 * data no longer lists is kept if the saved build already had it, so an old build can
 * still be edited.
 */
export function checkContent(
  content: BuildContent,
  rules: BuildRules,
  previous: BuildContent | null,
): BuildContent {
  const kept = previous ? refsOf(previous) : new Set<string>();
  const usedMods = new Set<string>();

  const mod = (slot: BuildSlot | null, where: 'aura' | 'exilus' | 'slot'): BuildSlot | null => {
    if (!slot) return null;
    if (usedMods.has(slot.uniqueName)) bad('inBuildTwice', { name: slot.name });
    usedMods.add(slot.uniqueName);
    const data = rules.mods.get(slot.uniqueName);
    if (!data) {
      if (kept.has(slot.uniqueName)) return slot;
      return bad('unknownMod', { name: slot.name });
    }
    if (where === 'aura' && !data.aura) bad('notAura', { name: data.name });
    if (where !== 'aura' && data.aura) bad('onlyAura', { name: data.name });
    if (where === 'exilus' && !data.exilus) bad('notExilus', { name: data.name });
    if (!augmentFits(data, rules.group))
      bad('augmentFor', { name: data.name, warframe: data.augmentFor ?? '' });
    if (slot.rank > data.maxRank) bad('maxRank', { name: data.name, max: data.maxRank });
    return { ...slot, name: data.name };
  };

  const usedArcanes = new Set<string>();
  const arcane = (slot: BuildSlot | null): BuildSlot | null => {
    if (!slot) return null;
    if (usedArcanes.has(slot.uniqueName)) bad('inBuildTwice', { name: slot.name });
    usedArcanes.add(slot.uniqueName);
    const data = rules.arcanes.get(slot.uniqueName);
    if (!data) {
      if (kept.has(slot.uniqueName)) return slot;
      return bad('unknownArcane', { name: slot.name });
    }
    if (slot.rank > data.maxRank) bad('maxRank', { name: data.name, max: data.maxRank });
    return { ...slot, name: data.name };
  };

  let helminth = content.helminth;
  if (helminth) {
    const data = rules.helminth.get(helminth.uniqueName);
    const own = rules.group.variants.some((v) =>
      v.raw.abilities.some((a) => a.uniqueName === helminth!.uniqueName),
    );
    if (own) bad('ownAbility', { name: helminth.name, warframe: rules.group.name });
    if (data) helminth = { ...helminth, name: data.name };
    else if (!kept.has(helminth.uniqueName)) bad('helminthCant', { name: helminth.name });
  }

  const weapons = new Set<string>();
  for (const w of content.weapons) {
    if (weapons.has(w.uniqueName)) bad('inBuildTwice', { name: w.name });
    weapons.add(w.uniqueName);
  }

  return {
    ...content,
    aura: mod(content.aura, 'aura'),
    exilus: mod(content.exilus, 'exilus'),
    slots: content.slots.map((s) => mod(s, 'slot')),
    arcanes: content.arcanes.map(arcane),
    helminth,
  };
}

// ---- changes -----------------------------------------------------------------------

export function createBuild(
  db: Db,
  userId: number,
  slug: string,
  name: string,
  content: BuildContent,
  now: Date,
): Build {
  const last = db
    .select({ value: max(builds.sortOrder) })
    .from(builds)
    .where(and(eq(builds.userId, userId), eq(builds.warframeSlug, slug)))
    .get();
  const row = db
    .insert(builds)
    .values({
      userId,
      warframeSlug: slug,
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

export function updateBuild(
  db: Db,
  userId: number,
  id: number,
  name: string,
  content: BuildContent,
  now: Date,
): Build {
  getRow(db, userId, id);
  const row = db
    .update(builds)
    .set({ name, contentJson: JSON.stringify(content), updatedAt: now })
    .where(eq(builds.id, id))
    .returning()
    .get();
  return toBuild(row);
}

export function deleteBuild(db: Db, userId: number, id: number): void {
  getRow(db, userId, id);
  db.delete(builds).where(eq(builds.id, id)).run();
}

/** Sets the order of one Warframe's builds. Every one of its builds must be listed once. */
export function reorderBuilds(db: Db, userId: number, body: ReorderBuildsRequest): void {
  if (new Set(body.buildIds).size !== body.buildIds.length) {
    bad('buildTwice');
  }
  const rows = db
    .select({ id: builds.id })
    .from(builds)
    .where(and(eq(builds.userId, userId), eq(builds.warframeSlug, body.slug)))
    .all();
  const mine = new Set(rows.map((r) => r.id));
  if (body.buildIds.some((id) => !mine.has(id))) {
    throw new HttpError(404, 'not_found', 'unknownBuildInOrder');
  }
  if (mine.size !== body.buildIds.length) bad('listEveryBuild');
  db.transaction((tx) => {
    body.buildIds.forEach((id, sortOrder) => {
      tx.update(builds)
        .set({ sortOrder })
        .where(and(eq(builds.userId, userId), eq(builds.id, id)))
        .run();
    });
  });
}

// ---- shown on the Warframe page ----------------------------------------------------

function resolveSlot(
  slot: BuildSlot | null,
  data: (ModOption | ArcaneOption) | undefined,
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

/** A saved build with what the data says about its mods, arcanes, shards and Helminth. */
/** A weapon's picture, from the item data the search saved (null if never seen). */
function weaponImage(db: Db, uniqueName: string): string | null {
  const row = db
    .select({ payloadJson: itemCache.payloadJson })
    .from(itemCache)
    .where(eq(itemCache.key, `item:${uniqueName}`))
    .get();
  if (!row) return null;
  try {
    const raw = JSON.parse(row.payloadJson) as { imageName?: unknown };
    return typeof raw.imageName === 'string' ? raw.imageName : null;
  } catch {
    return null;
  }
}

export function resolveBuild(db: Db, build: Build, rules: BuildRules): BuildView {
  const c = build.content;
  const mod = (s: BuildSlot | null) => resolveSlot(s, s ? rules.mods.get(s.uniqueName) : undefined);
  const arcane = (s: BuildSlot | null) =>
    resolveSlot(s, s ? rules.arcanes.get(s.uniqueName) : undefined);
  const h = c.helminth;
  return {
    ...build,
    aura: mod(c.aura),
    exilus: mod(c.exilus),
    slots: c.slots.map(mod),
    arcanes: c.arcanes.map(arcane),
    shards: c.shards.map((s) => {
      const stat = shardStat(s.stat)!;
      return {
        ...s,
        color: stat.color,
        text: s.tauforged ? stat.tauforged : stat.normal,
        image: shardImage(stat.color, s.tauforged),
      };
    }),
    weapons: c.weapons.map((w) => ({ ...w, image: weaponImage(db, w.uniqueName) })),
    helminth: h
      ? {
          ...h,
          image: rules.helminth.get(h.uniqueName)?.image ?? null,
          from: rules.helminth.get(h.uniqueName)?.from ?? null,
          page: abilityStats(h.uniqueName)?.page ?? null,
        }
      : null,
  };
}
