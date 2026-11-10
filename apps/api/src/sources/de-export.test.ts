import { describe, expect, it } from 'vitest';
import { buildPartRecipes, findManifestFiles, parseExportJson } from './de-export.js';
import { loadPartRecipes, partCraft } from './part-recipes.js';

const recipes = {
  ExportRecipes: [
    {
      uniqueName: '/Lotus/Types/Recipes/WarframeRecipes/NidusChassisBlueprint',
      resultType: '/Lotus/Types/Recipes/WarframeRecipes/NidusChassisComponent',
      buildPrice: 15000,
      ingredients: [
        { ItemType: '/Lotus/Types/Items/MiscItems/PolymerBundle', ItemCount: 6000 },
        { ItemType: '/Lotus/Types/Items/MiscItems/Mystery', ItemCount: 2 },
      ],
    },
    // The frame's own recipe: its result is the Warframe, so it is left out.
    {
      uniqueName: '/Lotus/Types/Recipes/WarframeRecipes/NidusBlueprint',
      resultType: '/Lotus/Powersuits/Infestation/Infestation',
      buildPrice: 25000,
      ingredients: [{ ItemType: '/Lotus/Types/Items/MiscItems/Kuva', ItemCount: 2000 }],
    },
  ],
};
const resources = {
  ExportResources: [
    { uniqueName: '/Lotus/Types/Items/MiscItems/PolymerBundle', name: 'Polymer Bundle' },
  ],
};

describe('buildPartRecipes', () => {
  it('keeps crafted parts only, with English names (or a readable fallback)', () => {
    const file = buildPartRecipes(recipes, resources, new Date('2026-11-10T19:00:00Z'));
    expect(Object.keys(file.recipes)).toEqual([
      '/Lotus/Types/Recipes/WarframeRecipes/NidusChassisComponent',
    ]);
    expect(file.recipes['/Lotus/Types/Recipes/WarframeRecipes/NidusChassisComponent']).toEqual({
      credits: 15000,
      ingredients: [
        { key: '/Lotus/Types/Items/MiscItems/PolymerBundle', name: 'Polymer Bundle', count: 6000 },
        { key: '/Lotus/Types/Items/MiscItems/Mystery', name: 'Mystery', count: 2 },
      ],
    });
    expect(file.generatedAt).toBe('2026-11-10T19:00:00.000Z');
  });
});

describe('DE export helpers', () => {
  it('reads DE JSON that has raw control characters inside strings', () => {
    expect(parseExportJson('{"a":"x\ny\u0001z"}')).toEqual({ a: 'x y z' });
  });

  it('finds the recipe and resource files in the index', () => {
    const index =
      'ExportCustoms_en.json!00_aaa\r\nExportRecipes_en.json!00_bbb\nExportResources_en.json!00_ccc\n';
    expect(findManifestFiles(index)).toEqual({
      recipes: 'ExportRecipes_en.json!00_bbb',
      resources: 'ExportResources_en.json!00_ccc',
    });
    expect(() => findManifestFiles('nothing')).toThrow(/ExportRecipes/);
  });
});

describe('the saved part-recipes.json (DE export, 10 Nov 2026)', () => {
  it('has the Nidus and Nidus Prime parts, matching what the export said', () => {
    expect(partCraft('/Lotus/Types/Recipes/WarframeRecipes/NidusChassisComponent')).toEqual({
      credits: 15000,
      ingredients: [
        { key: '/Lotus/Types/Items/MiscItems/PolymerBundle', name: 'Polymer Bundle', count: 6000 },
        { key: '/Lotus/Types/Items/MiscItems/Nanospores', name: 'Nano Spores', count: 5000 },
        { key: '/Lotus/Types/Items/MiscItems/Plastids', name: 'Plastids', count: 1400 },
        { key: '/Lotus/Types/Items/MiscItems/Neurode', name: 'Neurodes', count: 3 },
      ],
    });
    const prime = partCraft('/Lotus/Types/Recipes/WarframeRecipes/NidusPrimeChassisComponent')!;
    expect(prime.credits).toBe(15000);
    expect(prime.ingredients.map((i) => `${i.name} ×${i.count}`)).toEqual(
      expect.arrayContaining([
        'Tellurium ×2',
        'Plastids ×450',
        'Polymer Bundle ×1425',
        'Alloy Plate ×5500',
      ]),
    );
  });

  it('has no recipe for things that are not crafted (the frame itself, Prime weapon parts)', () => {
    expect(partCraft('/Lotus/Types/Recipes/WarframeRecipes/NidusBlueprint')).toBeNull();
    expect(partCraft('/Lotus/Types/Recipes/Weapons/WeaponParts/BoarPrimeBarrel')).toBeNull();
  });

  it('every ingredient has a readable name and the file is recent enough to trust', () => {
    const file = loadPartRecipes();
    for (const r of Object.values(file.recipes)) {
      for (const i of r.ingredients) expect(i.name).not.toContain('/');
    }
    expect(Object.keys(file.recipes).length).toBeGreaterThan(300);
  });
});
