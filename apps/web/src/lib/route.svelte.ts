/**
 * A tiny hash router (SPEC §3.3: "a small client-side router"): `#/` is the Tracker,
 * `#/settings` the Settings screen. Hash URLs work both from Vite and from the API's
 * static files without any server-side routing.
 */
export type Route = 'tracker' | 'goals' | 'profile' | 'settings';

export function routeFromHash(hash: string): Route {
  const first = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return first === 'settings' || first === 'goals' || first === 'profile' ? first : 'tracker';
}

export function hrefFor(route: Route): string {
  return route === 'tracker' ? '#/' : `#/${route}`;
}

export const router = $state({ route: routeFromHash(globalThis.location?.hash ?? '') });

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    router.route = routeFromHash(window.location.hash);
  });
}
