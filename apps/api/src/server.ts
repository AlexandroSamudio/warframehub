import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { initDatabase } from './db/init.js';
import { pruneTicks } from './db/tracker.js';
import { loadSeed } from './domain/seed.js';
import { IdleWatcher } from './idle.js';
import { DEFAULT_WEB_ROOT } from './routes/web.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const database = openDatabase(join(config.dataDir, 'warframehub.db'));
const init = initDatabase(database.db, loadSeed(), new Date());

// One way out for Ctrl+C, the Quit button and idle shutdown. Safe to call twice.
let stopping = false;
const shutdown = async (reason: string) => {
  if (stopping) return;
  stopping = true;
  app.log.info(`${reason}: shutting down`);
  idle.stop();
  clearInterval(pruneTimer);
  await app.close();
  database.close();
  process.exit(0);
};

// SPEC §9.2: stop after N minutes with no open page (the page sends a heartbeat each minute).
const idle = new IdleWatcher(config.idleMinutes * 60_000, () => {
  void shutdown(`no open page for ${config.idleMinutes} min`);
});

const app = await buildApp({
  logger: true,
  db: database.db,
  userId: init.userId,
  dataDir: config.dataDir,
  webRoot: process.env.WFHUB_WEB_ROOT ?? DEFAULT_WEB_ROOT,
  idleMinutes: config.idleMinutes,
  onActivity: () => idle.touch(),
  onShutdown: () => void shutdown('Quit pressed'),
});
app.log.info(
  { dataDir: config.dataDir, seed: init.seed, idleMinutes: config.idleMinutes },
  'database ready',
);

// Old ticks are deleted at startup and once a day (SPEC §4.2). Resets themselves need no timer.
const prune = () => {
  const deleted = pruneTicks(database.db, init.userId, new Date());
  if (deleted > 0) app.log.info({ deleted }, 'pruned old ticks');
};
prune();
const pruneTimer = setInterval(prune, 24 * 60 * 60 * 1000);
pruneTimer.unref();

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
  idle.start();
} catch (error) {
  app.log.error(error);
  database.close();
  process.exit(1);
}
