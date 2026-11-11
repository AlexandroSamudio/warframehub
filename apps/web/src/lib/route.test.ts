import { describe, expect, it } from 'vitest';
import { hrefFor, paramFromHash, routeFromHash } from './route.svelte.ts';

describe('routeFromHash', () => {
  it.each([
    ['', 'tracker'],
    ['#/', 'tracker'],
    ['#/settings', 'settings'],
    ['#settings', 'settings'],
    ['#/settings?x=1', 'settings'],
    ['#/nope', 'tracker'],
    ['#/goals', 'goals'],
    ['#/inventory', 'inventory'],
    ['#/warframes', 'warframes'],
    ['#/warframes/nidus', 'warframes'],
    ['#/profile', 'profile'],
  ])('%s → %s', (hash, route) => {
    expect(routeFromHash(hash)).toBe(route);
  });

  it('round-trips with hrefFor', () => {
    expect(routeFromHash(hrefFor('settings'))).toBe('settings');
    expect(routeFromHash(hrefFor('tracker'))).toBe('tracker');
    expect(routeFromHash(hrefFor('goals'))).toBe('goals');
  });
});

describe('paramFromHash', () => {
  it('reads a Warframe slug, and nothing else', () => {
    expect(paramFromHash('#/warframes/nidus')).toBe('nidus');
    expect(paramFromHash('#/warframes/excalibur?x=1')).toBe('excalibur');
    expect(paramFromHash('#/warframes')).toBeNull();
    expect(paramFromHash('#/goals/nidus')).toBeNull();
    expect(paramFromHash('#/warframes/Mesa')).toBe('mesa');
    expect(paramFromHash('#/warframes/xx_y')).toBe('xx_y'); // the page says it doesn't exist
  });

  it('builds the address back', () => {
    expect(hrefFor('warframes', 'nidus')).toBe('#/warframes/nidus');
    expect(paramFromHash(hrefFor('warframes', 'mesa'))).toBe('mesa');
  });
});
