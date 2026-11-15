import type {
  VariantKind,
  WarframeListItem,
  WarframeStats,
  WarframeVariant,
} from '@warframehub/shared';
import { formatAmount } from './goals.ts';
import { formatDay } from './time.ts';

/**
 * The list, filtered by the Warframe's name (case-insensitive). "prime" and "umbra" (or
 * their start, from 3 letters) find the Warframes that have that version. Version names
 * aren't matched directly: every "… Prime" would match "me".
 */
export function filterWarframes(list: WarframeListItem[], filter: string): WarframeListItem[] {
  const q = filter.trim().toLowerCase();
  if (q === '') return list;
  const kind =
    q.length >= 3 ? (['prime', 'umbra'] as const).find((k) => k.startsWith(q)) : undefined;
  return list.filter(
    (w) => w.name.toLowerCase().includes(q) || (kind && w.variants.some((v) => v.kind === kind)),
  );
}

export type SortKey = 'name' | 'mastered' | 'favorites';
export type SortDir = 'asc' | 'desc';
export const SORT_KEYS: SortKey[] = ['name', 'mastered', 'favorites'];

/**
 * The list in your order. Name: A–Z (`asc`) or Z–A. Mastered and Favorites: `asc` puts
 * the ones that have it first, `desc` last; inside each group it is always A–Z. A Warframe
 * counts as mastered when every one of its versions is.
 */
export function sortWarframes(
  list: WarframeListItem[],
  key: SortKey,
  dir: SortDir,
  locale?: string,
): WarframeListItem[] {
  const byName = (a: WarframeListItem, b: WarframeListItem) => a.name.localeCompare(b.name, locale);
  const flag = (w: WarframeListItem) =>
    key === 'mastered' ? w.variants.every((v) => v.mastered) : w.favorite;
  const sorted = [...list];
  if (key === 'name') {
    sorted.sort((a, b) => (dir === 'asc' ? byName(a, b) : byName(b, a)));
  } else {
    const sign = dir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => sign * (Number(flag(b)) - Number(flag(a))) || byName(a, b));
  }
  return sorted;
}

/** "madurai" → "Madurai" (the game's polarity names). */
export function polarityName(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** "2016-12-22" → "22 Dec 2016" (a calendar date; no time zone involved). */
export function formatRelease(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return formatDay(d.toISOString(), 'UTC');
}

export interface StatLine {
  key: keyof WarframeStats;
  value: string;
  /** The wiki's rank-30 value, when it differs. */
  rank30: string | null;
}

/** Health, shield, armor, energy, sprint, with rank-30 values where the wiki lists them. */
export function statLines(v: WarframeVariant): StatLine[] {
  const keys: (keyof WarframeStats)[] = ['health', 'shield', 'armor', 'energy', 'sprint'];
  return keys.map((key) => {
    const r30 = key === 'sprint' ? undefined : v.rank30[key];
    return {
      key,
      value: key === 'sprint' ? String(v.stats.sprint) : formatAmount(v.stats[key]),
      rank30: r30 !== undefined && r30 !== v.stats[key] ? formatAmount(r30) : null,
    };
  });
}

/** Which version to show first: the one asked for, else the normal one. */
export function pickVariant(
  variants: WarframeVariant[],
  kind: VariantKind | null,
): WarframeVariant {
  return variants.find((v) => v.kind === kind) ?? variants[0]!;
}
