import { POLARITY_SYMBOLS, WarframeDetail, WarframesResponse } from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { warframeDetail, warframeList } from '../db/warframes.js';
import type { ImageCache } from '../sources/images.js';
import type { WarframeCatalog } from '../sources/warframes.js';

export interface WarframeRouteDeps {
  db: Db;
  userId: number;
  catalog: WarframeCatalog;
  images: ImageCache;
  polarities: ImageCache;
}

/** "madurai" → the wiki's "Madurai_Pol.svg". */
export function polarityFile(polarity: string): string {
  return `${polarity.charAt(0).toUpperCase()}${polarity.slice(1)}_Pol.svg`;
}

export const POLARITY_FILES = new Set(POLARITY_SYMBOLS.map(polarityFile));
const PolarityParams = z.object({ name: z.enum(POLARITY_SYMBOLS) });

const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) });
const FileParams = z.object({ file: z.string().max(120) });

/** The Warframes section (SPEC §14), and the local image cache it uses. */
export function registerWarframeRoutes(app: FastifyInstance, deps: WarframeRouteDeps): void {
  const { db, userId, catalog, images, polarities } = deps;

  app.get('/api/warframes', async (): Promise<WarframesResponse> => {
    const state = await catalog.state();
    const { groups } = catalog.groups(state);
    return WarframesResponse.parse(
      warframeList(db, userId, state, groups, catalog.nextRefreshAt()),
    );
  });

  app.get('/api/warframes/:slug', async (request): Promise<WarframeDetail> => {
    const { slug } = SlugParams.parse(request.params);
    const state = await catalog.state();
    const { groups } = catalog.groups(state);
    return WarframeDetail.parse(
      warframeDetail(db, userId, state, groups, slug, catalog.nextRefreshAt()),
    );
  });

  /** Fetches the list again now (at most once an hour). */
  app.post('/api/warframes/refresh', async (): Promise<WarframesResponse> => {
    const state = await catalog.refresh();
    const { groups } = catalog.groups(state);
    return WarframesResponse.parse(
      warframeList(db, userId, state, groups, catalog.nextRefreshAt()),
    );
  });

  /** A Warframe image from the local cache (downloaded once). Only names the data lists. */
  app.get('/api/images/:file', async (request, reply) => {
    const { file } = FileParams.parse(request.params);
    const image = await images.get(file);
    if (!image) {
      return reply.code(404).send({ error: { code: 'not_found', message: `No image ${file}` } });
    }
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .type(image.type)
      .send(image.body);
  });

  /**
   * A polarity symbol (SVG from the Warframe wiki, downloaded once). Only ever used in
   * `<img>`; the sandboxing policy also stops anything active if it's opened directly.
   */
  app.get('/api/polarities/:name', async (request, reply) => {
    const { name } = PolarityParams.parse(request.params);
    const image = await polarities.get(polarityFile(name));
    if (!image) {
      return reply
        .code(404)
        .send({ error: { code: 'not_found', message: `No symbol for ${name}` } });
    }
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .type(image.type)
      .send(image.body);
  });
}
