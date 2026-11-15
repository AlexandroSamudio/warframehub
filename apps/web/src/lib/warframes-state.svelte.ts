import { SORT_KEYS, type SortDir, type SortKey } from './warframes.ts';

/**
 * What the Warframes list remembers while you look at a page: the filter you typed and the
 * Warframe you opened last (focus goes back to its tile). The order you chose is kept in
 * this browser, so it is still there next time.
 */
const ORDER_KEY = 'wfhub.warframes.order';

function savedOrder(): { sortKey: SortKey; sortDir: SortDir } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const { key, dir } = raw as { key?: unknown; dir?: unknown };
      if (SORT_KEYS.includes(key as SortKey) && (dir === 'asc' || dir === 'desc')) {
        return { sortKey: key as SortKey, sortDir: dir };
      }
    }
  } catch {
    // no storage, or not JSON: use the default
  }
  return { sortKey: 'name', sortDir: 'asc' };
}

export const listState = $state({
  filter: '',
  lastSlug: null as string | null,
  ...savedOrder(),
});

/** Changes the order and keeps it for next time. */
export function setOrder(key: SortKey, dir: SortDir): void {
  listState.sortKey = key;
  listState.sortDir = dir;
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify({ key, dir }));
  } catch {
    // private window or blocked storage: it just won't be remembered
  }
}
