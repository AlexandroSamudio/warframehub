import type { WeaponTab } from '@warframehub/shared';
import {
  WEAPON_SORT_KEYS,
  type MasteryFilter,
  type SlotFilter,
  type SortDir,
  type WeaponSortKey,
} from './weapons.ts';

/**
 * What the Weapons list remembers while you look at a weapon: the search, each tab's slot,
 * the class, mastery and Incarnon filters, and the weapon you opened last (focus goes back
 * to its tile). The order you chose is kept in this browser for next time.
 */
const ORDER_KEY = 'wfhub.weapons.order';

function savedOrder(): { sortKey: WeaponSortKey; sortDir: SortDir } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const { key, dir } = raw as { key?: unknown; dir?: unknown };
      if (WEAPON_SORT_KEYS.includes(key as WeaponSortKey) && (dir === 'asc' || dir === 'desc')) {
        return { sortKey: key as WeaponSortKey, sortDir: dir };
      }
    }
  } catch {
    // no storage, or not JSON: use the default
  }
  return { sortKey: 'name', sortDir: 'asc' };
}

export const weaponListState = $state({
  query: '',
  slot: { weapons: 'all', arch: 'all' } as Record<WeaponTab, SlotFilter>,
  cls: { weapons: '', arch: '' } as Record<WeaponTab, string>,
  mastery: 'all' as MasteryFilter,
  incarnonOnly: false,
  lastSlug: null as string | null,
  /** The tab the last weapon was opened from, for "← All weapons". */
  lastTab: 'weapons' as WeaponTab,
  ...savedOrder(),
});

/** Changes the order and keeps it for next time. */
export function setWeaponOrder(key: WeaponSortKey, dir: SortDir): void {
  weaponListState.sortKey = key;
  weaponListState.sortDir = dir;
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify({ key, dir }));
  } catch {
    // private window or blocked storage: it just won't be remembered
  }
}
