import {
  FavoriteRequest,
  FavoriteResponse,
  WeaponDetail,
  WeaponsResponse,
  type WeaponBuildView,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { userLanguage } from '../db/tracker.js';
import { circuitSlugs, setWeaponFavorite, weaponDetail, weaponList } from '../db/weapons.js';
import type { GameNames } from '../game-names.js';
import { HttpError } from '../http-error.js';
import type { CatalogState, WarframeCatalog } from '../sources/warframes.js';
import type { WeaponCatalog, WeaponGroup } from '../sources/weapons.js';
import { listWeaponBuilds, resolveWeaponBuild } from '../db/weapon-builds.js';

export interface WeaponRouteDeps {
  db: Db;
  userId: number;
  catalog: WeaponCatalog;
  names: GameNames;
  now: () => Date;
  /** The Warframe catalog: it also holds the weapon mods and arcanes builds use. */
  warframes: WarframeCatalog;
  /** This week's Steel Path Circuit weapons ("Boar"…); empty when unknown. Never throws. */
  circuit: () => Promise<string[]>;
}

const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) });

/** The Weapons section (SPEC §15). Pictures go through `GET /api/images/:file`. */
export function registerWeaponRoutes(app: FastifyInstance, deps: WeaponRouteDeps): void {
  const { db, userId, catalog, names, circuit, now, warframes } = deps;
  const circuitNow = async () => circuitSlugs(await circuit());
  const lang = () => userLanguage(db, userId);

  /**
   * The weapon's builds, resolved with the mod data (fetched with the Warframe data). If
   * that data can't be had, the builds still show with their saved names.
   */
  async function buildsOf(group: WeaponGroup): Promise<WeaponBuildView[]> {
    const saved = listWeaponBuilds(db, userId, group.slug);
    if (saved.length === 0) return [];
    const state = await warframes.state().catch(() => null);
    const data = state ?? { weaponMods: [], weaponArcanes: [] };
    return saved.map((b) =>
      names.weaponBuild(resolveWeaponBuild(b, data as CatalogState, group), lang()),
    );
  }

  const list = async (state: Awaited<ReturnType<WeaponCatalog['state']>>) => {
    const { groups } = catalog.groups(state);
    return WeaponsResponse.parse(
      names.weapons(
        weaponList(db, userId, state, groups, catalog.nextRefreshAt(), await circuitNow()),
        lang(),
      ),
    );
  };

  app.get('/api/weapons', async (): Promise<WeaponsResponse> => list(await catalog.state()));

  app.get('/api/weapons/:slug', async (request): Promise<WeaponDetail> => {
    const { slug } = SlugParams.parse(request.params);
    const state = await catalog.state();
    const { groups } = catalog.groups(state);
    const group = groups.find((g) => g.slug === slug);
    return WeaponDetail.parse(
      names.weapon(
        weaponDetail(
          db,
          userId,
          state,
          groups,
          slug,
          catalog.nextRefreshAt(),
          await circuitNow(),
          now(),
          group ? await buildsOf(group) : [],
        ),
        lang(),
      ),
    );
  });

  /** Stars or unstars a weapon. */
  app.put('/api/weapons/:slug/favorite', async (request): Promise<FavoriteResponse> => {
    const { slug } = SlugParams.parse(request.params);
    const { favorite } = FavoriteRequest.parse(request.body);
    const { groups } = catalog.groups(await catalog.state());
    if (!groups.some((g) => g.slug === slug)) {
      throw new HttpError(404, 'not_found', 'noWeapon', { slug });
    }
    setWeaponFavorite(db, userId, slug, favorite);
    return FavoriteResponse.parse({ slug, favorite });
  });

  /** Fetches the list again now (at most once an hour). */
  app.post('/api/weapons/refresh', async (): Promise<WeaponsResponse> =>
    list(await catalog.refresh()),
  );
}
