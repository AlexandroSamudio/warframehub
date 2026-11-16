import {
  FavoriteRequest,
  FavoriteResponse,
  WeaponDetail,
  WeaponsResponse,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { userLanguage } from '../db/tracker.js';
import { circuitSlugs, setWeaponFavorite, weaponDetail, weaponList } from '../db/weapons.js';
import type { GameNames } from '../game-names.js';
import { HttpError } from '../http-error.js';
import type { WeaponCatalog } from '../sources/weapons.js';

export interface WeaponRouteDeps {
  db: Db;
  userId: number;
  catalog: WeaponCatalog;
  names: GameNames;
  now: () => Date;
  /** This week's Steel Path Circuit weapons ("Boar"…); empty when unknown. Never throws. */
  circuit: () => Promise<string[]>;
}

const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/) });

/** The Weapons section (SPEC §15). Pictures go through `GET /api/images/:file`. */
export function registerWeaponRoutes(app: FastifyInstance, deps: WeaponRouteDeps): void {
  const { db, userId, catalog, names, circuit, now } = deps;
  const circuitNow = async () => circuitSlugs(await circuit());
  const lang = () => userLanguage(db, userId);

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
