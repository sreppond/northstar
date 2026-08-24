/**
 * Connecting to Monarch, checking freshness, and pulling a new snapshot.
 *
 * The shape of the whole feature is in `status`: the app asks how old the data
 * is on every load, and the answer tells it whether to say nothing, offer a
 * refresh, or send the user back to reconnect.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parseSnapshot, previewImport, type MonarchSnapshot, type Plan } from '@northstar/engine';
import { requireAuth, requireCsrf } from '../app.ts';
import {
  MonarchClient,
  MonarchError,
  MonarchSessionExpired,
  missingCookies,
} from '../monarch/client.ts';
import { defaultCashflowRange, toSnapshot } from '../monarch/snapshot.ts';
import { SealedDataError } from '../auth/crypto.ts';

const connectBody = z.object({
  cookieString: z.string().min(1, 'Paste the cookie header from Monarch.'),
});

const pasteBody = z.object({ snapshot: z.unknown() });

export function registerMonarchRoutes(app: FastifyInstance): void {
  /**
   * Is Monarch connected, and how stale is the data?
   *
   * `stale` is computed here rather than in the browser so the threshold is one
   * value on the server, not a constant duplicated into the client that can
   * drift out of step with it.
   */
  app.get('/api/monarch/status', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;

    const { credentials, snapshots, config } = request.services;
    const connection = credentials.status();
    const latest = snapshots.latest();

    const ageDays = latest ? daysSince(latest.capturedAt) : null;

    return {
      connected: connection !== null,
      // A session Monarch has already rejected. The UI routes on this to say
      // "reconnect" rather than offering a refresh that cannot work.
      needsReconnect: connection?.invalidAt != null,
      connectedAt: connection?.connectedAt ?? null,
      lastCapturedAt: latest?.capturedAt ?? null,
      lastSource: latest?.source ?? null,
      netWorth: latest?.netWorth ?? null,
      ageDays,
      stale: ageDays === null ? true : ageDays >= config.stalenessDays,
      stalenessDays: config.stalenessDays,
      snapshotCount: snapshots.count(),
    };
  });

  /**
   * Store a Monarch session, after proving it works.
   *
   * Verifying before saving is the point: a bad paste is caught while the user
   * is still on the page that explains how to get a good one, rather than
   * surfacing days later as a failed refresh.
   */
  app.post('/api/monarch/connect', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const parsed = connectBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const cookieString = parsed.data.cookieString.trim();
    const missing = missingCookies(cookieString);
    if (missing.length) {
      return reply.status(400).send({
        error: `That paste is missing ${missing.join(' and ')}. Copy the entire cookie header, not just one value.`,
      });
    }

    const { credentials, fetchImpl, config } = request.services;

    try {
      await new MonarchClient({ cookieString, fetchImpl, apiBase: config.monarchApiBase }).verify();
    } catch (e) {
      return monarchFailure(reply, e);
    }

    credentials.save(cookieString);
    return { ok: true };
  });

  app.post('/api/monarch/disconnect', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;
    request.services.credentials.clear();
    return { ok: true };
  });

  /**
   * Fetch a fresh snapshot from Monarch and store it.
   *
   * Returns the snapshot AND a preview of what importing it would change, so
   * the client can open the same diff the paste flow shows. The projection is
   * never altered here — the user still confirms.
   */
  app.post('/api/monarch/refresh', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const { credentials, snapshots, plans, fetchImpl, config } = request.services;

    let cookieString: string | null;
    try {
      cookieString = credentials.read();
    } catch (e) {
      if (e instanceof SealedDataError) {
        return reply.status(409).send({ error: e.message, needsReconnect: true });
      }
      throw e;
    }

    if (!cookieString) {
      return reply
        .status(409)
        .send({ error: 'Monarch is not connected yet.', needsReconnect: true });
    }

    const client = new MonarchClient({ cookieString, fetchImpl, apiBase: config.monarchApiBase });
    const { startDate, endDate } = defaultCashflowRange();

    let snapshot: MonarchSnapshot;
    try {
      const accounts = await client.getAccounts();
      // Cashflow is a bonus, not a requirement: a refresh that fails wholesale
      // because the aggregate query moved would block the balances too, which
      // are the part that matters.
      const cashflow = await client.getCashflow(startDate, endDate).catch(() => null);
      snapshot = toSnapshot(accounts, cashflow);
    } catch (e) {
      if (e instanceof MonarchSessionExpired) credentials.markInvalid();
      return monarchFailure(reply, e);
    }

    return storeAndPreview(plans, snapshots, snapshot, 'live', reply);
  });

  /**
   * The paste path, kept alongside the live one.
   *
   * It is the fallback for a dead Monarch session, and the only route that
   * works if Monarch's private API changes shape — worth keeping for that
   * alone.
   */
  app.post('/api/monarch/paste', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const body = pasteBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'A snapshot is required.' });

    let snapshot: MonarchSnapshot;
    try {
      snapshot = parseSnapshot(body.data.snapshot);
    } catch (e) {
      const issue = (e as { issues?: { path: (string | number)[]; message: string }[] }).issues?.[0];
      return reply.status(400).send({
        error: issue ? `${issue.path.join('.') || 'snapshot'}: ${issue.message}` : 'That is not a valid snapshot.',
      });
    }

    const { snapshots, plans } = request.services;
    return storeAndPreview(plans, snapshots, snapshot, 'paste', reply);
  });

  app.get('/api/monarch/latest', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const latest = request.services.snapshots.latest();
    if (!latest) return reply.status(404).send({ error: 'No snapshot has been captured yet.' });
    return latest;
  });

  /** Net worth as actually measured, for charting against the projection. */
  app.get('/api/monarch/history', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    return { history: request.services.snapshots.history() };
  });
}

// --- helpers ----------------------------------------------------------------

function storeAndPreview(
  plans: { list(): Plan[] },
  snapshots: { insert(s: MonarchSnapshot, source: 'live' | 'paste', netWorth: number | null): number },
  snapshot: MonarchSnapshot,
  source: 'live' | 'paste',
  reply: FastifyReply,
) {
  // Net worth is computed against the FIRST plan purely to have a headline
  // figure and a history point; it does not depend on plan state beyond the
  // account classes present, and it is never written back into a plan here.
  const anchor = plans.list()[0];
  const preview = anchor ? previewImport(anchor, snapshot) : null;

  snapshots.insert(snapshot, source, preview?.netWorth ?? null);
  return reply.send({ ok: true, snapshot, preview });
}

function monarchFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof MonarchSessionExpired) {
    return reply.status(401).send({ error: error.message, needsReconnect: true });
  }
  if (error instanceof MonarchError) {
    return reply.status(502).send({ error: error.message });
  }
  throw error;
}

function daysSince(isoDate: string): number {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / 86_400_000));
}
