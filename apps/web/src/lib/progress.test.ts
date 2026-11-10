import type { TrackerItem, TrackerSection } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { earliestReset, sectionProgress } from './progress.ts';

const item = (over: Partial<TrackerItem>): TrackerItem => ({
  id: 1,
  title: 'x',
  description: '',
  kind: 'check',
  slots: null,
  slotCount: 1,
  checked: [],
  verify: false,
  linkUrl: null,
  ...over,
});

const section = (items: TrackerItem[]): TrackerSection => ({
  id: 1,
  slug: 's',
  title: 'S',
  period: 'daily',
  periodKey: 'daily:2026-11-09',
  nextReset: null,
  estimated: false,
  items,
});

describe('sectionProgress', () => {
  it('counts every slot, and skips info rows', () => {
    const s = section([
      item({ checked: [0] }),
      item({ kind: 'counter', slots: { count: 6 }, slotCount: 6, checked: [0, 3] }),
      item({ kind: 'info', slotCount: 0 }),
    ]);
    expect(sectionProgress(s)).toEqual({ done: 3, total: 7 });
  });
});

describe('earliestReset', () => {
  it('picks the soonest known reset', () => {
    expect(earliestReset([null, '2026-11-10T00:00:00.000Z', '2026-11-09T16:00:00.000Z'])).toBe(
      Date.parse('2026-11-09T16:00:00.000Z'),
    );
    expect(earliestReset([null])).toBeNull();
  });
});
