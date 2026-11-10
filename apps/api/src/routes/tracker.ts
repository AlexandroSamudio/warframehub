import {
  ClearSectionResponse,
  PutTickRequest,
  PutTickResponse,
  TrackerResponse,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { clearSection, loadTracker, setTick, type LiveTimes } from '../db/tracker.js';

export interface TrackerRouteDeps {
  db: Db;
  userId: number;
  now: () => Date;
  liveTimes: () => LiveTimes;
}

const IdParams = z.object({ id: z.coerce.number().int().positive() });

export function registerTrackerRoutes(app: FastifyInstance, deps: TrackerRouteDeps): void {
  const { db, userId, now, liveTimes } = deps;

  app.get('/api/tracker', async (): Promise<TrackerResponse> => {
    return TrackerResponse.parse(loadTracker(db, userId, now(), liveTimes()));
  });

  app.put('/api/ticks', async (request): Promise<PutTickResponse> => {
    const body = PutTickRequest.parse(request.body);
    return PutTickResponse.parse(setTick(db, userId, body, now(), liveTimes()));
  });

  app.post('/api/sections/:id/clear', async (request): Promise<ClearSectionResponse> => {
    const { id } = IdParams.parse(request.params);
    return ClearSectionResponse.parse(clearSection(db, userId, id, now()));
  });
}
