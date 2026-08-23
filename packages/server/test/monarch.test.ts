import { describe, expect, it, vi } from 'vitest';
import {
  MonarchClient,
  MonarchSchemaError,
  MonarchSessionExpired,
  MonarchUnreachable,
  missingCookies,
  monthsBetween,
  parseCookieString,
} from '../src/monarch/client.ts';
import { defaultCashflowRange, toSnapshot } from '../src/monarch/snapshot.ts';
import { classify, previewImport } from '@northstar/engine';

const COOKIES = 'session_id=abc123; csrftoken=tok456';

/** A fetch that answers once with the given status/body. */
function fetchWith(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('parseCookieString', () => {
  it('splits on the first = only', () => {
    // Real session values are base64 and contain '='. Splitting on every '='
    // truncates the session id, and the resulting 401 is indistinguishable
    // from an expired login.
    const parsed = parseCookieString('session_id=eyJhbGc=abc==; csrftoken=xyz');
    expect(parsed.session_id).toBe('eyJhbGc=abc==');
    expect(parsed.csrftoken).toBe('xyz');
  });

  it('tolerates the whitespace and trailing semicolons of a real paste', () => {
    const parsed = parseCookieString('  session_id=a ;  csrftoken=b ;  ');
    expect(parsed).toEqual({ session_id: 'a', csrftoken: 'b' });
  });

  it('ignores junk segments rather than producing empty keys', () => {
    expect(parseCookieString('session_id=a; ; =novalue; csrftoken=b')).toEqual({
      session_id: 'a',
      csrftoken: 'b',
    });
  });
});

describe('missingCookies', () => {
  it('names exactly what is absent', () => {
    expect(missingCookies(COOKIES)).toEqual([]);
    expect(missingCookies('session_id=a')).toEqual(['csrftoken']);
    expect(missingCookies('')).toEqual(['session_id', 'csrftoken']);
  });
});

describe('MonarchClient', () => {
  it('refuses to construct without the required cookies', () => {
    expect(() => new MonarchClient({ cookieString: 'session_id=a' })).toThrow(/csrftoken/);
  });

  it('sends the headers Monarch requires, including the CSRF token', async () => {
    const fetchImpl = fetchWith({ data: { accounts: [] } });
    await new MonarchClient({ cookieString: COOKIES, fetchImpl }).getAccounts();

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    // The default must be the real Monarch: the override exists for testing
    // and a wrong default would send session cookies somewhere else.
    expect(url).toBe('https://api.monarch.com/graphql');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Csrftoken']).toBe('tok456');
    expect(headers.Cookie).toBe(COOKIES);
    expect(headers.Origin).toBe('https://app.monarch.com');
    expect(headers['monarch-client']).toBe('web');
  });

  it('maps 401 and 403 to an expired session', async () => {
    for (const status of [401, 403]) {
      const client = new MonarchClient({ cookieString: COOKIES, fetchImpl: fetchWith({}, status) });
      await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchSessionExpired);
    }
  });

  it.each([
    'User is not authenticated',
    'Unauthenticated.',
    'Authentication credentials were not provided.',
    'Signature has expired',
    'You do not have permission denied to perform this action',
    'Forbidden',
  ])('treats the GraphQL auth error %j as expired, not as schema drift', async (message) => {
    // These arrive as HTTP 200 with an errors array, so the status check does
    // not see them. Misfiling one sends the user off to recapture a GraphQL
    // document when all they need to do is sign in again.
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({ errors: [{ message }] }),
    });
    await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchSessionExpired);
  });

  it('does not mistake a schema error that merely mentions a field for an auth error', async () => {
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({ errors: [{ message: 'Cannot query field "loginMethod" on type "Account"' }] }),
    });
    await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchSchemaError);
  });

  it('reports a genuine query rejection as schema drift', async () => {
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({ errors: [{ message: 'Cannot query field "subtype"' }] }),
    });
    await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchSchemaError);
  });

  it('reports an unexpected response shape rather than importing nothing', async () => {
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({ data: { accounts: 'not-an-array' } }),
    });
    await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchSchemaError);
  });

  it('distinguishes not reaching Monarch from Monarch saying no', async () => {
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await expect(client.getAccounts()).rejects.toBeInstanceOf(MonarchUnreachable);
  });

  it('returns null cashflow when Monarch reports no aggregate', async () => {
    // Not zero: a zeroed baseline written into a plan is indistinguishable
    // from a real one that happens to be zero.
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({ data: { summary: [] } }),
    });
    expect(await client.getCashflow('2026-05-01', '2026-07-31')).toBeNull();
  });

  it('returns cashflow totals with the month span worked out', async () => {
    const client = new MonarchClient({
      cookieString: COOKIES,
      fetchImpl: fetchWith({
        data: { summary: [{ summary: { sumIncome: 38400, sumExpense: -22150 } }] },
      }),
    });
    expect(await client.getCashflow('2026-05-01', '2026-07-31')).toEqual({
      income: 38400,
      expenses: -22150,
      months: 3,
    });
  });
});

describe('monthsBetween', () => {
  it('counts inclusively', () => {
    expect(monthsBetween('2026-05-01', '2026-07-31')).toBe(3);
    expect(monthsBetween('2026-01-01', '2026-12-31')).toBe(12);
    expect(monthsBetween('2026-05-01', '2026-05-31')).toBe(1);
  });

  it('never returns zero or negative, which would divide the annualisation wrongly', () => {
    expect(monthsBetween('2026-07-01', '2026-05-01')).toBe(1);
    expect(monthsBetween('nonsense', 'also-nonsense')).toBe(1);
  });
});

describe('toSnapshot', () => {
  const account = (over: Record<string, unknown> = {}) => ({
    id: '170283',
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
    ...over,
  });

  it('prefers the balance Monarch shows in its own UI', () => {
    const snap = toSnapshot([account()], null);
    expect(snap.accounts[0].balance).toBe(8412.55);
  });

  it('falls back to currentBalance when there is no display balance', () => {
    const snap = toSnapshot([account({ displayBalance: null })], null);
    expect(snap.accounts[0].balance).toBe(8000);
  });

  it('reads a deactivation timestamp as closed', () => {
    const snap = toSnapshot([account({ deactivatedAt: '2025-01-01T00:00:00Z' })], null);
    expect(snap.accounts[0].is_active).toBe(false);
  });

  it('carries subtype through, which is what removes the tax-treatment question', () => {
    // The whole reason for going direct rather than through the MCP tool.
    const snap = toSnapshot(
      [account({ displayName: 'Fidelity 401(k)', type: { name: 'brokerage' }, subtype: { name: '401k' } })],
      null,
    );
    expect(classify(snap.accounts[0])).toEqual({
      kind: 'mapped',
      accountClass: 'taxDeferredInvestment',
      via: 'subtype',
    });
  });

  it('normalises a fractional rate into a percentage', () => {
    // Monarch reports these both ways. A 0.0599 read as 5.99% models a
    // mortgage at six hundredths of a percent — plausible on a chart, wildly
    // wrong in the projection.
    expect(toSnapshot([account({ interestRate: 0.0599 })], null).accounts[0].interest_rate).toBe(5.99);
    expect(toSnapshot([account({ interestRate: 5.875 })], null).accounts[0].interest_rate).toBe(5.875);
  });

  it('falls back to apr when there is no interest rate', () => {
    expect(toSnapshot([account({ apr: 22.99 })], null).accounts[0].interest_rate).toBe(22.99);
  });

  it('omits the rate entirely rather than inventing a zero', () => {
    expect(toSnapshot([account()], null).accounts[0].interest_rate).toBeUndefined();
  });

  it('produces a snapshot the engine imports without asking anything', () => {
    const snap = toSnapshot(
      [
        account(),
        account({ id: '2', displayName: '401k', type: { name: 'brokerage' }, subtype: { name: '401k' }, displayBalance: 288104.02 }),
        account({ id: '3', displayName: 'Roth', type: { name: 'brokerage' }, subtype: { name: 'roth_ira' }, displayBalance: 74310.88 }),
      ],
      { income: 38400, expenses: -22150, months: 3 },
    );

    const report = previewImport(
      { id: 'p', name: 'P', settings: { startYear: 2026, projectionYears: 5, inflationRate: 0, dollarMode: 'futureDollars', baselineIncome: 0, baselineExpenses: 0, incomeTaxRate: 0 }, participants: [], accounts: [], events: [], rules: [] },
      snap,
    );

    expect(report.needsChoice).toHaveLength(0);
    expect(report.lines.map((l) => l.accountClass).sort()).toEqual([
      'cash',
      'taxDeferredInvestment',
      'taxFreeInvestment',
    ]);
    expect(report.baseline).toMatchObject({ income: 153_600, expenses: 88_600 });
  });
});

describe('defaultCashflowRange', () => {
  it('covers the three whole months before this one', () => {
    expect(defaultCashflowRange(new Date('2026-08-23T00:00:00Z'))).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-07-31',
    });
  });

  it('rolls back across a year boundary', () => {
    expect(defaultCashflowRange(new Date('2026-02-10T00:00:00Z'))).toEqual({
      startDate: '2025-11-01',
      endDate: '2026-01-31',
    });
  });
});
