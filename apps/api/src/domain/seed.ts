import { CounterSlots, PeriodType, SubtickSlots } from '@warframehub/shared';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** Shape of `apps/api/seed/checklist.json`, the default checklist (SPEC §5.1, Appendix A). */

const SeedId = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'lowercase letters, digits, dots, dashes');

const BaseItem = z.object({
  seedId: SeedId,
  title: z.string().min(1),
  description: z.string().default(''),
  /** Shown with a "verify" badge until confirmed in game. */
  verify: z.boolean().default(false),
  linkUrl: z.url().optional(),
  /** The Spanish text (SPEC §8.3), shown while the item is unedited. */
  es: z.object({ title: z.string().min(1), description: z.string().default('') }).optional(),
});

export const SeedItem = z.discriminatedUnion('kind', [
  BaseItem.extend({ kind: z.literal('check') }),
  BaseItem.extend({ kind: z.literal('info') }),
  BaseItem.extend({ kind: z.literal('counter'), slots: CounterSlots }),
  BaseItem.extend({ kind: z.literal('subticks'), slots: SubtickSlots }),
]);
export type SeedItem = z.infer<typeof SeedItem>;

export const SeedSection = z.object({
  seedId: SeedId,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  period: PeriodType,
  /** The Spanish title, shown while the section is unedited. */
  es: z.object({ title: z.string().min(1) }).optional(),
  items: z.array(SeedItem),
});
export type SeedSection = z.infer<typeof SeedSection>;

export const SeedFile = z
  .object({
    seedVersion: z.int().min(1),
    sections: z.array(SeedSection).min(1),
  })
  .superRefine((seed, ctx) => {
    const seen = new Set<string>();
    const check = (value: string, what: string, path: (string | number)[]) => {
      if (seen.has(value)) {
        ctx.addIssue({ code: 'custom', message: `duplicate ${what} "${value}"`, path });
      }
      seen.add(value);
    };
    seed.sections.forEach((section, s) => {
      check(`section:${section.seedId}`, 'section seedId', ['sections', s, 'seedId']);
      check(`slug:${section.slug}`, 'section slug', ['sections', s, 'slug']);
      section.items.forEach((item, i) => {
        check(`item:${item.seedId}`, 'item seedId', ['sections', s, 'items', i, 'seedId']);
      });
    });
  });
export type SeedFile = z.infer<typeof SeedFile>;

// Works from both src/domain (dev) and dist/domain (build).
export const DEFAULT_SEED_PATH = new URL('../../seed/checklist.json', import.meta.url);

export function loadSeed(path: URL | string = DEFAULT_SEED_PATH): SeedFile {
  return SeedFile.parse(JSON.parse(readFileSync(path, 'utf8')));
}
