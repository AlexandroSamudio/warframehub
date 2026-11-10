import { afterEach, describe, expect, it } from 'vitest';
import { nextReset, periodKey, SORTIE_FALLBACK_HOUR_UTC } from './periods.js';

const at = (iso: string) => new Date(iso);
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('daily', () => {
  it('changes key exactly at 00:00 UTC (21:00 GMT-3)', () => {
    expect(periodKey('daily', at('2026-11-09T23:59:59.999Z'))).toBe('daily:2026-11-09');
    expect(periodKey('daily', at('2026-11-10T00:00:00.000Z'))).toBe('daily:2026-11-10');
  });

  it('20:59 and 21:00 in Buenos Aires fall on different days', () => {
    expect(periodKey('daily', at('2026-11-09T20:59:59-03:00'))).toBe('daily:2026-11-09');
    expect(periodKey('daily', at('2026-11-09T21:00:00-03:00'))).toBe('daily:2026-11-10');
  });

  it('next reset is the following 00:00 UTC', () => {
    expect(iso(nextReset('daily', at('2026-11-09T00:00:00.000Z')))).toBe(
      '2026-11-10T00:00:00.000Z',
    );
    expect(iso(nextReset('daily', at('2026-11-09T23:59:59.999Z')))).toBe(
      '2026-11-10T00:00:00.000Z',
    );
  });

  it('handles month, year and leap-day boundaries', () => {
    expect(periodKey('daily', at('2026-12-31T23:59:59Z'))).toBe('daily:2026-12-31');
    expect(periodKey('daily', at('2027-01-01T00:00:00Z'))).toBe('daily:2027-01-01');
    expect(periodKey('daily', at('2028-02-29T12:00:00Z'))).toBe('daily:2028-02-29');
    expect(iso(nextReset('daily', at('2028-02-28T12:00:00Z')))).toBe('2028-02-29T00:00:00.000Z');
  });
});

describe('weekly', () => {
  it('2026-11-09 is a Monday (sanity check for the fixtures below)', () => {
    expect(at('2026-11-09T00:00:00Z').getUTCDay()).toBe(1);
  });

  it('changes key exactly at Monday 00:00 UTC (Sunday 21:00 GMT-3)', () => {
    expect(periodKey('weekly', at('2026-11-08T23:59:59.999Z'))).toBe('weekly:2026-11-02');
    expect(periodKey('weekly', at('2026-11-09T00:00:00.000Z'))).toBe('weekly:2026-11-09');
    expect(periodKey('weekly', at('2026-11-08T21:00:00-03:00'))).toBe('weekly:2026-11-09');
  });

  it('every day of the week maps to that week’s Monday', () => {
    for (let day = 9; day <= 15; day++) {
      const d = at(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`);
      expect(periodKey('weekly', d)).toBe('weekly:2026-11-09');
    }
  });

  it('next reset is the following Monday 00:00 UTC', () => {
    expect(iso(nextReset('weekly', at('2026-11-09T00:00:00Z')))).toBe('2026-11-16T00:00:00.000Z');
    expect(iso(nextReset('weekly', at('2026-11-15T23:59:59.999Z')))).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('handles a week that crosses the new year', () => {
    // Monday 2026-12-28 to Sunday 2027-01-03
    expect(periodKey('weekly', at('2027-01-03T23:59:59Z'))).toBe('weekly:2026-12-28');
    expect(periodKey('weekly', at('2027-01-04T00:00:00Z'))).toBe('weekly:2027-01-04');
  });
});

describe('eight_hour', () => {
  it.each([
    ['2026-11-09T00:00:00.000Z', 'eight_hour:2026-11-09T00', '2026-11-09T08:00:00.000Z'],
    ['2026-11-09T07:59:59.999Z', 'eight_hour:2026-11-09T00', '2026-11-09T08:00:00.000Z'],
    ['2026-11-09T08:00:00.000Z', 'eight_hour:2026-11-09T08', '2026-11-09T16:00:00.000Z'],
    ['2026-11-09T15:59:59.999Z', 'eight_hour:2026-11-09T08', '2026-11-09T16:00:00.000Z'],
    ['2026-11-09T16:00:00.000Z', 'eight_hour:2026-11-09T16', '2026-11-10T00:00:00.000Z'],
    ['2026-11-09T23:59:59.999Z', 'eight_hour:2026-11-09T16', '2026-11-10T00:00:00.000Z'],
  ])('%s → %s, next reset %s', (now, key, next) => {
    expect(periodKey('eight_hour', at(now))).toBe(key);
    expect(iso(nextReset('eight_hour', at(now)))).toBe(next);
  });
});

describe('sortie', () => {
  it('uses the fallback hour of 16:00 UTC', () => {
    expect(SORTIE_FALLBACK_HOUR_UTC).toBe(16);
  });

  it('without live data, the period runs 16:00 to 16:00 UTC and is keyed by the date it ends', () => {
    expect(periodKey('sortie', at('2026-11-09T15:59:59.999Z'))).toBe('sortie:2026-11-09');
    expect(periodKey('sortie', at('2026-11-09T16:00:00.000Z'))).toBe('sortie:2026-11-10');
    expect(periodKey('sortie', at('2026-11-10T00:30:00.000Z'))).toBe('sortie:2026-11-10');
    expect(iso(nextReset('sortie', at('2026-11-09T15:59:59.999Z')))).toBe(
      '2026-11-09T16:00:00.000Z',
    );
    expect(iso(nextReset('sortie', at('2026-11-09T16:00:00.000Z')))).toBe(
      '2026-11-10T16:00:00.000Z',
    );
  });

  it('uses the live expiry when it is in the future', () => {
    const ctx = { sortieExpiry: at('2026-11-10T17:00:00.000Z') };
    const now = at('2026-11-10T16:30:00.000Z');
    expect(periodKey('sortie', now, ctx)).toBe('sortie:2026-11-10');
    expect(iso(nextReset('sortie', now, ctx))).toBe('2026-11-10T17:00:00.000Z');
  });

  it('live data and the fallback give the same key for most of the day', () => {
    const live = { sortieExpiry: at('2026-11-10T17:00:00.000Z') }; // real expiry seen 10 Nov 2026
    for (const t of ['2026-11-09T17:00:00Z', '2026-11-10T03:00:00Z', '2026-11-10T15:59:59Z']) {
      expect(periodKey('sortie', at(t), live)).toBe(periodKey('sortie', at(t)));
    }
  });

  it('the live key changes exactly at the live expiry', () => {
    expect(
      periodKey('sortie', at('2026-11-10T16:59:59.999Z'), {
        sortieExpiry: at('2026-11-10T17:00:00.000Z'),
      }),
    ).toBe('sortie:2026-11-10');
    expect(
      periodKey('sortie', at('2026-11-10T17:00:00.000Z'), {
        sortieExpiry: at('2026-11-11T17:00:00.000Z'),
      }),
    ).toBe('sortie:2026-11-11');
  });

  it('falls back when the live expiry has passed (stale cache)', () => {
    const ctx = { sortieExpiry: at('2026-11-09T16:00:00.000Z') };
    const now = at('2026-11-09T16:00:00.000Z');
    expect(periodKey('sortie', now, ctx)).toBe('sortie:2026-11-10');
    expect(iso(nextReset('sortie', now, ctx))).toBe('2026-11-10T16:00:00.000Z');
  });

  it('falls back when the live expiry is implausibly far ahead or invalid', () => {
    const now = at('2026-11-09T12:00:00.000Z');
    expect(periodKey('sortie', now, { sortieExpiry: at('2026-11-12T16:00:00Z') })).toBe(
      'sortie:2026-11-09',
    );
    expect(periodKey('sortie', now, { sortieExpiry: new Date('nope') })).toBe('sortie:2026-11-09');
    expect(periodKey('sortie', now, { sortieExpiry: null })).toBe('sortie:2026-11-09');
  });
});

describe('baro', () => {
  const activation = at('2026-11-13T13:00:00.000Z');

  it('is keyed by the visit’s activation time', () => {
    expect(periodKey('baro', at('2026-11-14T00:00:00Z'), { baroActivation: activation })).toBe(
      'baro:2026-11-13T13:00:00.000Z',
    );
  });

  it('next reset is the next arrival while he is away, unknown while he is here', () => {
    expect(iso(nextReset('baro', at('2026-11-12T00:00:00Z'), { baroActivation: activation }))).toBe(
      '2026-11-13T13:00:00.000Z',
    );
    expect(
      nextReset('baro', at('2026-11-13T13:00:00Z'), { baroActivation: activation }),
    ).toBeNull();
  });

  it('without live data the key is "baro:unknown" and the reset is unknown', () => {
    expect(periodKey('baro', at('2026-11-14T00:00:00Z'))).toBe('baro:unknown');
    expect(nextReset('baro', at('2026-11-14T00:00:00Z'))).toBeNull();
  });
});

describe('manual', () => {
  it('is keyed by the counter and never resets by itself', () => {
    const now = at('2026-11-09T12:00:00Z');
    expect(periodKey('manual', now)).toBe('manual:0');
    expect(periodKey('manual', now, { manualCounter: 3 })).toBe('manual:3');
    expect(nextReset('manual', now, { manualCounter: 3 })).toBeNull();
  });
});

describe('time zone independence', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each(['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'America/New_York'])(
    'gives the same results when the machine is in %s',
    (tz) => {
      process.env.TZ = tz;
      const now = at('2026-11-08T23:30:00.000Z'); // Sunday in UTC
      expect(periodKey('daily', now)).toBe('daily:2026-11-08');
      expect(periodKey('weekly', now)).toBe('weekly:2026-11-02');
      expect(periodKey('eight_hour', now)).toBe('eight_hour:2026-11-08T16');
      expect(iso(nextReset('weekly', now))).toBe('2026-11-09T00:00:00.000Z');
    },
  );

  it('is unaffected by daylight-saving changes (US DST ended 2026-11-01)', () => {
    process.env.TZ = 'America/New_York';
    expect(periodKey('daily', at('2026-11-01T05:59:59Z'))).toBe('daily:2026-11-01');
    expect(iso(nextReset('daily', at('2026-10-31T12:00:00Z')))).toBe('2026-11-01T00:00:00.000Z');
    expect(iso(nextReset('daily', at('2026-11-01T12:00:00Z')))).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('input validation', () => {
  it('rejects an invalid "now"', () => {
    expect(() => periodKey('daily', new Date('nope'))).toThrow(RangeError);
    expect(() => nextReset('daily', new Date('nope'))).toThrow(RangeError);
  });
});
