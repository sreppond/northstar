/**
 * The database, as a list of migrations.
 *
 * Migrations are append-only and run inside one transaction at boot. For a
 * single-user app this is the whole migration story — no tooling, no separate
 * CLI, no drift between "what the code expects" and "what the file contains".
 *
 * The plan is stored as a JSON document rather than normalised tables
 * (docs/PLAN.md §9 Phase 2): it is always read and written whole, so
 * normalising buys nothing and costs a join per render.
 */
import type { Database } from 'better-sqlite3';

interface Migration {
  name: string;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: '001-initial',
    up: `
      -- Exactly one row, enforced by the CHECK. A single-user app that can
      -- somehow acquire a second user is a bug that shows up as a login
      -- silently authenticating the wrong account.
      CREATE TABLE app_user (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
      );

      -- Only the hash of the session token is stored, so a stolen database
      -- does not hand over live sessions.
      CREATE TABLE session (
        token_hash  TEXT PRIMARY KEY,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX session_expires_at ON session (expires_at);

      -- The Monarch session, sealed. Ciphertext, nonce and tag are separate
      -- columns so a partial write cannot look like a valid envelope.
      CREATE TABLE monarch_credential (
        id           INTEGER PRIMARY KEY CHECK (id = 1),
        ciphertext   BLOB NOT NULL,
        nonce        BLOB NOT NULL,
        tag          BLOB NOT NULL,
        connected_at TEXT NOT NULL,
        -- Set when Monarch rejects the session, so the UI can say "reconnect"
        -- rather than "something went wrong".
        invalid_at   TEXT
      );

      CREATE TABLE plan (
        id         TEXT PRIMARY KEY,
        document   TEXT NOT NULL,
        version    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Every capture is kept. They are a few kB each and they are the only
      -- record of what was actually true on a given day — the raw material for
      -- charting real net worth against the projection.
      CREATE TABLE snapshot (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        source      TEXT NOT NULL CHECK (source IN ('live', 'paste')),
        document    TEXT NOT NULL,
        net_worth   REAL,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX snapshot_captured_at ON snapshot (captured_at DESC);
    `,
  },
];

export function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM migration').all().map((r) => (r as { name: string }).name),
  );

  const record = db.prepare('INSERT INTO migration (name, applied_at) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    // One transaction per migration: a failure leaves the database on the last
    // complete version rather than half-way through this one.
    db.transaction(() => {
      db.exec(migration.up);
      record.run(migration.name, new Date().toISOString());
    })();
  }
}
