/**
 * What the Warframes list remembers while you look at a page: the filter you typed and the
 * Warframe you opened last (focus goes back to its tile). In memory only.
 */
export const listState = $state({ filter: '', lastSlug: null as string | null });
