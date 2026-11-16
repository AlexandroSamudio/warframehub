import type {
  WeaponDetail,
  WeaponListItem,
  WeaponBuildView,
  WeaponVariant,
  WeaponsResponse,
} from '@warframehub/shared';
import { and, eq } from 'drizzle-orm';
import { isMastered } from '../domain/mastery.js';
import { nextReset } from '../domain/periods.js';
import { HttpError } from '../http-error.js';
import { incarnonOf } from '../sources/incarnon.js';
import { plainText, slugOf } from '../sources/warframes.js';
import {
  attackOf,
  hasIncarnon,
  statsOf,
  type WeaponCatalogState,
  type WeaponGroup,
} from '../sources/weapons.js';
import type { Db } from './client.js';
import { profileMasteryRank, profileXp } from './profile.js';
import { favoriteWeapons } from './schema.js';
import { weaponBuildCounts } from './weapon-builds.js';
import { goalFor, recipeOf, urlOrNull } from './warframes.js';

/** The Weapons section's answers (SPEC §15): the catalog plus your goals and profile. */

function favoriteSlugs(db: Db, userId: number): Set<string> {
  return new Set(
    db
      .select({ slug: favoriteWeapons.weaponSlug })
      .from(favoriteWeapons)
      .where(eq(favoriteWeapons.userId, userId))
      .all()
      .map((r) => r.slug),
  );
}

/** Stars or unstars a weapon. Doing it twice is fine. */
export function setWeaponFavorite(db: Db, userId: number, slug: string, favorite: boolean): void {
  if (favorite) {
    db.insert(favoriteWeapons).values({ userId, weaponSlug: slug }).onConflictDoNothing().run();
  } else {
    db.delete(favoriteWeapons)
      .where(and(eq(favoriteWeapons.userId, userId), eq(favoriteWeapons.weaponSlug, slug)))
      .run();
  }
}

function freshness(state: WeaponCatalogState, nextRefreshAt: Date | null) {
  return {
    fetchedAt: state.fetchedAt.toISOString(),
    stale: state.stale,
    nextRefreshAt: nextRefreshAt ? nextRefreshAt.toISOString() : null,
  };
}

/**
 * Incarnon: the data's "Incarnon Form" attack, or evolutions on the wiki (many melee
 * weapons, e.g. Skana, have only the latter).
 */
const isIncarnon = (raw: WeaponGroup['variants'][number]['raw']) =>
  hasIncarnon(raw) || incarnonOf(raw.name) !== null;

/** This week's Steel Path Circuit picks ("Boar", "Ack & Brunt") as weapon slugs. */
export function circuitSlugs(names: string[]): Set<string> {
  return new Set(names.map(slugOf));
}

const maxOf = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length > 0 ? Math.max(...known) : null;
};

export function weaponList(
  db: Db,
  userId: number,
  state: WeaponCatalogState,
  groups: WeaponGroup[],
  nextRefreshAt: Date | null,
  circuit: Set<string> = new Set(),
): WeaponsResponse {
  const xp = profileXp(db, userId);
  const favorites = favoriteSlugs(db, userId);
  const buildCounts = weaponBuildCounts(db, userId);
  const weapons: WeaponListItem[] = groups.map((g) => {
    const mrs = g.variants.map((v) => v.raw.masteryReq).filter((m): m is number => m !== undefined);
    return {
      slug: g.slug,
      name: g.name,
      image: g.variants[0]!.raw.imageName ?? null,
      tab: g.tab,
      slot: g.slot,
      class: g.class,
      favorite: favorites.has(g.slug),
      buildCount: buildCounts.get(g.slug) ?? 0,
      disposition: maxOf(g.variants.map((v) => statsOf(v.raw, g.slot).disposition)),
      masteryReq: mrs.length > 0 ? Math.min(...mrs) : null,
      incarnon: g.variants.some((v) => isIncarnon(v.raw)),
      inCircuit: circuit.has(g.slug),
      variants: g.variants.map((v) => ({
        kind: v.kind,
        name: v.raw.name,
        mastered: isMastered(g.slot, xp.get(v.raw.uniqueName)),
      })),
    };
  });
  return {
    weapons,
    masteryRank: profileMasteryRank(db, userId),
    ...freshness(state, nextRefreshAt),
  };
}

export function weaponDetail(
  db: Db,
  userId: number,
  state: WeaponCatalogState,
  groups: WeaponGroup[],
  slug: string,
  nextRefreshAt: Date | null,
  circuit: Set<string> = new Set(),
  now: Date = new Date(),
  builds: WeaponBuildView[] = [],
): WeaponDetail {
  const group = groups.find((g) => g.slug === slug);
  if (!group) throw new HttpError(404, 'not_found', 'noWeapon', { slug });
  const xp = profileXp(db, userId);
  const variants: WeaponVariant[] = group.variants.map(({ kind, raw }) => ({
    uniqueName: raw.uniqueName,
    name: raw.name,
    kind,
    description: plainText(raw.description),
    image: raw.imageName ?? null,
    masteryReq: raw.masteryReq ?? null,
    stats: statsOf(raw, group.slot),
    attacks: raw.attacks.map(attackOf),
    incarnon: isIncarnon(raw),
    evolutions: incarnonOf(raw.name),
    released: raw.releaseDate
      ? { date: raw.releaseDate, update: raw.introduced?.name ?? null }
      : null,
    vaulted: raw.vaulted ?? null,
    tradable: raw.tradable ?? null,
    wikiUrl: urlOrNull(raw.wikiaUrl),
    recipe: recipeOf(raw),
    mastered: isMastered(group.slot, xp.get(raw.uniqueName)),
    goal: goalFor(db, userId, raw.uniqueName),
  }));
  return {
    slug: group.slug,
    name: group.name,
    tab: group.tab,
    slot: group.slot,
    class: group.class,
    inCircuit: circuit.has(group.slug),
    // The Circuit's picks change at the weekly reset (as `normaliseCircuit` says).
    builds,
    circuitEndsAt: circuit.has(group.slug)
      ? (nextReset('weekly', now) as Date).toISOString()
      : null,
    favorite: favoriteSlugs(db, userId).has(group.slug),
    variants,
    ...freshness(state, nextRefreshAt),
  };
}
