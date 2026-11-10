import { readFileSync } from 'node:fs';
import type { FetchFn } from './worldstate.js';

/** Real warframestat.us responses saved on 2026-11-10 at 13:29:12 UTC (tests only). */
export const FIXTURES_SAVED_AT = new Date('2026-11-10T13:29:12.000Z');

/** `duviriCycle.json` and `archimedeas.json` were saved later, at 15:59:02 UTC. */
export const LATER_FIXTURES_SAVED_AT = new Date('2026-11-10T15:59:02.000Z');

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

/** Real warframestat.us item search responses saved on 2026-11-10 at 17:22 UTC. */
export function itemsFixture(name: string): Record<string, unknown>[] {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/items/${name}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>[];
}

/**
 * A fake warframestat.us item search that serves ./fixtures/items and can go offline.
 * `override` replaces the response for one query (e.g. to simulate a changed recipe).
 */
export function fakeItemsApi() {
  const state = {
    online: true,
    calls: [] as string[],
    userAgents: [] as string[],
    override: new Map<string, unknown[]>(),
  };
  const fetchFn: FetchFn = async (url, init) => {
    const u = new URL(url);
    state.calls.push(u.pathname);
    state.userAgents.push(new Headers(init.headers).get('user-agent') ?? '');
    if (!state.online) throw new TypeError('fetch failed');
    const [, kind, , rawQuery] = u.pathname.split('/'); // /warframes/search/nidus
    const query = decodeURIComponent(rawQuery!);
    const overridden = state.override.get(`${kind}/${query}`);
    let body: unknown;
    if (overridden) {
      body = overridden;
    } else {
      try {
        body = itemsFixture(`${kind}_search_${query}`);
      } catch {
        body = []; // no fixture for this query: upstream returns an empty list
      }
    }
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  };
  return { state, fetchFn };
}
