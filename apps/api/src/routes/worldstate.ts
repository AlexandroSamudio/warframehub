import { WorldstateResponse, type WorldstateCards } from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import type { WorldstateService } from '../sources/worldstate.js';

export interface WorldstateRouteDeps {
  worldstate: WorldstateService;
  now: () => Date;
  /** The cards in the user's language (SPEC §8.3). */
  localize?: (cards: WorldstateCards) => WorldstateCards;
}

export function registerWorldstateRoutes(app: FastifyInstance, deps: WorldstateRouteDeps): void {
  const { worldstate, now, localize = (cards) => cards } = deps;
  const respond = (): WorldstateResponse =>
    WorldstateResponse.parse({
      serverTime: now().toISOString(),
      cards: localize(worldstate.cards()),
    });

  /** Cached live rotations; expired endpoints are refetched first (SPEC §7). */
  app.get('/api/worldstate', async (): Promise<WorldstateResponse> => {
    await worldstate.ensureFresh();
    return respond();
  });

  /** Forces a refetch. Rate-limited to once a minute (429 otherwise). */
  app.post('/api/worldstate/refresh', async (): Promise<WorldstateResponse> => {
    await worldstate.refreshAll();
    return respond();
  });
}
