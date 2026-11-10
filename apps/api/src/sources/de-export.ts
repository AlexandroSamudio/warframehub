import { PartCraft } from '@warframehub/shared';
import { z } from 'zod';

/**
 * DE's public content export (https://content.warframe.com/PublicExport/), the same data
 * the game's own tools use. We only read the recipe list and the resource names, once,
 * with `npm run update-part-recipes`, and keep a small result in the repo
 * (`apps/api/data/part-recipes.json`). Nothing here runs when the app starts.
 */

export const EXPORT_BASE = 'https://content.warframe.com/PublicExport';

/** Result ids of the recipes we keep: Warframe parts and weapon parts. */
const KEPT_RESULTS = ['/Lotus/Types/Recipes/WarframeRecipes/', '/Lotus/Types/Recipes/Weapons/'];

// ---- the file we keep -------------------------------------------------------

export const PartRecipesFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** Keyed by the crafted part's `uniqueName` (what warframestat.us calls the component). */
  recipes: z.record(z.string(), PartCraft),
});
export type PartRecipesFile = z.infer<typeof PartRecipesFile>;

// ---- reading DE's export ------------------------------------------------------

const RawRecipes = z.object({
  ExportRecipes: z.array(
    z.looseObject({
      uniqueName: z.string(),
      resultType: z.string(),
      buildPrice: z.int().min(0).default(0),
      ingredients: z
        .array(z.looseObject({ ItemType: z.string(), ItemCount: z.int().positive() }))
        .default([]),
    }),
  ),
});

const RawResources = z.object({
  ExportResources: z.array(z.looseObject({ uniqueName: z.string(), name: z.string() })),
});

/**
 * DE's manifest files contain raw control characters inside strings, which strict JSON
 * rejects. They're all whitespace-like or invisible, so they become a space.
 */
export function parseExportJson(text: string): unknown {
  // eslint-disable-next-line no-control-regex
  return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
}

/** "/Lotus/Types/Items/MiscItems/PolymerBundle" → "Polymer Bundle" when DE has no name. */
function nameFromPath(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Part recipes keyed by what they craft. A recipe whose result is a Warframe part or a
 * weapon part is kept; the frame's own recipe (result is the frame) and everything
 * else is left out. Ingredients get their English names from the resource list.
 */
export function buildPartRecipes(
  recipesJson: unknown,
  resourcesJson: unknown,
  generatedAt: Date,
): PartRecipesFile {
  const recipes = RawRecipes.parse(recipesJson).ExportRecipes;
  const names = new Map(
    RawResources.parse(resourcesJson).ExportResources.map((r) => [r.uniqueName, r.name]),
  );
  const out: Record<string, PartCraft> = {};
  for (const r of recipes) {
    if (!KEPT_RESULTS.some((prefix) => r.resultType.startsWith(prefix))) continue;
    // The frame's own recipe has the Warframe itself as its result (under /Lotus/Powersuits),
    // so it never matches these folders; only crafted parts do.
    out[r.resultType] = {
      credits: r.buildPrice,
      ingredients: r.ingredients.map((i) => ({
        key: i.ItemType,
        name: names.get(i.ItemType) ?? nameFromPath(i.ItemType),
        count: i.ItemCount,
      })),
    };
  }
  return {
    source: 'DE public export (content.warframe.com)',
    generatedAt: generatedAt.toISOString(),
    recipes: out,
  };
}

/** The recipe/resource file names (with their content hashes) from DE's index text. */
export function findManifestFiles(indexText: string): { recipes: string; resources: string } {
  const lines = indexText.split(/\r?\n/).filter(Boolean);
  const find = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(`${prefix}_en.json!`));
    if (!line) throw new Error(`DE's index has no ${prefix}_en.json entry`);
    return line;
  };
  return { recipes: find('ExportRecipes'), resources: find('ExportResources') };
}
