import { HealthResponse, type ApiError } from '@warframehub/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db/client.js';
import type { LiveTimes } from './db/tracker.js';
import { HttpError } from './http-error.js';
import { loadSeed, type SeedFile } from './domain/seed.js';
import { registerChecklistRoutes } from './routes/checklist.js';
import { registerGoalRoutes } from './routes/goals.js';
import { ItemCatalog } from './sources/items.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerTrackerRoutes } from './routes/tracker.js';
import { registerWebApp } from './routes/web.js';
import { registerWorldstateRoutes } from './routes/worldstate.js';
import { WorldstateService } from './sources/worldstate.js';
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
  /** Live rotations (warframestat.us + cache). Created with defaults if not given. */
  worldstate?: WorldstateService;
  /** Goal planner item search (warframestat.us + cache). Created with defaults if not given. */
  items?: ItemCatalog;
  /** The default checklist, for "Restore defaults". Read from disk when not given. */
  seed?: SeedFile;
  /** Overrides the live Sortie/Baro times taken from `worldstate` (tests). */
  liveTimes?: () => LiveTimes | Promise<LiveTimes>;
  /** Built web app to serve on the same port (SPEC §3.2). Skipped if missing. */
  webRoot?: string;
  /** Called on every request, for idle shutdown (SPEC §9.2). */
  onActivity?: () => void;
  /** Minutes without a page before the server stops (shown in Settings). 0 = never. */
  idleMinutes?: number;
  /** Stops the process (Quit button). Without it, `POST /api/shutdown` only answers. */
  onShutdown?: () => void;
}

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    // Errors Fastify raises before routing (e.g. a malformed URL) use the standard shape too.
    frameworkErrors: (error, _request, reply) => {
      void (reply as FastifyReply).code(400).send(errorBody('bad_request', error.message));
    },
  });
  const now = options.now ?? (() => new Date());

  if (options.onActivity) {
    const onActivity = options.onActivity;
    app.addHook('onRequest', async () => onActivity());
  }

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

  const worldstate =
    options.worldstate ??
    new WorldstateService(options.db, {
      now,
      onError: (endpoint, error) =>
        app.log.warn({ endpoint, err: error }, 'worldstate fetch failed'),
    });

  registerTrackerRoutes(app, {
    db: options.db,
    userId: options.userId,
    now,
    liveTimes:
      options.liveTimes ??
      (async () => {
        // Period keys for Sortie and Baro need the live times (SPEC §4.1).
        await worldstate.ensureFresh(['sortie', 'voidTrader']);
        return worldstate.liveTimes();
      }),
  });
  registerWorldstateRoutes(app, { worldstate, now });

  registerGoalRoutes(app, {
    db: options.db,
    userId: options.userId,
    now,
    items:
      options.items ??
      new ItemCatalog(options.db, {
        now,
        onError: (query, error) => app.log.warn({ query, err: error }, 'item search failed'),
      }),
  });

  registerSystemRoutes(app, {
    db: options.db,
    userId: options.userId,
    dataDir: options.dataDir ?? '',
    idleMinutes: options.idleMinutes ?? 0,
    onShutdown: options.onShutdown ?? (() => {}),
  });

  let seed = options.seed;
  registerChecklistRoutes(app, {
    db: options.db,
    userId: options.userId,
    now,
    seed: () => (seed ??= loadSeed()),
  });

  // Last, so every /api route wins over the catch-all.
  if (options.webRoot) registerWebApp(app, options.webRoot);

  return app;
}
