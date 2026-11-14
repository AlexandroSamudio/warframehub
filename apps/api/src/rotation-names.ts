import { existsSync, readFileSync } from 'node:fs';
import type { Language, WorldstateCards } from '@warframehub/shared';
import { z } from 'zod';
import type { NamesFile } from './sources/names-es.js';

/**
 * The live rotations in the user's language (SPEC §8.3). warframestat.us answers in English
 * only, so the server swaps in Spanish on the way out:
 * - nodes, mission types and item names: DE's export (names-es.json);
 * - Sortie modifiers: the game's Spanish from warframestat.us's data package;
 * - factions: the same package; Archons as the export names their shards;
 * - Nightwave challenges and Archimedea effects: our own translation, done once
 *   (`apps/api/data/rotations-text-es.json`), worded with the export's terms.
 * Anything new or unknown stays in English.
 */

const TEXT_FILE = new URL('../data/rotations-text-es.json', import.meta.url);

export const RotationText = z.object({
  nightwave: z.record(z.string(), z.object({ title: z.string(), description: z.string() })),
  archimedea: z.record(z.string(), z.object({ name: z.string(), description: z.string() })),
});
export type RotationText = z.infer<typeof RotationText>;

/** warframe-worldstate-data's `es/factionsData.json`, plus the names warframestat.us uses. */
const FACTIONS: Record<string, string> = {
  Corrupted: 'Corruptos',
  Infestation: 'Infestados',
  Infested: 'Infestados',
  Sentient: 'Consciente',
  'Man in the Wall': 'Hombre en la pared',
  // Our own, from the export's "murmullos" (Cleanse The Murmur → Limpieza de murmullos).
  'The Murmur': 'El Murmullo',
  Murmur: 'El Murmullo',
};

export class RotationNames {
  private readonly planets = new Map<string, string>();

  constructor(
    private readonly es: NamesFile,
    private readonly text: RotationText = { nightwave: {}, archimedea: {} },
  ) {
    for (const [en, sp] of Object.entries(es.nodes)) {
      const [enPlanet] = en.split('/');
      const [esPlanet] = sp.split('/');
      if (enPlanet && esPlanet) this.planets.set(enPlanet, esPlanet);
    }
  }

  static load(es: NamesFile): RotationNames {
    const text = existsSync(TEXT_FILE)
      ? RotationText.parse(JSON.parse(readFileSync(TEXT_FILE, 'utf8')))
      : undefined;
    return new RotationNames(es, text);
  }

  /** "Ara (Mars)" → "Ara (Marte)"; "Orcus Relay (Pluto)" → "Repetidor Orcus (Plutón)". */
  node(en: string): string {
    const m = /^(.+) \(([^()]+)\)$/.exec(en);
    if (!m) return en;
    const [, node, planet] = m as unknown as [string, string, string];
    const both = this.es.nodes[`${planet}/${node}`];
    if (both) {
      const [esPlanet, esNode] = both.split('/');
      return `${esNode} (${esPlanet})`;
    }
    const relay = /^(.+) Relay$/.exec(node);
    const esNode = relay ? `Repetidor ${relay[1]}` : node;
    return `${esNode} (${this.planets.get(planet) ?? planet})`;
  }

  missionType(en: string): string {
    return this.es.missionTypes[en] ?? en;
  }

  faction(en: string): string {
    return FACTIONS[en] ?? en;
  }

  /** "Archon Amar" → "Arconte Amar" (the export: "Fragmento de Arconte Amar"). */
  boss(en: string): string {
    const archon = /^Archon (.+)$/.exec(en);
    return archon ? `Arconte ${archon[1]}` : en;
  }

  /**
   * A reward or item: "Umbra Forma Blueprint" → "Plano de Forma Umbra", "50,000 Kuva" →
   * "50.000 de Kuva", "3x Forma" → "3x Forma".
   */
  item(en: string): string {
    const known = this.es.english[en] ?? this.es.items[en];
    if (known) return known;
    const amount = /^(\d{1,3}(?:,\d{3})+|\d+) (.+)$/.exec(en);
    if (amount) return `${amount[1]!.replace(/,/g, '.')} de ${this.item(amount[2]!)}`;
    const times = /^(\d+)x (.+)$/.exec(en);
    if (times) return `${times[1]}x ${this.item(times[2]!)}`;
    const blueprint = /^(.+) Blueprint$/.exec(en);
    if (blueprint) {
      const inner = this.item(blueprint[1]!);
      if (inner !== blueprint[1]) return `Plano de ${inner}`;
    }
    return en;
  }

  private sortie(en: string): string {
    return this.es.sortieModifiers[en] ?? en;
  }

  private effect(e: { name: string; description: string }) {
    const es = this.text.archimedea[e.name];
    return es ? { ...e, name: es.name, description: es.description } : e;
  }

  cards(raw: WorldstateCards, lang: Language): WorldstateCards {
    const c = withoutPlaceholders(raw);
    if (lang === 'en') return c;
    type Data<C extends { data: unknown }> = NonNullable<C['data']>;
    const map = <C extends { data: unknown }>(card: C, f: (d: Data<C>) => Data<C>): C =>
      card.data === null ? card : { ...card, data: f(card.data as Data<C>) };
    return {
      ...c,
      archonHunt: map(c.archonHunt, (a) => ({
        ...a,
        boss: this.boss(a.boss),
        faction: this.faction(a.faction),
        missions: a.missions.map((m) => ({
          type: this.missionType(m.type),
          node: this.node(m.node),
        })),
      })),
      sortie: map(c.sortie, (s) => ({
        ...s,
        faction: this.faction(s.faction),
        missions: s.missions.map((m) => ({
          missionType: this.missionType(m.missionType),
          node: this.node(m.node),
          modifier: this.sortie(m.modifier),
          modifierDescription: this.sortie(m.modifierDescription),
        })),
      })),
      steelPath: map(c.steelPath, (s) => ({
        ...s,
        currentReward: { ...s.currentReward, name: this.item(s.currentReward.name) },
        estimatedReward: s.estimatedReward && {
          ...s.estimatedReward,
          name: this.item(s.estimatedReward.name),
        },
      })),
      dailyDeals: map(c.dailyDeals, (deals) =>
        deals.map((d) => ({ ...d, item: this.item(d.item) })),
      ),
      voidTrader: map(c.voidTrader, (v) => ({ ...v, location: this.node(v.location) })),
      nightwave: map(c.nightwave, (n) => ({
        ...n,
        challenges: n.challenges.map((ch) => {
          const es = this.text.nightwave[ch.title];
          if (es) return { ...ch, title: es.title, description: es.description };
          // A tier the data doesn't list yet ("Mission Complete XXI"): the title's base in
          // Spanish with its tier; the description's numbers differ per tier, so it stays.
          const tier = /^(.+) ([IVXLC]+)$/.exec(ch.title);
          const base = tier ? this.text.nightwave[tier[1]!] : undefined;
          return base ? { ...ch, title: `${base.title} ${tier![2]}` } : ch;
        }),
      })),
      events: map(c.events, (events) =>
        events.map((e) => ({ ...e, node: e.node && this.node(e.node) })),
      ),
      arbitration: map(c.arbitration, (a) => ({
        ...a,
        node: this.node(a.node),
        missionType: this.missionType(a.missionType),
        enemy: this.faction(a.enemy),
      })),
      duviriCycle: map(c.duviriCycle, (ci) => ({
        ...ci,
        normal: ci.normal.map((x) => this.item(x)),
        steelPath: ci.steelPath.map((x) => this.item(x)),
      })),
      archimedeas: map(c.archimedeas, (list) =>
        list.map((a) => ({
          ...a,
          missions: a.missions.map((m) => ({
            ...m,
            missionType: this.missionType(m.missionType),
            faction: this.faction(m.faction),
            deviation: m.deviation && this.effect(m.deviation),
            risks: m.risks.map((r) => ({ ...r, ...this.effect(r) })),
          })),
          personalModifiers: a.personalModifiers.map((p) => this.effect(p)),
        })),
      ),
    };
  }
}

/** DE's unfinished texts ("[PH] Infected Wounds Desc"): shown as nothing, in any language. */
const isPlaceholder = (text: string) => text.startsWith('[PH]');
const clear = (text: string) => (isPlaceholder(text) ? '' : text);

function withoutPlaceholders(c: WorldstateCards): WorldstateCards {
  const effect = <T extends { description: string }>(e: T): T => ({
    ...e,
    description: clear(e.description),
  });
  return {
    ...c,
    nightwave: c.nightwave.data
      ? {
          ...c.nightwave,
          data: { ...c.nightwave.data, challenges: c.nightwave.data.challenges.map(effect) },
        }
      : c.nightwave,
    sortie: c.sortie.data
      ? {
          ...c.sortie,
          data: {
            ...c.sortie.data,
            missions: c.sortie.data.missions.map((m) => ({
              ...m,
              modifierDescription: clear(m.modifierDescription),
            })),
          },
        }
      : c.sortie,
    archimedeas: c.archimedeas.data
      ? {
          ...c.archimedeas,
          data: c.archimedeas.data.map((a) => ({
            ...a,
            missions: a.missions.map((m) => ({
              ...m,
              deviation: m.deviation && effect(m.deviation),
              risks: m.risks.map(effect),
            })),
            personalModifiers: a.personalModifiers.map(effect),
          })),
        }
      : c.archimedeas,
  };
}
