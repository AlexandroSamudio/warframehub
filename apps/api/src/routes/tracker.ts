import type { SeedText } from '../domain/seed-text.js';
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
  /** Live Sortie/Baro times; may refresh the world-state cache first. */
  liveTimes: () => LiveTimes | Promise<LiveTimes>;
  /** The default checklist's Spanish (SPEC §8.3). */
  text: () => SeedText;
}

const IdParams = z.object({ id: z.coerce.number().int().positive() });

export function registerTrackerRoutes(app: FastifyInstance, deps: TrackerRouteDeps): void {
  const { db, userId, now, liveTimes, text } = deps;

  app.get('/api/tracker', async (): Promise<TrackerResponse> => {
    const live = await liveTimes();
    return TrackerResponse.parse(loadTracker(db, userId, now(), live, text()));
  });

  app.put('/api/ticks', async (request): Promise<PutTickResponse> => {
    const body = PutTickRequest.parse(request.body);
    const live = await liveTimes();
    return PutTickResponse.parse(setTick(db, userId, body, now(), live));
  });

  app.post('/api/sections/:id/clear', async (request): Promise<ClearSectionResponse> => {
    const { id } = IdParams.parse(request.params);
    return ClearSectionResponse.parse(clearSection(db, userId, id, now()));
  });
}
