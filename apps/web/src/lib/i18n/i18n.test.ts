import { afterEach, describe, expect, it } from 'vitest';
import { formatAmount, formatChance, parseAmount, parseEntry } from '../goals.ts';
import { formatDay } from '../time.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { setLanguage, t } from './index.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Spanish dictionary', () => {
  it('has every English key, with the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(es[key], key).toBeTypeOf('string');
      expect(es[key].trim(), key).not.toBe('');
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('switching language', () => {
  afterEach(() => setLanguage('en'));

  it('changes the text t() gives', () => {
    expect(t('build.socketsLeft', { n: 2, max: 5 })).toBe('2 of 5 sockets empty');
    setLanguage('es');
    expect(t('build.socketsLeft', { n: 2, max: 5 })).toBe('2 de 5 ranuras vacías');
    expect(t('card.sortie')).toBe('Incursión');
  });

  it('formats dates, amounts and chances in Spanish', () => {
    setLanguage('es');
    expect(formatDay('2026-11-13T12:00:00.000Z', 'UTC')).toBe('13 nov 2026');
    expect(formatAmount(1250)).toBe('1.250');
    expect(formatAmount(2500000)).toBe('2.500.000');
    expect(formatChance(14.29)).toBe('14,29%');
    expect(formatChance(10)).toBe('10%');
  });

  it('reads amounts typed either way, in either language', () => {
    for (const lang of ['es', 'en'] as const) {
      setLanguage(lang);
      expect(parseAmount('1.250')).toBe(1250);
      expect(parseAmount('1,250')).toBe(1250);
      expect(parseAmount('2.500.000')).toBe(2500000);
      expect(parseAmount('1.5')).toBeNull();
      expect(parseAmount('12.34')).toBeNull();
      expect(parseEntry('+1.000', 250)).toEqual({ amount: 1250 });
    }
  });
});
