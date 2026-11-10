/**
 * A tiny hash router (SPEC §3.3: "a small client-side router"): `#/` is the Tracker,
 * `#/settings` the Settings screen. Hash URLs work both from Vite and from the API's
 * static files without any server-side routing.
 */
export type Route = 'tracker' | 'settings';

export function routeFromHash(hash: string): Route {
  return hash.replace(/^#\/?/, '').split(/[/?]/)[0] === 'settings' ? 'settings' : 'tracker';
}

export function hrefFor(route: Route): string {
  return route === 'settings' ? '#/settings' : '#/';
}

export const router = $state({ route: routeFromHash(globalThis.location?.hash ?? '') });

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    router.route = routeFromHash(window.location.hash);
  });
}
