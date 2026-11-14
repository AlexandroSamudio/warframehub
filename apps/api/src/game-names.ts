import { existsSync, readFileSync } from 'node:fs';
import {
  shardStat,
  shardText,
  type ArcaneOption,
  type BuildOptionsResponse,
  type BuildView,
  type GoalsResponse,
  type HelminthOption,
  type ItemDrop,
  type ItemRecipe,
  type ItemSearchResult,
  type Language,
  type ModOption,
  type RecipeComponent,
  type ResolvedSlot,
  type Shortfall,
  type WarframeDetail,
  type WarframesResponse,
} from '@warframehub/shared';
import { z } from 'zod';
import { withContentNames } from './db/builds.js';
import { NamesFile } from './sources/names-es.js';

/**
 * Game data in the user's language (SPEC §8.3). Everything is fetched and stored in
 * English; these functions swap in the game's own Spanish (names-es.json, from DE's export)
 * on the way out. English answers pass through untouched. Anything with no Spanish name
 * (an enemy, a quest) stays in English.
 */

const NAMES_FILE = new URL('../data/names-es.json', import.meta.url);
/** Ability number lines ("Damage: 300 / 400 / 500") translated once, `{ en: es }`. */
const LINES_FILE = new URL('../data/ability-lines-es.json', import.meta.url);

const REFINEMENTS: Record<string, string> = {
  Intact: 'Intacta',
  Exceptional: 'Excepcional',
  Flawless: 'Perfecta',
  Radiant: 'Radiante',
};

/** What an ability costs ("25 energy"), our own words (the wiki data has these four). */
const COST_TYPES: Record<string, string> = {
  energy: 'energía',
  shield: 'escudo',
  mutation: 'mutación',
  time: 'tiempo',
};

/**
 * Syndicates that sell augments: not in DE's export, so the Spanish wiki's page titles
 * (checked 13 Nov 2026; docs/GLOSSARY-es.md).
 */
const SYNDICATES: Record<string, string> = {
  'Arbiters of Hexis': 'Árbitros de Hexis',
  'Cephalon Suda': 'Céfalon Suda',
  'New Loka': 'Nuevo Loka',
  'Red Veil': 'Velo Rojo',
  'Steel Meridian': 'Meridiano de Acero',
  'The Perrin Sequence': 'La Secuencia Perrin',
};

/** Credits: the game's own word ("Créditos"), not a resource in the export. */
const CREDITS_ES = 'Créditos';

export class GameNames {
  private readonly es: NamesFile;
  private readonly lines: Record<string, string>;
  /** Item English names, longest first, for "Nidus Prime Chassis" → item + part. */
  private readonly itemsByLength: string[];
  /** Lowercase Spanish name → English name, for search. */
  private readonly searchIndex: [string, string][];

  constructor(es: NamesFile, lines: Record<string, string> = {}) {
    this.es = es;
    this.lines = lines;
    this.itemsByLength = Object.keys(es.items).sort((a, b) => b.length - a.length);
    this.searchIndex = Object.entries(es.items).map(([en, sp]) => [sp.toLowerCase(), en]);
  }

  /** Reads the files in `apps/api/data` (built into dist the same way). */
  static load(): GameNames {
    const es = NamesFile.parse(JSON.parse(readFileSync(NAMES_FILE, 'utf8')));
    const lines = existsSync(LINES_FILE)
      ? z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(LINES_FILE, 'utf8')))
      : {};
    return new GameNames(es, lines);
  }

  // ---- single names ----------------------------------------------------------------

  /** An item by `uniqueName`, else by English name, else unchanged. */
  item(uniqueName: string | null, en: string): string {
    return (uniqueName ? this.es.names[uniqueName] : undefined) ?? this.es.items[en] ?? en;
  }

  /** A part word: "Chassis" → "Chasis". */
  part(en: string): string {
    return this.es.parts[en] ?? en;
  }

  /**
   * A part with its item, "Nidus Prime Chassis" → "Chasis de Nidus Prime",
   * "Nidus Prime Blueprint" → "Plano de Nidus Prime". Unchanged when it can't be split.
   */
  compound(en: string): string {
    if (this.es.items[en]) return this.es.items[en];
    for (const item of this.itemsByLength) {
      if (!en.startsWith(`${item} `)) continue;
      const rest = en.slice(item.length + 1);
      const part = this.es.parts[rest];
      if (part) return `${part} de ${this.es.items[item]}`;
      // "Chassis Blueprint": the part's blueprint.
      const bp = /^(.+) Blueprint$/.exec(rest);
      if (bp && this.es.parts[bp[1]!]) {
        return `Plano de ${this.es.parts[bp[1]!]!.toLowerCase()} de ${this.es.items[item]}`;
      }
    }
    return en;
  }

  /** A resource or part by key, else its English name split as a part. */
  component(key: string, en: string): string {
    if (key === 'credits') return CREDITS_ES;
    return this.es.names[key] ?? this.compound(en);
  }

  /**
   * A drop location: "Eris/Oestrus (Infested Salvage), Rotation C" →
   * "Eris/Oestrus (Salvamento infestado), Rotación C"; "Axi N12 Relic (Radiant)" →
   * "Reliquia Axi N12 (Radiante)". Enemies and other places stay as they are.
   */
  location(en: string): string {
    const relic = /^(.+ Relic)(?: \((\w+)\))?$/.exec(en);
    if (relic) {
      const name = this.es.relics[relic[1]!] ?? relic[1]!;
      const refinement = relic[2] ? (REFINEMENTS[relic[2]] ?? relic[2]) : null;
      return refinement ? `${name} (${refinement})` : name;
    }
    const rotation = /^(.*), Rotation ([A-Z])$/.exec(en);
    const place = rotation ? rotation[1]! : en;
    const node = /^([^/()]+\/[^()]+?) \(([^)]+)\)$/.exec(place);
    let out = place;
    if (node) {
      const where = this.es.nodes[node[1]!] ?? node[1]!;
      const type = this.es.missionTypes[node[2]!] ?? node[2]!;
      out = `${where} (${type})`;
    }
    return rotation ? `${out}, Rotación ${rotation[2]}` : out;
  }

  /** An ability number line, when it was translated. */
  line(en: string): string {
    return this.lines[en] ?? en;
  }

  /** English names whose Spanish name contains the query (and the English one doesn't). */
  englishFor(query: string, limit = 3): string[] {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    // Names that start with the query first, then the shortest (closest) ones.
    const hits = this.searchIndex
      .filter(([es, en]) => es.includes(q) && !en.toLowerCase().includes(q))
      .sort(([a], [b]) => Number(b.startsWith(q)) - Number(a.startsWith(q)) || a.length - b.length);
    return [...new Set(hits.map(([, en]) => en))].slice(0, limit);
  }

  /** The Spanish name, for search aliases ("Plasma Sword" → "espada de plasma"). */
  spanishOf(uniqueName: string): string | undefined {
    return this.es.names[uniqueName];
  }

  // ---- whole responses ---------------------------------------------------------------

  /**
   * Places only: relic drops stay as the data words them, since the web groups them by
   * relic and labels the refinements itself (apps/web/src/lib/goals.ts).
   */
  private drops(drops: ItemDrop[]): ItemDrop[] {
    return drops.map((d) => (d.relic ? d : { ...d, location: this.location(d.location) }));
  }

  private resource(r: RecipeComponent): RecipeComponent {
    return { ...r, name: this.component(r.key, r.name), drops: this.drops(r.drops) };
  }

  private shortfall(s: Shortfall): Shortfall {
    return { ...s, name: this.component(s.key, s.name) };
  }

  recipe(r: ItemRecipe, lang: Language): ItemRecipe {
    if (lang === 'en') return r;
    return {
      ...r,
      name: this.item(r.uniqueName, r.name),
      parts: r.parts.map((p) => ({
        ...p,
        name: this.part(p.name),
        drops: this.drops(p.drops),
        craft: p.craft && {
          ...p.craft,
          ingredients: p.craft.ingredients.map((i) => ({
            ...i,
            name: this.component(i.key, i.name),
          })),
        },
      })),
      resources: r.resources.map((x) => this.resource(x)),
    };
  }

  searchResults(results: ItemSearchResult[], lang: Language): ItemSearchResult[] {
    if (lang === 'en') return results;
    return results.map((r) => ({ ...r, name: this.item(r.uniqueName, r.name) }));
  }

  goals(g: GoalsResponse, lang: Language): GoalsResponse {
    if (lang === 'en') return g;
    const goalName = new Map<number, string>();
    const goal = (x: GoalsResponse['active'][number]) => {
      const name = this.item(x.uniqueName, x.name);
      goalName.set(x.id, name);
      return {
        ...x,
        name,
        parts: x.parts.map((p) => ({
          ...p,
          name: this.part(p.name),
          drops: this.drops(p.drops),
          craft: p.craft && {
            ...p.craft,
            ingredients: p.craft.ingredients.map((i) => ({
              ...i,
              name: this.component(i.key, i.name),
            })),
          },
          craftShort: p.craftShort.map((s) => this.shortfall(s)),
        })),
        resources: x.resources.map((r) => ({ ...r, ...this.resource(r) })),
        buildShort: x.buildShort.map((s) => this.shortfall(s)),
      };
    };
    const active = g.active.map(goal);
    const built = g.built.map(goal);
    return {
      active,
      built,
      shoppingList: g.shoppingList.map((row) => ({
        ...row,
        name: this.component(row.key, row.name),
        goals: row.goals.map((x) => ({ ...x, name: goalName.get(x.id) ?? x.name })),
      })),
      stock: g.stock.map((s) => ({ ...s, name: this.component(s.key, s.name) })),
      partStock: g.partStock.map((p) => ({ ...p, name: this.component(p.key, p.name) })),
      undo: g.undo && { ...g.undo, name: this.compound(g.undo.name) },
    };
  }

  warframes(list: WarframesResponse, lang: Language): WarframesResponse {
    if (lang === 'en') return list;
    return {
      ...list,
      warframes: list.warframes.map((w) => ({
        ...w,
        name: this.item(null, w.name),
        variants: w.variants.map((v) => ({ ...v, name: this.item(null, v.name) })),
      })),
    };
  }

  private slot(s: ResolvedSlot | null): ResolvedSlot | null {
    if (!s) return null;
    const effects = this.es.effects[s.uniqueName];
    return {
      ...s,
      name: this.es.names[s.uniqueName] ?? s.name,
      effect: effects ? (effects[Math.min(s.rank, effects.length - 1)] ?? s.effect) : s.effect,
    };
  }

  private abilityName(uniqueName: string, en: string): string {
    return this.es.abilities[uniqueName]?.name ?? en;
  }

  /** Helminth's "from": a Warframe's name, or Helminth itself. */
  private from(en: string): string {
    return en === 'Helminth' ? 'Helminto' : this.item(null, en);
  }

  build(b: BuildView, lang: Language): BuildView {
    if (lang === 'en') return b;
    return withContentNames({
      ...b,
      aura: this.slot(b.aura),
      exilus: this.slot(b.exilus),
      slots: b.slots.map((s) => this.slot(s)),
      arcanes: b.arcanes.map((s) => this.slot(s)),
      shards: b.shards.map((s) => {
        const stat = shardStat(s.stat);
        return stat ? { ...s, text: shardText(stat, s.tauforged, 'es') } : s;
      }),
      weapons: b.weapons.map((w) => ({ ...w, name: this.item(w.uniqueName, w.name) })),
      helminth: b.helminth && {
        ...b.helminth,
        name: this.abilityName(b.helminth.uniqueName, b.helminth.name),
        from: b.helminth.from && this.from(b.helminth.from),
      },
    });
  }

  private option<T extends ModOption | ArcaneOption>(o: T): T {
    const name = this.es.names[o.uniqueName];
    return {
      ...o,
      name: name ?? o.name,
      alias: name && name !== o.name ? o.name : null,
      effects: this.es.effects[o.uniqueName] ?? o.effects,
    };
  }

  /** The edit page's choices. Each renamed one keeps its English name as `alias` for search. */
  buildOptions(
    o: BuildOptionsResponse,
    lang: Language,
    abilityIds: string[],
  ): BuildOptionsResponse {
    if (lang === 'en') return o;
    return {
      ...o,
      buildsVariant: this.item(null, o.buildsVariant),
      abilities: o.abilities.map((a, i) => ({
        ...a,
        name: this.abilityName(abilityIds[i] ?? '', a.name),
      })),
      mods: o.mods.map((m) => this.option(m)),
      arcanes: o.arcanes.map((a) => this.option(a)),
      helminth: o.helminth.map((h): HelminthOption => {
        const name = this.abilityName(h.uniqueName, h.name);
        return { ...h, name, from: this.from(h.from), alias: name !== h.name ? h.name : null };
      }),
    };
  }

  /**
   * The Warframe page. `mods` are the catalogue's mods: augments are matched to them by
   * English name, since the augment list doesn't carry a `uniqueName`.
   */
  warframe(d: WarframeDetail, lang: Language, mods: ModOption[]): WarframeDetail {
    if (lang === 'en') return d;
    const abilityEs = new Map<string, string>();
    const variants = d.variants.map((v) => {
      const frame = this.es.warframes[v.uniqueName];
      return {
        ...v,
        name: this.item(v.uniqueName, v.name),
        description: frame?.description || v.description,
        passive: frame?.passive ?? v.passive,
        abilities: v.abilities.map((a) => {
          const es = this.es.abilities[a.uniqueName];
          if (es) abilityEs.set(a.name, es.name);
          return {
            ...a,
            name: es?.name ?? a.name,
            description: es?.description || a.description,
            numbers: a.numbers && {
              ...a.numbers,
              costType: COST_TYPES[a.numbers.costType] ?? a.numbers.costType,
              strength: a.numbers.strength.map((l) => this.line(l)),
              duration: a.numbers.duration.map((l) => this.line(l)),
              range: a.numbers.range.map((l) => this.line(l)),
              misc: a.numbers.misc.map((l) => this.line(l)),
            },
          };
        }),
        recipe: v.recipe && this.recipe(v.recipe, lang),
      };
    });
    const augmentIds = new Map(
      mods.filter((m) => m.augmentFor !== null).map((m) => [m.name, m.uniqueName]),
    );
    return {
      ...d,
      name: this.item(null, d.name),
      buildsVariant: this.item(null, d.buildsVariant),
      augmentShops: d.augmentShops.map((shop) => SYNDICATES[shop] ?? shop),
      variants,
      augments: d.augments.map((a) => {
        const u = augmentIds.get(a.name);
        const effects = u ? this.es.effects[u] : undefined;
        return {
          ...a,
          name: (u && this.es.names[u]) || a.name,
          ability: a.ability && (abilityEs.get(a.ability) ?? a.ability),
          effect: effects?.at(-1) ?? a.effect,
        };
      }),
      builds: d.builds.map((b) => this.build(b, lang)),
    };
  }
}
