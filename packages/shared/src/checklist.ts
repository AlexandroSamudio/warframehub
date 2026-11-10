import { z } from 'zod';

/**
 * How often a section's ticks reset (SPEC §4.1).
 * An item's period always comes from its section.
 */
export const PeriodType = z.enum([
  'daily',
  'weekly',
  'eight_hour',
  'four_day',
  'sortie',
  'baro',
  'manual',
]);
export type PeriodType = z.infer<typeof PeriodType>;

/**
 * What an item looks like on the checklist (SPEC §4.3):
 * - `check`: one checkbox
 * - `counter`: N identical slots (e.g. Steel Path Incursions ×6)
 * - `subticks`: named slots (e.g. Vendetta · Radiation · Ignition)
 * - `info`: a note with no checkbox
 */
export const ItemKind = z.enum(['check', 'counter', 'subticks', 'info']);
export type ItemKind = z.infer<typeof ItemKind>;

/** Slot layout stored in `items.slots_json`. `check` and `info` items have none. */
export const CounterSlots = z.object({ count: z.int().min(1).max(99) });
export type CounterSlots = z.infer<typeof CounterSlots>;

export const SubtickSlots = z.object({ labels: z.array(z.string().min(1)).min(1).max(20) });
export type SubtickSlots = z.infer<typeof SubtickSlots>;

export const ItemSlots = z.union([CounterSlots, SubtickSlots]);
export type ItemSlots = z.infer<typeof ItemSlots>;

/** How many tick slots an item has. `info` items have none. */
export function slotCount(kind: ItemKind, slots: ItemSlots | null): number {
  switch (kind) {
    case 'info':
      return 0;
    case 'check':
      return 1;
    case 'counter':
      return slots && 'count' in slots ? slots.count : 1;
    case 'subticks':
      return slots && 'labels' in slots ? slots.labels.length : 1;
  }
}
