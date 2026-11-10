import { describe, expect, it } from 'vitest';
import { hrefFor, routeFromHash } from './route.svelte.ts';

describe('routeFromHash', () => {
  it.each([
    ['', 'tracker'],
    ['#/', 'tracker'],
    ['#/settings', 'settings'],
    ['#settings', 'settings'],
    ['#/settings?x=1', 'settings'],
    ['#/nope', 'tracker'],
    ['#/goals', 'goals'],
  ])('%s → %s', (hash, route) => {
    expect(routeFromHash(hash)).toBe(route);
  });

  it('round-trips with hrefFor', () => {
    expect(routeFromHash(hrefFor('settings'))).toBe('settings');
    expect(routeFromHash(hrefFor('tracker'))).toBe('tracker');
    expect(routeFromHash(hrefFor('goals'))).toBe('goals');
  });
});
