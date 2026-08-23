/**
 * The API client.
 *
 * Everything is same-origin, so the session rides as an httpOnly cookie the
 * page never sees. What the page does have to carry is the CSRF token, read
 * from its (deliberately readable) cookie and echoed in a header — that pairing
 * is what makes the double-submit check work.
 */
import type { MonarchSnapshot, ImportReport, Plan } from '@northstar/engine';

const CSRF_COOKIE = 'northstar_csrf';
const CSRF_HEADER = 'X-Northstar-Csrf';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set when the fix is to reconnect Monarch rather than to retry. */
    readonly needsReconnect = false,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers[CSRF_HEADER] = csrfToken();

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      // Same-origin, but stated rather than relied upon.
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the Northstar server. Is it running?', 0);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or non-JSON body on an error is still an error worth reporting.
  }

  if (!response.ok) {
    const data = payload as { error?: string; needsReconnect?: boolean } | null;
    throw new ApiError(
      data?.error ?? `Request failed (${response.status}).`,
      response.status,
      Boolean(data?.needsReconnect),
    );
  }

  return payload as T;
}

// --- auth -------------------------------------------------------------------

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
}

export const api = {
  authStatus: () => call<AuthStatus>('GET', '/api/auth/status'),
  setup: (password: string) => call<{ ok: true }>('POST', '/api/auth/setup', { password }),
  login: (password: string) => call<{ ok: true }>('POST', '/api/auth/login', { password }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout'),

  // --- monarch --------------------------------------------------------------

  monarchStatus: () => call<MonarchStatus>('GET', '/api/monarch/status'),
  connectMonarch: (cookieString: string) =>
    call<{ ok: true }>('POST', '/api/monarch/connect', { cookieString }),
  disconnectMonarch: () => call<{ ok: true }>('POST', '/api/monarch/disconnect'),
  refreshMonarch: () => call<RefreshResult>('POST', '/api/monarch/refresh'),
  pasteSnapshot: (snapshot: unknown) =>
    call<RefreshResult>('POST', '/api/monarch/paste', { snapshot }),

  // --- plans ----------------------------------------------------------------

  listPlans: () => call<{ plans: Plan[] }>('GET', '/api/plans'),
  syncPlans: (plans: Plan[]) => call<{ ok: true; count: number }>('PUT', '/api/plans', { plans }),
};

export interface MonarchStatus {
  connected: boolean;
  needsReconnect: boolean;
  connectedAt: string | null;
  lastCapturedAt: string | null;
  lastSource: 'live' | 'paste' | null;
  netWorth: number | null;
  ageDays: number | null;
  stale: boolean;
  stalenessDays: number;
  snapshotCount: number;
}

export interface RefreshResult {
  ok: true;
  snapshot: MonarchSnapshot;
  preview: ImportReport | null;
}
