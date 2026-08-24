/** Database handle and connection settings. */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './schema.ts';

export type Db = Database.Database;

export function openDatabase(url: string): Db {
  if (url !== ':memory:') mkdirSync(dirname(url), { recursive: true });

  const db = new Database(url);

  // WAL survives an unclean shutdown without losing the last commit, which
  // matters when the "server" is a laptop that gets closed.
  db.pragma('journal_mode = WAL');
  // Without this SQLite does not enforce the CHECK-backed single-row tables.
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db);
  return db;
}
