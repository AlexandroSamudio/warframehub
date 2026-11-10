import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export interface Config {
  host: string;
  port: number;
  /** Where the database lives. Always outside the repo (SPEC §2). */
  dataDir: string;
  /** Stop after this many minutes with no open page (SPEC §9.2). 0 = never. */
  idleMinutes: number;
}

/**
 * Reads settings from environment variables.
 * The API listens on 127.0.0.1 by default so nothing else on the network can reach it (SPEC §3.2).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, home = homedir()): Config {
  const host = env.WFHUB_HOST ?? '127.0.0.1';
  const port = Number(env.WFHUB_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WFHUB_PORT must be a port number (1-65535), got "${env.WFHUB_PORT}"`);
  }
  const idleMinutes = Number(env.WFHUB_IDLE_MINUTES ?? 30);
  if (!Number.isInteger(idleMinutes) || idleMinutes < 0) {
    throw new Error(
      `WFHUB_IDLE_MINUTES must be a whole number of minutes (0 = never), got "${env.WFHUB_IDLE_MINUTES}"`,
    );
  }
  return { host, port, dataDir: resolveDataDir(env, home), idleMinutes };
}

/**
 * `WFHUB_DATA_DIR` if set, otherwise `$XDG_DATA_HOME/warframehub`,
 * otherwise `~/.local/share/warframehub`.
 */
export function resolveDataDir(env: NodeJS.ProcessEnv, home: string): string {
  if (env.WFHUB_DATA_DIR) {
    if (!isAbsolute(env.WFHUB_DATA_DIR)) {
      throw new Error(`WFHUB_DATA_DIR must be an absolute path, got "${env.WFHUB_DATA_DIR}"`);
    }
    return env.WFHUB_DATA_DIR;
  }
  // The XDG spec says to ignore a relative XDG_DATA_HOME.
  const xdg = env.XDG_DATA_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, '.local', 'share');
  return join(base, 'warframehub');
}
