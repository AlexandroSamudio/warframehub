/**
 * `npm run update-ability-stats`: refreshes apps/api/data/ability-stats.json from the
 * Warframe wiki: Module:Ability/data (cost, augments, Helminth), each ability page's infobox
 * (strength, duration, range, misc by rank) and Module:Warframes/data (passives, augment
 * shops, rank-30 stats). Run it now and then (new Warframes, balance changes), review the
 * diff, commit the file. The app never calls the wiki.
 */
import { writeFileSync } from 'node:fs';
import {
  abilityPageTitle,
  buildAbilityStats,
  warframeAbilities,
} from '../apps/api/src/sources/wiki-abilities.ts';
import { parseLuaData } from '../apps/api/src/sources/wiki-lua.ts';
import { WIKI_BASE } from '../apps/api/src/sources/wiki-quests.ts';

const OUT = new URL('../apps/api/data/ability-stats.json', import.meta.url);
const headers = {
  'user-agent':
    'warframehub-update-ability-stats (+https://github.com/AlexandroSamudio/warframehub)',
};
const API = `${WIKI_BASE}/api.php`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WikiResponse {
  query: {
    pages?: Record<
      string,
      { title: string; missing?: string; revisions?: { slots?: { main?: { '*'?: string } } }[] }
    >;
  };
}

async function contents(titles: string[]): Promise<Record<string, string>> {
  const params = new URLSearchParams({
    format: 'json',
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: titles.join('|'),
  });
  const res = await fetch(`${API}?${params}`, { headers });
  if (!res.ok) throw new Error(`wiki returned ${res.status}`);
  const data = (await res.json()) as WikiResponse & {
    query: { redirects?: { from: string; to: string }[] };
  };
  const out: Record<string, string> = {};
  for (const p of Object.values(data.query.pages ?? {})) {
    out[p.title] = p.revisions?.[0]?.slots?.main?.['*'] ?? '';
  }
  // Keep the title we asked for when the wiki redirected it.
  for (const r of data.query.redirects ?? []) out[r.from] = out[r.to] ?? '';
  return out;
}

const modules = await contents(['Module:Ability/data', 'Module:Warframes/data']);
const abilityModule = parseLuaData(modules['Module:Ability/data'] ?? '');
const warframeModule = parseLuaData(modules['Module:Warframes/data'] ?? '');

const titles = [
  ...new Set(
    warframeAbilities(abilityModule)
      .map(abilityPageTitle)
      .filter((t): t is string => t !== null),
  ),
];
const pages: Record<string, string> = {};
for (let i = 0; i < titles.length; i += 40) {
  await pause(500); // be gentle with the wiki
  Object.assign(pages, await contents(titles.slice(i, i + 40)));
}

const file = buildAbilityStats(abilityModule, warframeModule, pages, new Date());
writeFileSync(OUT, JSON.stringify(file) + '\n');
const entries = Object.values(file.abilities);
const withNumbers = entries.filter(
  (a) => a.strength.length + a.duration.length + a.range.length > 0,
);
console.log(
  `Read ${titles.length} ability pages: ${entries.length} abilities (${withNumbers.length} with numbers), ` +
    `${Object.keys(file.warframes).length} Warframes. Wrote apps/api/data/ability-stats.json`,
);
