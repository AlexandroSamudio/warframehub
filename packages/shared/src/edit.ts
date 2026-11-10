import { z } from 'zod';
import { CounterSlots, ItemKind, ItemSlots, PeriodType, SubtickSlots } from './checklist.js';

/** Edit mode (SPEC §8.1): the whole checklist, hidden rows included. */

export const Origin = z.enum(['default', 'custom']);
export type Origin = z.infer<typeof Origin>;

export const EditableItem = z.object({
  id: z.int(),
  sectionId: z.int(),
  title: z.string(),
  description: z.string(),
  kind: ItemKind,
  slots: ItemSlots.nullable(),
  verify: z.boolean(),
  linkUrl: z.string().nullable(),
  hidden: z.boolean(),
  origin: Origin,
  /** A default the user has changed (seed updates leave its text alone). */
  edited: z.boolean(),
});
export type EditableItem = z.infer<typeof EditableItem>;

export const EditableSection = z.object({
  id: z.int(),
  slug: z.string(),
  title: z.string(),
  period: PeriodType,
  hidden: z.boolean(),
  origin: Origin,
  edited: z.boolean(),
  items: z.array(EditableItem),
});
export type EditableSection = z.infer<typeof EditableSection>;

/** Response of `GET /api/sections` and of every edit call, so the UI can redraw from it. */
export const ChecklistResponse = z.object({ sections: z.array(EditableSection) });
export type ChecklistResponse = z.infer<typeof ChecklistResponse>;

const Title = z.string().trim().min(1).max(120);
const Description = z.string().trim().max(2000);
const LinkUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .nullable();

export const CreateSectionRequest = z.object({ title: Title, period: PeriodType });
export type CreateSectionRequest = z.infer<typeof CreateSectionRequest>;

export const UpdateSectionRequest = z
  .object({ title: Title, period: PeriodType, hidden: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'nothing to change');
export type UpdateSectionRequest = z.infer<typeof UpdateSectionRequest>;

export const ReorderSectionsRequest = z.object({
  sectionIds: z.array(z.int().positive()).min(1),
});
export type ReorderSectionsRequest = z.infer<typeof ReorderSectionsRequest>;

/** `check`/`info` items have no slots; `counter` needs `{count}`, `subticks` needs `{labels}`. */
export function slotsMatchKind(kind: ItemKind, slots: ItemSlots | null | undefined): boolean {
  switch (kind) {
    case 'check':
    case 'info':
      return slots == null;
    case 'counter':
      return CounterSlots.safeParse(slots).success;
    case 'subticks':
      return SubtickSlots.safeParse(slots).success;
  }
}

const ItemFields = z.object({
  title: Title,
  description: Description,
  kind: ItemKind,
  slots: ItemSlots.nullable(),
  verify: z.boolean(),
  linkUrl: LinkUrl,
  hidden: z.boolean(),
});

export const CreateItemRequest = ItemFields.omit({ hidden: true })
  .extend({
    sectionId: z.int().positive(),
    description: Description.default(''),
    slots: ItemSlots.nullable().default(null),
    verify: z.boolean().default(false),
    linkUrl: LinkUrl.default(null),
  })
  .refine((body) => slotsMatchKind(body.kind, body.slots), {
    message: 'slots do not match the item kind',
    path: ['slots'],
  });
export type CreateItemRequest = z.input<typeof CreateItemRequest>;

/** Any subset of fields. The server checks kind and slots together after merging. */
export const UpdateItemRequest = ItemFields.partial().refine(
  (body) => Object.keys(body).length > 0,
  'nothing to change',
);
export type UpdateItemRequest = z.infer<typeof UpdateItemRequest>;

/** The new order of one section's items. Items listed from other sections move into it. */
export const ReorderItemsRequest = z.object({
  sectionId: z.int().positive(),
  itemIds: z.array(z.int().positive()),
});
export type ReorderItemsRequest = z.infer<typeof ReorderItemsRequest>;
