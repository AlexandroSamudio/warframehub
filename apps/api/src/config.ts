import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export interface Config {
  host: string;
  port: number;
  /** Where the database lives. Always outside the repo (SPEC §2). */
  dataDir: string;
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
  return { host, port, dataDir: resolveDataDir(env, home) };
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
