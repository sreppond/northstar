/**
 * Configuration, resolved once at boot.
 *
 * Northstar's server is single-tenant by construction: one household, one
 * password, one Monarch connection. That is not a limitation to be designed
 * around later — it is what lets the whole thing be a SQLite file and a
 * process, with no user table to join through and no tenancy to get wrong.
 *
 * Defaults target a local machine, because that is where the data should live:
 * a stored Monarch session is read access to every account you own, and the
 * safest place for it is hardware you physically control.
 */
import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  host: string;
  /** SQLite file. `:memory:` in tests. */
  databaseUrl: string;
  /** 32-byte key for the Monarch credential envelope. */
  encryptionKey: Buffer;
  /** Serve the built SPA from here. Same-origin, so no CORS and no bearer tokens. */
  staticDir?: string;
  /**
   * Set `Secure` on cookies. Off for plain-HTTP localhost, since a Secure
   * cookie is silently dropped there and the failure looks like a broken login.
   */
  secureCookies: boolean;
  /** How old a snapshot may get before the app offers a refresh. */
  stalenessDays: number;
  sessionTtlHours: number;
  /**
   * Monarch's API root. Overridable only so the whole flow can be driven
   * against a stand-in during testing; there is no reason to change it in
   * normal use.
   */
  monarchApiBase: string;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.NORTHSTAR_DB ?? './data/northstar.db';
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be a valid port number, got "${env.PORT}"`);
  }

  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    databaseUrl,
    encryptionKey: readKey(env.NORTHSTAR_ENCRYPTION_KEY),
    staticDir: env.NORTHSTAR_STATIC_DIR,
    // Explicit opt-in rather than inferred: guessing wrong in the insecure
    // direction is a silent downgrade nobody would notice.
    secureCookies: env.NORTHSTAR_SECURE_COOKIES === 'true',
    stalenessDays: Number(env.NORTHSTAR_STALENESS_DAYS ?? 7),
    sessionTtlHours: Number(env.NORTHSTAR_SESSION_TTL_HOURS ?? 24 * 14),
    monarchApiBase: env.NORTHSTAR_MONARCH_API_BASE ?? 'https://api.monarch.com',
  };
}

/**
 * The encryption key is required and must be supplied, never generated on the
 * fly. A key invented at boot would change on every restart and silently make
 * the stored Monarch session undecryptable — which presents as "reconnect to
 * Monarch again" forever, with nothing in the logs to explain it.
 */
function readKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new ConfigError(
      'NORTHSTAR_ENCRYPTION_KEY is required (32 bytes, base64). Generate one with:\n' +
        `  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new ConfigError('NORTHSTAR_ENCRYPTION_KEY must be valid base64.');
  }

  if (key.length !== 32) {
    throw new ConfigError(
      `NORTHSTAR_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`,
    );
  }
  return key;
}

/** For tests and for the `generate-key` script. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}
