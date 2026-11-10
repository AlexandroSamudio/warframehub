import {
  CreateGoalRequest,
  GoalsResponse,
  ItemSearchResponse,
  ReorderGoalsRequest,
  SetStockRequest,
  UpdateGoalPartRequest,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import {
  createGoal,
  deleteGoal,
  loadGoals,
  markBuilt,
  reactivate,
  refreshRecipe,
  reorderGoals,
  setPartOwned,
  setStock,
} from '../db/goals.js';
import type { ItemCatalog } from '../sources/items.js';

export interface GoalRouteDeps {
  db: Db;
  userId: number;
  now: () => Date;
  items: ItemCatalog;
}

const SearchQuery = z.object({ q: z.string().max(80).default('') });
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** Goal planner routes (SPEC §13). Every change answers with the full `GoalsResponse`. */
export function registerGoalRoutes(app: FastifyInstance, deps: GoalRouteDeps): void {
  const { db, userId, now, items } = deps;
  const current = (): GoalsResponse => GoalsResponse.parse(loadGoals(db, userId));

  /** Warframes and weapons matching `q`, from warframestat.us (cached for a day). */
  app.get('/api/goals/search', async (request): Promise<ItemSearchResponse> => {
    const { q } = SearchQuery.parse(request.query);
    return ItemSearchResponse.parse(await items.search(q));
  });

  app.get('/api/goals', async () => current());

  app.post('/api/goals', async (request, reply) => {
    const { uniqueName } = CreateGoalRequest.parse(request.body);
    createGoal(db, userId, items, uniqueName, now());
    return reply.code(201).send(current());
  });

  app.patch('/api/goals/:id/parts', async (request) => {
    const { id } = IdParams.parse(request.params);
    setPartOwned(db, userId, id, UpdateGoalPartRequest.parse(request.body));
    return current();
  });

  app.put('/api/resources', async (request) => {
    setStock(db, userId, SetStockRequest.parse(request.body));
    return current();
  });

  app.post('/api/goals/:id/built', async (request) => {
    const { id } = IdParams.parse(request.params);
    markBuilt(db, userId, id, now());
    return current();
  });

  app.post('/api/goals/:id/reactivate', async (request) => {
    const { id } = IdParams.parse(request.params);
    reactivate(db, userId, id);
    return current();
  });

  app.delete('/api/goals/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    deleteGoal(db, userId, id);
    return current();
  });

  app.post('/api/goals/reorder', async (request) => {
    reorderGoals(db, userId, ReorderGoalsRequest.parse(request.body));
    return current();
  });

  app.post('/api/goals/:id/refresh', async (request) => {
    const { id } = IdParams.parse(request.params);
    await refreshRecipe(db, userId, items, id, now());
    return current();
  });
}
