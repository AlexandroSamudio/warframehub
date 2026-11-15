import type { WarframeListItem, WarframeVariant } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  filterWarframes,
  formatRelease,
  pickVariant,
  polarityName,
  sortWarframes,
  statLines,
} from './warframes.ts';

const item = (name: string, variants: string[]): WarframeListItem => ({
  favorite: false,
  slug: name.toLowerCase(),
  name,
  image: null,
  variants: variants.map((n) => ({
    kind: n.endsWith('Prime') ? 'prime' : n.endsWith('Umbra') ? 'umbra' : 'normal',
    name: n,
    mastered: false,
  })),
});

describe('filterWarframes', () => {
  const list = [item('Excalibur', ['Excalibur', 'Excalibur Umbra']), item('Mesa', ['Mesa'])];
  const withPrime = [...list, item('Nidus', ['Nidus', 'Nidus Prime'])];

  it('matches names case-insensitively, not every "… Prime"', () => {
    expect(filterWarframes(withPrime, ' MES ').map((w) => w.name)).toEqual(['Mesa']);
    expect(filterWarframes(withPrime, 'me').map((w) => w.name)).toEqual(['Mesa']);
    expect(filterWarframes(withPrime, '')).toHaveLength(3);
  });

  it('finds versions by the words prime and umbra', () => {
    expect(filterWarframes(withPrime, 'umbra').map((w) => w.name)).toEqual(['Excalibur']);
    expect(filterWarframes(withPrime, 'pri').map((w) => w.name)).toEqual(['Nidus']);
  });
});

describe('small formats', () => {
  it('names polarities and release dates', () => {
    expect(polarityName('madurai')).toBe('Madurai');
    expect(formatRelease('2016-12-22')).toBe('22 Dec 2016');
    expect(formatRelease('soon')).toBe('soon');
  });
});

describe('statLines', () => {
  it('shows the rank-30 value only where it differs', () => {
    const v = {
      stats: { health: 675, shield: 0, armor: 350, energy: 100, sprint: 1 },
      rank30: { armor: 450, shield: 0 },
    } as unknown as WarframeVariant;
    expect(statLines(v)).toEqual([
      { key: 'health', value: '675', rank30: null },
      { key: 'shield', value: '0', rank30: null },
      { key: 'armor', value: '350', rank30: '450' },
      { key: 'energy', value: '100', rank30: null },
      { key: 'sprint', value: '1', rank30: null },
    ]);
  });
});

describe('pickVariant', () => {
  const vs = [{ kind: 'normal' }, { kind: 'prime' }] as WarframeVariant[];
  it('picks the asked version, else the first', () => {
    expect(pickVariant(vs, 'prime').kind).toBe('prime');
    expect(pickVariant(vs, 'umbra').kind).toBe('normal');
    expect(pickVariant(vs, null).kind).toBe('normal');
  });
});

describe('sortWarframes', () => {
  const frame = (name: string, mastered: boolean[], favorite = false): WarframeListItem => ({
    slug: name.toLowerCase(),
    name,
    image: null,
    favorite,
    variants: mastered.map((m, i) => ({ kind: i === 0 ? 'normal' : 'prime', name, mastered: m })),
  });
  const list = [
    frame('Nidus', [true, true], false),
    frame('Ash', [false], true),
    frame('Mesa', [true, false], true),
    frame('Volt', [true], false),
  ];
  const names = (l: WarframeListItem[]) => l.map((w) => w.name);

  it('sorts by name, both ways', () => {
    expect(names(sortWarframes(list, 'name', 'asc'))).toEqual(['Ash', 'Mesa', 'Nidus', 'Volt']);
    expect(names(sortWarframes(list, 'name', 'desc'))).toEqual(['Volt', 'Nidus', 'Mesa', 'Ash']);
  });

  it('puts the starred first or last, A–Z inside each group', () => {
    expect(names(sortWarframes(list, 'favorites', 'asc'))).toEqual([
      'Ash',
      'Mesa',
      'Nidus',
      'Volt',
    ]);
    expect(names(sortWarframes(list, 'favorites', 'desc'))).toEqual([
      'Nidus',
      'Volt',
      'Ash',
      'Mesa',
    ]);
  });

  it('counts a Warframe as mastered only when every version is', () => {
    expect(names(sortWarframes(list, 'mastered', 'asc'))).toEqual(['Nidus', 'Volt', 'Ash', 'Mesa']);
    expect(names(sortWarframes(list, 'mastered', 'desc'))).toEqual([
      'Ash',
      'Mesa',
      'Nidus',
      'Volt',
    ]);
  });

  it('does not change the list it is given', () => {
    const copy = names(list);
    sortWarframes(list, 'name', 'desc');
    expect(names(list)).toEqual(copy);
  });

  it('sorts accented names by the language', () => {
    const l = [frame('Éxito', [false]), frame('Zeta', [false]), frame('Ágil', [false])];
    expect(names(sortWarframes(l, 'name', 'asc', 'es'))).toEqual(['Ágil', 'Éxito', 'Zeta']);
  });
});
