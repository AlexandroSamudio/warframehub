import { ItemSearchResponse } from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ItemCatalog } from '../sources/items.js';

export interface GoalRouteDeps {
  items: ItemCatalog;
}

const SearchQuery = z.object({ q: z.string().max(80).default('') });

/** Goal planner routes (SPEC §13). The goals themselves come in the next step. */
export function registerGoalRoutes(app: FastifyInstance, deps: GoalRouteDeps): void {
  const { items } = deps;

  /** Warframes and weapons matching `q`, from warframestat.us (cached for a day). */
  app.get('/api/goals/search', async (request): Promise<ItemSearchResponse> => {
    const { q } = SearchQuery.parse(request.query);
    return ItemSearchResponse.parse(await items.search(q));
  });
}
