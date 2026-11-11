import { ProfileResponse, SetAccountRequest } from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import type { ProfileService } from '../sources/profile.js';

/** Profile import routes (SPEC §13.2). The account ID is accepted once and never sent back. */
export function registerProfileRoutes(app: FastifyInstance, profile: ProfileService): void {
  app.get('/api/profile', async (): Promise<ProfileResponse> => profile.current());

  app.put('/api/profile/account', async (request): Promise<ProfileResponse> => {
    const { accountId } = SetAccountRequest.parse(request.body);
    return profile.setAccount(accountId);
  });

  app.post('/api/profile/refresh', async (): Promise<ProfileResponse> => profile.refresh());

  app.delete('/api/profile', async (): Promise<ProfileResponse> => profile.forget());
}
