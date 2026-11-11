import { describe, expect, it } from 'vitest';
import { isMastered, rank30Xp } from './mastery.js';

describe('isMastered', () => {
  it('Warframes need 900,000 affinity, weapons 450,000', () => {
    expect(rank30Xp('warframe')).toBe(900_000);
    for (const c of ['primary', 'secondary', 'melee'] as const) expect(rank30Xp(c)).toBe(450_000);
  });

  it('is true at the threshold and above (XP keeps counting past rank 30)', () => {
    expect(isMastered('warframe', 900_000)).toBe(true);
    expect(isMastered('warframe', 899_999)).toBe(false);
    expect(isMastered('melee', 450_000)).toBe(true);
    expect(isMastered('primary', 98_548_038)).toBe(true);
  });

  it('an item never ranked is not mastered', () => {
    expect(isMastered('warframe', undefined)).toBe(false);
    expect(isMastered('warframe', 0)).toBe(false);
  });
});
