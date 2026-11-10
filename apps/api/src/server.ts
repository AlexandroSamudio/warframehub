import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { initDatabase } from './db/init.js';
import { loadSeed } from './domain/seed.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const database = openDatabase(join(config.dataDir, 'warframehub.db'));
const init = initDatabase(database.db, loadSeed(), new Date());

const app = await buildApp({ logger: true, dataDir: config.dataDir });
app.log.info({ dataDir: config.dataDir, seed: init.seed }, 'database ready');

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  database.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  database.close();
  process.exit(1);
}
