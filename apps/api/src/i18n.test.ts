import { ApiError, SettingsResponse } from '@warframehub/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './db/client.js';
import { initDatabase } from './db/init.js';
import { loadSeed } from './domain/seed.js';
import { message } from './i18n.js';

const START = new Date('2026-11-13T12:00:00.000Z');

async function setup() {
  const database = openDatabase(':memory:');
  const { userId } = initDatabase(database.db, loadSeed(), START);
  const app = await buildApp({ db: database.db, userId, now: () => START, liveTimes: () => ({}) });
  return { app, database };
}

describe('messages in the user language (SPEC §8.3)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.app.close();
    ctx.database.close();
  });

  const errorOf = async (url: string) =>
    ApiError.parse((await ctx.app.inject({ method: 'GET', url })).json()).error;

  it('starts in Spanish, and Settings switches it', async () => {
    const settings = SettingsResponse.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/settings' })).json(),
    );
    expect(settings.language).toBe('es');
    expect((await errorOf('/api/builds/99')).message).toBe('No existe la build 99');

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { language: 'en' },
    });
    expect(SettingsResponse.parse(res.json())).toMatchObject({ language: 'en' });
    expect((await errorOf('/api/builds/99')).message).toBe('No build 99');
  });

  it('keeps the time zone when only the language changes', async () => {
    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { displayTz: 'Europe/Madrid' },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { language: 'en' },
    });
    expect(SettingsResponse.parse(res.json())).toMatchObject({
      displayTz: 'Europe/Madrid',
      language: 'en',
    });
  });

  it('refuses an unknown language or an empty change, in Spanish', async () => {
    for (const payload of [{ language: 'fr' }, {}]) {
      const res = await ctx.app.inject({ method: 'PATCH', url: '/api/settings', payload });
      expect(res.statusCode).toBe(400);
    }
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { displayTz: 'Mars/Olympus' },
    });
    expect(ApiError.parse(res.json()).error.message).toBe('Zona horaria desconocida');
  });

  it('says unknown routes in Spanish', async () => {
    expect((await errorOf('/api/nope')).message).toBe('No existe la ruta GET /api/nope');
  });
});

describe('message()', () => {
  it('formats numbers and amount lists per language', () => {
    const list = [
      { count: 25000, name: 'Créditos' },
      { count: 5, name: 'Célula orokin' },
    ];
    expect(message('es', 'cantBuild', { list })).toBe(
      'Aún no se puede construir. Falta: 25.000 Créditos, 5 Célula orokin.',
    );
    expect(message('en', 'cantBuild', { list })).toBe(
      "Can't build yet. Missing: 25,000 Créditos, 5 Célula orokin.",
    );
    expect(message('es', 'maxRank', { name: 'Flujo Prime', max: 10 })).toBe(
      'Flujo Prime llega como máximo al rango 10',
    );
  });
});
