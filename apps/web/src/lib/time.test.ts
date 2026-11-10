import { describe, expect, it } from 'vitest';
import { formatCountdown, formatLocal, formatUtc, isResetSoon } from './time.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;

describe('time formatting', () => {
  // Weekly reset: Monday 00:00 UTC is Sunday 21:00 in GMT-3.
  const weeklyReset = '2026-11-16T00:00:00.000Z';

  it('shows the weekly reset as Sunday 21:00 in GMT-3', () => {
    expect(formatLocal(weeklyReset)).toBe('Sun 21:00');
  });

  it('shows the same moment as 00:00 UTC', () => {
    expect(formatUtc(weeklyReset)).toBe('00:00');
  });

  it('can show another display time zone', () => {
    expect(formatLocal(weeklyReset, 'UTC')).toBe('Mon 00:00');
  });
});

describe('formatCountdown', () => {
  it.each([
    [0, '< 1m'],
    [59_999, '< 1m'],
    [MIN, '1m'],
    [59 * MIN + 59_999, '59m'],
    [HOUR, '1h 0m'],
    [3 * HOUR + 12 * MIN, '3h 12m'],
    [24 * HOUR, '1d 0h'],
    [6 * 24 * HOUR + 23 * HOUR + 59 * MIN, '6d 23h'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe('isResetSoon', () => {
  it('highlights under 3 hours, or under 24 hours for weekly', () => {
    expect(isResetSoon('daily', 3 * HOUR - 1)).toBe(true);
    expect(isResetSoon('daily', 3 * HOUR)).toBe(false);
    expect(isResetSoon('weekly', 23 * HOUR)).toBe(true);
    expect(isResetSoon('weekly', 24 * HOUR)).toBe(false);
    expect(isResetSoon('daily', -1)).toBe(false);
    expect(isResetSoon('four_day', 23 * HOUR)).toBe(true);
    expect(isResetSoon('four_day', 24 * HOUR)).toBe(false);
  });
});
