import { z } from 'zod';
import { effectText } from './build-data.js';

/**
 * The game's own Spanish (SPEC §8.3, PR 2): names, descriptions, passives and effects from
 * DE's public export (`_es` files, matched to the English ones by `uniqueName`), saved by
 * `npm run update-names` in `apps/api/data/names-es.json`. The app never calls DE.
 */

export const NamesFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** Items by `uniqueName`: Warframes, weapons, Warframe mods, arcanes, resources. */
  names: z.record(z.string(), z.string()),
  /** Abilities by `uniqueName`. */
  abilities: z.record(z.string(), z.object({ name: z.string(), description: z.string() })),
  /** Warframes by `uniqueName`: description and passive (with its numbers filled in). */
  warframes: z.record(
    z.string(),
    z.object({ description: z.string(), passive: z.string().nullable() }),
  ),
  /** Mod and arcane effects by `uniqueName`, one string per rank (lines joined by "\n"). */
  effects: z.record(z.string(), z.array(z.string())),
  /** Short part words: "Chassis" → "Chasis", "Blueprint" → "Plano". */
  parts: z.record(z.string(), z.string()),
  /** Relics by English name: "Axi N12 Relic" → "Reliquia Axi N12". */
  relics: z.record(z.string(), z.string()),
  /** Star chart nodes: "Mercury/Apollodorus" → "Mercurio/Apolodoro". */
  nodes: z.record(z.string(), z.string()),
  /** Mission types: "Exterminate" → "Exterminio" (Spanish wiki titles). */
  missionTypes: z.record(z.string(), z.string()),
  /**
   * Warframes and weapons by English name → Spanish name ("Nidus Prime" → "Nidus Prime"),
   * for part names ("Nidus Prime Chassis") and for searching in Spanish.
   */
  items: z.record(z.string(), z.string()),
});
export type NamesFile = z.infer<typeof NamesFile>;

// ---- reading the export -----------------------------------------------------------

const Named = z.looseObject({ uniqueName: z.string(), name: z.string().optional() });
const ExportFile = z.record(z.string(), z.unknown());

type Entry = z.infer<typeof Named> & Record<string, unknown>;

/** Every `{ uniqueName, … }` object in one export file, by `uniqueName`. */
function byUnique(file: unknown, ...keys: string[]): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const parsed = ExportFile.parse(file);
  for (const key of keys) {
    const list = parsed[key];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const item = Named.safeParse(raw);
      if (item.success) out.set(item.data.uniqueName, item.data as Entry);
    }
  }
  return out;
}

/** "<SHARD_RED_SIMPLE> Fragmento" → "Fragmento"; game colour tags go. */
export function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fills a Spanish passive's blanks ("|SPEED|") with the numbers the English wiki gives.
 * The English export passive has the same blanks: lined up with the wiki text it tells
 * which number goes in each. Returns null when they can't be lined up for sure.
 */
export function fillPassive(
  esPassive: string,
  enPassive: string,
  wikiPassive: string,
): string | null {
  const blank = /\|([A-Z_0-9]+)\|/g;
  const esText = clean(esPassive);
  if (!blank.test(esText)) return esText;
  const enText = clean(enPassive);
  const wiki = clean(wikiPassive);
  const names = [...enText.matchAll(/\|([A-Z_0-9]+)\|/g)].map((m) => m[1]!);
  const values = new Map<string, string>();

  // 1) Line the English export text up with the wiki text, blank by blank.
  const parts = enText.split(/\|[A-Z_0-9]+\|/);
  const pattern = parts
    .map((p, i) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (i < parts.length - 1 ? '(.+?)' : ''))
    .join('');
  const lined = new RegExp(`^${pattern}$`, 'is').exec(wiki);
  if (lined) {
    names.forEach((name, i) => {
      const number = /[+-]?\d+(?:[.,]\d+)?/.exec(lined[i + 1] ?? '')?.[0];
      if (number && !values.has(name)) values.set(name, number);
    });
  }
  // 2) Otherwise, the wiki's numbers in order, when there's exactly one per blank.
  if (values.size < new Set(names).size) {
    const numbers = wiki.match(/[+-]?\d+(?:[.,]\d+)?/g) ?? [];
    if (numbers.length !== names.length) return null;
    names.forEach((name, i) => values.set(name, numbers[i]!));
  }
  let missing = false;
  const filled = esText.replace(blank, (_m, name: string) => {
    const v = values.get(name);
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : filled;
}

/** A mod's or arcane's effect per rank, cleaned like the English ones (`effectText`). */
function effectsOf(entry: Entry | undefined): string[] | null {
  const stats = entry?.levelStats;
  if (!Array.isArray(stats)) return null;
  return stats.map((level) =>
    effectText(
      Array.isArray((level as { stats?: unknown }).stats)
        ? (level as { stats: string[] }).stats
        : [],
    ),
  );
}

export interface ExportPair {
  en: unknown;
  es: unknown;
}

export interface NamesInput {
  warframes: ExportPair;
  upgrades: ExportPair;
  arcanes: ExportPair;
  weapons: ExportPair;
  resources: ExportPair;
  recipes: unknown;
  regions: ExportPair;
  /** The English wiki's passives with numbers, by the Warframe's `uniqueName`. */
  wikiPassives: Record<string, string | null>;
  /** Hand translations for passives the numbers can't be lined up for. */
  passiveOverrides: Record<string, string>;
  missionTypes: Record<string, string>;
}

/** Recipe result folders whose ingredients the app shows (Warframes, weapons, their parts). */
const SHOWN_RECIPES = ['/Lotus/Types/Recipes/WarframeRecipes/', '/Lotus/Types/Recipes/Weapons/'];

export function buildSpanishNames(
  input: NamesInput,
  generatedAt: Date,
): {
  file: NamesFile;
  unfilledPassives: string[];
} {
  const frames = {
    en: byUnique(input.warframes.en, 'ExportWarframes'),
    es: byUnique(input.warframes.es, 'ExportWarframes'),
  };
  const mods = {
    en: byUnique(input.upgrades.en, 'ExportUpgrades'),
    es: byUnique(input.upgrades.es, 'ExportUpgrades'),
  };
  const arcanes = {
    en: byUnique(input.arcanes.en, 'ExportRelicArcane'),
    es: byUnique(input.arcanes.es, 'ExportRelicArcane'),
  };
  const weapons = {
    en: byUnique(input.weapons.en, 'ExportWeapons'),
    es: byUnique(input.weapons.es, 'ExportWeapons'),
  };
  const resources = {
    en: byUnique(input.resources.en, 'ExportResources'),
    es: byUnique(input.resources.es, 'ExportResources'),
  };
  const regions = {
    en: byUnique(input.regions.en, 'ExportRegions'),
    es: byUnique(input.regions.es, 'ExportRegions'),
  };

  const names: Record<string, string> = {};
  const items: Record<string, string> = {};
  const name = (map: Map<string, Entry>, u: string) => {
    const n = map.get(u)?.name;
    return n ? clean(n) : null;
  };

  // Warframes: names, descriptions, passives; their abilities.
  const warframes: NamesFile['warframes'] = {};
  const abilities: NamesFile['abilities'] = {};
  const unfilledPassives: string[] = [];
  for (const [u, es] of frames.es) {
    const en = frames.en.get(u);
    const esName = name(frames.es, u);
    if (esName) names[u] = esName;
    if (esName && en?.name) items[clean(en.name)] = esName;
    const esPassive = typeof es.passiveDescription === 'string' ? es.passiveDescription : '';
    let passive: string | null = null;
    if (input.passiveOverrides[u]) passive = input.passiveOverrides[u];
    else if (esPassive) {
      const wiki = input.wikiPassives[u];
      const enPassive = typeof en?.passiveDescription === 'string' ? en.passiveDescription : '';
      passive = /\|[A-Z_0-9]+\|/.test(esPassive)
        ? wiki
          ? fillPassive(esPassive, enPassive, wiki)
          : null
        : clean(esPassive);
      if (passive === null && /\|[A-Z_0-9]+\|/.test(esPassive)) unfilledPassives.push(u);
    }
    warframes[u] = {
      description: typeof es.description === 'string' ? clean(es.description) : '',
      passive,
    };
    const list = Array.isArray(es.abilities) ? es.abilities : [];
    for (const a of list as {
      abilityUniqueName?: string;
      abilityName?: string;
      description?: string;
    }[]) {
      if (!a.abilityUniqueName || !a.abilityName) continue;
      abilities[a.abilityUniqueName] = {
        name: clean(a.abilityName),
        description: clean(a.description ?? ''),
      };
    }
  }
  // Helminth's own abilities live under ExportAbilities.
  for (const [u, a] of byUnique(input.warframes.es, 'ExportAbilities')) {
    const n = typeof a.abilityName === 'string' ? a.abilityName : a.name;
    if (!n || abilities[u]) continue;
    abilities[u] = {
      name: clean(n),
      description: typeof a.description === 'string' ? clean(a.description) : '',
    };
  }

  // Warframe mods and arcanes: names and effects per rank.
  const effects: NamesFile['effects'] = {};
  for (const [u, es] of mods.es) {
    const type = typeof es.type === 'string' ? es.type : '';
    if (type !== 'WARFRAME' && type !== 'AURA') continue;
    const n = name(mods.es, u);
    if (n) names[u] = n;
    const e = effectsOf(es);
    if (e) effects[u] = e;
  }
  const relics: NamesFile['relics'] = {};
  for (const [u, es] of arcanes.es) {
    const en = arcanes.en.get(u);
    const esName = name(arcanes.es, u);
    const enName = en?.name ? clean(en.name) : null;
    if (!esName || !enName) continue;
    if (/ Relic$/.test(enName)) {
      relics[enName] = esName;
      continue;
    }
    names[u] = esName;
    const e = effectsOf(es);
    if (e) effects[u] = e;
  }

  // Weapons the goal planner and builds use: names, plus search.
  for (const u of weapons.es.keys()) {
    const en = weapons.en.get(u);
    const esName = name(weapons.es, u);
    if (!esName) continue;
    names[u] = esName;
    if (en?.name) items[clean(en.name)] = esName;
  }

  // Resources that recipes for Warframes, weapons and their parts use, and the parts.
  const recipeList = byUnique(input.recipes, 'ExportRecipes');
  const used = new Set<string>();
  for (const r of recipeList.values()) {
    const result = typeof r.resultType === 'string' ? r.resultType : '';
    const shown =
      SHOWN_RECIPES.some((p) => result.startsWith(p)) ||
      frames.es.has(result) ||
      weapons.es.has(result);
    if (!shown) continue;
    used.add(result);
    for (const ing of (Array.isArray(r.ingredients) ? r.ingredients : []) as {
      ItemType?: string;
    }[]) {
      if (ing.ItemType) used.add(ing.ItemType);
    }
  }
  const partVotes = new Map<string, Map<string, number>>();
  for (const u of used) {
    const esName = name(resources.es, u);
    const enName = name(resources.en, u);
    if (!esName) continue;
    names[u] = esName;
    // "<Item> <Part>" / "<Part> de <Item>" teaches the short part word ("Chasis").
    const m = /^(.+?) de (.+)$/.exec(esName);
    if (m && enName) {
      const item = m[2]!;
      const enItem = [...frames.es.entries(), ...weapons.es.entries()].find(
        ([, e]) => clean(e.name ?? '') === item,
      );
      const enItemName = enItem
        ? (name(frames.en, enItem[0]) ?? name(weapons.en, enItem[0]))
        : null;
      if (enItemName && enName.startsWith(`${enItemName} `)) {
        const enPart = enName.slice(enItemName.length + 1);
        const votes = partVotes.get(enPart) ?? new Map<string, number>();
        votes.set(m[1]!, (votes.get(m[1]!) ?? 0) + 1);
        partVotes.set(enPart, votes);
      }
    }
  }
  const parts: NamesFile['parts'] = { Blueprint: 'Plano' };
  for (const [enPart, votes] of partVotes) {
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) parts[enPart] = best[0];
  }

  // Star chart nodes: "Planet/Node".
  const nodes: NamesFile['nodes'] = {};
  for (const [u, en] of regions.en) {
    const es = regions.es.get(u);
    const enKey = `${String(en.systemName ?? '')}/${String(en.name ?? '')}`;
    if (!es || !en.name || !en.systemName) continue;
    nodes[clean(enKey)] = clean(`${String(es.systemName ?? '')}/${String(es.name ?? '')}`);
  }

  return {
    file: {
      source:
        "DE's public export (content.warframe.com, _en and _es files), the English Warframe wiki's numbers for passives, and the Spanish wiki's mission-type titles",
      generatedAt: generatedAt.toISOString(),
      names,
      abilities,
      warframes,
      effects,
      parts,
      relics,
      nodes,
      missionTypes: input.missionTypes,
      items,
    },
    unfilledPassives,
  };
}
