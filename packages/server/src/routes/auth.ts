/**
 * Setup, sign in, sign out.
 *
 * "Setup" is the first-run flow: an unconfigured server has no password, so the
 * first request to arrive can set one. That is safe here only because the
 * server binds to localhost by default — the README says so explicitly, and it
 * is the reason `HOST` defaults to 127.0.0.1 rather than 0.0.0.0.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearAuthCookies,
  requireAuth,
  requireCsrf,
  setCsrfCookie,
  setSessionCookie,
} from '../app.ts';

// Long rather than complex: a passphrase is the right shape for a thing typed
// occasionally on a personal device, and length is what actually resists the
// offline attack that matters if the database leaks.
const password = z.string().min(12, 'Use at least 12 characters.').max(200);

const setupBody = z.object({ password });
const loginBody = z.object({ password: z.string().max(200) });

export function registerAuthRoutes(app: FastifyInstance): void {
  /** What the app needs before it can decide which screen to show. */
  app.get('/api/auth/status', async (request) => {
    const { users, sessions } = request.services;
    return {
      configured: users.isConfigured(),
      authenticated: sessions.verify(request.cookies[SESSION_COOKIE]) !== null,
    };
  });

  app.post('/api/auth/setup', async (request, reply) => {
    const { users, sessions, config } = request.services;

    // Only ever available once. Without this, anyone who can reach the port
    // could reset the password and take the account.
    if (users.isConfigured()) {
      return reply.status(409).send({ error: 'This server already has a password set.' });
    }

    const parsed = setupBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    await users.setPassword(parsed.data.password);

    const { token } = sessions.create();
    setSessionCookie(reply, token, config);
    setCsrfCookie(reply, randomBytes(24).toString('base64url'), config);
    return { ok: true };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { users, sessions, throttle, config } = request.services;

    if (!users.isConfigured()) {
      return reply.status(409).send({ error: 'This server has no password yet. Run setup first.' });
    }

    if (throttle.isBlocked()) {
      return reply
        .status(429)
        .send({ error: `Too many attempts. Try again in ${throttle.retryAfter()} seconds.` });
    }

    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Password required.' });
    }

    if (!(await users.verify(parsed.data.password))) {
      throttle.recordFailure();
      // Deliberately identical whatever went wrong. There is one account, so
      // there is nothing to enumerate, but a distinct message would still tell
      // an attacker when they were close.
      return reply.status(401).send({ error: 'Incorrect password.' });
    }

    throttle.reset();
    const { token } = sessions.create();
    setSessionCookie(reply, token, config);
    setCsrfCookie(reply, randomBytes(24).toString('base64url'), config);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const { sessions, config } = request.services;
    sessions.destroy(request.cookies[SESSION_COOKIE]);
    clearAuthCookies(reply, config);
    return { ok: true };
  });

  app.post('/api/auth/password', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const { users, sessions, config } = request.services;

    const body = z
      .object({ currentPassword: z.string(), newPassword: password })
      .safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0].message });
    }

    if (!(await users.verify(body.data.currentPassword))) {
      return reply.status(401).send({ error: 'Current password is incorrect.' });
    }

    await users.setPassword(body.data.newPassword);

    // Every other session dies with the old password — that is most of the
    // point of changing it.
    sessions.destroyAll();
    const { token } = sessions.create();
    setSessionCookie(reply, token, config);
    setCsrfCookie(reply, randomBytes(24).toString('base64url'), config);
    return { ok: true };
  });

  /** Lets a long-lived tab recover a CSRF token without a full sign-in. */
  app.get('/api/auth/csrf', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const existing = request.cookies[CSRF_COOKIE];
    if (existing) return { ok: true };
    setCsrfCookie(reply, randomBytes(24).toString('base64url'), request.services.config);
    return { ok: true };
  });
}
