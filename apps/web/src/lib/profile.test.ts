import { describe, expect, it } from 'vitest';
import { formatWhen, hoursPlayed, intrinsicGroups } from './profile.ts';

describe('intrinsicGroups', () => {
  it('orders them as the game does and keeps Railjack and Duviri apart', () => {
    const groups = intrinsicGroups([
      { tag: 'LPS_COMMAND', level: 10 },
      { tag: 'LPS_TACTICAL', level: 5 },
      { tag: 'LPS_DRIFT_COMBAT', level: 10 },
    ]);
    expect(groups.map((g) => g.id)).toEqual(['railjack', 'duviri']);
    expect(groups[0]!.rows).toEqual([
      { key: 'intrinsic.tactical', level: 5 },
      { key: 'intrinsic.command', level: 10 },
    ]);
  });

  it('leaves out unknown tags and empty groups', () => {
    expect(intrinsicGroups([{ tag: 'LPS_SOMETHING_NEW', level: 3 }])).toEqual([]);
    expect(intrinsicGroups([{ tag: 'LPS_DRIFT_RIDING', level: 7 }]).map((g) => g.id)).toEqual([
      'duviri',
    ]);
  });
});

describe('hoursPlayed', () => {
  it('rounds seconds to whole hours', () => {
    expect(hoursPlayed({ timePlayedSeconds: 2_533_244 })).toBe(704);
    expect(hoursPlayed({ timePlayedSeconds: 1_700 })).toBe(0);
  });
});

describe('formatWhen', () => {
  it('shows the day and time in the display zone', () => {
    expect(formatWhen('2026-11-11T00:00:00.000Z', 'America/Argentina/Buenos_Aires')).toBe(
      '10 Nov, 21:00',
    );
  });
});
