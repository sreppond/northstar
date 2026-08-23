/** The single user, and the sealed Monarch credential. */
import type { Db } from '../db/index.ts';
import { hashPassword, open, seal, verifyPassword, type Sealed } from './crypto.ts';

export class UserStore {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  /** False until the first-run setup has happened. Drives the whole setup gate. */
  isConfigured(): boolean {
    const row = this.db.prepare('SELECT 1 FROM app_user WHERE id = 1').get();
    return row !== undefined;
  }

  async setPassword(password: string): Promise<void> {
    const hash = await hashPassword(password);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_user (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      )
      .run(hash, now, now);
  }

  async verify(password: string): Promise<boolean> {
    const row = this.db.prepare('SELECT password_hash FROM app_user WHERE id = 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row) return false;
    return verifyPassword(password, row.password_hash);
  }
}

export interface MonarchConnection {
  connectedAt: string;
  /** Set when Monarch last rejected this session. */
  invalidAt: string | null;
}

export class MonarchCredentialStore {
  private db: Db;
  private key: Buffer;

  constructor(db: Db, key: Buffer) {
    this.db = db;
    this.key = key;
  }

  /**
   * Store the Monarch cookie string, sealed. Replaces any existing one and
   * clears the invalid flag, since a reconnect is exactly the act of asserting
   * the old session is superseded.
   */
  save(cookieString: string): void {
    const sealed = seal(cookieString, this.key);
    this.db
      .prepare(
        `INSERT INTO monarch_credential (id, ciphertext, nonce, tag, connected_at, invalid_at)
         VALUES (1, ?, ?, ?, ?, NULL)
         ON CONFLICT (id) DO UPDATE SET
           ciphertext = excluded.ciphertext, nonce = excluded.nonce, tag = excluded.tag,
           connected_at = excluded.connected_at, invalid_at = NULL`,
      )
      .run(sealed.ciphertext, sealed.nonce, sealed.tag, new Date().toISOString());
  }

  /** The decrypted cookie string, or null when nothing is stored. Throws only on a key mismatch. */
  read(): string | null {
    const row = this.db
      .prepare('SELECT ciphertext, nonce, tag FROM monarch_credential WHERE id = 1')
      .get() as Sealed | undefined;
    if (!row) return null;
    return open({ ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag }, this.key);
  }

  status(): MonarchConnection | null {
    const row = this.db
      .prepare('SELECT connected_at, invalid_at FROM monarch_credential WHERE id = 1')
      .get() as { connected_at: string; invalid_at: string | null } | undefined;
    if (!row) return null;
    return { connectedAt: row.connected_at, invalidAt: row.invalid_at };
  }

  /** Mark the stored session rejected, so the UI can prompt a reconnect. */
  markInvalid(): void {
    this.db
      .prepare('UPDATE monarch_credential SET invalid_at = ? WHERE id = 1')
      .run(new Date().toISOString());
  }

  clear(): void {
    this.db.prepare('DELETE FROM monarch_credential WHERE id = 1').run();
  }
}
