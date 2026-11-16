import { z } from 'zod';
import { wikiPlain } from './wiki-abilities.js';
import { isTable, type LuaValue } from './wiki-lua.js';
import { wikiUrl } from './wiki-quests.js';

/**
 * Incarnon evolutions (SPEC §15, part 3), from the Warframe wiki (checked 15 Nov 2026):
 * - the Genesis adapters' pages ("Braton Incarnon Genesis", in Category:Incarnon), whose
 *   "Evolutions" table has one value column per weapon version (Braton, Mk1, Vandal, Prime);
 * - the pages of weapons that are Incarnon from the start (Traits "Incarnon" in
 *   Module:Weapons/data: Felarx, Laetum…), whose table has no version columns.
 * Each table lists tiers EVO1–EVO5 with their perks, and "Evolution Challenge" rows that
 * unlock the next tier (or, on the weapons' own pages, the tier that follows). DE's public
 * export has none of this text, so it's English in both languages. Saved by
 * `npm run update-incarnon` in `apps/api/data/incarnon.json`; the app never calls the wiki.
 * Text is CC BY-SA; a page that can't be read is skipped, never guessed.
 */

export const IncarnonPerkFile = z.object({ name: z.string(), lines: z.array(z.string()) });
export const IncarnonTierFile = z.object({
  tier: z.int().min(1).max(5),
  /** What unlocks this tier; null for the first tier of an adapter (installing it). */
  challenge: z.string().nullable(),
  perks: z.array(IncarnonPerkFile),
});
export const IncarnonEntry = z.object({
  kind: z.enum(['genesis', 'native']),
  /** The wiki page the evolutions come from. */
  page: z.url(),
  tiers: z.array(IncarnonTierFile).min(1),
});
export type IncarnonEntry = z.infer<typeof IncarnonEntry>;

export const IncarnonFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** By weapon name as the wiki writes it ("Braton Prime", "Mk1-Braton", "Felarx"). */
  weapons: z.record(z.string(), IncarnonEntry),
  /** Pages whose table couldn't be read (shown in the script's output, kept for review). */
  skipped: z.array(z.string()),
});
export type IncarnonFile = z.infer<typeof IncarnonFile>;

/** The weapons that are Incarnon from the start: `Traits` include "Incarnon". */
export function nativeIncarnonPages(modules: LuaValue[]): { name: string; page: string }[] {
  const out: { name: string; page: string }[] = [];
  for (const module of modules) {
    if (!isTable(module)) continue;
    for (const entry of Object.values(module.map)) {
      if (!isTable(entry)) continue;
      const traits = entry.map.Traits;
      const name = entry.map.Name;
      const link = entry.map.Link;
      if (!isTable(traits) || typeof name !== 'string') continue;
      if (!traits.list.includes('Incarnon')) continue;
      out.push({ name, page: typeof link === 'string' ? link : name });
    }
  }
  return out;
}

// ---- reading one table ---------------------------------------------------------------

interface Cell {
  header: boolean;
  span: number;
  text: string;
}

/** Splits a cell's "attributes | content" (only when the part before | is attributes). */
function cellOf(raw: string, header: boolean): Cell {
  let text = raw;
  let span = 1;
  const bar = raw.search(/(?<!\|)\|(?!\|)/);
  if (bar >= 0) {
    const attrs = raw.slice(0, bar);
    if (/^\s*[a-z-]+\s*=/.test(attrs) && !/\[\[|\{\{/.test(attrs)) {
      text = raw.slice(bar + 1);
      const colspan = /colspan\s*=\s*"?(\d+)/.exec(attrs);
      if (colspan) span = Number(colspan[1]);
    }
  }
  return { header, span, text: text.trim() };
}

/** One table row's cells, in order (`|`/`!` starts, `||`/`!!` inline separators). */
function cellsOf(row: string): Cell[] {
  const cells: Cell[] = [];
  let current: { header: boolean; lines: string[] } | null = null;
  const flush = () => {
    if (current) cells.push(cellOf(current.lines.join('\n'), current.header));
    current = null;
  };
  for (const line of row.split('\n')) {
    const start = /^([|!])(?![-}+])/.exec(line);
    if (start) {
      flush();
      const header = start[1] === '!';
      const parts = line.slice(1).split(header ? '!!' : '||');
      parts.forEach((p, i) => {
        if (i > 0) flush();
        current = { header, lines: [p] };
      });
    } else if (current) {
      (current as { lines: string[] }).lines.push(line);
    }
  }
  flush();
  return cells;
}

/** "X = 24<br>Y = 30" → { X: "24", Y: "30" }; "-" → {}. */
function valuesOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  // The key in either case: one table writes "x = 50".
  for (const m of text.matchAll(/\b([A-Za-z])\s*=\s*([^<\n]+?)\s*(?=<br\s*\/?>|\n|$)/g)) {
    out[m[1]!.toUpperCase()] = m[2]!.trim();
  }
  return out;
}

/**
 * Puts a version's numbers into the text: "'''+X'''" → "'''+24'''", "'''+X%'''" with
 * X = "12%" → "'''+12%'''" (the unit isn't doubled).
 */
function fill(text: string, values: Record<string, string>): string {
  // "%." after X, with X = "14%": keep only the part the value doesn't already end with.
  const rest = (value: string, unit: string) => {
    for (let k = unit.length; k > 0; k--)
      if (value.endsWith(unit.slice(0, k))) return unit.slice(k);
    return unit;
  };
  return (
    text
      .replace(
        /'''([+-]?)([A-Z])([^A-Za-z0-9'\s]*)'''/g,
        (all, sign: string, key: string, unit: string) => {
          const value = values[key];
          return value === undefined ? all : `'''${sign}${value}${rest(value, unit)}'''`;
        },
      )
      // Some tables don't bold it: "by X%", "to Y%".
      .replace(
        /\b(by|to) ([A-Z])(%?)(?![A-Za-z])/g,
        (all, word: string, key: string, unit: string) => {
          const value = values[key];
          return value === undefined ? all : `${word} ${value}${rest(value, unit)}`;
        },
      )
  );
}

/**
 * Templates the ability cleaner doesn't know but these tables use: {{A|Sonar}}, {{pc|120}},
 * {{E|Scathing Whisper|Scathing}} (the last plain argument is the word shown).
 */
function plainLines(wikitext: string): string[] {
  const lines: string[] = [];
  for (const raw of wikitext.split('\n')) {
    const bullet = /^\s*(\*+)\s*(.*)$/.exec(raw);
    const body = (bullet ? bullet[2]! : raw).replace(
      /\{\{\s*(?:a|e|pc|sc|clr)\s*(?:\|([^{}]*))?\}\}/gi,
      (_, args?: string) =>
        args
          ? (args
              .split('|')
              .filter((p) => !p.includes('='))
              .at(-1) ?? '')
          : '',
    );
    const plain = wikiPlain(body);
    if (plain === null) return []; // something unreadable: the perk keeps its name only
    const text = plain.join(' ').trim();
    if (text === '') continue;
    lines.push(bullet && bullet[1]!.length > 1 ? `– ${text}` : text);
  }
  return lines;
}

function perkName(text: string): string {
  const plain = wikiPlain(text.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, ''));
  return (plain ?? []).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The "Evolutions" table of a page, per version: `versions` names the value columns
 * ({{Weapon|Braton Vandal|Vandal}} → "Braton Vandal"); a table without them belongs to
 * `ownName`. Null when there's no such table or a row doesn't fit the shape.
 */
export function parseEvolutions(
  wikitext: string,
  ownName: string,
): Record<string, IncarnonTierFileT[]> | null {
  const heading = /^=+\s*Evolutions\s*=+\s*$/m.exec(wikitext);
  if (!heading) return null;
  const from = wikitext.indexOf('{|', heading.index);
  const to = wikitext.indexOf('\n|}', from);
  if (from < 0 || to < 0) return null;
  // The first chunk is the "{|" line itself, and on some pages the header row too.
  const rows = wikitext
    .slice(from, to)
    .replace(/^\{\|[^\n]*\n?/, '')
    .split(/\n?\|-[^\n]*/);

  let versions: string[] = [];
  const tiers: { tier: number; challenge: string | null; perks: { cells: Cell[] }[] }[] = [];
  let pending: string | null = null;

  for (const row of rows) {
    const cells = cellsOf(row.replace(/^\n/, ''));
    if (cells.length === 0) continue;
    const first = cells[0]!;
    // The header row: the version columns.
    if (first.header && /^''?Evolution''?$|^Evolution$/.test(first.text)) {
      versions = [...row.matchAll(/\{\{\s*Weapon\s*\|\s*([^|}]+)/g)].map((m) => m[1]!.trim());
      continue;
    }
    // A challenge row: unlocks the next tier.
    if (first.header && /Challenge/i.test(first.text)) {
      const last = cells.at(-1)!;
      const text = plainLines(last.text).join(' ');
      if (!text || last === first) return null;
      // The wiki ends some challenges with a full stop and some without: always end with one.
      pending = /[.!?)]$/.test(text) ? text : `${text}.`;
      continue;
    }
    // A tier's first row starts with "! EVO2" (with a rowspan for its other perks).
    const evo = first.header ? /EVO\s*(\d)/.exec(first.text) : null;
    if (evo) {
      tiers.push({ tier: Number(evo[1]), challenge: pending, perks: [{ cells: cells.slice(1) }] });
      pending = null;
      continue;
    }
    if (!first.header && tiers.length > 0) {
      tiers.at(-1)!.perks.push({ cells });
      continue;
    }
    return null; // a row this reader doesn't know
  }
  if (tiers.length === 0) return null;

  const names = versions.length > 0 ? versions : [ownName];
  const out: Record<string, IncarnonTierFileT[]> = {};
  for (const [vi, version] of names.entries()) {
    out[version] = tiers.map((t) => ({
      tier: t.tier,
      challenge: t.challenge,
      perks: t.perks.map(({ cells }) => {
        const [nameCell, descCell, ...rest] = cells;
        // Value cells: one per version, a colspan covering several.
        let values: Record<string, string> = {};
        if (versions.length > 0) {
          let col = 0;
          for (const c of rest) {
            if (vi >= col && vi < col + c.span) {
              values = valuesOf(c.text);
              break;
            }
            col += c.span;
            if (col >= versions.length) break;
          }
        }
        return {
          name: perkName(nameCell?.text ?? ''),
          lines: plainLines(fill(descCell?.text ?? '', values)),
        };
      }),
    }));
  }
  return out;
}

type IncarnonTierFileT = z.infer<typeof IncarnonTierFile>;

/** Builds the file from the fetched pages. */
export function buildIncarnon(
  pages: { title: string; kind: 'genesis' | 'native'; ownName: string; wikitext: string }[],
  generatedAt: Date,
): IncarnonFile {
  const weapons: Record<string, IncarnonEntry> = {};
  const skipped: string[] = [];
  for (const p of pages) {
    const parsed = parseEvolutions(p.wikitext, p.ownName);
    if (!parsed) {
      skipped.push(p.title);
      continue;
    }
    for (const [name, tiers] of Object.entries(parsed)) {
      weapons[name] = { kind: p.kind, page: wikiUrl(p.title), tiers };
    }
  }
  return {
    source:
      'https://wiki.warframe.com (Incarnon Genesis pages and Incarnon weapon pages, CC BY-SA)',
    generatedAt: generatedAt.toISOString(),
    weapons,
    skipped: skipped.sort(),
  };
}
