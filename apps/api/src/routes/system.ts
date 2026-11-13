import { SettingsResponse, UpdateSettingsRequest } from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { displayTz, userLanguage } from '../db/tracker.js';
import { APP_VERSION } from '../version.js';

export interface SystemRouteDeps {
  db: Db;
  userId: number;
  dataDir: string;
  idleMinutes: number;
  /** Stops the server (Quit button). Runs after the reply has been sent. */
  onShutdown: () => void;
}

export function registerSystemRoutes(app: FastifyInstance, deps: SystemRouteDeps): void {
  const { db, userId } = deps;
  const current = (): SettingsResponse =>
    SettingsResponse.parse({
      displayTz: displayTz(db, userId),
      language: userLanguage(db, userId),
      dataDir: deps.dataDir,
      version: APP_VERSION,
      idleMinutes: deps.idleMinutes,
    });

  app.get('/api/settings', async () => current());

  app.patch('/api/settings', async (request) => {
    const body = UpdateSettingsRequest.parse(request.body);
    const save = (key: string, value: unknown) =>
      db
        .insert(settings)
        .values({ userId, key, valueJson: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: [settings.userId, settings.key],
          set: { valueJson: JSON.stringify(value) },
        })
        .run();
    if (body.displayTz !== undefined) save('display_tz', body.displayTz);
    if (body.language !== undefined) save('language', body.language);
    return current();
  });

  /** The open page calls this once a minute; any request counts as activity (SPEC §9.2). */
  app.post('/api/heartbeat', async (_request, reply) => reply.code(204).send());

  /** Quit button (SPEC §6): answers first, then stops the server. */
  app.post('/api/shutdown', async (_request, reply) => {
    reply.raw.once('finish', () => setImmediate(deps.onShutdown));
    return reply.code(202).send({ status: 'stopping' });
  });
}
