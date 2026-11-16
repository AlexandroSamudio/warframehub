import {
  CreateWeaponBuildRequest,
  ImportWeaponBuildRequest,
  ImportWeaponBuildResponse,
  ReorderWeaponBuildsRequest,
  ShareBuildResponse,
  UpdateWeaponBuildRequest,
  WeaponBuild,
  WeaponBuildContent,
  WeaponBuildOptionsResponse,
  WeaponBuildView,
  WeaponVariantKind,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decodeWeaponShare, encodeWeaponShare, isOtherKindOfCode } from '../build-share.js';
import type { Db } from '../db/client.js';
import { userLanguage } from '../db/tracker.js';
import {
  checkWeaponContent,
  createWeaponBuild,
  defaultVariant,
  deleteWeaponBuild,
  getWeaponBuild,
  listWeaponBuilds,
  reorderWeaponBuilds,
  resolveWeaponBuild,
  updateWeaponBuild,
  weaponBuildRules,
} from '../db/weapon-builds.js';
import type { GameNames } from '../game-names.js';
import { HttpError } from '../http-error.js';
import type { WarframeCatalog } from '../sources/warframes.js';
import type { WeaponCatalog } from '../sources/weapons.js';

export interface WeaponBuildRouteDeps {
  db: Db;
  userId: number;
  now: () => Date;
  /** The weapons (which weapon, which versions). */
  weapons: WeaponCatalog;
  /** The mods, stances and arcanes (fetched with the Warframe data). */
  warframes: WarframeCatalog;
  names: GameNames;
}

const Slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** Weapon builds (SPEC §15.1). Shown on `GET /api/weapons/:slug`; saved and changed here. */
export function registerWeaponBuildRoutes(app: FastifyInstance, deps: WeaponBuildRouteDeps): void {
  const { db, userId, now, weapons, warframes, names } = deps;
  const lang = () => userLanguage(db, userId);

  async function groupOf(slug: string) {
    const { groups } = weapons.groups(await weapons.state());
    const group = groups.find((g) => g.slug === slug);
    if (!group) throw new HttpError(404, 'not_found', 'noWeapon', { slug });
    return { group, groups };
  }

  async function rulesFor(slug: string, kind: WeaponVariantKind) {
    const { group, groups } = await groupOf(slug);
    const state = await warframes.state();
    return { state, group, groups, rules: weaponBuildRules(state, group, kind) };
  }

  /** Everything the edit page can pick for this weapon version (default: the Prime). */
  app.get('/api/weapon-builds/options', async (request): Promise<WeaponBuildOptionsResponse> => {
    const q = z.object({ slug: Slug, variant: WeaponVariantKind.optional() }).parse(request.query);
    const { group } = await groupOf(q.slug);
    const { rules } = await rulesFor(q.slug, q.variant ?? defaultVariant(group));
    const all = [...rules.mods.values()].map(({ type: _t, tags: _g, notTags: _n, ...m }) => m);
    return WeaponBuildOptionsResponse.parse(
      names.weaponBuildOptions(
        {
          mods: all.filter((m) => !m.stance),
          stances: all.filter((m) => m.stance),
          arcaneSlots: rules.arcaneSlots.map((slot) => [...slot.values()]),
          hasExilus: rules.exilus,
          rivenStats: (rules.riven ?? []).map((r) => ({
            stat: r.name,
            spliced: r.spliced,
            negative: r.negative,
          })),
          progenitor: rules.progenitor,
        },
        lang(),
      ),
    );
  });

  /** One build with its pictures and effects (the edit page shows them too). */
  app.get('/api/weapon-builds/:id', async (request): Promise<WeaponBuildView> => {
    const { id } = IdParams.parse(request.params);
    const saved = getWeaponBuild(db, userId, id);
    const { group } = await groupOf(saved.slug);
    const state = await warframes.state();
    return WeaponBuildView.parse(
      names.weaponBuild(resolveWeaponBuild(saved, state, group), lang()),
    );
  });

  /** The build as one line of text, to send to someone. */
  app.get('/api/weapon-builds/:id/share', async (request): Promise<ShareBuildResponse> => {
    const { id } = IdParams.parse(request.params);
    const saved = getWeaponBuild(db, userId, id);
    return ShareBuildResponse.parse({
      code: encodeWeaponShare({ slug: saved.slug, name: saved.name, content: saved.content }),
    });
  });

  /** Reads a pasted code for this weapon and answers with the build to fill the form with. */
  app.post('/api/weapon-builds/import', async (request): Promise<ImportWeaponBuildResponse> => {
    const body = ImportWeaponBuildRequest.parse(request.body);
    const { group, groups } = await groupOf(body.slug);
    const shared = decodeWeaponShare(body.code);
    if (!shared) {
      throw new HttpError(
        400,
        'bad_request',
        isOtherKindOfCode(body.code, true) ? 'shareWrongKind' : 'shareInvalid',
      );
    }
    if (shared.slug !== group.slug) {
      const other = groups.find((g) => g.slug === shared.slug)?.name ?? shared.slug;
      throw new HttpError(400, 'bad_request', 'shareOtherWeapon', { weapon: other });
    }
    const { rules } = await rulesFor(body.slug, shared.content.variant);
    const content = checkWeaponContent(shared.content, rules, null);
    return ImportWeaponBuildResponse.parse({ name: shared.name, content });
  });

  app.post('/api/weapon-builds', async (request, reply) => {
    const body = CreateWeaponBuildRequest.parse(request.body);
    const { group, rules } = await rulesFor(body.slug, body.content.variant);
    const content = checkWeaponContent(body.content, rules, null);
    const build = createWeaponBuild(db, userId, group.slug, body.name, content, now());
    return reply.code(201).send(WeaponBuild.parse(build));
  });

  app.put('/api/weapon-builds/:id', async (request): Promise<WeaponBuild> => {
    const { id } = IdParams.parse(request.params);
    const body = UpdateWeaponBuildRequest.parse(request.body);
    const saved = getWeaponBuild(db, userId, id);
    const content = WeaponBuildContent.parse(body.content);
    const { rules } = await rulesFor(saved.slug, content.variant);
    const checked = checkWeaponContent(content, rules, saved.content);
    return WeaponBuild.parse(updateWeaponBuild(db, userId, id, body.name, checked, now()));
  });

  app.delete('/api/weapon-builds/:id', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    deleteWeaponBuild(db, userId, id);
    return reply.code(204).send();
  });

  /** Answers with that weapon's builds in the new order. */
  app.post('/api/weapon-builds/reorder', async (request): Promise<WeaponBuild[]> => {
    const body = ReorderWeaponBuildsRequest.parse(request.body);
    reorderWeaponBuilds(db, userId, body);
    return listWeaponBuilds(db, userId, body.slug).map((b) => WeaponBuild.parse(b));
  });
}
