import {
  ARCANE_SLOTS,
  MOD_SLOTS,
  SHARD_STATS,
  type ArcaneOption,
  type BuildContent,
  type ModOption,
  type ShardColor,
  type ShardStat,
} from '@warframehub/shared';

/** Helpers for the Builds section and the edit page (SPEC §14.1). */

export type SlotKind = 'aura' | 'exilus' | 'slot';

/** Does this mod go in this kind of slot? Exilus mods also fit normal slots. */
export function fitsSlot(mod: ModOption, kind: SlotKind): boolean {
  if (kind === 'aura') return mod.aura;
  if (mod.aura) return false;
  return kind === 'exilus' ? mod.exilus : true;
}

/**
 * Names starting with the query first ("flow" → Flow, Primed Flow), then names containing
 * it, then items whose effect mentions it ("strength" → Intensify, Transient Fortitude…).
 */
function byQuery<T extends { name: string; effects?: string[] }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return items;
  const starts: T[] = [];
  const contains: T[] = [];
  const effect: T[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    if (name.startsWith(q)) starts.push(item);
    else if (name.includes(q)) contains.push(item);
    else if (item.effects?.at(-1)?.toLowerCase().includes(q)) effect.push(item);
  }
  return [...starts, ...contains, ...effect];
}

/**
 * Mods the picker offers for a slot: they fit and aren't used elsewhere. With no query, this
 * Warframe's augments come first (they're why most builds differ), then the rest A–Z.
 */
export function modChoices(
  mods: ModOption[],
  kind: SlotKind,
  used: Set<string>,
  query: string,
): ModOption[] {
  const fits = mods.filter((m) => fitsSlot(m, kind) && !used.has(m.uniqueName));
  if (query.trim() === '') {
    return [...fits.filter((m) => m.augmentFor), ...fits.filter((m) => !m.augmentFor)];
  }
  return byQuery(fits, query);
}

export function arcaneChoices(
  arcanes: ArcaneOption[],
  used: Set<string>,
  query: string,
): ArcaneOption[] {
  return byQuery(
    arcanes.filter((a) => !used.has(a.uniqueName)),
    query,
  );
}

export function searchByName<T extends { name: string }>(items: T[], query: string): T[] {
  return byQuery(items, query);
}

/** "https://www.overframe.gg/build/1/" → "overframe.gg"; the link's text. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** "13 Nov 2026" in the user's zone. */
export function formatSaved(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

export function emptyContent(): BuildContent {
  return {
    sourceUrl: '',
    author: '',
    patch: '',
    description: '',
    guide: '',
    aura: null,
    exilus: null,
    slots: Array<null>(MOD_SLOTS).fill(null),
    arcanes: Array<null>(ARCANE_SLOTS).fill(null),
    shards: [],
    helminth: null,
    weapons: [],
  };
}

export const SHARD_COLORS: ShardColor[] = [
  'crimson',
  'amber',
  'azure',
  'emerald',
  'topaz',
  'violet',
];

/** Shard stats grouped by colour, for a grouped `<select>`. */
export function shardGroups(): { color: ShardColor; stats: ShardStat[] }[] {
  return SHARD_COLORS.map((color) => ({
    color,
    stats: SHARD_STATS.filter((s) => s.color === color),
  }));
}

// ---- the last tab opened, per Warframe (a convenience; may be unavailable) ----------

const TAB_KEY = 'wfhub.buildTab.';

export function rememberedTab(slug: string): number | null {
  try {
    const value = Number(globalThis.localStorage?.getItem(TAB_KEY + slug));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberTab(slug: string, id: number): void {
  try {
    globalThis.localStorage?.setItem(TAB_KEY + slug, String(id));
  } catch {
    // private window or blocked storage: the first tab opens next time
  }
}
