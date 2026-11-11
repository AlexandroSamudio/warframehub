import { PartSource } from '@warframehub/shared';
import { z } from 'zod';

/**
 * Where parts with no drop data come from, read from the Warframe wiki's quest pages
 * (https://wiki.warframe.com, Category:Quest). A quest's infobox has a `reward` field,
 * and most blueprint rewards are written the same way: `{{WF|Nidus}} blueprint`.
 * `npm run update-part-sources` reads it once and keeps a small file in the repo
 * (`apps/api/data/part-sources.json`). Nothing here runs when the app starts.
 *
 * Only clear matches are kept. Anything worded another way is left out, so the part
 * stays unknown (the user's own note) instead of getting a guess.
 */

export const WIKI_BASE = 'https://wiki.warframe.com';

// ---- the file we keep -------------------------------------------------------

export const PartSourceEntry = z.object({
  /** The quest gives the item's blueprint; `allParts` also when it says "and parts". */
  allParts: z.boolean(),
  sources: z.array(PartSource).min(1),
});
export type PartSourceEntry = z.infer<typeof PartSourceEntry>;

export const PartSourcesFile = z.object({
  source: z.string(),
  generatedAt: z.iso.datetime(),
  /** Keyed by the item's name as the wiki writes it (matched case-insensitively). */
  items: z.record(z.string(), PartSourceEntry),
});
export type PartSourcesFile = z.infer<typeof PartSourcesFile>;

// ---- reading the wiki -----------------------------------------------------------

/** The text of the infobox's `reward` parameter (it can run over several lines). */
export function rewardField(wikitext: string): string | null {
  const m = /\|\s*reward\s*=\s*([^\n]*(?:\n(?!\s*\|)[^\n]*)*)/i.exec(wikitext);
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : null;
}

export interface QuestReward {
  item: string;
  /** "blueprint and parts" / "blueprint & parts": the quest hands over the parts too. */
  allParts: boolean;
}

const PARTS_TAIL = String.raw`(?:\s*(?:and|&|&amp;)\s*parts)?`;
// {{WF|Nidus}} blueprint · {{Weapon|Shedu}} Blueprint · {{WF|Atlas}} [[Blueprint]]
const TEMPLATE_BLUEPRINT = new RegExp(
  String.raw`\{\{\s*(?:WF|Weapon)\s*\|\s*([^|}]+?)\s*\}\}\s*(?:\[\[)?\s*blueprint(?:\]\])?(${PARTS_TAIL})`,
  'gi',
);
// [[Revenant]] blueprint (a plain link)
const LINK_BLUEPRINT = new RegExp(
  String.raw`\[\[\s*([^\]|#]+?)\s*\]\]\s*blueprint(?:\]\])?(${PARTS_TAIL})`,
  'gi',
);

/** Every "<item> blueprint" in a reward field. Items are checked against the goals later. */
export function questRewards(reward: string): QuestReward[] {
  const found = new Map<string, QuestReward>();
  for (const re of [TEMPLATE_BLUEPRINT, LINK_BLUEPRINT]) {
    for (const m of reward.matchAll(re)) {
      const item = m[1]!.trim();
      const allParts = /parts/i.test(m[2] ?? '');
      const key = item.toLowerCase();
      found.set(key, { item, allParts: allParts || (found.get(key)?.allParts ?? false) });
    }
  }
  return [...found.values()];
}

/** "Vox Solaris (Quest)" → "Vox Solaris": the name players know the quest by. */
export function questName(pageTitle: string): string {
  return pageTitle.replace(/\s*\((?:Quest|quest)\)\s*$/, '');
}

export function wikiUrl(pageTitle: string): string {
  return `${WIKI_BASE}/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}`;
}

/** Builds the file from quest pages (`title → wikitext`). */
export function buildPartSources(
  pages: Record<string, string>,
  generatedAt: Date,
): PartSourcesFile {
  const items: Record<string, PartSourceEntry> = {};
  for (const [title, wikitext] of Object.entries(pages).sort(([a], [b]) => a.localeCompare(b))) {
    const reward = rewardField(wikitext);
    if (!reward) continue;
    for (const { item, allParts } of questRewards(reward)) {
      const existing = items[item];
      const source = { kind: 'quest' as const, title: questName(title), url: wikiUrl(title) };
      if (existing) {
        existing.allParts ||= allParts;
        existing.sources.push(source);
      } else {
        items[item] = { allParts, sources: [source] };
      }
    }
  }
  return {
    source: 'Warframe wiki (wiki.warframe.com), quest reward fields',
    generatedAt: generatedAt.toISOString(),
    items,
  };
}
