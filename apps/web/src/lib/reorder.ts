/**
 * New item order for `targetSectionId` after moving `itemId` to `index` in it.
 * `index` counts positions in the target list as it looks without the moved item.
 * Returns null when nothing would change.
 */
export function moveItem(
  sections: { id: number; items: { id: number }[] }[],
  itemId: number,
  targetSectionId: number,
  index: number,
): number[] | null {
  const target = sections.find((s) => s.id === targetSectionId);
  if (!target) return null;
  const before = target.items.map((i) => i.id);
  const rest = before.filter((id) => id !== itemId);
  const at = Math.max(0, Math.min(index, rest.length));
  const after = [...rest.slice(0, at), itemId, ...rest.slice(at)];
  return after.join() === before.join() ? null : after;
}

/** Moves one id up (-1) or down (+1) in a list. Returns null at the ends. */
export function shift(ids: number[], id: number, by: -1 | 1): number[] | null {
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
