import type {
  Goal,
  GoalResource,
  GoalsResponse,
  ItemDrop,
  PartCraft,
  PartSource,
  Shortfall,
  ShoppingRow,
} from '@warframehub/shared';

/** One missing part in the "What to farm next" list. Parts belong to one goal. */
export interface MissingPart {
  goalId: number;
  goalName: string;
  key: string;
  name: string;
  /** How many more are needed (count − owned). */
  missing: number;
  drops: ItemDrop[];
  /** Your own note on where this part comes from. */
  note: string;
  /** Quest rewards the Warframe wiki names for this part. */
  sources: PartSource[];
  /** What stops one Craft (empty when it can be crafted now). */
  craftShort: Shortfall[];
}

export interface FarmQueue {
  /** Parts whose blueprint you hold: craft them in the Foundry (or see what's missing). */
  craftNow: MissingPart[];
  /** Parts you can farm now, best chance first. */
  farmNow: MissingPart[];
  /** Parts no drop table lists (quest, Market, vendor): you keep a note on where. */
  other: MissingPart[];
  /** Parts of vaulted items: their relics no longer drop. In goal order. */
  vaulted: MissingPart[];
  /** Resources still short across active goals, most missing first (server order). */
  resources: ShoppingRow[];
}

/** The highest chance among a part's drops, or -1 when there is none. */
function bestChance(p: MissingPart): number {
  return p.drops.reduce((best, d) => Math.max(best, d.chance ?? -1), -1);
}

/**
 * "What to farm next" (surface brief .impeccable/surfaces/goals.md, after the critique of
 * 10 Nov 2026): what can be farmed now comes first, sorted by best chance, so the row
 * worth running this mission is on top. Vaulted parts are listed separately.
 */
export function farmQueue(data: GoalsResponse): FarmQueue {
  const craftNow: MissingPart[] = [];
  const farmNow: MissingPart[] = [];
  const other: MissingPart[] = [];
  const vaulted: MissingPart[] = [];
  for (const goal of data.active) {
    for (const p of goal.parts) {
      if (p.owned >= p.count) continue;
      const part: MissingPart = {
        goalId: goal.id,
        goalName: goal.name,
        key: p.key,
        name: p.name,
        missing: p.count - p.owned,
        drops: p.drops,
        note: p.note,
        sources: p.sources,
        craftShort: p.craftShort,
      };
      if (p.craft && p.blueprints > 0) {
        craftNow.push(part);
        continue;
      }
      (p.drops.length === 0 ? other : goal.vaulted === true ? vaulted : farmNow).push(part);
    }
  }
  farmNow.sort((a, b) => bestChance(b) - bestChance(a));
  // Ready ones first, then the fewest things missing.
  craftNow.sort((a, b) => a.craftShort.length - b.craftShort.length);
  return {
    craftNow,
    farmNow,
    other,
    vaulted,
    resources: data.shoppingList.filter((r) => r.missing > 0),
  };
}

// ---- drops -----------------------------------------------------------------

/** Void relic refinements, in the order the game lists them. */
export const REFINEMENTS = ['Intact', 'Exceptional', 'Flawless', 'Radiant'] as const;
export type Refinement = (typeof REFINEMENTS)[number];

/** One relic with its chance at each refinement (null where the data has none). */
export interface RelicSource {
  kind: 'relic';
  relic: string;
  chances: Record<Refinement, number | null>;
  best: number;
}

/** A mission, bounty or enemy drop. */
export interface PlaceSource {
  kind: 'place';
  location: string;
  chance: number | null;
  rarity: string | null;
}

export type DropSource = RelicSource | PlaceSource;

const RELIC = /^(.+?) Relic(?: \((Intact|Exceptional|Flawless|Radiant)\))?$/;

/**
 * Groups relic drops by relic ("Axi N12 Relic (Radiant)" → Axi N12 with four chances),
 * so a part's 24 rows become 6. The upstream rarity is left out for relics: it follows
 * the chance bucket, not the relic's reward tier, and flips between refinements.
 * Best source first.
 */
export function groupDrops(drops: ItemDrop[]): DropSource[] {
  const relics = new Map<string, RelicSource>();
  const places: PlaceSource[] = [];
  for (const d of drops) {
    const m = d.relic ? RELIC.exec(d.location) : null;
    if (!m) {
      places.push({ kind: 'place', location: d.location, chance: d.chance, rarity: d.rarity });
      continue;
    }
    const name = m[1]!;
    const refinement = (m[2] ?? 'Intact') as Refinement;
    const relic = relics.get(name) ?? {
      kind: 'relic' as const,
      relic: name,
      chances: { Intact: null, Exceptional: null, Flawless: null, Radiant: null },
      best: -1,
    };
    relic.chances[refinement] = d.chance;
    relic.best = Math.max(relic.best, d.chance ?? -1);
    relics.set(name, relic);
  }
  const score = (s: DropSource) => (s.kind === 'relic' ? s.best : (s.chance ?? -1));
  return [...relics.values(), ...places].sort(
    (a, b) =>
      score(b) - score(a) ||
      (a.kind === 'relic' ? a.relic : a.location).localeCompare(
        b.kind === 'relic' ? b.relic : b.location,
      ),
  );
}

/** Relic names only, e.g. for the compact vaulted rows: "Axi N12, Lith N7". */
export function relicNames(drops: ItemDrop[]): string[] {
  return groupDrops(drops)
    .filter((s): s is RelicSource => s.kind === 'relic')
    .map((s) => s.relic);
}

// ---- formatting --------------------------------------------------------------

const integer = new Intl.NumberFormat('en-US');

/** The materials of a craft as quantity + name pairs: Credits first, then A–Z. */
export function materialList(craft: PartCraft): { count: number; name: string }[] {
  const lines = craft.ingredients
    .map((i) => ({ count: i.count, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (craft.credits > 0) lines.unshift({ count: craft.credits, name: 'Credits' });
  return lines;
}

export interface MaterialStock {
  key: string;
  name: string;
  need: number;
  have: number;
}

/** A part's materials with what the shared stock holds of each (Credits first, then A–Z). */
export function materialsWithStock(
  craft: PartCraft,
  stock: { key: string; amount: number }[],
): MaterialStock[] {
  const have = new Map(stock.map((s) => [s.key, s.amount]));
  const lines = craft.ingredients
    .map((i) => ({ key: i.key, name: i.name, need: i.count, have: have.get(i.key) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (craft.credits > 0) {
    lines.unshift({
      key: 'credits',
      name: 'Credits',
      need: craft.credits,
      have: have.get('credits') ?? 0,
    });
  }
  return lines;
}

/** "18 Rubedo, 1 blueprint" for a Craft or Build that can't run yet. */
export function shortList(short: Shortfall[]): string {
  return short.map((s) => `${formatAmount(s.missing)} ${s.name}`).join(', ');
}

/** "15,000 Credits · 1,425 Polymer Bundle · 5,500 Alloy Plate" (plain text). */
export function formatMaterials(craft: PartCraft): string {
  return materialList(craft)
    .map((l) => `${formatAmount(l.count)} ${l.name}`)
    .join(' · ');
}

/**
 * A goal card's resources in two groups: what the item's own recipe needs (a row may
 * also include materials for parts), and materials only parts need until you have them.
 * Each group shows what's most missing first, then A–Z, like the farm queue.
 */
export function splitResources(resources: GoalResource[]): {
  forItem: GoalResource[];
  forPartsOnly: GoalResource[];
} {
  const byMissing = (a: GoalResource, b: GoalResource) =>
    b.count - b.have - (a.count - a.have) || a.name.localeCompare(b.name);
  return {
    forItem: resources.filter((r) => r.forParts < r.count).sort(byMissing),
    forPartsOnly: resources.filter((r) => r.forParts === r.count).sort(byMissing),
  };
}

/** 25000 → "25,000". */
export function formatAmount(n: number): string {
  return integer.format(n);
}

/** "25,000" or "25000" → 25000; anything that isn't a whole number ≥ 0 → null. */
export type Entry = { amount: number } | { error: 'invalid' | 'belowZero' };

/**
 * What the user typed into an amount field: "1,200" sets it, "+250" adds to what's saved,
 * "-30" takes away. Thousands separators and spaces are fine.
 */
export function parseEntry(text: string, current: number): Entry {
  const m = /^\s*([+-])?\s*([\d,\s]+)$/.exec(text);
  const n = m ? parseAmount(m[2]!) : null;
  if (!m || n === null) return { error: 'invalid' };
  const amount = m[1] === '+' ? current + n : m[1] === '-' ? current - n : n;
  if (amount < 0) return { error: 'belowZero' };
  return Number.isSafeInteger(amount) ? { amount } : { error: 'invalid' };
}

export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** 14.29 → "14.29%"; 100 → "100%"; null → "". */
export function formatChance(chance: number | null): string {
  if (chance === null) return '';
  return `${Number.isInteger(chance) ? chance : chance.toFixed(2).replace(/0$/, '')}%`;
}

/** Goal progress as a 0–100 percentage for the bar. */
export function progressPercent(goal: Pick<Goal, 'progress'>): number {
  const { done, total } = goal.progress;
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** "Nidus Prime" / "Nidus Prime and Boar Prime" / "Nidus Prime, Boar Prime and Boar". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
