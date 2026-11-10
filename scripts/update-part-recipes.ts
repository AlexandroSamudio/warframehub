/**
 * `npm run update-part-recipes`: refreshes apps/api/data/part-recipes.json from DE's public
 * content export (https://content.warframe.com/PublicExport/). Run it when new Warframes
 * come out. Needs the `xz` tool (DE's index is LZMA-compressed). The app never calls DE.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  buildPartRecipes,
  EXPORT_BASE,
  findManifestFiles,
  parseExportJson,
} from '../apps/api/src/sources/de-export.ts';

const OUT = new URL('../apps/api/data/part-recipes.json', import.meta.url);
const headers = {
  'user-agent':
    'warframehub-update-part-recipes (+https://github.com/AlexandroSamudio/warframehub)',
};

async function get(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function unlzma(data: Buffer): string {
  const run = spawnSync('xz', ['--format=lzma', '-dc'], {
    input: data,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error || run.status !== 0) {
    throw new Error(
      `xz couldn't decompress DE's index (${run.error?.message ?? run.stderr.toString()}). Install xz.`,
    );
  }
  return run.stdout.toString('utf8');
}

const index = findManifestFiles(unlzma(await get(`${EXPORT_BASE}/index_en.txt.lzma`)));
const [recipes, resources] = await Promise.all([
  get(`${EXPORT_BASE}/Manifest/${index.recipes}`),
  get(`${EXPORT_BASE}/Manifest/${index.resources}`),
]);
const file = buildPartRecipes(
  parseExportJson(recipes.toString('utf8')),
  parseExportJson(resources.toString('utf8')),
  new Date(),
);
writeFileSync(OUT, JSON.stringify(file) + '\n');
console.log(
  `Wrote ${Object.keys(file.recipes).length} part recipes to apps/api/data/part-recipes.json`,
);
