/**
 * `npm run update-names`: refreshes apps/api/data/names-es.json, the game's own Spanish
 * (SPEC §8.3): names, descriptions, passives and mod/arcane effects from DE's public export
 * (`_en` and `_es` files, matched by uniqueName), passive numbers from the English wiki data
 * we already keep (ability-stats.json), and the hand-kept mission-type names
 * (mission-types-es.json, checked against the Spanish wiki), plus the Sortie modifiers'
 * Spanish from warframestat.us's data package (DE's export has none). Needs the `xz` tool. Run it after game updates,
 * review the diff, commit the file. The app never calls DE or the wiki for this.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { EXPORT_BASE, parseExportJson } from '../apps/api/src/sources/de-export.ts';
import { buildSpanishNames } from '../apps/api/src/sources/names-es.ts';

const OUT = new URL('../apps/api/data/names-es.json', import.meta.url);
const STATS = new URL('../apps/api/data/ability-stats.json', import.meta.url);
const OVERRIDES = new URL('../apps/api/data/passives-es-overrides.json', import.meta.url);
const MISSION_TYPES_FILE = new URL('../apps/api/data/mission-types-es.json', import.meta.url);
const headers = {
  'user-agent': 'warframehub-update-names (+https://github.com/AlexandroSamudio/warframehub)',
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

async function exportsFor(lang: 'en' | 'es'): Promise<Record<string, unknown>> {
  const index = unlzma(await get(`${EXPORT_BASE}/index_${lang}.txt.lzma`))
    .split(/\r?\n/)
    .filter(Boolean);
  const wanted = [
    'ExportWarframes',
    'ExportUpgrades',
    'ExportRelicArcane',
    'ExportWeapons',
    'ExportResources',
    'ExportRecipes',
    'ExportRegions',
    'ExportGear',
    'ExportSentinels',
  ];
  const out: Record<string, unknown> = {};
  for (const name of wanted) {
    const line = index.find((l) => l.startsWith(`${name}_${lang}.json!`));
    if (!line) throw new Error(`DE's ${lang} index has no ${name}`);
    out[name] = parseExportJson((await get(`${EXPORT_BASE}/Manifest/${line}`)).toString('utf8'));
  }
  return out;
}

const [en, es] = await Promise.all([exportsFor('en'), exportsFor('es')]);
// Sortie modifiers: DE's export has none; warframestat.us's data package has the game's
// Spanish for them. Pinned to a version, so a refresh is a deliberate change.
const WORLDSTATE_DATA = 'https://cdn.jsdelivr.net/npm/warframe-worldstate-data@3.19.3/dist/data';
const [sortieEn, sortieEs] = await Promise.all(
  ['sortieData.json', 'es/sortieData.json'].map(async (f) =>
    JSON.parse((await get(`${WORLDSTATE_DATA}/${f}`)).toString('utf8')),
  ),
);
// Mission types: checked against the Spanish wiki's page titles; the few with no page are
// our own translation (docs/GLOSSARY-es.md). Kept by hand in mission-types-es.json.
const types = JSON.parse(readFileSync(MISSION_TYPES_FILE, 'utf8')) as Record<string, string>;
const stats = JSON.parse(readFileSync(STATS, 'utf8')) as {
  warframes: Record<string, { passive: string | null }>;
};
const overrides = JSON.parse(readFileSync(OVERRIDES, 'utf8')) as Record<string, string>;
const { file, unfilledPassives } = buildSpanishNames(
  {
    warframes: { en: en.ExportWarframes, es: es.ExportWarframes },
    upgrades: { en: en.ExportUpgrades, es: es.ExportUpgrades },
    arcanes: { en: en.ExportRelicArcane, es: es.ExportRelicArcane },
    weapons: { en: en.ExportWeapons, es: es.ExportWeapons },
    resources: { en: en.ExportResources, es: es.ExportResources },
    recipes: es.ExportRecipes,
    regions: { en: en.ExportRegions, es: es.ExportRegions },
    wikiPassives: Object.fromEntries(
      Object.entries(stats.warframes).map(([u, w]) => [u, w.passive]),
    ),
    passiveOverrides: overrides,
    missionTypes: types,
    extra: [
      { en: en.ExportGear, es: es.ExportGear },
      { en: en.ExportSentinels, es: es.ExportSentinels },
    ],
    sortie: { en: sortieEn, es: sortieEs },
  },
  new Date(),
);
writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n');
console.log(
  `Wrote names-es.json: ${Object.keys(file.names).length} names, ${Object.keys(file.abilities).length} abilities, ` +
    `${Object.keys(file.effects).length} effects, ${Object.keys(file.parts).length} part words, ` +
    `${Object.keys(file.relics).length} relics, ${Object.keys(file.nodes).length} nodes, ` +
    `${Object.keys(file.missionTypes).length} mission types, ${Object.keys(file.english).length} other names, ` +
    `${Object.keys(file.sortieModifiers).length} sortie texts.`,
);
if (unfilledPassives.length > 0) {
  console.log(
    `${unfilledPassives.length} passives need a hand translation in apps/api/data/passives-es-overrides.json:\n  ` +
      unfilledPassives.join('\n  '),
  );
}
