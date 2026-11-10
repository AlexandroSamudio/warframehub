import { z } from 'zod';
import { ItemKind, ItemSlots, PeriodType } from './checklist.js';

/** One checklist item as the Tracker screen shows it. */
export const TrackerItem = z.object({
  id: z.int(),
  title: z.string(),
  description: z.string(),
  kind: ItemKind,
  slots: ItemSlots.nullable(),
  /** Number of tick slots (0 for `info`, 1 for `check`). */
  slotCount: z.int().min(0),
  /** Slots ticked in the current period. */
  checked: z.array(z.int().min(0)),
  verify: z.boolean(),
  linkUrl: z.string().nullable(),
});
export type TrackerItem = z.infer<typeof TrackerItem>;

export const TrackerSection = z.object({
  id: z.int(),
  slug: z.string(),
  title: z.string(),
  period: PeriodType,
  /** Key of the current period, computed by the server (SPEC §4.2). */
  periodKey: z.string(),
  /** When the ticks clear, or null when unknown (`manual`, or `baro` without a known arrival). */
  nextReset: z.iso.datetime().nullable(),
  /** True when the reset time is a fallback guess rather than live data. */
  estimated: z.boolean(),
  items: z.array(TrackerItem),
});
export type TrackerSection = z.infer<typeof TrackerSection>;

/** The reset clocks shown in the Tracker's top bar (SPEC §8.1). */
export const ClockId = z.enum(['daily', 'weekly', 'sortie', 'eight_hour', 'baro']);
export type ClockId = z.infer<typeof ClockId>;

export const ResetClock = z.object({
  id: ClockId,
  nextReset: z.iso.datetime().nullable(),
  estimated: z.boolean(),
});
export type ResetClock = z.infer<typeof ResetClock>;

/** Response of `GET /api/tracker`: everything the Tracker screen needs in one call. */
export const TrackerResponse = z.object({
  serverTime: z.iso.datetime(),
  displayTz: z.string(),
  clocks: z.array(ResetClock),
  sections: z.array(TrackerSection),
});
export type TrackerResponse = z.infer<typeof TrackerResponse>;

/** Body of `PUT /api/ticks`. The server works out the period key; the client never sends one. */
export const PutTickRequest = z.object({
  itemId: z.int().positive(),
  slot: z.int().min(0),
  checked: z.boolean(),
});
export type PutTickRequest = z.infer<typeof PutTickRequest>;

export const PutTickResponse = PutTickRequest.extend({ periodKey: z.string() });
export type PutTickResponse = z.infer<typeof PutTickResponse>;

/** Response of `POST /api/sections/:id/clear` (manual sections only). */
export const ClearSectionResponse = z.object({
  sectionId: z.int(),
  periodKey: z.string(),
});
export type ClearSectionResponse = z.infer<typeof ClearSectionResponse>;
