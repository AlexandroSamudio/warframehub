import type { TrackerSection } from '@warframehub/shared';

/** Ticked slots out of all slots in a section. Info rows count for neither. */
export function sectionProgress(section: TrackerSection): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const item of section.items) {
    total += item.slotCount;
    done += item.checked.filter((slot) => slot < item.slotCount).length;
  }
  return { done, total };
}

/** The earliest upcoming reset in a tracker response, as epoch ms, or null if none is known. */
export function earliestReset(times: (string | null)[]): number | null {
  let earliest: number | null = null;
  for (const iso of times) {
    if (iso === null) continue;
    const ms = Date.parse(iso);
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}
