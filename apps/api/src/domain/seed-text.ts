import type { Language } from '@warframehub/shared';
import type { SeedFile } from './seed.js';

/**
 * The default checklist in the user's language (SPEC §8.3). The database keeps the seed's
 * English; an unedited default shows the seed's Spanish instead. Anything the user edited
 * is theirs and shows as they wrote it, in either language (SPEC §5.1).
 */

interface Text {
  title: string;
  description?: string;
}

/** A row as stored, with what decides whether the seed's text applies. */
export interface SeedRow {
  seedId: string | null;
  origin: 'default' | 'custom';
  edited: boolean;
}

export class SeedText {
  private readonly sections = new Map<string, Text>();
  private readonly items = new Map<string, Text>();

  constructor(seed: SeedFile) {
    for (const s of seed.sections) {
      if (s.es) this.sections.set(s.seedId, s.es);
      for (const i of s.items) if (i.es) this.items.set(i.seedId, i.es);
    }
  }

  private find(map: Map<string, Text>, row: SeedRow, lang: Language): Text | undefined {
    if (lang === 'en' || row.origin !== 'default' || row.edited || !row.seedId) return undefined;
    return map.get(row.seedId);
  }

  sectionTitle(row: SeedRow & { title: string }, lang: Language): string {
    return this.find(this.sections, row, lang)?.title ?? row.title;
  }

  item<T extends SeedRow & { title: string; description: string }>(
    row: T,
    lang: Language,
  ): { title: string; description: string } {
    const es = this.find(this.items, row, lang);
    if (!es) return { title: row.title, description: row.description };
    return {
      title: es.title,
      // A description the seed has in English but not in Spanish stays in English.
      description: row.description === '' ? '' : es.description || row.description,
    };
  }
}
