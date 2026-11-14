import type { WorldstateCards } from '@warframehub/shared';
import { describe, expect, it } from 'vitest';
import { GameNames } from './game-names.js';
import { RotationNames } from './rotation-names.js';

const text = {
  nightwave: { Executioner: { title: 'Verdugo', description: 'Mata 10 enemigos con remates' } },
  archimedea: {
    'Fissure Cascade': { name: 'Cascada de fisuras', description: 'Las fisuras…' },
  },
};
const names = new RotationNames(GameNames.load().data, text);

const card = <T>(data: T) => ({ freshness: 'live' as const, fetchedAt: null, stale: false, data });
const empty = card(null);

function cards(partial: Partial<WorldstateCards>): WorldstateCards {
  return {
    archonHunt: empty,
    sortie: empty,
    steelPath: empty,
    dailyDeals: empty,
    voidTrader: empty,
    nightwave: empty,
    events: empty,
    arbitration: empty,
    duviriCycle: empty,
    archimedeas: empty,
    ...partial,
  };
}

describe('RotationNames', () => {
  it('names nodes, relays and mission types as the game does', () => {
    expect(names.node('Ara (Mars)')).toBe('Ara (Marte)');
    expect(names.node('Orcus Relay (Pluto)')).toBe('Repetidor Orcus (Plutón)');
    expect(names.node('Somewhere')).toBe('Somewhere');
    expect(names.missionType('Extermination')).toBe('Exterminio');
    expect(names.missionType('Mobile Defense')).toBe('Defensa móvil');
  });

  it('names rewards, with amounts and blueprints', () => {
    expect(names.item('Kitgun Riven Mod')).toBe('Mod agrietado de kitgun');
    expect(names.item('Umbra Forma Blueprint')).toBe('Plano de Forma Umbra');
    expect(names.item('50,000 Kuva')).toBe('50.000 de Kuva');
    expect(names.item('3x Forma')).toBe('3x Forma');
    expect(names.item('Something New')).toBe('Something New');
  });

  it('translates every card in Spanish and leaves English alone', () => {
    const input = cards({
      archonHunt: card({
        boss: 'Archon Amar',
        shard: 'Crimson' as const,
        faction: 'Narmer',
        activation: '2026-11-09T00:00:00.000Z',
        expiry: '2026-11-16T00:00:00.000Z',
        missions: [{ type: 'Extermination', node: 'Arval (Mars)' }],
      }),
      sortie: card({
        boss: 'Lech Kril',
        faction: 'Infested',
        activation: '2026-11-13T17:00:00.000Z',
        expiry: '2026-11-14T17:00:00.000Z',
        missions: [
          {
            missionType: 'Rescue',
            node: 'Thon (Ceres)',
            modifier: 'Environmental Hazard: Fire',
            modifierDescription: 'Not a known text',
          },
        ],
      }),
      nightwave: card({
        season: 15,
        activation: '2026-11-09T00:00:00.000Z',
        expiry: '2026-12-09T00:00:00.000Z',
        challenges: [
          {
            title: 'Executioner',
            description: 'Kill 10 Enemies with Finishers',
            reputation: 1000,
            kind: 'daily' as const,
            expiry: '2026-11-14T00:00:00.000Z',
          },
          {
            title: 'Executioner XXI',
            description: 'Kill 99 Enemies with Finishers',
            reputation: 1000,
            kind: 'daily' as const,
            expiry: '2026-11-14T00:00:00.000Z',
          },
        ],
      }),
    });
    const es = names.cards(input, 'es');
    expect(es.archonHunt.data).toMatchObject({
      boss: 'Arconte Amar',
      missions: [{ type: 'Exterminio', node: 'Arval (Marte)' }],
    });
    expect(es.sortie.data!.faction).toBe('Infestados');
    expect(es.sortie.data!.missions[0]).toMatchObject({
      missionType: 'Rescate',
      modifier: 'Peligro ambiental: fuego',
      modifierDescription: 'Not a known text', // unknown: stays in English
    });
    expect(es.nightwave.data!.challenges[0]).toMatchObject({ title: 'Verdugo' });
    expect(es.nightwave.data!.challenges[1]).toMatchObject({
      title: 'Verdugo XXI',
      description: 'Kill 99 Enemies with Finishers',
    });
    expect(names.cards(input, 'en')).toEqual(input);
  });

  it("drops DE's placeholder descriptions in both languages", () => {
    const input = cards({
      nightwave: card({
        season: 18,
        activation: '2026-11-09T00:00:00.000Z',
        expiry: '2026-12-09T00:00:00.000Z',
        challenges: [
          {
            title: 'Season Weekly To Ashes',
            description: '[PH] Season Weekly To Ashes Desc',
            reputation: 4500,
            kind: 'weekly' as const,
            expiry: '2026-11-16T00:00:00.000Z',
          },
        ],
      }),
    });
    for (const lang of ['es', 'en'] as const) {
      expect(names.cards(input, lang).nightwave.data!.challenges[0]!.description).toBe('');
    }
  });
});
