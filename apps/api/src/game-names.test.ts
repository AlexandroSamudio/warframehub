import { describe, expect, it } from 'vitest';
import { GameNames } from './game-names.js';
import type { NamesFile } from './sources/names-es.js';

const file: NamesFile = {
  source: 'test',
  generatedAt: '2026-11-13T00:00:00.000Z',
  names: {
    '/Lotus/Types/Items/MiscItems/OrokinCell': 'Célula orokin',
    '/Lotus/Types/Recipes/WarframeRecipes/NidusPrimeChassisComponent': 'Chasis de Nidus Prime',
  },
  abilities: {},
  warframes: {},
  effects: {},
  parts: { Blueprint: 'Plano', Chassis: 'Chasis', Neuroptics: 'Neurópticas' },
  relics: { 'Axi N12 Relic': 'Reliquia Axi N12' },
  nodes: { 'Eris/Oestrus': 'Eris/Oestrus', 'Mercury/Apollodorus': 'Mercurio/Apolodoro' },
  missionTypes: { 'Infested Salvage': 'Salvamento infestado', Survival: 'Supervivencia' },
  items: { 'Nidus Prime': 'Nidus Prime', 'Plasma Sword': 'Espada de plasma', Nidus: 'Nidus' },
};
const names = new GameNames(file, { 'Damage: 300': 'Daño: 300' });

describe('GameNames', () => {
  it('splits part names into part and item', () => {
    expect(names.compound('Nidus Prime Chassis')).toBe('Chasis de Nidus Prime');
    expect(names.compound('Nidus Prime Blueprint')).toBe('Plano de Nidus Prime');
    expect(names.compound('Nidus Prime Neuroptics Blueprint')).toBe(
      'Plano de neurópticas de Nidus Prime',
    );
    expect(names.compound('Plasma Sword')).toBe('Espada de plasma');
    expect(names.compound('Something Else')).toBe('Something Else');
  });

  it('names resources by key, with Credits as the game words it', () => {
    expect(names.component('/Lotus/Types/Items/MiscItems/OrokinCell', 'Orokin Cell')).toBe(
      'Célula orokin',
    );
    expect(names.component('credits', 'Credits')).toBe('Créditos');
    expect(names.component('/unknown', 'Nidus Prime Chassis')).toBe('Chasis de Nidus Prime');
  });

  it('translates drop locations: nodes, mission types, rotations, relics', () => {
    expect(names.location('Eris/Oestrus (Infested Salvage), Rotation C')).toBe(
      'Eris/Oestrus (Salvamento infestado), Rotación C',
    );
    expect(names.location('Mercury/Apollodorus (Survival)')).toBe(
      'Mercurio/Apolodoro (Supervivencia)',
    );
    expect(names.location('Axi N12 Relic (Radiant)')).toBe('Reliquia Axi N12 (Radiante)');
    expect(names.location('Axi N12 Relic')).toBe('Reliquia Axi N12');
    expect(names.location('Demolisher Bailiff')).toBe('Demolisher Bailiff');
    expect(names.location('The Icebind: Crested Frozen Chests, Rotation B')).toBe(
      'The Icebind: Crested Frozen Chests, Rotación B',
    );
  });

  it('finds the English name for a Spanish search', () => {
    expect(names.englishFor('espada de')).toEqual(['Plasma Sword']);
    expect(names.englishFor('nidus')).toEqual([]); // the English search finds it already
  });

  it('translates known ability number lines only', () => {
    expect(names.line('Damage: 300')).toBe('Daño: 300');
    expect(names.line('10 / 11 / 13 / 16 m')).toBe('10 / 11 / 13 / 16 m');
  });

  it('leaves English answers alone', () => {
    const list = { warframes: [], fetchedAt: '', stale: false, nextRefreshAt: null };
    expect(names.warframes(list, 'en')).toBe(list);
  });
});

describe('names-es.json', () => {
  it('loads the committed file', () => {
    const real = GameNames.load();
    expect(real.compound('Mesa Prime Chassis')).toBe('Chasis de Mesa Prime');
    expect(real.spanishOf('/Lotus/Powersuits/Cowgirl/MesaPrime')).toBe('Mesa Prime');
  });
});
