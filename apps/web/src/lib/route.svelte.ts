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

export function hrefFor(route: Route, param?: string): string {
  if (route === 'tracker') return '#/';
  return param ? `#/${route}/${param}` : `#/${route}`;
}

export const router = $state({
  route: routeFromHash(globalThis.location?.hash ?? ''),
  param: paramFromHash(globalThis.location?.hash ?? ''),
});

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    router.route = routeFromHash(window.location.hash);
    router.param = paramFromHash(window.location.hash);
  });
}
