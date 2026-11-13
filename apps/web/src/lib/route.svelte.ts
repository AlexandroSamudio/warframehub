/**
 * A tiny hash router (SPEC §3.3: "a small client-side router"): `#/` is the Tracker,
 * `#/settings` the Settings screen, `#/warframes/nidus` a Warframe's page. Hash URLs work
 * both from Vite and from the API's static files without any server-side routing.
 */
export type Route = 'tracker' | 'goals' | 'warframes' | 'inventory' | 'profile' | 'settings';

const ROUTES: Route[] = ['goals', 'warframes', 'inventory', 'profile', 'settings'];

function segments(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('?')[0]!.split('/');
}

export function routeFromHash(hash: string): Route {
  const first = segments(hash)[0] ?? '';
  return ROUTES.includes(first as Route) ? (first as Route) : 'tracker';
}

/**
 * The part after the route: the Warframe's slug in `#/warframes/nidus`, else null.
 * Lowercased; anything else non-empty is passed on as it is, so the page can say
 * "No Warframe called…" instead of showing the list.
 */
export function paramFromHash(hash: string): string | null {
  const [first, second] = segments(hash);
  if (first !== 'warframes' || !second) return null;
  return decodeURIComponent(second).toLowerCase().slice(0, 60);
}

/**
 * The Builds part of a Warframe (SPEC §14.1):
 * - `#/warframes/mesa/builds`: the Builds page (the remembered build open);
 * - `…/builds/12`: that build open;
 * - `…/builds/new`, `…/builds/12/edit`: the edit page.
 */
export type BuildSub =
  { kind: 'list' } | { kind: 'view'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number };

const ID = /^[1-9]\d{0,8}$/;

export function subFromHash(hash: string): BuildSub | null {
  const [first, second, third, fourth, fifth] = segments(hash);
  if (first !== 'warframes' || !second || third !== 'builds') return null;
  if (!fourth) return { kind: 'list' };
  if (fourth === 'new') return fifth ? null : { kind: 'new' };
  if (!ID.test(fourth)) return null;
  if (!fifth) return { kind: 'view', id: Number(fourth) };
  return fifth === 'edit' ? { kind: 'edit', id: Number(fourth) } : null;
}

/** The address of a Warframe's Builds page, one build, or its edit page. */
export function buildHref(slug: string, sub: BuildSub = { kind: 'list' }): string {
  const base = `#/warframes/${slug}/builds`;
  switch (sub.kind) {
    case 'list':
      return base;
    case 'new':
      return `${base}/new`;
    case 'view':
      return `${base}/${sub.id}`;
    case 'edit':
      return `${base}/${sub.id}/edit`;
  }
}

export function hrefFor(route: Route, param?: string): string {
  if (route === 'tracker') return '#/';
  return param ? `#/${route}/${param}` : `#/${route}`;
}

export const router = $state({
  route: routeFromHash(globalThis.location?.hash ?? ''),
  param: paramFromHash(globalThis.location?.hash ?? ''),
  sub: subFromHash(globalThis.location?.hash ?? ''),
});

/**
 * A page with unsaved changes (the build edit page) can hold a move to another address:
 * the guard gets the new hash and returns false to stay. The address is then put back,
 * and the page asks inline; `leave()` goes on once the user agrees.
 */
let guard: ((hash: string) => boolean) | null = null;
let shown = globalThis.location?.hash ?? '';

export function setLeaveGuard(fn: ((hash: string) => boolean) | null): void {
  guard = fn;
}

/** Goes to `hash` without asking the guard (after "Leave without saving"). */
export function leave(hash: string): void {
  guard = null;
  window.location.hash = hash;
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = window.location.hash;
    if (guard && !guard(next)) {
      // Covers links, the nav and browser Back alike: stay where we were.
      history.replaceState(null, '', shown || '#/');
      return;
    }
    shown = next;
    router.route = routeFromHash(next);
    router.param = paramFromHash(next);
    router.sub = subFromHash(next);
  });
}
