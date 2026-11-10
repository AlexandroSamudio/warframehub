import type { FastifyInstance, FastifyReply } from 'fastify';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Serves the built web app (`apps/web/dist`) so daily use is one process on one port
 * (SPEC §3.2). Unknown paths outside `/api` get `index.html`, so the client-side
 * router works on reload. A tiny handler instead of a plugin: the files are known,
 * it only listens on 127.0.0.1, and it needs no ranges or compression.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

/** The default location of the built web app, relative to this file in src/ or dist/. */
export const DEFAULT_WEB_ROOT = resolve(new URL('../../../web/dist', import.meta.url).pathname);

function sendFile(reply: FastifyReply, file: string, immutable: boolean) {
  return reply
    .header('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
    .header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
    .header('x-content-type-options', 'nosniff')
    .send(createReadStream(file));
}

/** Returns false (and registers nothing) when there is no built web app. */
export function registerWebApp(app: FastifyInstance, webRoot: string): boolean {
  const root = resolve(webRoot);
  const index = join(root, 'index.html');
  if (!existsSync(index)) return false;

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    handler: async (request, reply) => {
      let path: string;
      try {
        path = decodeURIComponent(request.url.split('?')[0] ?? '/');
      } catch {
        return reply.callNotFound(); // malformed %-escape
      }
      // Unknown API routes keep the JSON 404.
      if (path === '/api' || path.startsWith('/api/')) return reply.callNotFound();

      const file = resolve(join(root, normalize(path)));
      const inside = file === root || file.startsWith(root + sep);
      if (inside && file !== root && existsSync(file) && statSync(file).isFile()) {
        // Vite puts hashed file names under assets/, so those can be cached for good.
        return sendFile(reply, file, path.startsWith('/assets/'));
      }
      if (!inside || extname(path) !== '') return reply.callNotFound();
      return sendFile(reply, index, false);
    },
  });
  return true;
}
