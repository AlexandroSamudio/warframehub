import type {
  WarframeDetail,
  WarframeListItem,
  WarframeVariant,
  WarframesResponse,
} from '@warframehub/shared';
import { and, desc, eq } from 'drizzle-orm';
import { isMastered } from '../domain/mastery.js';
import { HttpError } from '../http-error.js';
import { abilityStats, warframeWiki } from '../sources/ability-stats.js';
import { buildsVariant, helminthOptions } from '../sources/build-data.js';
import { normaliseItem } from '../sources/items.js';
import { partSources } from '../sources/part-sources.js';
import {
  abilitiesOf,
  plainText,
  type CatalogState,
  type RawWarframe,
  type WarframeGroup,
} from '../sources/warframes.js';
import { buildRules, listBuilds, resolveBuild } from './builds.js';
import type { Db } from './client.js';
import { profileXp } from './profile.js';
import { goals } from './schema.js';

/** The Warframes section's answers (SPEC §14): the catalog plus your goals and profile. */

function freshness(state: CatalogState, nextRefreshAt: Date | null) {
  return {
    fetchedAt: state.fetchedAt.toISOString(),
    stale: state.stale,
    nextRefreshAt: nextRefreshAt ? nextRefreshAt.toISOString() : null,
  };
}

export function warframeList(
  db: Db,
  userId: number,
  state: CatalogState,
  groups: WarframeGroup[],
  nextRefreshAt: Date | null,
): WarframesResponse {
  const xp = profileXp(db, userId);
  const warframes: WarframeListItem[] = groups.map((g) => ({
    slug: g.slug,
    name: g.name,
    image: g.variants[0]!.raw.imageName ?? null,
    variants: g.variants.map((v) => ({
      kind: v.kind,
      name: v.raw.name,
      mastered: isMastered('warframe', xp.get(v.raw.uniqueName)),
    })),
  }));
  return { warframes, ...freshness(state, nextRefreshAt) };
}

/** The goal for this item: an active one first, else the most recently built. */
function goalFor(db: Db, userId: number, uniqueName: string) {
  const rows = db
    .select({ id: goals.id, status: goals.status })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.uniqueName, uniqueName)))
    .orderBy(desc(goals.builtAt))
    .all();
  return rows.find((r) => r.status === 'active') ?? rows[0] ?? null;
}

function recipeOf(raw: RawWarframe) {
  try {
    const recipe = normaliseItem(raw);
    if (!recipe) return null;
    return {
      ...recipe,
      parts: recipe.parts.map((p) => ({ ...p, sources: partSources(recipe.name, p.name) })),
    };
  } catch {
    return null; // odd recipe data: the page still shows everything else
  }
}

function urlOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export function warframeDetail(
  db: Db,
  userId: number,
  state: CatalogState,
  groups: WarframeGroup[],
  slug: string,
  nextRefreshAt: Date | null,
): WarframeDetail {
  const group = groups.find((g) => g.slug === slug);
  if (!group) throw new HttpError(404, 'not_found', `No Warframe called "${slug}"`);
  const xp = profileXp(db, userId);
  const rules = buildRules(state, group, helminthOptions(groups));
  const variants: WarframeVariant[] = group.variants.map(({ kind, raw }) => {
    const wiki = warframeWiki(raw.uniqueName);
    // The data's passive has placeholders ("|SPEED|%"); the wiki's has the numbers.
    const dataPassive = raw.passiveDescription ? plainText(raw.passiveDescription) : '';
    const passive = wiki?.passive ?? (/\|[A-Z_]+\|/.test(dataPassive) ? '' : dataPassive);
    return {
      uniqueName: raw.uniqueName,
      name: raw.name,
      kind,
      description: plainText(raw.description),
      passive: passive === '' ? null : passive,
      image: raw.imageName ?? null,
      abilities: abilitiesOf(raw).map((a) => {
        const n = abilityStats(a.uniqueName);
        return {
          ...a,
          description: plainText(a.description),
          numbers: n
            ? {
                cost: n.cost,
                costType: n.costType,
                channeled: n.channeled,
                subsumable: n.subsumable,
                strength: n.strength,
                duration: n.duration,
                range: n.range,
                misc: n.misc,
                page: n.page,
              }
            : null,
        };
      }),
      stats: {
        health: raw.health,
        shield: raw.shield,
        armor: raw.armor,
        energy: raw.power,
        sprint: raw.sprintSpeed,
      },
      rank30: wiki?.rank30 ?? {},
      polarities: raw.polarities,
      aura: raw.aura ?? null,
      masteryReq: raw.masteryReq ?? null,
      released: raw.releaseDate
        ? { date: raw.releaseDate, update: raw.introduced?.name ?? null }
        : null,
      vaulted: raw.vaulted ?? null,
      wikiUrl: urlOrNull(raw.wikiaUrl),
      recipe: recipeOf(raw),
      mastered: isMastered('warframe', xp.get(raw.uniqueName)),
      goal: goalFor(db, userId, raw.uniqueName),
    };
  });
  return {
    slug: group.slug,
    name: group.name,
    variants,
    augments: state.augments[group.name] ?? [],
    augmentShops: warframeWiki(group.variants[0]!.raw.uniqueName)?.augmentShops ?? [],
    buildsVariant: buildsVariant(group).raw.name,
    builds: listBuilds(db, userId, group.slug).map((b) => resolveBuild(db, b, rules)),
    ...freshness(state, nextRefreshAt),
  };
}
