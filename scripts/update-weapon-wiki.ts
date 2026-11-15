/**
 * `npm run update-weapon-wiki`: refreshes apps/api/data/weapon-wiki.json from the Warframe
 * wiki's Module:Weapons/data (primary, secondary, melee, archwing): each weapon's class.
 * Run it after new weapons come out, review the diff, commit the file. The app never calls
 * the wiki.
 */
import { writeFileSync } from 'node:fs';
import { buildWeaponWiki, WEAPON_MODULES } from '../apps/api/src/sources/wiki-weapons.ts';
import { parseLuaData } from '../apps/api/src/sources/wiki-lua.ts';
import { WIKI_BASE } from '../apps/api/src/sources/wiki-quests.ts';

const OUT = new URL('../apps/api/data/weapon-wiki.json', import.meta.url);
const headers = {
  'user-agent': 'warframehub-update-weapon-wiki (+https://github.com/AlexandroSamudio/warframehub)',
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const modules = [];
for (const title of WEAPON_MODULES) {
  const res = await fetch(`${WIKI_BASE}/w/${title}?action=raw`, { headers });
  if (!res.ok) throw new Error(`wiki returned ${res.status} for ${title}`);
  modules.push(parseLuaData(await res.text()));
  await pause(500); // be gentle with the wiki
}

const file = buildWeaponWiki(modules, new Date());
writeFileSync(OUT, JSON.stringify(file) + '\n');
console.log(
  `Read ${WEAPON_MODULES.length} modules: ${Object.keys(file.weapons).length} weapons. ` +
    'Wrote apps/api/data/weapon-wiki.json',
);
