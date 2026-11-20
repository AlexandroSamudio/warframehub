import type { WeaponListItem } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  attackKey,
  classesOf,
  filterWeapons,
  formatStat,
  groupBySlot,
  pageGroups,
  pageWindow,
  paginate,
  slotStartPages,
  sortWeapons,
  type WeaponFilters,
} from './weapons.ts';

function weapon(over: Partial<WeaponListItem> & { name: string }): WeaponListItem {
  return {
    slug: over.name.toLowerCase().replace(/ /g, '-'),
    image: null,
    tab: 'weapons',
    slot: 'primary',
    class: 'Rifle',
    variants: [{ kind: 'normal', name: over.name, mastered: false }],
    disposition: 3,
    masteryReq: 0,
    incarnon: false,
    inCircuit: false,
    favorite: false,
    buildCount: 0,
    ...over,
  };
}

const list = [
  weapon({
    name: 'Braton',
    incarnon: true,
    disposition: 4,
    variants: [
      { kind: 'normal', name: 'Braton', mastered: true },
      { kind: 'prime', name: 'Braton Prime', mastered: false },
    ],
  }),
  weapon({ name: 'Hek', class: 'Shotgun', masteryReq: 4, favorite: true }),
  weapon({ name: 'Lex', slot: 'secondary', class: 'Pistol', masteryReq: 2, disposition: null }),
  weapon({
    name: 'Skana',
    slot: 'melee',
    class: 'Sword',
    variants: [{ kind: 'normal', name: 'Skana', mastered: true }],
  }),
  weapon({ name: 'Mausolon', tab: 'arch', slot: 'archgun', class: null, masteryReq: null }),
];

const all: WeaponFilters = {
  tab: 'weapons',
  slot: 'all',
  cls: '',
  mastery: 'all',
  incarnonOnly: false,
  withBuilds: false,
  query: '',
};
const names = (l: WeaponListItem[]) => l.map((w) => w.name);

describe('filterWeapons', () => {
  it('keeps one tab, then narrows by slot and class', () => {
    expect(names(filterWeapons(list, all))).toEqual(['Braton', 'Hek', 'Lex', 'Skana']);
    expect(names(filterWeapons(list, { ...all, tab: 'arch' }))).toEqual(['Mausolon']);
    expect(names(filterWeapons(list, { ...all, slot: 'primary' }))).toEqual(['Braton', 'Hek']);
    expect(names(filterWeapons(list, { ...all, cls: 'Shotgun' }))).toEqual(['Hek']);
  });

  it('counts a weapon mastered only when every version is', () => {
    expect(names(filterWeapons(list, { ...all, mastery: 'yes' }))).toEqual(['Skana']);
    expect(names(filterWeapons(list, { ...all, mastery: 'not' }))).toEqual([
      'Braton',
      'Hek',
      'Lex',
    ]);
  });

  it('can show only Incarnon weapons, a filter the arch tab ignores', () => {
    expect(names(filterWeapons(list, { ...all, incarnonOnly: true }))).toEqual(['Braton']);
    expect(names(filterWeapons(list, { ...all, tab: 'arch', incarnonOnly: true }))).toEqual([
      'Mausolon',
    ]);
  });

  it('can show only weapons with builds', () => {
    const withBuild = [...list.slice(0, 1), { ...list[1]!, buildCount: 2 }, ...list.slice(2)];
    expect(names(filterWeapons(withBuild, { ...all, withBuilds: true }))).toEqual(['Hek']);
  });

  it('searches names, and version words from 3 letters', () => {
    expect(names(filterWeapons(list, { ...all, query: 'he' }))).toEqual(['Hek']);
    expect(names(filterWeapons(list, { ...all, query: 'PRI' }))).toEqual(['Braton']);
    expect(names(filterWeapons(list, { ...all, query: 'pr' }))).toEqual([]);
  });
});

describe('sortWeapons', () => {
  const four = filterWeapons(list, all);

  it('sorts by name both ways', () => {
    expect(names(sortWeapons(four, 'name', 'desc'))).toEqual(['Skana', 'Lex', 'Hek', 'Braton']);
  });

  it('puts favorites or mastered first, A–Z inside', () => {
    expect(names(sortWeapons(four, 'favorites', 'asc'))).toEqual(['Hek', 'Braton', 'Lex', 'Skana']);
    expect(names(sortWeapons(four, 'mastered', 'asc'))[0]).toBe('Skana');
    expect(names(sortWeapons(four, 'mastered', 'desc')).at(-1)).toBe('Skana');
  });

  it('sorts Mastery rank lowest first', () => {
    expect(names(sortWeapons(four, 'mr', 'asc'))).toEqual(['Braton', 'Skana', 'Lex', 'Hek']);
    expect(names(sortWeapons(four, 'mr', 'desc'))).toEqual(['Hek', 'Lex', 'Braton', 'Skana']);
  });
});

describe('groupBySlot and classesOf', () => {
  it('groups in the game order and leaves empty slots out', () => {
    const groups = groupBySlot(filterWeapons(list, { ...all, cls: 'Pistol' }), 'weapons');
    expect(groups.map((g) => g.slot)).toEqual(['secondary']);
    expect(groupBySlot(filterWeapons(list, all), 'weapons').map((g) => g.slot)).toEqual([
      'primary',
      'secondary',
      'melee',
    ]);
  });

  it('lists the classes without the unknown ones', () => {
    expect(classesOf(list)).toEqual(['Pistol', 'Rifle', 'Shotgun', 'Sword']);
  });
});

describe('labels', () => {
  it('formats numbers like the game, and knows the common attack names', () => {
    expect(formatStat(12.25, 'en')).toBe('12.25');
    expect(formatStat(2.1500001, 'en')).toBe('2.15');
    expect(formatStat(1.75, 'es')).toBe('1,75');
    expect(attackKey('Heavy Slam Attack')).toBe('heavySlam');
    expect(attackKey('Glass Explosion')).toBeNull();
  });
});

describe('paginate', () => {
  const ten = Array.from({ length: 10 }, (_, i) => i + 1);

  it('cuts a page and says where it is', () => {
    expect(paginate(ten, 2, 4)).toEqual({
      items: [5, 6, 7, 8],
      page: 2,
      pages: 3,
      from: 5,
      to: 8,
      total: 10,
    });
    expect(paginate(ten, 3, 4).items).toEqual([9, 10]);
  });

  it('keeps an out-of-range page inside the list, and copes with nothing', () => {
    expect(paginate(ten, 99, 4).page).toBe(3);
    expect(paginate(ten, 0, 4).page).toBe(1);
    expect(paginate(ten, Number.NaN, 4).page).toBe(1);
    expect(paginate([], 5, 4)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });

  it('uses 48 a page by default', () => {
    const many = Array.from({ length: 477 }, (_, i) => i);
    expect(paginate(many, 1).items).toHaveLength(48);
    expect(paginate(many, 1).pages).toBe(10);
    expect(paginate(many, 10).items).toHaveLength(45);
  });
});

describe('pageWindow', () => {
  it('links the ends and the pages around the current one, with gaps', () => {
    expect(pageWindow(7, 14)).toEqual([1, 'gap', 5, 6, 7, 8, 9, 'gap', 14]);
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 'gap', 10]);
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 8, 9, 10]);
  });

  it('writes a number where a gap would hide only one', () => {
    expect(pageWindow(5, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 7 stands for the one gap
    expect(pageWindow(6, 10)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is just 1 for one page', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

describe('pageGroups', () => {
  const mk = (n: number, slot: WeaponListItem['slot']) =>
    Array.from({ length: n }, (_, i) => weapon({ name: `${slot}${i}`, slot }));
  const all = [
    { slot: 'primary' as const, items: mk(5, 'primary') },
    { slot: 'secondary' as const, items: mk(3, 'secondary') },
    { slot: 'melee' as const, items: mk(4, 'melee') },
  ];
  const flat = all.flatMap((g) => g.items);

  it('puts a page’s weapons under their slot headings', () => {
    const groups = pageGroups(all, paginate(flat, 1, 6));
    expect(groups.map((g) => [g.slot, g.items.length, g.total, g.continued])).toEqual([
      ['primary', 5, 5, false],
      ['secondary', 1, 3, false],
    ]);
  });

  it('marks a slot that started on an earlier page as continued', () => {
    const groups = pageGroups(all, paginate(flat, 2, 6));
    expect(groups.map((g) => [g.slot, g.items.length, g.total, g.continued])).toEqual([
      ['secondary', 2, 3, true],
      ['melee', 4, 4, false],
    ]);
    // Every weapon appears once across the pages.
    const seen = [1, 2].flatMap((p) =>
      pageGroups(all, paginate(flat, p, 6)).flatMap((g) => g.items.map((w) => w.name)),
    );
    expect(seen).toEqual(flat.map((w) => w.name));
  });

  it('has no groups for an empty page', () => {
    expect(pageGroups([], paginate([], 1, 6))).toEqual([]);
  });
});

describe('slotStartPages', () => {
  it('says which page each slot starts on', () => {
    const g = (slot: WeaponListItem['slot'], n: number) => ({ slot, items: new Array(n) });
    expect(slotStartPages([g('primary', 153), g('secondary', 115), g('melee', 184)])).toEqual([
      { slot: 'primary', page: 1 },
      { slot: 'secondary', page: 4 },
      { slot: 'melee', page: 6 },
    ]);
    expect(slotStartPages([g('primary', 5), g('melee', 4)], 6)).toEqual([
      { slot: 'primary', page: 1 },
      { slot: 'melee', page: 1 },
    ]);
  });
});
