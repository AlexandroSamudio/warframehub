import { HealthResponse } from '@warframehub/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { APP_VERSION } from './version.js';

export interface AppOptions {
  logger?: boolean;
  /** Injectable clock, so tests can pin the time. */
  now?: () => Date;
  /** Shown by /api/health. */
  dataDir?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => new Date());

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      error: { code: 'not_found', message: `No route for ${request.method} ${request.url}` },
    });
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

  return app;
}
