import type { WarframeListItem, WarframeVariant } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import {
  filterWarframes,
  formatRelease,
  pickVariant,
  polarityName,
  statLines,
} from './warframes.ts';

const item = (name: string, variants: string[]): WarframeListItem => ({
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
