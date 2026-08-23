/**
 * Password hashing and the Monarch credential envelope.
 *
 * Everything here uses `node:crypto` only. Argon2 would be the better password
 * KDF, but it needs a native build step, and a personal tool that fails to
 * `npm install` on a fresh machine is a tool that does not get run. scrypt with
 * the parameters below is a sound second choice and ships with Node.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
/**
 * `promisify` cannot see scrypt's options overload, so it is wrapped by hand
 * rather than cast — the cast would hide a genuine arity mistake here.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived as Buffer),
    );
  });
}

// N=2^16 puts a single hash at roughly 100ms on modern hardware. There is one
// login on this server, so the cost is paid once and buys real brute-force
// resistance if the database ever leaks.
const SCRYPT_PARAMS = { N: 65536, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Verify a password. Never throws on a malformed stored hash — it returns
 * false, because a corrupted row should read as "wrong password" rather than
 * crash the login route and reveal that something is different about this
 * account.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// --- session tokens ---------------------------------------------------------

export interface IssuedToken {
  /** Sent to the browser. Never stored. */
  token: string;
  /** Stored. Never sent. */
  hash: string;
}

export function issueSessionToken(): IssuedToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/**
 * Session tokens are high-entropy random values, not passwords, so a plain
 * SHA-256 is the right primitive: there is nothing to brute-force, and the
 * lookup happens on every request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// --- the Monarch credential envelope ---------------------------------------

export interface Sealed {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

/**
 * Seal a Monarch session with AES-256-GCM.
 *
 * GCM rather than CBC because it authenticates: a tampered ciphertext fails to
 * open rather than decrypting to garbage that then gets sent to Monarch as a
 * cookie. The key lives in the environment, never in the database, so a stolen
 * database file alone does not yield the session.
 */
export function seal(plaintext: string, key: Buffer): Sealed {
  // 96 bits is the GCM-specified nonce size; anything else forces a slower
  // internal derivation and buys nothing.
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

export class SealedDataError extends Error {}

export function open(sealed: Sealed, key: Buffer): string {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.nonce);
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Almost always a changed NORTHSTAR_ENCRYPTION_KEY. Say so, because the
    // symptom otherwise is an endless "reconnect to Monarch" loop.
    throw new SealedDataError(
      'Could not decrypt the stored Monarch session. This usually means ' +
        'NORTHSTAR_ENCRYPTION_KEY changed since it was saved — reconnect to Monarch to store it again.',
    );
  }
}

/** Constant-time compare for CSRF tokens and the like. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
