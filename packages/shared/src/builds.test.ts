import { describe, expect, it } from 'vitest';
import { BuildContent, endoToMax } from './builds.js';

describe('endoToMax', () => {
  const mod = (rarity: string | null, maxRank: number | null) => ({ rarity, maxRank });

  it('follows the wiki table: 10 × rarity × (2^rank − 1)', () => {
    expect(endoToMax([mod('Common', 5)]).endo).toBe(310);
    expect(endoToMax([mod('Uncommon', 10)]).endo).toBe(20460);
    expect(endoToMax([mod('Rare', 10)]).endo).toBe(30690);
    expect(endoToMax([mod('Legendary', 10)]).endo).toBe(40920);
    expect(endoToMax([mod('Rare', 3)]).endo).toBe(210);
  });

  it('adds mods up, skips empty slots and rank 0', () => {
    expect(endoToMax([mod('Common', 5), null, mod('Rare', 0), mod('Common', 3)])).toEqual({
      endo: 310 + 70,
      unknown: 0,
    });
    expect(endoToMax([])).toEqual({ endo: 0, unknown: 0 });
  });

  it('counts the mods it cannot price instead of guessing', () => {
    expect(endoToMax([mod('Common', 5), mod(null, 5), mod('Odd', 5), mod('Rare', null)])).toEqual({
      endo: 310,
      unknown: 3,
    });
  });
});

describe('BuildContent forma', () => {
  it('is null when missing, and a whole number from 0 to 60', () => {
    expect(BuildContent.parse({}).forma).toBeNull();
    expect(BuildContent.parse({ forma: 0 }).forma).toBe(0);
    expect(BuildContent.safeParse({ forma: 61 }).success).toBe(false);
    expect(BuildContent.safeParse({ forma: 1.5 }).success).toBe(false);
  });
});
