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
