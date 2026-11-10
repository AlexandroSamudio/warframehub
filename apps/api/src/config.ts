export interface Config {
  host: string;
  port: number;
}

/**
 * Reads settings from environment variables.
 * The API listens on 127.0.0.1 by default so nothing else on the network can reach it (SPEC §3.2).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.WFHUB_HOST ?? '127.0.0.1';
  const port = Number(env.WFHUB_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WFHUB_PORT must be a port number (1-65535), got "${env.WFHUB_PORT}"`);
  }
  return { host, port };
}
