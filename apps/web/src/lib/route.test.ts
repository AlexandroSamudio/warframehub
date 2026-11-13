import { describe, expect, it } from 'vitest';
import { buildHref, hrefFor, paramFromHash, routeFromHash, subFromHash } from './route.svelte.ts';

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

describe('subFromHash', () => {
  it('reads the Builds page, one build, and the edit pages under a Warframe', () => {
    expect(subFromHash('#/warframes/mesa/builds')).toEqual({ kind: 'list' });
    expect(subFromHash('#/warframes/mesa/builds/12')).toEqual({ kind: 'view', id: 12 });
    expect(subFromHash('#/warframes/mesa/builds/12/edit')).toEqual({ kind: 'edit', id: 12 });
    expect(subFromHash('#/warframes/mesa/builds/new')).toEqual({ kind: 'new' });
    expect(paramFromHash('#/warframes/mesa/builds/12/edit')).toBe('mesa');
    expect(routeFromHash('#/warframes/mesa/builds')).toBe('warframes');
  });

  it('ignores anything else', () => {
    expect(subFromHash('#/warframes/mesa')).toBeNull();
    expect(subFromHash('#/warframes/mesa/builds/0')).toBeNull();
    expect(subFromHash('#/warframes/mesa/builds/x1')).toBeNull();
    expect(subFromHash('#/warframes/mesa/builds/12/delete')).toBeNull();
    expect(subFromHash('#/warframes/mesa/builds/new/edit')).toBeNull();
    expect(subFromHash('#/goals/mesa/builds/new')).toBeNull();
  });

  it('builds the addresses back', () => {
    for (const sub of [
      { kind: 'list' },
      { kind: 'new' },
      { kind: 'view', id: 7 },
      { kind: 'edit', id: 7 },
    ] as const) {
      expect(subFromHash(buildHref('mesa', sub))).toEqual(sub);
    }
    expect(buildHref('mesa')).toBe('#/warframes/mesa/builds');
  });
});
