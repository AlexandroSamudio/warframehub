import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './client.js';
import { partStock } from './schema.js';

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** A database as it was before migration 0006 (parts ticked per goal). */
function databaseAt0005(file: string, dir: string) {
  const old = join(dir, 'drizzle-0005');
  cpSync(MIGRATIONS, old, { recursive: true });
  const journalFile = join(old, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((e) => e.idx <= 5);
  writeFileSync(journalFile, JSON.stringify(journal));
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: old });
  return sqlite;
}

const recipe = (name: string, parts: string[]) =>
  JSON.stringify({ name, parts: parts.map((p) => ({ key: `/P/${name}${p}`, name: p })) });

describe('migration 0006: parts become shared stock', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wfhub-0006-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('turns ticks on active goals into finished-part stock, and skips built goals', () => {
    const file = join(dir, 'warframehub.db');
    const sqlite = databaseAt0005(file, dir);
    sqlite.exec(`
      INSERT INTO users (id, name, created_at) VALUES (1, 'Alex', 0);
      INSERT INTO goals (id, user_id, unique_name, name, recipe_json, recipe_fetched_at, status, sort_order, created_at)
        VALUES (1, 1, '/W/Nidus', 'Nidus', '${recipe('Nidus', ['Blueprint', 'Chassis'])}', 0, 'active', 0, 0),
               (2, 1, '/W/Boar', 'Boar', '${recipe('Boar', ['Barrel'])}', 0, 'built', 1, 0);
      INSERT INTO goal_parts (goal_id, component_key, owned, note) VALUES
        (1, '/P/NidusChassis', 1, ''),
        (1, '/P/NidusBlueprint', 0, 'Glast Gambit'),
        (2, '/P/BoarBarrel', 1, '');
    `);
    sqlite.close();

    const { db, close } = openDatabase(file);
    expect(
      db
        .select()
        .from(partStock)
        .all()
        .map((p) => [p.partKey, p.name, p.blueprints, p.crafted]),
    ).toEqual([['/P/NidusChassis', 'Nidus Chassis', 0, 1]]);
    close();
  });
});
