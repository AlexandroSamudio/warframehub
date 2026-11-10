import { HealthResponse, type ApiError } from '@warframehub/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db/client.js';
import type { LiveTimes } from './db/tracker.js';
import { HttpError } from './http-error.js';
import { registerTrackerRoutes } from './routes/tracker.js';
import { APP_VERSION } from './version.js';

export interface AppOptions {
  db: Db;
  /** The user every request acts as. v1 has a single local user (SPEC §6). */
  userId: number;
  logger?: boolean;
  /** Injectable clock, so tests can pin the time. */
  now?: () => Date;
  /** Shown by /api/health. */
  dataDir?: string;
  /** Live Sortie/Baro times. Phase 3 wires this to the world-state cache. */
  liveTimes?: () => LiveTimes;
}

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => new Date());

  app.setNotFoundHandler((request, reply) => {
    void reply
      .code(404)
      .send(errorBody('not_found', `No route for ${request.method} ${request.url}`));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return reply.code(400).send(errorBody('bad_request', message));
    }
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : 'Bad request';
      return reply.code(status).send(errorBody('bad_request', message));
    }
    request.log.error(error);
    return reply.code(500).send(errorBody('internal', 'Something went wrong on the server'));
  });

  app.get('/api/health', async (): Promise<HealthResponse> => {
    return HealthResponse.parse({
      status: 'ok',
      app: 'warframehub',
      version: APP_VERSION,
      serverTime: now().toISOString(),
      dataDir: options.dataDir ?? '',
    });
  });

  registerTrackerRoutes(app, {
    db: options.db,
    userId: options.userId,
    now,
    liveTimes: options.liveTimes ?? (() => ({})),
  });

  return app;
}
