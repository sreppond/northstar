/**
 * Plan and snapshot storage.
 *
 * Both are JSON documents. The plan is read and written whole (docs/PLAN.md
 * §9 Phase 2), and a snapshot is an immutable record of what Monarch said on
 * a given day — neither benefits from being spread across tables.
 */
import type { MonarchSnapshot, Plan } from '@northstar/engine';
import type { Db } from './index.ts';

export class PlanRepo {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  list(): Plan[] {
    const rows = this.db
      .prepare('SELECT document FROM plan ORDER BY created_at ASC')
      .all() as { document: string }[];
    return rows.map((r) => JSON.parse(r.document) as Plan);
  }

  get(id: string): Plan | null {
    const row = this.db.prepare('SELECT document FROM plan WHERE id = ?').get(id) as
      | { document: string }
      | undefined;
    return row ? (JSON.parse(row.document) as Plan) : null;
  }

  save(plan: Plan): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO plan (id, document, version, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           document = excluded.document,
           version = plan.version + 1,
           updated_at = excluded.updated_at`,
      )
      .run(plan.id, JSON.stringify(plan), now, now);
  }

  /**
   * Replace the whole set in one transaction.
   *
   * The client owns the plan list (it has undo, duplication and deletion), so
   * a sync is a whole-set replace. Doing it transactionally is what stops a
   * failure part-way through from leaving the user with half their scenarios.
   */
  replaceAll(plans: Plan[]): void {
    this.db.transaction(() => {
      const keep = new Set(plans.map((p) => p.id));
      const existing = this.db.prepare('SELECT id FROM plan').all() as { id: string }[];
      const drop = this.db.prepare('DELETE FROM plan WHERE id = ?');
      for (const row of existing) {
        if (!keep.has(row.id)) drop.run(row.id);
      }
      for (const plan of plans) this.save(plan);
    })();
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM plan WHERE id = ?').run(id);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) c FROM plan').get() as { c: number }).c;
  }
}

export interface StoredSnapshot {
  id: number;
  capturedAt: string;
  source: 'live' | 'paste';
  netWorth: number | null;
  createdAt: string;
  snapshot: MonarchSnapshot;
}

export class SnapshotRepo {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** Every capture is kept: they are the only record of what was true that day. */
  insert(snapshot: MonarchSnapshot, source: 'live' | 'paste', netWorth: number | null): number {
    const result = this.db
      .prepare(
        `INSERT INTO snapshot (captured_at, source, document, net_worth, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.capturedAt,
        source,
        JSON.stringify(snapshot),
        netWorth,
        new Date().toISOString(),
      );
    return Number(result.lastInsertRowid);
  }

  /**
   * Ordered by when the row was written, not by `capturedAt`. A re-imported
   * older capture must not present as the current state of the world.
   */
  latest(): StoredSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM snapshot ORDER BY created_at DESC, id DESC LIMIT 1')
      .get() as
      | {
          id: number;
          captured_at: string;
          source: 'live' | 'paste';
          document: string;
          net_worth: number | null;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      capturedAt: row.captured_at,
      source: row.source,
      netWorth: row.net_worth,
      createdAt: row.created_at,
      snapshot: JSON.parse(row.document) as MonarchSnapshot,
    };
  }

  /** Captured date + net worth for every snapshot, oldest first. Real vs forecast. */
  history(): { capturedAt: string; netWorth: number | null; source: string }[] {
    return this.db
      .prepare('SELECT captured_at, net_worth, source FROM snapshot ORDER BY captured_at ASC, id ASC')
      .all()
      .map((r) => {
        const row = r as { captured_at: string; net_worth: number | null; source: string };
        return { capturedAt: row.captured_at, netWorth: row.net_worth, source: row.source };
      });
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) c FROM snapshot').get() as { c: number }).c;
  }
}
