/**
 * `npm run update-incarnon`: refreshes apps/api/data/incarnon.json from the Warframe wiki:
 * the Incarnon Genesis pages (Category:Incarnon) and the pages of weapons that are Incarnon
 * from the start (Traits "Incarnon" in Module:Weapons/data). Run it after Incarnon updates,
 * review the diff (and the skipped pages it lists), commit the file. The app never calls
 * the wiki.
 */
import { writeFileSync } from 'node:fs';
import { buildIncarnon, nativeIncarnonPages } from '../apps/api/src/sources/wiki-incarnon.ts';
import { parseLuaData } from '../apps/api/src/sources/wiki-lua.ts';
import { WIKI_BASE } from '../apps/api/src/sources/wiki-quests.ts';

const OUT = new URL('../apps/api/data/incarnon.json', import.meta.url);
const headers = {
  'user-agent': 'warframehub-update-incarnon (+https://github.com/AlexandroSamudio/warframehub)',
};
const API = `${WIKI_BASE}/api.php`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function query(params: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, {
    headers,
  });
  if (!res.ok) throw new Error(`wiki returned ${res.status}`);
  return res.json();
}

interface Pages {
  query: {
    pages?: Record<
      string,
      { title: string; revisions?: { slots?: { main?: { '*'?: string } } }[] }
    >;
    redirects?: { from: string; to: string }[];
  };
}

async function contents(titles: string[]): Promise<Record<string, string>> {
  const data = (await query({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    titles: titles.join('|'),
  })) as Pages;
  const out: Record<string, string> = {};
  for (const p of Object.values(data.query.pages ?? {})) {
    out[p.title] = p.revisions?.[0]?.slots?.main?.['*'] ?? '';
  }
  for (const r of data.query.redirects ?? []) out[r.from] = out[r.to] ?? '';
  return out;
}

// The adapters: every "… Incarnon Genesis" page in Category:Incarnon.
const members = (await query({
  action: 'query',
  list: 'categorymembers',
  cmtitle: 'Category:Incarnon',
  cmlimit: '500',
})) as { query: { categorymembers: { title: string }[] } };
const genesis = members.query.categorymembers
  .map((m) => m.title)
  .filter((t) => t.endsWith(' Incarnon Genesis'));

// The weapons that are Incarnon from the start.
await pause(500);
const modules = await contents([
  'Module:Weapons/data/primary',
  'Module:Weapons/data/secondary',
  'Module:Weapons/data/melee',
]);
const natives = nativeIncarnonPages(Object.values(modules).map((m) => parseLuaData(m)));

const titles = [...genesis, ...natives.map((n) => n.page)];
const pages: Record<string, string> = {};
for (let i = 0; i < titles.length; i += 40) {
  await pause(500); // be gentle with the wiki
  Object.assign(pages, await contents(titles.slice(i, i + 40)));
}

const file = buildIncarnon(
  [
    ...genesis.map((title) => ({
      title,
      kind: 'genesis' as const,
      ownName: title.replace(/ Incarnon Genesis$/, ''),
      wikitext: pages[title] ?? '',
    })),
    ...natives.map((n) => ({
      title: n.page,
      kind: 'native' as const,
      ownName: n.name,
      wikitext: pages[n.page] ?? '',
    })),
  ],
  new Date(),
);
writeFileSync(OUT, JSON.stringify(file) + '\n');
console.log(
  `Read ${genesis.length} Genesis pages and ${natives.length} Incarnon weapons: ` +
    `${Object.keys(file.weapons).length} weapon versions. Wrote apps/api/data/incarnon.json`,
);
if (file.skipped.length > 0) console.log(`Skipped (no readable table): ${file.skipped.join(', ')}`);
