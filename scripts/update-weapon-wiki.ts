/**
 * `npm run update-weapon-wiki`: refreshes apps/api/data/weapon-wiki.json from the Warframe
 * wiki: Module:Weapons/data (primary, secondary, melee, archwing) for each weapon's class,
 * tags and family; Module:Mods/data for which weapons each mod fits; the "Riven Mods" page
 * for the Riven stats per weapon type. Run it after new weapons or mods come out, review the
 * diff, commit the file. The app never calls the wiki.
 */
import { writeFileSync } from 'node:fs';
import {
  buildWeaponWiki,
  MODS_MODULE,
  RIVEN_PAGE,
  WEAPON_MODULES,
} from '../apps/api/src/sources/wiki-weapons.ts';
import { parseLuaData } from '../apps/api/src/sources/wiki-lua.ts';
import { WIKI_BASE } from '../apps/api/src/sources/wiki-quests.ts';

const OUT = new URL('../apps/api/data/weapon-wiki.json', import.meta.url);
const headers = {
  'user-agent': 'warframehub-update-weapon-wiki (+https://github.com/AlexandroSamudio/warframehub)',
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function raw(title: string): Promise<string> {
  const res = await fetch(`${WIKI_BASE}/w/${encodeURIComponent(title)}?action=raw`, { headers });
  if (!res.ok) throw new Error(`wiki returned ${res.status} for ${title}`);
  await pause(500); // be gentle with the wiki
  return res.text();
}

const modules = [];
for (const title of WEAPON_MODULES) modules.push(parseLuaData(await raw(title)));
const mods = parseLuaData(await raw(MODS_MODULE));
const riven = await raw(RIVEN_PAGE);

const file = buildWeaponWiki(modules, new Date(), mods, riven);
writeFileSync(OUT, JSON.stringify(file) + '\n');
const rivenCounts = Object.entries(file.riven)
  .map(([type, stats]) => `${type} ${stats.length}`)
  .join(', ');
console.log(
  `Read ${WEAPON_MODULES.length} weapon modules, the mods module and the Riven page: ` +
    `${Object.keys(file.weapons).length} weapons, ${Object.keys(file.mods).length} mods, ` +
    `Riven stats ${rivenCounts}. Wrote apps/api/data/weapon-wiki.json`,
);
