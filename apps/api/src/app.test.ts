import { ApiError, HealthResponse } from '@warframehub/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';

const database = openDatabase(':memory:');
const base = { db: database.db, userId: 1 };

describe('API', () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it('GET /api/health reports ok with the server time in UTC', async () => {
    app = await buildApp({
      ...base,
      now: () => new Date('2026-11-10T03:00:00.000Z'),
      dataDir: '/data/warframehub',
    });
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body.serverTime).toBe('2026-11-10T03:00:00.000Z');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.dataDir).toBe('/data/warframehub');
  });

  it('unknown routes return the standard error shape', async () => {
    app = await buildApp(base);
    const res = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe('not_found');
  });
});
