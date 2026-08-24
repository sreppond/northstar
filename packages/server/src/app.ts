/**
 * The Fastify app.
 *
 * Built as a function taking a Config so tests can spin up a real server on an
 * in-memory database — every route test below exercises the actual HTTP stack,
 * cookies and all, rather than calling handlers directly.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import type { Config } from './config.ts';
import { openDatabase, type Db } from './db/index.ts';
import { PlanRepo, SnapshotRepo } from './db/repos.ts';
import { LoginThrottle, Sessions } from './auth/sessions.ts';
import { MonarchCredentialStore, UserStore } from './auth/store.ts';
import { safeEqual } from './auth/crypto.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerMonarchRoutes } from './routes/monarch.ts';
import { registerPlanRoutes } from './routes/plans.ts';

export const SESSION_COOKIE = 'northstar_session';
export const CSRF_COOKIE = 'northstar_csrf';
export const CSRF_HEADER = 'x-northstar-csrf';

export interface Services {
  config: Config;
  db: Db;
  users: UserStore;
  sessions: Sessions;
  throttle: LoginThrottle;
  credentials: MonarchCredentialStore;
  plans: PlanRepo;
  snapshots: SnapshotRepo;
  /** Swapped in tests so no route ever reaches the real Monarch. */
  fetchImpl: typeof fetch;
}

declare module 'fastify' {
  interface FastifyRequest {
    services: Services;
  }
  interface FastifyInstance {
    services: Services;
  }
}

export interface BuildOptions {
  config: Config;
  fetchImpl?: typeof fetch;
  logger?: boolean;
}

export function buildApp({ config, fetchImpl, logger = false }: BuildOptions): FastifyInstance {
  const db = openDatabase(config.databaseUrl);

  const services: Services = {
    config,
    db,
    users: new UserStore(db),
    sessions: new Sessions(db, config.sessionTtlHours),
    throttle: new LoginThrottle(),
    credentials: new MonarchCredentialStore(db, config.encryptionKey),
    plans: new PlanRepo(db),
    snapshots: new SnapshotRepo(db),
    fetchImpl: fetchImpl ?? fetch,
  };

  const app = Fastify({
    logger,
    // A plan document with many scenarios is comfortably over Fastify's 1MB
    // default, and hitting it presents as a save that silently fails.
    bodyLimit: 8 * 1024 * 1024,
  });

  app.decorate('services', services);
  app.decorateRequest('services', null as unknown as Services);
  app.addHook('onRequest', async (request) => {
    request.services = services;
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  /**
   * Never let an error message reach the client unfiltered. A stack trace or a
   * SQLite error string can name paths and column layouts; this app holds
   * financial data and there is exactly one legitimate user.
   */
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.status(status).send({
      error: status === 500 ? 'Something went wrong on the server.' : error.message,
    });
  });

  registerAuthRoutes(app);
  registerMonarchRoutes(app);
  registerPlanRoutes(app);

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}

export async function registerCookies(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
}

// --- guards -----------------------------------------------------------------

/**
 * Reject anything without a live session. Returns false when it has already
 * replied, so a handler reads as `if (!(await requireAuth(...))) return;`.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const token = request.cookies[SESSION_COOKIE];
  const session = request.services.sessions.verify(token);
  if (!session) {
    await reply.status(401).send({ error: 'Not signed in.' });
    return false;
  }
  return true;
}

/**
 * Double-submit CSRF check on mutations.
 *
 * SameSite=Strict already blocks the cross-site form post, but it is one
 * browser default away from being the only thing standing between a malicious
 * page and a request that carries the Monarch session. Two independent checks
 * for the cost of a header.
 */
export async function requireCsrf(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const cookieToken = request.cookies[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];

  if (!cookieToken || typeof headerToken !== 'string' || !safeEqual(cookieToken, headerToken)) {
    await reply.status(403).send({ error: 'Bad or missing CSRF token. Reload the page.' });
    return false;
  }
  return true;
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
    maxAge: config.sessionTtlHours * 3600,
  });
}

/** Readable by script on purpose — the page has to echo it back in a header. */
export function setCsrfCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
  });
}

export function clearAuthCookies(reply: FastifyReply, config: Config): void {
  const options = { path: '/', sameSite: 'strict' as const, secure: config.secureCookies };
  reply.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
