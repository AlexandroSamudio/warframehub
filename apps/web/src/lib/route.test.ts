import { describe, expect, it } from 'vitest';
import {
  buildHref,
  hrefFor,
  paramFromHash,
  routeFromHash,
  subFromHash,
  weaponPageFromHash,
  weaponsHref,
  weaponTabFromHash,
} from './route.svelte.ts';

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
    expect(subFromHash('#/warframes/mesa/builds/new?import')).toEqual({
      kind: 'new',
      withCode: true,
    });
    expect(subFromHash('#/warframes/mesa/builds/new?other')).toEqual({ kind: 'new' });
    expect(buildHref('mesa', { kind: 'new', withCode: true })).toBe(
      '#/warframes/mesa/builds/new?import',
    );
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

describe('weapons', () => {
  it('routes the list and a weapon page', () => {
    expect(routeFromHash('#/weapons')).toBe('weapons');
    expect(routeFromHash('#/weapons?tab=arch')).toBe('weapons');
    expect(paramFromHash('#/weapons')).toBeNull();
    expect(paramFromHash('#/weapons/Braton')).toBe('braton');
    expect(hrefFor('weapons', 'kuva-hek')).toBe('#/weapons/kuva-hek');
  });

  it('reads the tab from the list address only', () => {
    expect(weaponTabFromHash('#/weapons')).toBe('weapons');
    expect(weaponTabFromHash('#/weapons?tab=arch')).toBe('arch');
    expect(weaponTabFromHash('#/weapons?tab=nope')).toBe('weapons');
    expect(weaponTabFromHash('#/weapons/mausolon?tab=arch')).toBe('weapons');
    expect(weaponTabFromHash('#/warframes?tab=arch')).toBe('weapons');
    expect(weaponsHref('arch')).toBe('#/weapons?tab=arch');
    expect(weaponsHref('weapons')).toBe('#/weapons');
  });
});

describe('weapon builds', () => {
  it('reads and writes the Builds addresses under a weapon', () => {
    expect(subFromHash('#/weapons/braton/builds')).toEqual({ kind: 'list' });
    expect(subFromHash('#/weapons/braton/builds/7')).toEqual({ kind: 'view', id: 7 });
    expect(subFromHash('#/weapons/braton/builds/7/edit')).toEqual({ kind: 'edit', id: 7 });
    expect(subFromHash('#/weapons/braton/builds/new?import')).toEqual({
      kind: 'new',
      withCode: true,
    });
    expect(paramFromHash('#/weapons/braton/builds/7')).toBe('braton');
    expect(buildHref('braton', { kind: 'view', id: 7 }, 'weapons')).toBe(
      '#/weapons/braton/builds/7',
    );
    expect(buildHref('mesa')).toBe('#/warframes/mesa/builds');
  });
});

describe('weapon list pages', () => {
  it('reads the page from the list address only', () => {
    expect(weaponPageFromHash('#/weapons')).toBe(1);
    expect(weaponPageFromHash('#/weapons?page=3')).toBe(3);
    expect(weaponPageFromHash('#/weapons?tab=arch&page=2')).toBe(2);
    expect(weaponPageFromHash('#/weapons?page=0')).toBe(1);
    expect(weaponPageFromHash('#/weapons?page=abc')).toBe(1);
    expect(weaponPageFromHash('#/weapons/braton?page=3')).toBe(1);
    expect(weaponTabFromHash('#/weapons?tab=arch&page=2')).toBe('arch');
  });

  it('writes the address of a tab and page, leaving out the defaults', () => {
    expect(weaponsHref('weapons')).toBe('#/weapons');
    expect(weaponsHref('weapons', 1)).toBe('#/weapons');
    expect(weaponsHref('weapons', 4)).toBe('#/weapons?page=4');
    expect(weaponsHref('arch', 2)).toBe('#/weapons?tab=arch&page=2');
    expect(weaponsHref('arch')).toBe('#/weapons?tab=arch');
  });
});
