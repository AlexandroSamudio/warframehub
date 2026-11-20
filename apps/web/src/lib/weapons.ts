import type { WeaponListItem, WeaponSlot, WeaponTab } from '@warframehub/shared';

/** The Weapons list (SPEC §15): which weapons show, in what order, under which heading. */

export const TAB_SLOTS: Record<WeaponTab, WeaponSlot[]> = {
  weapons: ['primary', 'secondary', 'melee'],
  arch: ['archgun', 'archmelee'],
};

export type SlotFilter = 'all' | WeaponSlot;
export type MasteryFilter = 'all' | 'not' | 'yes';

export interface WeaponFilters {
  tab: WeaponTab;
  slot: SlotFilter;
  /** The wiki class ("Rifle"), or '' for any. */
  cls: string;
  mastery: MasteryFilter;
  incarnonOnly: boolean;
  /** Only weapons you saved a build for (SPEC §15.1). */
  withBuilds: boolean;
  query: string;
}

/** A weapon counts as mastered when every one of its versions is (as on Warframes). */
export function isMastered(w: WeaponListItem): boolean {
  return w.variants.every((v) => v.mastered);
}

const KIND_WORDS = ['prime', 'vandal', 'mk1'] as const;

/**
 * Matches the name (case-insensitive). "prime", "vandal" and "mk1" (or their start, from
 * 3 letters) also find the weapons that have that version.
 */
function matches(w: WeaponListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (w.name.toLowerCase().includes(q)) return true;
  const kind = q.length >= 3 ? KIND_WORDS.find((k) => k.startsWith(q)) : undefined;
  return kind !== undefined && w.variants.some((v) => v.kind === kind);
}

export function filterWeapons(list: WeaponListItem[], f: WeaponFilters): WeaponListItem[] {
  return list.filter(
    (w) =>
      w.tab === f.tab &&
      (f.slot === 'all' || w.slot === f.slot) &&
      (f.cls === '' || w.class === f.cls) &&
      (f.mastery === 'all' || isMastered(w) === (f.mastery === 'yes')) &&
      // Only the Weapons tab has Incarnon weapons; the arch tab doesn't offer the filter.
      (!f.incarnonOnly || f.tab === 'arch' || w.incarnon) &&
      (!f.withBuilds || w.buildCount > 0) &&
      matches(w, f.query),
  );
}

/** The classes among these weapons (English keys, A–Z); the page sorts their labels. */
export function classesOf(list: WeaponListItem[]): string[] {
  return [...new Set(list.map((w) => w.class).filter((c): c is string => c !== null))].sort();
}

/**
 * No Riven disposition sort: DE retired dispositions, and every weapon is 1.20× now
 * (wiki, "Riven Mods", checked 15 Nov 2026).
 */
export type WeaponSortKey = 'name' | 'mastered' | 'favorites' | 'mr';
export type SortDir = 'asc' | 'desc';
export const WEAPON_SORT_KEYS: WeaponSortKey[] = ['name', 'mastered', 'favorites', 'mr'];

/**
 * The list in your order; inside equal values it is always A–Z.
 * - Name: A–Z (`asc`) or Z–A.
 * - Mastered, Favorites: `asc` puts the ones that have it first.
 * - Mastery rank: `asc` is lowest first. Unknown ranks go last either way.
 */
export function sortWeapons(
  list: WeaponListItem[],
  key: WeaponSortKey,
  dir: SortDir,
  locale?: string,
): WeaponListItem[] {
  const byName = (a: WeaponListItem, b: WeaponListItem) => a.name.localeCompare(b.name, locale);
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = [...list];
  if (key === 'name') {
    sorted.sort((a, b) => sign * byName(a, b));
  } else if (key === 'mastered' || key === 'favorites') {
    const flag = (w: WeaponListItem) => (key === 'mastered' ? isMastered(w) : w.favorite);
    sorted.sort((a, b) => sign * (Number(flag(b)) - Number(flag(a))) || byName(a, b));
  } else {
    sorted.sort((a, b) => {
      const va = a.masteryReq;
      const vb = b.masteryReq;
      if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
      return sign * (va - vb) || byName(a, b);
    });
  }
  return sorted;
}

/** One block per slot of the tab, in the game's order; empty slots are left out. */
export function groupBySlot(
  list: WeaponListItem[],
  tab: WeaponTab,
): { slot: WeaponSlot; items: WeaponListItem[] }[] {
  return TAB_SLOTS[tab]
    .map((slot) => ({ slot, items: list.filter((w) => w.slot === slot) }))
    .filter((g) => g.items.length > 0);
}

/** A damage amount as the game shows it: up to 2 decimals, no trailing zeros. */
export function formatStat(n: number, locale?: string): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** The attack names the data uses most often, as i18n keys; the rest stay as the data says. */
const ATTACK_KEYS: Record<string, string> = {
  'Normal Attack': 'normal',
  'Incarnon Form': 'incarnon',
  'Incarnon Form AoE': 'incarnonArea',
  'Incarnon Form Radial Attack': 'incarnonRadial',
  'Incarnon Form Charged Shot': 'incarnonCharged',
  'Radial Attack': 'radial',
  'Slam Attack': 'slam',
  'Heavy Slam Attack': 'heavySlam',
  'Heavy Attack': 'heavy',
  'Slide Attack': 'slide',
  'Charged Shot': 'charged',
  'Uncharged Shot': 'uncharged',
  'Alt-Fire': 'altFire',
  Throw: 'throw',
  'Charged Throw': 'chargedThrow',
};

export function attackKey(name: string): string | null {
  return ATTACK_KEYS[name] ?? null;
}

/** Weapons per page on the list (Alex's choice, 16 Nov 2026). */
export const PAGE_SIZE = 48;

export interface Paged<T> {
  items: T[];
  /** The page shown: the one asked for, kept between 1 and `pages`. */
  page: number;
  pages: number;
  /** 1-based positions of the first and last item shown (0 when there are none). */
  from: number;
  to: number;
  total: number;
}

/** One page of a list. An out-of-range page is clamped, so a shorter list never shows nothing. */
export function paginate<T>(list: T[], page: number, size = PAGE_SIZE): Paged<T> {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (at - 1) * size;
  const items = list.slice(start, start + size);
  return {
    items,
    page: at,
    pages,
    from: items.length > 0 ? start + 1 : 0,
    to: start + items.length,
    total,
  };
}

/**
 * The page numbers to link: the first, the last, and the ones around the current page, with
 * a gap ('gap') where numbers are left out: 1 … 4 5 [6] 7 8 … 10.
 */
export function pageWindow(page: number, pages: number, around = 2): (number | 'gap')[] {
  const keep = new Set<number>([1, pages]);
  for (let n = page - around; n <= page + around; n++) if (n >= 1 && n <= pages) keep.add(n);
  const out: (number | 'gap')[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - last === 2)
      out.push(last + 1); // a gap of one number is just the number
    else if (n - last > 2) out.push('gap');
    out.push(n);
    last = n;
  }
  return out;
}

/**
 * A page's weapons under their slot headings. `total` is the slot's whole count (across
 * pages) and `continued` says the slot started on an earlier page.
 */
export function pageGroups(
  all: { slot: WeaponSlot; items: WeaponListItem[] }[],
  page: Paged<WeaponListItem>,
): { slot: WeaponSlot; items: WeaponListItem[]; total: number; continued: boolean }[] {
  const out: { slot: WeaponSlot; items: WeaponListItem[]; total: number; continued: boolean }[] =
    [];
  const startIndex = page.from - 1;
  let before = 0; // weapons in earlier groups
  for (const g of all) {
    const first = Math.max(startIndex - before, 0);
    const slice = g.items.slice(first, Math.max(page.to - before, 0));
    if (slice.length > 0 && page.items.length > 0) {
      out.push({ slot: g.slot, items: slice, total: g.items.length, continued: first > 0 });
    }
    before += g.items.length;
  }
  return out;
}

/** The page each slot starts on, for the jump links ("Melee → page 7"). */
export function slotStartPages(
  all: { slot: WeaponSlot; items: unknown[] }[],
  size = PAGE_SIZE,
): { slot: WeaponSlot; page: number }[] {
  let before = 0;
  return all.map((g) => {
    const page = Math.floor(before / size) + 1;
    before += g.items.length;
    return { slot: g.slot, page };
  });
}
