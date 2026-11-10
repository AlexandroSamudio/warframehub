import { describe, expect, it } from 'vitest';
import { moveItem, shift } from './reorder.ts';

const sections = [
  { id: 1, items: [{ id: 10 }, { id: 11 }, { id: 12 }] },
  { id: 2, items: [{ id: 20 }] },
];

describe('moveItem', () => {
  it('moves within a section', () => {
    expect(moveItem(sections, 12, 1, 0)).toEqual([12, 10, 11]);
    expect(moveItem(sections, 10, 1, 2)).toEqual([11, 12, 10]);
  });

  it('moves into another section at any position', () => {
    expect(moveItem(sections, 11, 2, 0)).toEqual([11, 20]);
    expect(moveItem(sections, 11, 2, 99)).toEqual([20, 11]);
  });

  it('returns null when nothing changes or the section is unknown', () => {
    expect(moveItem(sections, 10, 1, 0)).toBeNull();
    expect(moveItem(sections, 10, 3, 0)).toBeNull();
  });
});

describe('shift', () => {
  it('swaps with the neighbour and stops at the ends', () => {
    expect(shift([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(shift([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(shift([1, 2, 3], 1, -1)).toBeNull();
    expect(shift([1, 2, 3], 3, 1)).toBeNull();
  });
});
