import { ApiError, SettingsResponse, TrackerResponse } from '@warframehub/shared';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppOptions } from '../app.js';
import { openDatabase, type OpenDatabase } from '../db/client.js';
import { initDatabase } from '../db/init.js';
import { loadSeed } from '../domain/seed.js';

let database: OpenDatabase;
let app: Awaited<ReturnType<typeof buildApp>>;

async function start(extra: Partial<AppOptions> = {}) {
  database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), new Date('2026-11-10T12:00:00Z'));
  app = await buildApp({
    db: database.db,
    userId,
    dataDir: '/data/warframehub',
    idleMinutes: 30,
    liveTimes: () => ({}),
    ...extra,
  });
}

afterEach(async () => {
  await app.close();
  database.close();
});

describe('settings', () => {
  beforeEach(() => start());

  it('GET /api/settings shows the time zone, data folder, version and idle time', async () => {
    const body = SettingsResponse.parse((await app.inject({ url: '/api/settings' })).json());
    expect(body).toMatchObject({
      displayTz: 'America/Argentina/Buenos_Aires',
      dataDir: '/data/warframehub',
      idleMinutes: 30,
    });
  });

  it('PATCH changes the display time zone, which the tracker then uses', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { displayTz: 'Europe/Madrid' },
    });
    expect(SettingsResponse.parse(res.json()).displayTz).toBe('Europe/Madrid');
    const tracker = TrackerResponse.parse((await app.inject({ url: '/api/tracker' })).json());
    expect(tracker.displayTz).toBe('Europe/Madrid');
  });

  it('rejects an unknown time zone', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { displayTz: 'Mars/Olympus_Mons' },
    });
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('bad_request');
  });
});

describe('heartbeat, activity and shutdown', () => {
  it('every request counts as activity, including the heartbeat', async () => {
    const onActivity = vi.fn();
    await start({ onActivity });
    expect((await app.inject({ method: 'POST', url: '/api/heartbeat' })).statusCode).toBe(204);
    await app.inject({ url: '/api/health' });
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it('POST /api/shutdown answers first, then stops the server', async () => {
    const onShutdown = vi.fn();
    await start({ onShutdown });
    const res = await app.inject({ method: 'POST', url: '/api/shutdown' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'stopping' });
    await vi.waitFor(() => expect(onShutdown).toHaveBeenCalledTimes(1));
  });
});

describe('serving the built web app', () => {
  let dir: string;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>WarframeHub</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    await start({ webRoot: dir });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html at /, with no caching', async () => {
    const res = await app.inject({ url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('<title>WarframeHub</title>');
  });

  it('serves hashed assets with long caching and the right type', async () => {
    const res = await app.inject({ url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/javascript/);
    expect(res.headers['cache-control']).toContain('immutable');
    expect((await app.inject({ url: '/favicon.svg' })).headers['content-type']).toBe(
      'image/svg+xml',
    );
  });

  it('falls back to index.html for app routes, but not for missing files', async () => {
    expect((await app.inject({ url: '/settings' })).body).toContain('WarframeHub');
    expect((await app.inject({ url: '/assets/missing.js' })).statusCode).toBe(404);
  });

  it('keeps the JSON 404 and the API routes under /api', async () => {
    const res = await app.inject({ url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe('not_found');
    expect((await app.inject({ url: '/api/health' })).json()).toMatchObject({ status: 'ok' });
  });

  it.each(['/../package.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%2F..%2Fpackage.json'])(
    'never serves files outside the web root: %s',
    async (url) => {
      const res = await app.inject({ url });
      expect(res.body).not.toContain('"name"');
    },
  );
});

describe('malformed URLs', () => {
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wfhub-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    await start({ webRoot: dir });
  });

  it('a broken %-escape is a client error in the standard shape, not a server error', async () => {
    const res = await app.inject({ url: '/%E0%A4%A' });
    expect(res.statusCode).toBe(400); // Fastify rejects it before routing
    expect(ApiError.parse(res.json()).error.code).toBe('bad_request');
  });
});

describe('without a built web app', () => {
  beforeEach(() => start({ webRoot: '/nonexistent/warframehub-web' }));

  it('/ is a plain JSON 404', async () => {
    const res = await app.inject({ url: '/' });
    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe('not_found');
  });
});
