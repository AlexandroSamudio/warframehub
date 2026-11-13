import {
  Build,
  BuildContent,
  BuildOptionsResponse,
  CreateBuildRequest,
  ReorderBuildsRequest,
  UpdateBuildRequest,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  augmentFits,
  buildRules,
  checkContent,
  createBuild,
  deleteBuild,
  getBuild,
  listBuilds,
  reorderBuilds,
  updateBuild,
} from '../db/builds.js';
import type { Db } from '../db/client.js';
import { HttpError } from '../http-error.js';
import { buildsVariant, helminthOptions } from '../sources/build-data.js';
import { abilitiesOf, type WarframeCatalog } from '../sources/warframes.js';

export interface BuildRouteDeps {
  db: Db;
  userId: number;
  now: () => Date;
  catalog: WarframeCatalog;
}

const Slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** Builds (SPEC §14.1). Shown on `GET /api/warframes/:slug`; saved and changed here. */
export function registerBuildRoutes(app: FastifyInstance, deps: BuildRouteDeps): void {
  const { db, userId, now, catalog } = deps;

  /** The catalog, this Warframe's group and what its builds may hold. */
  async function rulesFor(slug: string) {
    const state = await catalog.state();
    const { groups } = catalog.groups(state);
    const group = groups.find((g) => g.slug === slug);
    if (!group) throw new HttpError(404, 'not_found', `No Warframe called "${slug}"`);
    return { state, group, helminth: helminthOptions(groups), groups };
  }

  /** Everything the edit page can pick for this Warframe. */
  app.get('/api/builds/options', async (request): Promise<BuildOptionsResponse> => {
    const { slug } = z.object({ slug: Slug }).parse(request.query);
    const { state, group, helminth } = await rulesFor(slug);
    const owner = buildsVariant(group);
    const own = new Set(group.variants.flatMap((v) => v.raw.abilities.map((a) => a.uniqueName)));
    return BuildOptionsResponse.parse({
      slug,
      buildsVariant: owner.raw.name,
      abilities: abilitiesOf(owner.raw).map((a) => ({ key: a.key, name: a.name })),
      mods: state.mods.filter((m) => augmentFits(m, group)),
      arcanes: state.arcanes,
      helminth: helminth.filter((h) => !own.has(h.uniqueName)),
    });
  });

  app.get('/api/builds/:id', async (request): Promise<Build> => {
    const { id } = IdParams.parse(request.params);
    return Build.parse(getBuild(db, userId, id));
  });

  app.post('/api/builds', async (request, reply) => {
    const body = CreateBuildRequest.parse(request.body);
    const { state, group, helminth } = await rulesFor(body.slug);
    const content = checkContent(body.content, buildRules(state, group, helminth), null);
    const build = createBuild(db, userId, group.slug, body.name, content, now());
    return reply.code(201).send(Build.parse(build));
  });

  app.put('/api/builds/:id', async (request): Promise<Build> => {
    const { id } = IdParams.parse(request.params);
    const body = UpdateBuildRequest.parse(request.body);
    const saved = getBuild(db, userId, id);
    const { state, group, helminth } = await rulesFor(saved.slug);
    const content = checkContent(
      BuildContent.parse(body.content),
      buildRules(state, group, helminth),
      saved.content,
    );
    return Build.parse(updateBuild(db, userId, id, body.name, content, now()));
  });

  app.delete('/api/builds/:id', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    deleteBuild(db, userId, id);
    return reply.code(204).send();
  });

  /** Answers with that Warframe's builds in the new order. */
  app.post('/api/builds/reorder', async (request): Promise<Build[]> => {
    const body = ReorderBuildsRequest.parse(request.body);
    reorderBuilds(db, userId, body);
    return listBuilds(db, userId, body.slug).map((b) => Build.parse(b));
  });
}
