import { z } from 'zod';
import { WIKI_BASE, wikiUrl } from './wiki-quests.js';
import { bool, isTable, num, str, strings, type LuaTable, type LuaValue } from './wiki-lua.js';

/**
 * Ability numbers and Warframe passives from the Warframe wiki (SPEC §14):
 * - `Module:Ability/data`: energy cost, cost type, augments, Helminth, channeled, keyed by
 *   the ability's `InternalName` (the same id warframestat.us uses);
 * - each ability page's infobox: strength, duration, range and misc lines by rank;
 * - `Module:Warframes/data`: the passive with its real numbers, the syndicates that sell
 *   the augments, and the rank-30 stats where they differ.
 * `npm run update-ability-stats` reads them into apps/api/data/ability-stats.json (committed).
 * The app never calls the wiki. Only clean lines are kept: anything the reader can't turn
 * into plain text is left out instead of shown half-parsed.
 */

export const AbilityStatsEntry = z.object({
  /** The wiki page, for the credit link. */
  page: z.url(),
  cost: z.number().nullable(),
  /** "energy" unless the wiki says otherwise (e.g. "mutation", "health"). */
  costType: z.string(),
  channeled: z.boolean(),
  /** Helminth can take this ability. */
  subsumable: z.boolean(),
  augments: z.array(z.string()),
  strength: z.array(z.string()),
  duration: z.array(z.string()),
  range: z.array(z.string()),
  misc: z.array(z.string()),
});
export type AbilityStatsEntry = z.infer<typeof AbilityStatsEntry>;

export const WarframeWikiEntry = z.object({
  page: z.url(),
  passive: z.string().nullable(),
  /** Syndicates that sell this Warframe's augments. */
  augmentShops: z.array(z.string()),
  /** Stats the wiki lists separately at rank 30 (only where they differ). */
  rank30: z.record(z.string(), z.number()),
});
export type WarframeWikiEntry = z.infer<typeof WarframeWikiEntry>;

export const AbilityStatsFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** Keyed by the ability's internal name. */
  abilities: z.record(z.string(), AbilityStatsEntry),
  /** Keyed by the Warframe's internal name. */
  warframes: z.record(z.string(), WarframeWikiEntry),
});
export type AbilityStatsFile = z.infer<typeof AbilityStatsFile>;

// ---- wikitext → plain text ---------------------------------------------------------

/** Templates whose last plain argument is the word to show ({{D|Puncture}} → "Puncture"). */
const WORD_TEMPLATES = new Set([
  'd',
  'dt',
  'wf',
  'weapon',
  'resource',
  'm',
  'mod',
  'tt',
  'abilityu',
]);

/**
 * One wikitext value as plain text lines, or null when something is left that the reader
 * doesn't understand (an unknown template, a table): such a line isn't shown.
 */
export function wikiPlain(value: string): string[] | null {
  let s = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');
  // Templates, innermost first.
  for (let guard = 0; guard < 50 && /\{\{[^{}]*\}\}/.test(s); guard++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => {
      const parts = body.split('|').map((p) => p.trim());
      const name = (parts[0] ?? '').toLowerCase();
      if (name === 'stat' && parts.includes('icon=only')) return '';
      if (name === 'stat') return parts[1] ?? '';
      if (WORD_TEMPLATES.has(name)) {
        const args = parts.slice(1).filter((p) => !p.includes('='));
        return args.at(-1) ?? '';
      }
      return '\uE000'; // unknown: mark the line as unreadable
    });
  }
  s = s
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/'''|''/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:u|b|i|sup|sub|small|span)[^>]*>/gi, '');
  s = decodeEntities(s);
  if (/\uE000|\{\{|\}\}|<[a-z]|\{\||&[a-z]+;/i.test(s)) return null;
  return s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  infin: '∞',
  times: '×',
  deg: '°',
  plusmn: '±',
  minus: '−',
  ndash: '–',
  mdash: '—',
};

/** "&infin;" → "∞", "&#37;" → "%". Unknown named entities stay, and the line is dropped. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** The top-level `| key = value` fields of the first `{{Ability…}}` infobox on a page. */
export function infoboxFields(wikitext: string): Record<string, string> {
  const start = wikitext.search(/\{\{\s*Ability/i);
  if (start < 0) return {};
  const fields: Record<string, string> = {};
  let depth = 0;
  let links = 0;
  let current = '';
  for (let i = start; i < wikitext.length; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === '{{') {
      depth++;
      i++;
      if (depth > 1) current += two;
      continue;
    }
    if (two === '}}') {
      depth--;
      i++;
      if (depth === 0) {
        addField(fields, current);
        break;
      }
      current += two;
      continue;
    }
    if (two === '[[') links++;
    if (two === ']]') links = Math.max(0, links - 1);
    const c = wikitext[i]!;
    if (c === '|' && depth === 1 && links === 0) {
      addField(fields, current);
      current = '';
      continue;
    }
    current += c;
  }
  return fields;
}

function addField(fields: Record<string, string>, raw: string) {
  const eq = raw.indexOf('=');
  if (eq < 0) return;
  const key = raw.slice(0, eq).trim().toLowerCase();
  if (/^[a-z0-9_ ]+$/.test(key)) fields[key] = raw.slice(eq + 1).trim();
}

// ---- building the file ---------------------------------------------------------------

function tableOf(v: LuaValue | undefined): LuaTable | null {
  return isTable(v) ? v : null;
}

/** The wiki page an ability lives on (its `Link`, else its name). */
export function abilityPageTitle(ability: LuaTable): string | null {
  return str(ability, 'Link') ?? str(ability, 'Name');
}

/** Every ability of a real Warframe in `Module:Ability/data` (not archived ones). */
export function warframeAbilities(abilityModule: LuaValue): LuaTable[] {
  const all = tableOf(isTable(abilityModule) ? abilityModule.map.Ability : undefined);
  if (!all) return [];
  return Object.values(all.map)
    .map(tableOf)
    .filter((a): a is LuaTable => a !== null && str(a, 'InternalName') !== null);
}

const lines = (fields: Record<string, string>, key: string) => {
  const v = fields[key];
  return v ? (wikiPlain(v) ?? []) : [];
};

export function buildAbilityStats(
  abilityModule: LuaValue,
  warframeModule: LuaValue,
  pages: Record<string, string>,
  generatedAt: Date,
): AbilityStatsFile {
  const abilities: Record<string, AbilityStatsEntry> = {};
  for (const a of warframeAbilities(abilityModule)) {
    const title = abilityPageTitle(a);
    if (!title) continue;
    const fields = infoboxFields(pages[title] ?? '');
    abilities[str(a, 'InternalName')!] = {
      page: wikiUrl(title),
      cost: num(a, 'Cost'),
      costType: (str(a, 'CostType') ?? 'energy').toLowerCase(),
      channeled: bool(a, 'IsChanneled'),
      subsumable: bool(a, 'Subsumable'),
      augments: strings(a, 'Augments'),
      strength: lines(fields, 'strength'),
      duration: lines(fields, 'duration'),
      range: lines(fields, 'range'),
      misc: lines(fields, 'misc'),
    };
  }

  const warframes: Record<string, WarframeWikiEntry> = {};
  const frames = tableOf(isTable(warframeModule) ? warframeModule.map.Warframes : undefined);
  for (const [name, value] of Object.entries(frames?.map ?? {})) {
    const w = tableOf(value);
    const internal = w ? str(w, 'InternalName') : null;
    if (!w || !internal) continue;
    const passive = str(w, 'Passive');
    const plain = passive ? wikiPlain(passive) : null;
    const rank30: Record<string, number> = {};
    for (const [k, v] of Object.entries(w.map)) {
      const m = /^(Health|Shield|Armor|Energy)Rank30$/.exec(k);
      if (m && typeof v === 'number') rank30[m[1]!.toLowerCase()] = v;
    }
    warframes[internal] = {
      page: wikiUrl(str(w, 'Link') ?? name),
      passive: plain && plain.length > 0 ? plain.join(' ') : null,
      augmentShops: strings(w, 'AugmentShop'),
      rank30,
    };
  }

  return {
    source: `Warframe wiki (${WIKI_BASE}): Module:Ability/data, Module:Warframes/data and ability pages`,
    generatedAt: generatedAt.toISOString(),
    abilities,
    warframes,
  };
}
