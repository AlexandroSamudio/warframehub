import type { ArcaneOption, HelminthOption, ModOption } from '@warframehub/shared';
import { z } from 'zod';
import { loadAbilityStats } from './ability-stats.js';
import { plainText, type WarframeGroup } from './warframes.js';

/**
 * What a build can hold (SPEC §14.1): Warframe mods and arcanes from warframestat.us,
 * Helminth abilities from the wiki data, and which version of a Warframe owns the builds.
 * Checked against the live lists on 13 Nov 2026 (trimmed copies in ./fixtures/warframes).
 */

/** "On Energy Pickup:\\n60% chance…" → plain lines, repeats dropped. */
export function effectText(stats: string[]): string {
  const lines = stats
    .join('\n')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => plainText(line))
    .filter((line) => line !== '');
  return [...new Set(lines)].join('\n');
}

const LevelStats = z.array(z.looseObject({ stats: z.array(z.string()) })).default([]);

const RawBuildMod = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  type: z.string().optional(),
  compatName: z.string().nullable().optional(),
  isAugment: z.boolean().optional(),
  isExilus: z.boolean().optional(),
  polarity: z.string().nullable().optional(),
  rarity: z.string().nullable().optional(),
  imageName: z.string().optional(),
  levelStats: LevelStats,
});

/**
 * Copies the game keeps under the same name: the "Flawed" mods (`Beginner`/`Intermediate`
 * paths), Conclave-only mods (`PvPMods`), and stray `Expert` entries named like the
 * normal mod ("Intensify"). Primed mods also live under `Expert` but have their own names,
 * so they stay. Conclave augments (Mesa's Waltz…) work in missions and stay too.
 */
const SKIPPED_PATHS = ['/Beginner/', '/Intermediate/', '/PvPMods/'];

/** Lower is better when two mods share a name ("Adaptation" also has a Sentient copy). */
function pathRank(uniqueName: string): number {
  if (uniqueName.includes('/Expert/')) return 3;
  if (uniqueName.startsWith('/Lotus/Upgrades/Mods/Warframe/')) return 0;
  return uniqueName.startsWith('/Lotus/Upgrades/Mods/') ? 1 : 2;
}

/**
 * The mods a Warframe build can use, A–Z: general Warframe mods, auras, and the augments of
 * the Warframes in `warframeNames` (`augmentFor`). Mods for Parazons and others the data
 * also files as "Warframe Mod" are left out.
 */
export function normaliseMods(rawMods: unknown[], warframeNames: Set<string>): ModOption[] {
  const byName = new Map<string, { rank: number; mod: ModOption }>();
  for (const raw of rawMods) {
    const parsed = RawBuildMod.safeParse(raw);
    if (!parsed.success) continue; // one odd mod doesn't spoil the list
    const m = parsed.data;
    if (m.type !== 'Warframe Mod' || m.levelStats.length === 0) continue;
    if (SKIPPED_PATHS.some((p) => m.uniqueName.includes(p))) continue;
    const aura = m.compatName === 'AURA';
    const augmentFor =
      m.isAugment && m.compatName && warframeNames.has(m.compatName) ? m.compatName : null;
    if (!aura && !augmentFor && m.compatName !== 'WARFRAME') continue;
    const mod: ModOption = {
      uniqueName: m.uniqueName,
      name: m.name,
      polarity: m.polarity ?? null,
      rarity: m.rarity ?? null,
      image: m.imageName ?? null,
      maxRank: m.levelStats.length - 1,
      aura,
      exilus: !aura && m.isExilus === true,
      augmentFor,
      effects: m.levelStats.map((level) => effectText(level.stats)),
    };
    const rank = pathRank(m.uniqueName);
    const kept = byName.get(m.name);
    if (!kept || rank < kept.rank) byName.set(m.name, { rank, mod });
  }
  return [...byName.values()].map((v) => v.mod).sort((a, b) => a.name.localeCompare(b.name));
}

const RawArcane = z.looseObject({
  uniqueName: z.string(),
  name: z.string(),
  type: z.string().optional(),
  rarity: z.string().nullable().optional(),
  imageName: z.string().optional(),
  levelStats: LevelStats,
});

/** Warframe arcanes ("Warframe Arcane", plus the older ones typed just "Arcane"). */
const ARCANE_TYPES = new Set(['Warframe Arcane', 'Arcane']);

/** Warframe arcanes, A–Z. The data lists some twice, once without ranks: those go. */
export function normaliseArcanes(rawArcanes: unknown[]): ArcaneOption[] {
  const byName = new Map<string, ArcaneOption>();
  for (const raw of rawArcanes) {
    const parsed = RawArcane.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    if (!a.type || !ARCANE_TYPES.has(a.type) || a.levelStats.length === 0) continue;
    if (byName.has(a.name)) continue;
    byName.set(a.name, {
      uniqueName: a.uniqueName,
      name: a.name,
      rarity: a.rarity ?? null,
      image: a.imageName ?? null,
      maxRank: a.levelStats.length - 1,
      effects: a.levelStats.map((level) => effectText(level.stats)),
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Versions the data lists but nobody can get any more: Excalibur Prime was a Founders'
 * exclusive (Alex, 13 Nov 2026), so Excalibur's builds go to Excalibur Umbra.
 */
export const UNOBTAINABLE = new Set(['Excalibur Prime']);

/** The version that owns a Warframe's builds: the Prime if it can be had, else Umbra, else normal. */
export function buildsVariant(group: WarframeGroup): WarframeGroup['variants'][number] {
  const of = (kind: string) => group.variants.find((v) => v.kind === kind);
  const prime = of('prime');
  if (prime && !UNOBTAINABLE.has(prime.raw.name)) return prime;
  return of('umbra') ?? of('normal') ?? group.variants[0]!;
}

const HELMINTH_PREFIX = '/Lotus/Powersuits/PowersuitAbilities/Helminth';

/** "https://wiki.warframe.com/wiki/Marked_For_Death" → "Marked For Death". */
function nameFromPage(page: string): string {
  const last = page.split('/').pop() ?? '';
  return decodeURIComponent(last).replace(/_/g, ' ');
}

/**
 * Abilities Helminth can give: every Warframe ability the wiki marks as subsumable, plus
 * Helminth's own. A–Z.
 */
export function helminthOptions(groups: WarframeGroup[]): HelminthOption[] {
  const stats = loadAbilityStats().abilities;
  const out = new Map<string, HelminthOption>();
  for (const group of groups) {
    for (const { raw } of group.variants) {
      for (const a of raw.abilities) {
        if (!stats[a.uniqueName]?.subsumable || out.has(a.uniqueName)) continue;
        out.set(a.uniqueName, {
          uniqueName: a.uniqueName,
          name: a.name,
          from: group.name,
          image: a.imageName ?? null,
        });
      }
    }
  }
  for (const [uniqueName, entry] of Object.entries(stats)) {
    if (!uniqueName.startsWith(HELMINTH_PREFIX) || out.has(uniqueName)) continue;
    out.set(uniqueName, {
      uniqueName,
      name: nameFromPage(entry.page),
      from: 'Helminth',
      image: null,
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
