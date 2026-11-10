import { describe, expect, it } from 'vitest';
import { FIXTURES_SAVED_AT, fixture } from './test-fixtures.js';
import {
  cacheTtlMs,
  normaliseArbitration,
  normaliseArchonHunt,
  normaliseDailyDeals,
  normaliseEvents,
  normaliseNightwave,
  normaliseSortie,
  normaliseSteelPath,
  normaliseVoidTrader,
  UnexpectedDataError,
} from './warframestat.js';

const SAVED_AT = FIXTURES_SAVED_AT;
const at = (iso: string) => new Date(iso);

describe('sortie', () => {
  it('normalises the boss, faction and three missions', () => {
    const { data, freshness } = normaliseSortie(fixture('sortie'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data).toMatchObject({
      boss: 'Lephantis',
      faction: 'Infestation',
      expiry: '2026-11-10T17:00:00.000Z',
    });
    expect(data!.missions).toHaveLength(3);
    expect(data!.missions[0]).toEqual({
      missionType: 'Mobile Defense',
      node: 'Phlegyas (Deimos)',
      modifier: 'Augmented Enemy Armor',
      modifierDescription: expect.stringContaining('armor') as string,
    });
  });

  it('is "outdated" once its expiry has passed', () => {
    expect(normaliseSortie(fixture('sortie'), at('2026-11-10T17:00:00Z')).freshness).toBe(
      'outdated',
    );
  });
});

describe('archonHunt', () => {
  it('maps the Archon to its shard colour', () => {
    const { data, freshness } = normaliseArchonHunt(fixture('archonHunt'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data).toMatchObject({ boss: 'Archon Amar', shard: 'Crimson', faction: 'Narmer' });
    expect(data!.missions.map((m) => m.type)).toEqual([
      'Extermination',
      'Defense',
      'Assassination',
    ]);
  });

  it.each([
    ['Archon Nira', 'Amber'],
    ['Archon Boreal', 'Azure'],
    ['Archon Someone New', null],
  ])('%s → %s', (boss, shard) => {
    const raw = { ...(fixture('archonHunt') as object), boss };
    expect(normaliseArchonHunt(raw, SAVED_AT).data!.shard).toBe(shard);
  });
});

describe('steelPath (Teshin)', () => {
  it('is live while its dates cover now', () => {
    const { data, freshness } = normaliseSteelPath(fixture('steelPath'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data).toMatchObject({
      currentReward: { name: 'Umbra Forma Blueprint', cost: 150 },
      estimatedReward: null,
    });
  });

  it('when the API lags, estimates the item from the rotation order', () => {
    // One week after the saved week: next item in the API's rotation list.
    const nextWeek = normaliseSteelPath(fixture('steelPath'), at('2026-11-16T12:00:00Z'));
    expect(nextWeek.freshness).toBe('estimated');
    expect(nextWeek.data!.estimatedReward).toEqual({ name: '50,000 Kuva', cost: 55 });

    // Eight weeks later the rotation wraps around.
    const wrapped = normaliseSteelPath(fixture('steelPath'), at('2027-01-04T12:00:00Z'));
    expect(wrapped.data!.estimatedReward!.name).toBe('Umbra Forma Blueprint');
  });

  it('is "outdated" when the current item is not in the rotation list', () => {
    const raw = {
      ...(fixture('steelPath') as object),
      currentReward: { name: 'Mystery', cost: 1 },
    };
    const result = normaliseSteelPath(raw, at('2026-11-16T12:00:00Z'));
    expect(result.freshness).toBe('outdated');
    expect(result.data!.estimatedReward).toBeNull();
  });
});

describe('dailyDeals (Darvo)', () => {
  it('normalises the deal', () => {
    const { data, freshness } = normaliseDailyDeals(fixture('dailyDeals'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data).toEqual([
      {
        item: 'Vectis',
        originalPrice: 250,
        salePrice: 100,
        discount: 60,
        sold: 28,
        total: 100,
        activation: '2026-11-09T17:00:00.000Z',
        expiry: '2026-11-10T19:00:00.000Z',
      },
    ]);
  });

  it('an empty list means "check in game"', () => {
    expect(normaliseDailyDeals([], SAVED_AT)).toEqual({ freshness: 'unavailable', data: null });
  });
});

describe('voidTrader (Baro)', () => {
  it('reports his next visit while he is away', () => {
    const { data, freshness } = normaliseVoidTrader(fixture('voidTrader'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data).toEqual({
      location: 'Orcus Relay (Pluto)',
      activation: '2026-11-13T14:00:00.000Z',
      expiry: '2026-11-15T14:00:00.000Z',
    });
  });

  it('is "outdated" after that visit ends', () => {
    expect(normaliseVoidTrader(fixture('voidTrader'), at('2026-11-15T14:00:00Z')).freshness).toBe(
      'outdated',
    );
  });
});

describe('nightwave', () => {
  it('lists challenges by kind', () => {
    const { data, freshness } = normaliseNightwave(fixture('nightwave'), SAVED_AT);
    expect(freshness).toBe('live');
    expect(data!.season).toBe(18);
    const kinds = new Set(data!.challenges.map((c) => c.kind));
    expect(kinds.has('daily')).toBe(true);
    expect(kinds.has('weekly')).toBe(true);
    expect(data!.challenges[0]).toMatchObject({
      title: 'Everything Old is New Again',
      reputation: 1000,
      kind: 'daily',
    });
  });

  it('is "outdated" when no challenge covers now (known upstream lag)', () => {
    expect(normaliseNightwave(fixture('nightwave'), at('2026-12-01T00:00:00Z')).freshness).toBe(
      'outdated',
    );
  });
});

describe('events', () => {
  it('keeps running events only', () => {
    expect(normaliseEvents(fixture('events'), SAVED_AT).data!.map((e) => e.name)).toEqual([
      'Thermia Fractures',
      'Epoch Operation: Taubound',
      'Ghoul Purge',
    ]);
    expect(
      normaliseEvents(fixture('events'), at('2026-11-18T00:00:00Z')).data!.map((e) => e.name),
    ).toEqual(['Thermia Fractures', 'Ghoul Purge']);
  });

  it('keeps the node when there is one', () => {
    const [thermia] = normaliseEvents(fixture('events'), SAVED_AT).data!;
    expect(thermia).toMatchObject({
      node: 'Orb Vallis (Venus)',
      description: 'Seal fractures across the Orb Vallis',
    });
  });
});

describe('arbitration', () => {
  it('the placeholder response (SolNode000, 1970, expired) means "check in game"', () => {
    expect(normaliseArbitration(fixture('arbitration'), SAVED_AT)).toEqual({
      freshness: 'unavailable',
      data: null,
    });
  });

  it('a real arbitration is normalised', () => {
    const raw = {
      node: 'Casta (Ceres)',
      type: 'Defense',
      enemy: 'Grineer',
      activation: '2026-11-10T13:00:00.000Z',
      expiry: '2026-11-10T14:00:00.000Z',
      expired: false,
    };
    expect(normaliseArbitration(raw, SAVED_AT)).toMatchObject({
      freshness: 'live',
      data: { node: 'Casta (Ceres)', missionType: 'Defense', enemy: 'Grineer' },
    });
  });
});

describe('unexpected data', () => {
  it('throws UnexpectedDataError for missing fields or junk dates', () => {
    expect(() => normaliseSortie({ boss: 'x' }, SAVED_AT)).toThrow(UnexpectedDataError);
    const junk = { ...(fixture('voidTrader') as object), expiry: '+275760-09-13T00:00:00.000Z' };
    expect(() => normaliseVoidTrader(junk, SAVED_AT)).toThrow(UnexpectedDataError);
  });
});

describe('cacheTtlMs', () => {
  const MIN = 60_000;
  it('uses the data’s own expiry, capped at 1 hour', () => {
    expect(cacheTtlMs('sortie', { expiry: '2026-11-10T13:59:12.000Z' }, SAVED_AT)).toBe(30 * MIN);
    expect(cacheTtlMs('sortie', fixture('sortie'), SAVED_AT)).toBe(60 * MIN);
    expect(cacheTtlMs('dailyDeals', fixture('dailyDeals'), SAVED_AT)).toBe(60 * MIN);
  });

  it('waits 5 minutes when upstream is behind, 10 minutes for lists', () => {
    expect(cacheTtlMs('sortie', { expiry: '2026-11-10T13:00:00.000Z' }, SAVED_AT)).toBe(5 * MIN);
    expect(cacheTtlMs('nightwave', fixture('nightwave'), SAVED_AT)).toBe(10 * MIN);
    expect(cacheTtlMs('events', fixture('events'), SAVED_AT)).toBe(10 * MIN);
  });
});
