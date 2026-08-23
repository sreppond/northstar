/**
 * A Monarch client, cookie-authenticated.
 *
 * Cookies rather than password login, deliberately. Monarch gates programmatic
 * logins behind Cloudflare for unfamiliar IPs, and the login flow carries
 * email OTP, TOTP and a device-uuid handshake. A browser session sidesteps all
 * of it: with `session_id` and `csrftoken` in hand, the API is ordinary
 * authenticated GraphQL. There is no login flow in this file because there does
 * not need to be one.
 *
 * The cost is that the session expires with the browser login, which is why
 * `MonarchSessionExpired` is a distinct error the UI can route on.
 */
import { z } from 'zod';
import { GET_ACCOUNTS, GET_CASHFLOW } from './queries.ts';

const DEFAULT_API_BASE = 'https://api.monarch.com';

/**
 * Sent on every request. Monarch checks `monarch-client-version` against a
 * server-side minimum and rejects anything it considers too old, so this is a
 * value with a shelf life — a sudden 403 on every call is the sign it needs
 * recapturing from the web app.
 */
const HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Client-Platform': 'web',
  Origin: 'https://app.monarch.com',
  Referer: 'https://app.monarch.com/',
  'monarch-client': 'web',
  'monarch-client-version': '2025.05',
};

export const REQUIRED_COOKIES = ['session_id', 'csrftoken'] as const;

/**
 * Messages that mean "your session is dead", as opposed to "your query is
 * wrong". Getting this split wrong is a bad user-facing failure in both
 * directions: an expired session reported as schema drift sends you off to
 * recapture a GraphQL document, and schema drift reported as an expired
 * session sends you round a reconnect loop that can never fix it.
 */
const AUTH_ERROR =
  /\bnot authenticated\b|\bunauthenticated\b|\bunauthorized\b|\bnot authorized\b|\bforbidden\b|permission denied|credentials were not provided|signature has expired|login required/i;

export class MonarchError extends Error {}
/** The stored session is no longer good. The only fix is a fresh paste. */
export class MonarchSessionExpired extends MonarchError {}
/** Monarch answered, but not in a shape we recognise — most likely schema drift. */
export class MonarchSchemaError extends MonarchError {}
/** Could not reach Monarch at all. */
export class MonarchUnreachable extends MonarchError {}

/**
 * Split a pasted `cookie:` header into pairs.
 *
 * Real pasted headers carry cookies whose values contain `=` (base64 session
 * payloads), so this splits on the FIRST `=` only. Splitting on all of them
 * truncates the session id and produces a 401 that looks like an expired login.
 */
export function parseCookieString(raw: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    cookies[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return cookies;
}

export function missingCookies(raw: string): string[] {
  const cookies = parseCookieString(raw);
  return REQUIRED_COOKIES.filter((name) => !cookies[name]);
}

// --- response shapes --------------------------------------------------------

const accountSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  displayName: z.string().nullish(),
  deactivatedAt: z.string().nullish(),
  isHidden: z.boolean().nullish(),
  currentBalance: z.number().nullish(),
  displayBalance: z.number().nullish(),
  type: z.object({ name: z.string().nullish() }).nullish(),
  subtype: z.object({ name: z.string().nullish() }).nullish(),
  institution: z.object({ name: z.string().nullish() }).nullish(),
  apr: z.number().nullish(),
  interestRate: z.number().nullish(),
  minimumPayment: z.number().nullish(),
  plannedPayment: z.number().nullish(),
});

const accountsResponse = z.object({ accounts: z.array(accountSchema) });

const cashflowResponse = z.object({
  summary: z.array(
    z.object({
      summary: z.object({ sumIncome: z.number().nullish(), sumExpense: z.number().nullish() }),
    }),
  ),
});

export type MonarchApiAccount = z.infer<typeof accountSchema>;

export interface CashflowTotals {
  income: number;
  expenses: number;
  months: number;
}

export interface MonarchClientOptions {
  cookieString: string;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Overridden only to point at a stand-in during testing. */
  apiBase?: string;
}

export class MonarchClient {
  private cookieString: string;
  private csrfToken: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private apiBase: string;

  constructor({ cookieString, fetchImpl, timeoutMs = 20_000, apiBase }: MonarchClientOptions) {
    const missing = missingCookies(cookieString);
    if (missing.length) {
      throw new MonarchError(
        `The pasted cookies are missing ${missing.join(' and ')}. Copy the whole cookie header from a request to api.monarch.com.`,
      );
    }
    this.cookieString = cookieString;
    this.csrfToken = parseCookieString(cookieString).csrftoken;
    this.fetchImpl = fetchImpl ?? fetch;
    this.timeoutMs = timeoutMs;
    this.apiBase = apiBase ?? DEFAULT_API_BASE;
  }

  private async call<T>(
    operationName: string,
    query: string,
    variables: unknown,
    // The third parameter matters: bare `ZodType<T>` pins the schema's INPUT
    // to T as well, which breaks any schema with a transform (here, an id that
    // arrives as a number and leaves as a string).
    shape: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    // Without a timeout a hung connection would wedge the refresh request until
    // the browser gives up, with no way to tell which side is stuck.
    const abort = AbortSignal.timeout(this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBase}/graphql`, {
        method: 'POST',
        headers: { ...HEADERS, 'X-Csrftoken': this.csrfToken, Cookie: this.cookieString },
        body: JSON.stringify({ operationName, query, variables }),
        signal: abort,
      });
    } catch (e) {
      throw new MonarchUnreachable(
        `Could not reach Monarch: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new MonarchSessionExpired(
        'Monarch rejected the stored session. Sign in to Monarch in your browser and paste fresh cookies.',
      );
    }
    if (!response.ok) {
      throw new MonarchError(`Monarch returned HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MonarchSchemaError('Monarch returned a response that was not JSON.');
    }

    const envelope = payload as { data?: unknown; errors?: { message?: string }[] };

    if (envelope.errors?.length) {
      const message = envelope.errors.map((e) => e.message).filter(Boolean).join('; ');
      // GraphQL-level auth failures come back as 200 + an errors array, so the
      // status check above does not catch them. Monarch is Django-backed
      // (session_id + csrftoken), so these are the DRF/graphene phrasings —
      // note "not authenticated", which does not contain "unauthenticated".
      if (AUTH_ERROR.test(message)) {
        throw new MonarchSessionExpired(
          'Monarch rejected the stored session. Sign in to Monarch in your browser and paste fresh cookies.',
        );
      }
      throw new MonarchSchemaError(`Monarch rejected the query: ${message}`);
    }

    const parsed = shape.safeParse(envelope.data);
    if (!parsed.success) {
      throw new MonarchSchemaError(
        `Monarch's response did not match the expected shape (${parsed.error.issues[0]?.path.join('.') || 'root'}). ` +
          "Monarch's API is private and unversioned; the query in queries.ts may need recapturing.",
      );
    }
    return parsed.data;
  }

  async getAccounts(): Promise<MonarchApiAccount[]> {
    const { accounts } = await this.call('GetAccounts', GET_ACCOUNTS, {}, accountsResponse);
    return accounts;
  }

  /**
   * Cashflow totals for a date range. Returns null when Monarch reports no
   * aggregate at all, rather than a zero — a zeroed baseline written into a
   * plan is indistinguishable from a real one that happens to be zero.
   */
  async getCashflow(startDate: string, endDate: string): Promise<CashflowTotals | null> {
    const data = await this.call(
      'Web_GetCashFlowPage',
      GET_CASHFLOW,
      { filters: { search: '', categories: [], accounts: [], tags: [], startDate, endDate } },
      cashflowResponse,
    );

    const totals = data.summary[0]?.summary;
    if (!totals || totals.sumIncome == null || totals.sumExpense == null) return null;

    return {
      income: totals.sumIncome,
      expenses: totals.sumExpense,
      months: monthsBetween(startDate, endDate),
    };
  }

  /** Cheapest call that proves the session works. Used when connecting. */
  async verify(): Promise<void> {
    await this.getAccounts();
  }
}

/**
 * Inclusive month span. Getting this wrong is silently expensive: read a
 * quarter as a month and the annualised income lands three times too high.
 */
export function monthsBetween(startDate: string, endDate: string): number {
  const a = new Date(startDate);
  const b = new Date(endDate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return months > 0 ? months : 1;
}
