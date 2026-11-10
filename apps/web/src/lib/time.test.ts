import { describe, expect, it } from 'vitest';
import { formatLocal, formatUtc } from './time.ts';

describe('time formatting', () => {
  // Weekly reset: Monday 00:00 UTC is Sunday 21:00 in GMT-3.
  const weeklyReset = '2026-11-16T00:00:00.000Z';

  it('shows the weekly reset as Sunday 21:00 in GMT-3', () => {
    expect(formatLocal(weeklyReset)).toBe('Sun 21:00');
  });

  it('shows the same moment as 00:00 UTC', () => {
    expect(formatUtc(weeklyReset)).toBe('00:00');
  });
});
