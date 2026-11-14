import {
  DEFAULT_LANGUAGE,
  HealthResponse,
  SHARD_IMAGES,
  type ApiError,
  type Language,
} from '@warframehub/shared';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from './db/client.js';
import type { LiveTimes } from './db/tracker.js';
import { HttpError } from './http-error.js';
import { isServerMessageKey, message, type ServerMessageKey } from './i18n.js';
import { userLanguage } from './db/tracker.js';
import { GameNames } from './game-names.js';
import { loadSeed, type SeedFile } from './domain/seed.js';
import { registerBuildRoutes } from './routes/builds.js';
import { registerChecklistRoutes } from './routes/checklist.js';
import { registerGoalRoutes } from './routes/goals.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerWarframeRoutes } from './routes/warframes.js';
import { ItemCatalog } from './sources/items.js';
import { ImageCache, WIKI_FILES } from './sources/images.js';
import { POLARITY_FILES } from './routes/warframes.js';
import { ProfileService } from './sources/profile.js';
import { WarframeCatalog } from './sources/warframes.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerTrackerRoutes } from './routes/tracker.js';
import { registerWebApp } from './routes/web.js';
import { registerWorldstateRoutes } from './routes/worldstate.js';
import { WorldstateService } from './sources/worldstate.js';
import { APP_VERSION } from './version.js';

const SHARD_IMAGE_NAMES = new Set(
  Object.values(SHARD_IMAGES).flatMap((s) => [s.normal, s.tauforged]),
);

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
  /** The Warframes section's data (warframestat.us + cache). Created with defaults if not given. */
  warframes?: WarframeCatalog;
  /** DE images, cached in the data folder. Created with defaults if not given. */
  images?: ImageCache;
  /** The polarity symbols from the Warframe wiki, cached the same way. */
  polarities?: ImageCache;
  /** DE public profile import. Created with defaults if not given. */
  profile?: ProfileService;
  /** The default checklist, for "Restore defaults". Read from disk when not given. */
  seed?: SeedFile;
  /** Overrides the live Sortie/Baro times taken from `worldstate` (tests). */
  liveTimes?: () => LiveTimes | Promise<LiveTimes>;
  /** Built web app to serve on the same port (SPEC §3.2). Skipped if missing. */
  webRoot?: string;
  /** The game's Spanish names (names-es.json). Read from disk when not given. */
  gameNames?: GameNames;
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

  // Messages go out in the user's language (SPEC §8.3). A broken settings row never
  // stops an error from being answered.
  const lang = (): Language => {
    try {
      return userLanguage(options.db, options.userId);
    } catch {
      return DEFAULT_LANGUAGE;
    }
  };

  app.setNotFoundHandler((request, reply) => {
    void reply
      .code(404)
      .send(
        errorBody(
          'not_found',
          message(lang(), 'notFoundRoute', { route: `${request.method} ${request.url}` }),
        ),
      );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send(errorBody(error.code, message(lang(), error.key, error.params)));
    }
    if (error instanceof ZodError) {
      // Messages people can see are keys (e.g. "buildName"); anything else names the fields.
      const known = error.issues.filter((issue) => isServerMessageKey(issue.message));
      const text =
        known.length > 0
          ? [
              ...new Set(known.map((issue) => message(lang(), issue.message as ServerMessageKey))),
            ].join('; ')
          : message(lang(), 'invalid', {
              fields: [...new Set(error.issues.map((i) => i.path.join('.') || 'body'))].join(', '),
            });
      return reply.code(400).send(errorBody('bad_request', text));
    }
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('bad_request', message(lang(), 'badRequest')));
    }
    request.log.error(error);
    return reply.code(500).send(errorBody('internal', message(lang(), 'internal')));
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

  const items =
    options.items ??
    new ItemCatalog(options.db, {
      now,
      onError: (query, error) => app.log.warn({ query, err: error }, 'item search failed'),
    });
  const names = options.gameNames ?? GameNames.load();
  registerGoalRoutes(app, { db: options.db, userId: options.userId, now, items, names });

  const warframes =
    options.warframes ??
    new WarframeCatalog(options.db, {
      now,
      onError: (error) => app.log.warn({ err: error }, 'warframes fetch failed'),
    });
  registerWarframeRoutes(app, {
    db: options.db,
    userId: options.userId,
    catalog: warframes,
    names,
    images:
      options.images ??
      new ImageCache({
        ...(options.dataDir ? { dir: join(options.dataDir, 'images') } : {}),
        // Only names the cached data mentions: Warframes, mods, arcanes, shards, weapons.
        allowed: (name) =>
          warframes.cachedImageNames().has(name) ||
          SHARD_IMAGE_NAMES.has(name) ||
          items.knowsImage(name),
        onError: (name, error) => app.log.warn({ name, err: error }, 'image fetch failed'),
      }),
    polarities:
      options.polarities ??
      new ImageCache({
        ...(options.dataDir ? { dir: join(options.dataDir, 'images') } : {}),
        base: WIKI_FILES,
        allowed: (name) => POLARITY_FILES.has(name),
        onError: (name, error) => app.log.warn({ name, err: error }, 'polarity fetch failed'),
      }),
  });
  registerBuildRoutes(app, {
    db: options.db,
    userId: options.userId,
    now,
    catalog: warframes,
    names,
  });

  registerProfileRoutes(
    app,
    options.profile ??
      new ProfileService(options.db, options.userId, {
        now,
        onError: (reason) => app.log.warn({ reason }, 'profile fetch failed'),
      }),
  );

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
