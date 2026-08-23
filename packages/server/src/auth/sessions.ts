/**
 * Session lifecycle and login throttling.
 *
 * Sessions slide: every authenticated request pushes the expiry out, so an app
 * in daily use never logs you out, while one left alone for two weeks does.
 */
import type { Db } from '../db/index.ts';
import { hashToken, issueSessionToken } from './crypto.ts';

export interface SessionRecord {
  tokenHash: string;
  expiresAt: string;
}

export class Sessions {
  // Written out rather than declared as constructor parameter properties:
  // Node's type stripping (`--experimental-strip-types`) cannot erase those,
  // and the server runs straight from TypeScript with no build step.
  private db: Db;
  private ttlHours: number;

  constructor(db: Db, ttlHours: number) {
    this.db = db;
    this.ttlHours = ttlHours;
  }

  create(): { token: string; expiresAt: Date } {
    const { token, hash } = issueSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 3_600_000);

    this.db
      .prepare(
        'INSERT INTO session (token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?)',
      )
      .run(hash, now.toISOString(), expiresAt.toISOString(), now.toISOString());

    return { token, expiresAt };
  }

  /**
   * Look up a session and slide its expiry. Returns null for anything not
   * currently valid — unknown token, or expired — so callers have exactly one
   * failure case to handle.
   */
  verify(token: string | undefined): SessionRecord | null {
    if (!token) return null;

    const hash = hashToken(token);
    const row = this.db
      .prepare('SELECT token_hash, expires_at FROM session WHERE token_hash = ?')
      .get(hash) as { token_hash: string; expires_at: string } | undefined;

    if (!row) return null;

    const now = new Date();
    if (new Date(row.expires_at) <= now) {
      this.db.prepare('DELETE FROM session WHERE token_hash = ?').run(hash);
      return null;
    }

    const expiresAt = new Date(now.getTime() + this.ttlHours * 3_600_000);
    this.db
      .prepare('UPDATE session SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .run(now.toISOString(), expiresAt.toISOString(), hash);

    return { tokenHash: hash, expiresAt: expiresAt.toISOString() };
  }

  destroy(token: string | undefined): void {
    if (!token) return;
    this.db.prepare('DELETE FROM session WHERE token_hash = ?').run(hashToken(token));
  }

  /** Used when the password changes: every other session must die with it. */
  destroyAll(): void {
    this.db.prepare('DELETE FROM session').run();
  }

  purgeExpired(): number {
    return this.db
      .prepare('DELETE FROM session WHERE expires_at <= ?')
      .run(new Date().toISOString()).changes;
  }
}

/**
 * Login throttle.
 *
 * In-memory on purpose: there is one user and one process, so a table would be
 * durable state bought at the price of a write on every failed guess. A restart
 * clearing the counter is an acceptable trade for a service on your own
 * network — and the scrypt cost already makes online guessing slow.
 */
export class LoginThrottle {
  private attempts: { at: number }[] = [];
  private limit: number;
  private windowMs: number;

  constructor(limit = 10, windowMs = 15 * 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  private prune(now: number): void {
    this.attempts = this.attempts.filter((a) => now - a.at < this.windowMs);
  }

  isBlocked(now = Date.now()): boolean {
    this.prune(now);
    return this.attempts.length >= this.limit;
  }

  recordFailure(now = Date.now()): void {
    this.prune(now);
    this.attempts.push({ at: now });
  }

  reset(): void {
    this.attempts = [];
  }

  /** Seconds until the next attempt is allowed. 0 when not blocked. */
  retryAfter(now = Date.now()): number {
    if (!this.isBlocked(now)) return 0;
    const oldest = Math.min(...this.attempts.map((a) => a.at));
    return Math.ceil((this.windowMs - (now - oldest)) / 1000);
  }
}
