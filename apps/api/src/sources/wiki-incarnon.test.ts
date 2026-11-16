import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLuaData } from './wiki-lua.js';
import { buildIncarnon, nativeIncarnonPages, parseEvolutions } from './wiki-incarnon.js';

/** The "Evolutions" sections of real wiki pages, saved on 15 Nov 2026 (CC BY-SA). */
const page = (name: string) =>
  readFileSync(new URL(`./fixtures/wiki/${name}.wiki`, import.meta.url), 'utf8');

describe('parseEvolutions', () => {
  it('reads an adapter table per version, with each version’s numbers', () => {
    const all = parseEvolutions(page('braton-incarnon-genesis'), 'Braton')!;
    expect(Object.keys(all)).toEqual(['Braton', 'Mk1-Braton', 'Braton Vandal', 'Braton Prime']);
    const prime = all['Braton Prime']!;
    expect(prime.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
    // Installing the adapter unlocks tier 1; a challenge unlocks each later tier.
    expect(prime[0]!.challenge).toBeNull();
    expect(prime[1]!.challenge).toBe('Complete a solo mission with this weapon equipped.');
    expect(prime[1]!.perks.map((p) => p.name)).toEqual(['Daring Reverie', 'Munitions Grit']);
    expect(prime[1]!.perks[0]!.lines[0]).toBe('Increase Base Damage by +4.');
    expect(all['Mk1-Braton']![1]!.perks[0]!.lines[0]).toBe('Increase Base Damage by +28.');
    // A perk the same for every version (colspan "-") keeps its text.
    expect(prime[2]!.perks[1]).toEqual({
      name: "Void's Guidance",
      lines: ['+60% Accuracy', '-60% Recoil'],
    });
  });

  it('fills units without doubling them, and reads a header right after "{|"', () => {
    const all = parseEvolutions(page('angstrum-incarnon-genesis'), 'Angstrum')!;
    expect(Object.keys(all)).toEqual(['Angstrum', 'Prisma Angstrum']);
    const lines = all['Angstrum']!.flatMap((t) => t.perks.flatMap((p) => p.lines));
    expect(lines.some((l) => /[+-]X\b|%%/.test(l))).toBe(false);
  });

  it('reads a lowercase value key ("x = 50") as X', () => {
    const all = parseEvolutions(page('obex-incarnon-genesis'), 'Obex')!;
    const finisher = all['Obex']!.flatMap((t) => t.perks).find(
      (p) => p.name === 'Armored Finisher',
    );
    expect(finisher!.lines[0]).toBe('Increase Base Damage by +50');
  });

  it('reads a weapon that is Incarnon from the start, challenge before each tier', () => {
    const felarx = parseEvolutions(page('felarx'), 'Felarx')!;
    expect(Object.keys(felarx)).toEqual(['Felarx']);
    const tiers = felarx['Felarx']!;
    expect(tiers).toHaveLength(5);
    expect(tiers[0]!.challenge).toBe('Kill 100 enemies with the Felarx.');
    expect(tiers[2]!.perks.map((p) => p.name)).toContain('Dual-Mode Chamber');
    // Enemy templates ({{E|…}}) read as their word.
    const onos = parseEvolutions(page('onos'), 'Onos')!['Onos']!;
    expect(onos[2]!.challenge).toMatch(/Scathing and Mocking Whispers/);
    // Every challenge ends with a full stop, whatever the wiki wrote.
    expect(onos.every((t) => t.challenge === null || /[.!?)]$/.test(t.challenge))).toBe(true);
  });

  it('returns null without an Evolutions table', () => {
    expect(parseEvolutions('== Acquisition ==\nNothing here.', 'Lex')).toBeNull();
  });
});

describe('buildIncarnon and nativeIncarnonPages', () => {
  it('keys versions by name, links the page, and lists what it skipped', () => {
    const file = buildIncarnon(
      [
        { title: 'Felarx', kind: 'native', ownName: 'Felarx', wikitext: page('felarx') },
        { title: 'Broken Page', kind: 'genesis', ownName: 'Broken', wikitext: 'no table' },
      ],
      new Date('2026-11-15T12:00:00.000Z'),
    );
    expect(file.weapons['Felarx']).toMatchObject({
      kind: 'native',
      page: 'https://wiki.warframe.com/w/Felarx',
    });
    expect(file.skipped).toEqual(['Broken Page']);
  });

  it('finds weapons whose traits include Incarnon', () => {
    const module = parseLuaData(`return {
      Felarx = { Name = "Felarx", Traits = { "Zariman", "Incarnon" } },
      Braton = { Name = "Braton", Traits = { "Tenno" } },
    }`);
    expect(nativeIncarnonPages([module])).toEqual([{ name: 'Felarx', page: 'Felarx' }]);
  });
});
