import { describe, expect, it } from 'vitest';
import { t } from './index.ts';

describe('t()', () => {
  it('returns the English string', () => {
    expect(t('app.title')).toBe('WarframeHub');
  });

  it('fills in placeholders', () => {
    expect(t('health.version', { version: '0.1.0' })).toBe('Version 0.1.0');
  });

  it('leaves unknown placeholders visible instead of dropping them', () => {
    expect(t('health.version')).toBe('Version {version}');
  });
});
