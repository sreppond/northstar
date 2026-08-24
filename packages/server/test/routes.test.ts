import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, registerCookies, CSRF_HEADER } from '../src/app.ts';
import { generateEncryptionKey, loadConfig } from '../src/config.ts';

const PASSWORD = 'a-long-enough-passphrase';
const COOKIES = 'session_id=abc123; csrftoken=tok456';

const ACCOUNTS_OK = {
  data: {
    accounts: [
      {
        id: '1',
        displayName: 'Chase Checking',
        deactivatedAt: null,
        isHidden: false,
        currentBalance: 8000,
        displayBalance: 8412.55,
        type: { name: 'depository' },
        subtype: { name: 'checking' },
        institution: { name: 'Chase' },
        apr: null,
        interestRate: null,
        minimumPayment: null,
        plannedPayment: null,
      },
    ],
  },
};

function config() {
  return loadConfig({ NORTHSTAR_ENCRYPTION_KEY: generateEncryptionKey(), NORTHSTAR_DB: ':memory:' });
}

/** Collects Set-Cookie into a jar so requests carry a real session. */
class Client {
  private jar = new Map<string, string>();

  constructor(private app: FastifyInstance) {}

  private cookieHeader(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  csrf(): string | undefined {
    return this.jar.get('northstar_csrf');
  }

  async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    const headers: Record<string, string> = {};
    const cookies = this.cookieHeader();
    if (cookies) headers.cookie = cookies;

    const csrf = this.csrf();
    if (csrf && method !== 'GET') headers[CSRF_HEADER] = csrf;

    const response = await this.app.inject({ method, url, payload: payload as never, headers });

    for (const raw of [response.headers['set-cookie'] ?? []].flat()) {
      const [pair] = String(raw).split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return response;
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, payload?: unknown) => this.request('POST', url, payload);
  put = (url: string, payload?: unknown) => this.request('PUT', url, payload);
  del = (url: string) => this.request('DELETE', url);

  /** Deliberately omits the CSRF header, to prove mutations are guarded. */
  async postWithoutCsrf(url: string, payload?: unknown) {
    return this.app.inject({
      method: 'POST',
      url,
      payload: payload as never,
      headers: { cookie: this.cookieHeader() },
    });
  }
}

async function makeApp(fetchImpl?: typeof fetch) {
  const app = buildApp({ config: config(), fetchImpl });
  await registerCookies(app);
  await app.ready();
  return app;
}

function fetchOnce(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as unknown as typeof fetch;
}

describe('auth routes', () => {
  let app: FastifyInstance;
  let client: Client;

  beforeEach(async () => {
    app = await makeApp();
    client = new Client(app);
  });

  it('reports an unconfigured server so the app can show setup', async () => {
    const res = await client.get('/api/auth/status');
    expect(res.json()).toEqual({ configured: false, authenticated: false });
  });

  it('sets a password on first run and signs you straight in', async () => {
    const res = await client.post('/api/auth/setup', { password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect((await client.get('/api/auth/status')).json()).toEqual({
      configured: true,
      authenticated: true,
    });
  });

  it('refuses a second setup, so the port cannot be used to seize the account', async () => {
    await client.post('/api/auth/setup', { password: PASSWORD });
    const res = await new Client(app).post('/api/auth/setup', { password: 'another-password-x' });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await client.post('/api/auth/setup', { password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/at least 12/);
  });

  it('issues an httpOnly, SameSite=Strict session cookie', async () => {
    const res = await client.post('/api/auth/setup', { password: PASSWORD });
    const raw = [res.headers['set-cookie'] ?? []].flat().map(String);
    const session = raw.find((c) => c.startsWith('northstar_session='))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Strict/i);
    // Secure is off for plain-HTTP localhost: set there, the browser drops the
    // cookie and the failure looks like a broken login.
    expect(session).not.toMatch(/Secure/i);

    // The CSRF cookie must NOT be httpOnly — the page has to read it back.
    expect(raw.find((c) => c.startsWith('northstar_csrf='))!).not.toMatch(/HttpOnly/i);
  });

  it('logs in and out', async () => {
    await client.post('/api/auth/setup', { password: PASSWORD });
    await client.post('/api/auth/logout');
    expect((await client.get('/api/auth/status')).json().authenticated).toBe(false);

    expect((await client.post('/api/auth/login', { password: PASSWORD })).statusCode).toBe(200);
    expect((await client.get('/api/auth/status')).json().authenticated).toBe(true);
  });

  it('gives the same answer for a wrong password however it is wrong', async () => {
    await client.post('/api/auth/setup', { password: PASSWORD });
    await client.post('/api/auth/logout');
    const res = await client.post('/api/auth/login', { password: 'not-the-password' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Incorrect password.');
  });

  it('throttles repeated failures', async () => {
    await client.post('/api/auth/setup', { password: PASSWORD });
    await client.post('/api/auth/logout');
    for (let i = 0; i < 10; i++) await client.post('/api/auth/login', { password: 'wrong' });

    const res = await client.post('/api/auth/login', { password: 'wrong' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatch(/Try again in \d+ seconds/);
  });

  it('kills every other session when the password changes', async () => {
    await client.post('/api/auth/setup', { password: PASSWORD });
    const other = new Client(app);
    await other.post('/api/auth/login', { password: PASSWORD });
    expect((await other.get('/api/auth/status')).json().authenticated).toBe(true);

    await client.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-passphrase',
    });

    expect((await other.get('/api/auth/status')).json().authenticated).toBe(false);
    expect((await client.get('/api/auth/status')).json().authenticated).toBe(true);
  });
});

describe('route guards', () => {
  it('refuses every protected route without a session', async () => {
    const app = await makeApp();
    const anon = new Client(app);
    for (const url of ['/api/monarch/status', '/api/monarch/latest', '/api/plans', '/api/monarch/history']) {
      expect((await anon.get(url)).statusCode).toBe(401);
    }
  });

  it('refuses a mutation carrying a session but no CSRF header', async () => {
    // SameSite=Strict should already stop this; the double-submit token is the
    // second lock, because the first one is a browser default away from gone.
    const app = await makeApp();
    const client = new Client(app);
    await client.post('/api/auth/setup', { password: PASSWORD });

    const res = await client.postWithoutCsrf('/api/monarch/connect', { cookieString: COOKIES });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/CSRF/);
  });
});

describe('monarch routes', () => {
  async function signedIn(fetchImpl?: typeof fetch) {
    const app = await makeApp(fetchImpl);
    const client = new Client(app);
    await client.post('/api/auth/setup', { password: PASSWORD });
    return { app, client };
  }

  it('reports disconnected and stale before anything has been captured', async () => {
    const { client } = await signedIn();
    expect((await client.get('/api/monarch/status')).json()).toMatchObject({
      connected: false,
      lastCapturedAt: null,
      ageDays: null,
      stale: true,
      snapshotCount: 0,
    });
  });

  it('verifies a session against Monarch before storing it', async () => {
    const fetchImpl = fetchOnce(ACCOUNTS_OK);
    const { client } = await signedIn(fetchImpl);

    expect((await client.post('/api/monarch/connect', { cookieString: COOKIES })).statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect((await client.get('/api/monarch/status')).json().connected).toBe(true);
  });

  it('does not store a session Monarch rejects', async () => {
    // Catching the bad paste while the user is still on the page that explains
    // how to get a good one, rather than days later as a failed refresh.
    const { client } = await signedIn(fetchOnce({}, 401));
    const res = await client.post('/api/monarch/connect', { cookieString: COOKIES });
    expect(res.statusCode).toBe(401);
    expect((await client.get('/api/monarch/status')).json().connected).toBe(false);
  });

  it('names the missing cookie rather than failing vaguely', async () => {
    const { client } = await signedIn();
    const res = await client.post('/api/monarch/connect', { cookieString: 'session_id=only' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/csrftoken/);
  });

  it('refreshes into a stored snapshot and returns the diff', async () => {
    const { client } = await signedIn(fetchOnce(ACCOUNTS_OK));
    await client.post('/api/monarch/connect', { cookieString: COOKIES });

    const res = await client.post('/api/monarch/refresh');
    expect(res.statusCode).toBe(200);
    expect(res.json().snapshot.accounts[0].name).toBe('Chase Checking');

    const status = (await client.get('/api/monarch/status')).json();
    expect(status).toMatchObject({ snapshotCount: 1, ageDays: 0, stale: false, lastSource: 'live' });
  });

  it('flags the connection for reconnect when Monarch rejects a refresh', async () => {
    const app = await makeApp(fetchOnce(ACCOUNTS_OK));
    const client = new Client(app);
    await client.post('/api/auth/setup', { password: PASSWORD });
    await client.post('/api/monarch/connect', { cookieString: COOKIES });

    // The stored session dies between connecting and refreshing.
    app.services.fetchImpl = fetchOnce({ errors: [{ message: 'User is not authenticated' }] });

    const res = await client.post('/api/monarch/refresh');
    expect(res.statusCode).toBe(401);
    expect(res.json().needsReconnect).toBe(true);
    expect((await client.get('/api/monarch/status')).json().needsReconnect).toBe(true);
  });

  it('refuses to refresh when Monarch was never connected', async () => {
    const { client } = await signedIn();
    const res = await client.post('/api/monarch/refresh');
    expect(res.statusCode).toBe(409);
    expect(res.json().needsReconnect).toBe(true);
  });

  it('still keeps the balances when the cashflow query fails', async () => {
    // Cashflow is a bonus. Losing it must not block the part that matters.
    // Keyed on the operation rather than call order, because `connect` fetches
    // too and a counter silently tests the wrong request.
    const fetchImpl = vi.fn(async (_url: unknown, init: { body: string }) => {
      const { operationName } = JSON.parse(init.body) as { operationName: string };
      const body =
        operationName === 'GetAccounts'
          ? ACCOUNTS_OK
          : { errors: [{ message: 'Cannot query field "sumIncome"' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const { client } = await signedIn(fetchImpl);
    await client.post('/api/monarch/connect', { cookieString: COOKIES });

    const res = await client.post('/api/monarch/refresh');
    expect(res.statusCode).toBe(200);
    expect(res.json().snapshot.accounts).toHaveLength(1);
    expect(res.json().snapshot.cashflow).toBeUndefined();
  });

  it('accepts a pasted snapshot as the fallback path', async () => {
    const { client } = await signedIn();
    const res = await client.post('/api/monarch/paste', {
      snapshot: {
        capturedAt: '2026-08-23',
        accounts: [{ id: '1', name: 'Chase', type: 'depository', balance: 100 }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect((await client.get('/api/monarch/status')).json().lastSource).toBe('paste');
  });

  it('rejects a malformed paste, naming the field', async () => {
    const { client } = await signedIn();
    const res = await client.post('/api/monarch/paste', { snapshot: { accounts: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/capturedAt/);
  });

  it('keeps every capture as history', async () => {
    const { client } = await signedIn();
    for (const day of ['2026-06-01', '2026-07-01', '2026-08-01']) {
      await client.post('/api/monarch/paste', {
        snapshot: { capturedAt: day, accounts: [{ id: '1', name: 'C', type: 'depository', balance: 100 }] },
      });
    }
    const { history } = (await client.get('/api/monarch/history')).json();
    expect(history.map((h: { capturedAt: string }) => h.capturedAt)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ]);
  });
});

describe('plan routes', () => {
  const plan = (id: string, name = 'Plan') => ({
    id,
    name,
    settings: { startYear: 2026, projectionYears: 5, inflationRate: 0, dollarMode: 'futureDollars', baselineIncome: 0, baselineExpenses: 0, incomeTaxRate: 0 },
    participants: [],
    accounts: [],
    events: [],
    rules: [],
  });

  async function signedIn() {
    const app = await makeApp();
    const client = new Client(app);
    await client.post('/api/auth/setup', { password: PASSWORD });
    return client;
  }

  it('round-trips a plan set', async () => {
    const client = await signedIn();
    await client.put('/api/plans', { plans: [plan('a', 'House'), plan('b', 'Retirement')] });
    const { plans } = (await client.get('/api/plans')).json();
    expect(plans.map((p: { name: string }) => p.name)).toEqual(['House', 'Retirement']);
  });

  it('replaces rather than accumulating', async () => {
    const client = await signedIn();
    await client.put('/api/plans', { plans: [plan('a'), plan('b')] });
    await client.put('/api/plans', { plans: [plan('a')] });
    expect((await client.get('/api/plans')).json().plans).toHaveLength(1);
  });

  it('refuses an empty set, which almost always means the client lost state', async () => {
    const client = await signedIn();
    await client.put('/api/plans', { plans: [plan('a')] });

    const res = await client.put('/api/plans', { plans: [] });
    expect(res.statusCode).toBe(400);
    // The stored plan must survive the refusal.
    expect((await client.get('/api/plans')).json().plans).toHaveLength(1);
  });

  it('rejects a body that is not a plan', async () => {
    const client = await signedIn();
    expect((await client.put('/api/plans', { plans: [{ id: 'x' }] })).statusCode).toBe(400);
  });

  it('will not delete the last plan', async () => {
    const client = await signedIn();
    await client.put('/api/plans', { plans: [plan('a')] });
    expect((await client.del('/api/plans/a')).statusCode).toBe(400);

    await client.put('/api/plans', { plans: [plan('a'), plan('b')] });
    expect((await client.del('/api/plans/b')).statusCode).toBe(200);
    expect((await client.get('/api/plans')).json().plans).toHaveLength(1);
  });
});
