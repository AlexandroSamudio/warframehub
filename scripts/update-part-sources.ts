/**
 * `npm run update-part-sources`: refreshes apps/api/data/part-sources.json from the Warframe
 * wiki's quest pages (Category:Quest, the `reward` field of each quest's infobox). It only
 * keeps clear "<item> blueprint" rewards. Run it now and then, review the diff, commit the file.
 * The app never calls the wiki.
 */
import { writeFileSync } from 'node:fs';
import { buildPartSources, WIKI_BASE } from '../apps/api/src/sources/wiki-quests.ts';

const OUT = new URL('../apps/api/data/part-sources.json', import.meta.url);
const headers = {
  'user-agent':
    'warframehub-update-part-sources (+https://github.com/AlexandroSamudio/warframehub)',
};
const API = `${WIKI_BASE}/api.php`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface WikiResponse {
  continue?: unknown;
  query: {
    categorymembers?: { title: string }[];
    pages?: Record<
      string,
      { title: string; revisions?: { slots?: { main?: { '*'?: string } } }[] }
    >;
  };
}

async function api(params: Record<string, string>): Promise<WikiResponse> {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, {
    headers,
  });
  if (!res.ok) throw new Error(`wiki returned ${res.status}`);
  return (await res.json()) as WikiResponse;
}

const members = await api({
  action: 'query',
  list: 'categorymembers',
  cmtitle: 'Category:Quest',
  cmnamespace: '0',
  cmlimit: '500',
});
const titles = (members.query.categorymembers ?? []).map((m) => m.title);
if (members.continue) throw new Error('Category:Quest has more than 500 pages; add paging.');

const pages: Record<string, string> = {};
for (let i = 0; i < titles.length; i += 40) {
  const data = await api({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    titles: titles.slice(i, i + 40).join('|'),
  });
  for (const p of Object.values(data.query.pages ?? {})) {
    pages[p.title] = p.revisions?.[0]?.slots?.main?.['*'] ?? '';
  }
  await pause(500); // be gentle with the wiki
}

const file = buildPartSources(pages, new Date());
writeFileSync(OUT, JSON.stringify(file) + '\n');
console.log(
  `Read ${titles.length} quest pages; wrote ${Object.keys(file.items).length} items to apps/api/data/part-sources.json`,
);
