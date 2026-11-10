import type { Goal, GoalsResponse, ItemDrop, ShoppingRow } from '@warframehub/shared';

/** One missing part in the "What to farm next" list. Parts belong to one goal. */
export interface MissingPart {
  goalId: number;
  goalName: string;
  key: string;
  name: string;
  /** How many more are needed (count − owned). */
  missing: number;
  drops: ItemDrop[];
}

export interface FarmQueue {
  /** Parts you can farm (or buy) now, best chance first; no drop data last. */
  farmNow: MissingPart[];
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
  const farmNow: MissingPart[] = [];
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
      };
      (goal.vaulted === true ? vaulted : farmNow).push(part);
    }
  }
  farmNow.sort((a, b) => bestChance(b) - bestChance(a));
  return { farmNow, vaulted, resources: data.shoppingList.filter((r) => r.missing > 0) };
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

/** 25000 → "25,000". */
export function formatAmount(n: number): string {
  return integer.format(n);
}

/** "25,000" or "25000" → 25000; anything that isn't a whole number ≥ 0 → null. */
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
