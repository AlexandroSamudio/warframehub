/**
 * Runs a change that can add or remove rows above the control you used (e.g. a part
 * amount that changes the resource list), then scrolls back so that control's row stays
 * where it was on screen, and gives focus back. When the control itself is gone, focus
 * goes to `fallback()` instead of being lost.
 */
export async function keepPlace(
  change: () => Promise<boolean>,
  after: () => Promise<void>,
  fallback?: () => HTMLElement | null | undefined,
): Promise<boolean> {
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const anchor = el?.closest('li') ?? el;
  const before = anchor?.getBoundingClientRect().top;
  const ok = await change();
  await after();
  if (anchor?.isConnected && before !== undefined) {
    window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: 'instant' });
  }
  if (el?.isConnected) el.focus({ preventScroll: true });
  else if (el) fallback?.()?.focus();
  return ok;
}
