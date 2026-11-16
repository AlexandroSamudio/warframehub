import type { WeaponListItem } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  attackKey,
  classesOf,
  filterWeapons,
  formatStat,
  groupBySlot,
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
