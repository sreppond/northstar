import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashToken,
  issueSessionToken,
  open,
  safeEqual,
  seal,
  SealedDataError,
  verifyPassword,
} from '../src/auth/crypto.ts';
import { LoginThrottle, Sessions } from '../src/auth/sessions.ts';
import { MonarchCredentialStore, UserStore } from '../src/auth/store.ts';
import { openDatabase } from '../src/db/index.ts';
import { generateEncryptionKey, loadConfig, ConfigError } from '../src/config.ts';

const KEY = Buffer.from(generateEncryptionKey(), 'base64');

function db() {
  return openDatabase(':memory:');
}

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('returns false for a corrupt stored hash rather than throwing', async () => {
    // A crash here would be a side channel: it distinguishes "this row is
    // damaged" from "wrong password" to anyone watching the response.
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'scrypt$a$b$c$d$e', 'bcrypt$1$2$3$4$5']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});

describe('the Monarch credential envelope', () => {
  it('round-trips a cookie string', () => {
    const cookie = 'session_id=abc123; csrftoken=def456';
    expect(open(seal(cookie, KEY), KEY)).toBe(cookie);
  });

  it('produces a different ciphertext each time', () => {
    const a = seal('same', KEY);
    const b = seal('same', KEY);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.nonce.equals(b.nonce)).toBe(false);
  });

  it('refuses a tampered ciphertext instead of returning garbage', () => {
    // The reason for GCM over CBC: a flipped bit must fail loudly, not decrypt
    // into something that then gets sent to Monarch as a cookie.
    const sealed = seal('session_id=abc; csrftoken=def', KEY);
    sealed.ciphertext[0] ^= 0xff;
    expect(() => open(sealed, KEY)).toThrow(SealedDataError);
  });

  it('refuses the wrong key with an explanation naming the likely cause', () => {
    const sealed = seal('secret', KEY);
    const other = Buffer.from(generateEncryptionKey(), 'base64');
    expect(() => open(sealed, other)).toThrow(/NORTHSTAR_ENCRYPTION_KEY changed/);
  });
});

describe('config', () => {
  it('demands an encryption key rather than inventing one', () => {
    // A generated-at-boot key changes on restart and silently orphans the
    // stored session; the failure would present as an endless reconnect loop.
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/NORTHSTAR_ENCRYPTION_KEY is required/);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => loadConfig({ NORTHSTAR_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(
      /exactly 32 bytes/,
    );
  });

  it('defaults to localhost with insecure cookies, and opts in explicitly', () => {
    const local = loadConfig({ NORTHSTAR_ENCRYPTION_KEY: generateEncryptionKey() });
    expect(local.host).toBe('127.0.0.1');
    expect(local.secureCookies).toBe(false);

    const tls = loadConfig({
      NORTHSTAR_ENCRYPTION_KEY: generateEncryptionKey(),
      NORTHSTAR_SECURE_COOKIES: 'true',
    });
    expect(tls.secureCookies).toBe(true);
  });

  it('rejects a nonsense port', () => {
    expect(() =>
      loadConfig({ NORTHSTAR_ENCRYPTION_KEY: generateEncryptionKey(), PORT: 'http' }),
    ).toThrow(/PORT must be a valid port/);
  });
});

describe('sessions', () => {
  it('stores only the hash of a token, never the token', () => {
    const d = db();
    const sessions = new Sessions(d, 24);
    const { token } = sessions.create();

    const rows = d.prepare('SELECT token_hash FROM session').all() as { token_hash: string }[];
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
  });

  it('verifies a live session and rejects an unknown one', () => {
    const sessions = new Sessions(db(), 24);
    const { token } = sessions.create();
    expect(sessions.verify(token)).not.toBeNull();
    expect(sessions.verify('not-a-real-token')).toBeNull();
    expect(sessions.verify(undefined)).toBeNull();
  });

  it('expires a session and deletes it on the way out', () => {
    const d = db();
    const sessions = new Sessions(d, 24);
    const { token } = sessions.create();

    d.prepare('UPDATE session SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
    expect(sessions.verify(token)).toBeNull();
    expect(d.prepare('SELECT COUNT(*) c FROM session').get()).toEqual({ c: 0 });
  });

  it('slides the expiry on use, so an app in daily use never logs you out', () => {
    const d = db();
    const sessions = new Sessions(d, 24);
    const { token } = sessions.create();

    const near = new Date(Date.now() + 60_000).toISOString();
    d.prepare('UPDATE session SET expires_at = ?').run(near);

    const verified = sessions.verify(token);
    expect(new Date(verified!.expiresAt).getTime()).toBeGreaterThan(new Date(near).getTime());
  });

  it('destroys one session, and all of them', () => {
    const sessions = new Sessions(db(), 24);
    const a = sessions.create();
    const b = sessions.create();

    sessions.destroy(a.token);
    expect(sessions.verify(a.token)).toBeNull();
    expect(sessions.verify(b.token)).not.toBeNull();

    sessions.destroyAll();
    expect(sessions.verify(b.token)).toBeNull();
  });
});

describe('login throttle', () => {
  it('blocks after the limit and reports when to retry', () => {
    const throttle = new LoginThrottle(3, 60_000);
    const t0 = 1_000_000;

    throttle.recordFailure(t0);
    throttle.recordFailure(t0);
    expect(throttle.isBlocked(t0)).toBe(false);

    throttle.recordFailure(t0);
    expect(throttle.isBlocked(t0)).toBe(true);
    expect(throttle.retryAfter(t0)).toBe(60);
  });

  it('lets attempts age out of the window', () => {
    const throttle = new LoginThrottle(3, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) throttle.recordFailure(t0);
    expect(throttle.isBlocked(t0)).toBe(true);
    expect(throttle.isBlocked(t0 + 61_000)).toBe(false);
  });

  it('clears on a successful login', () => {
    const throttle = new LoginThrottle(1, 60_000);
    throttle.recordFailure();
    expect(throttle.isBlocked()).toBe(true);
    throttle.reset();
    expect(throttle.isBlocked()).toBe(false);
  });
});

describe('user store', () => {
  it('reports unconfigured until a password is set', async () => {
    const store = new UserStore(db());
    expect(store.isConfigured()).toBe(false);
    await store.setPassword('hunter2hunter2');
    expect(store.isConfigured()).toBe(true);
    expect(await store.verify('hunter2hunter2')).toBe(true);
    expect(await store.verify('wrong')).toBe(false);
  });

  it('cannot be tricked into a second user', async () => {
    const d = db();
    const store = new UserStore(d);
    await store.setPassword('first-password');
    await store.setPassword('second-password');

    expect(d.prepare('SELECT COUNT(*) c FROM app_user').get()).toEqual({ c: 1 });
    expect(await store.verify('second-password')).toBe(true);
    expect(await store.verify('first-password')).toBe(false);
  });
});

describe('monarch credential store', () => {
  it('stores nothing readable in the database', () => {
    const d = db();
    const store = new MonarchCredentialStore(d, KEY);
    store.save('session_id=supersecret; csrftoken=alsosecret');

    const row = d.prepare('SELECT ciphertext FROM monarch_credential').get() as { ciphertext: Buffer };
    expect(row.ciphertext.toString('utf8')).not.toContain('supersecret');
    expect(store.read()).toBe('session_id=supersecret; csrftoken=alsosecret');
  });

  it('reports no connection before anything is saved', () => {
    const store = new MonarchCredentialStore(db(), KEY);
    expect(store.read()).toBeNull();
    expect(store.status()).toBeNull();
  });

  it('replaces on reconnect rather than accumulating rows', () => {
    const d = db();
    const store = new MonarchCredentialStore(d, KEY);
    store.save('session_id=one; csrftoken=a');
    store.save('session_id=two; csrftoken=b');
    expect(d.prepare('SELECT COUNT(*) c FROM monarch_credential').get()).toEqual({ c: 1 });
    expect(store.read()).toBe('session_id=two; csrftoken=b');
  });

  it('flags a rejected session, and a reconnect clears the flag', () => {
    const store = new MonarchCredentialStore(db(), KEY);
    store.save('session_id=one; csrftoken=a');
    expect(store.status()?.invalidAt).toBeNull();

    store.markInvalid();
    expect(store.status()?.invalidAt).not.toBeNull();

    store.save('session_id=two; csrftoken=b');
    expect(store.status()?.invalidAt).toBeNull();
  });
});

describe('safeEqual', () => {
  it('compares without leaking length-independent timing', () => {
    expect(safeEqual('token', 'token')).toBe(true);
    expect(safeEqual('token', 'tokes')).toBe(false);
    expect(safeEqual('token', 'longer-token')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('issueSessionToken', () => {
  it('produces url-safe, non-repeating tokens', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { token } = issueSessionToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });
});
