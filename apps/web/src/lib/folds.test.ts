import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFoldOpen, savedTrackerView, saveTrackerView, setFoldOpen } from './folds.ts';

function fakeStorage() {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  });
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe('folds', () => {
  it('are folded until opened, and remember being opened', () => {
    fakeStorage();
    expect(isFoldOpen('nightwave')).toBe(false);
    setFoldOpen('nightwave', true);
    expect(isFoldOpen('nightwave')).toBe(true);
    setFoldOpen('nightwave', false);
    expect(isFoldOpen('nightwave')).toBe(false);
  });

  it('cope with broken or blocked storage', () => {
    const map = fakeStorage();
    map.set('wfhub.rotations.open', 'not json');
    expect(isFoldOpen('x')).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isFoldOpen('x')).toBe(false);
    expect(() => setFoldOpen('x', true)).not.toThrow();
    expect(savedTrackerView()).toBe('checklist');
  });
});

describe('tracker view', () => {
  it('is the checklist unless live was chosen', () => {
    fakeStorage();
    expect(savedTrackerView()).toBe('checklist');
    saveTrackerView('live');
    expect(savedTrackerView()).toBe('live');
  });
});
