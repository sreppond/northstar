/**
 * Plan storage.
 *
 * The client keeps owning plan state — it has undo, duplication and live
 * drafts, none of which want a round trip. The server is durable storage
 * behind that, so the sync is a whole-set replace rather than per-field edits.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Plan } from '@northstar/engine';
import { requireAuth, requireCsrf } from '../app.ts';

/**
 * Structural validation only.
 *
 * The engine's own types are the real contract and re-deriving them as a zod
 * schema here would create two definitions to keep in step. This checks the
 * shape enough that a corrupt body cannot be stored as a plan.
 */
const planSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  settings: z.object({ startYear: z.number() }).passthrough(),
  participants: z.array(z.unknown()),
  accounts: z.array(z.unknown()),
  events: z.array(z.unknown()),
  rules: z.array(z.unknown()),
});

const syncBody = z.object({ plans: z.array(planSchema).max(100) });

export function registerPlanRoutes(app: FastifyInstance): void {
  app.get('/api/plans', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    return { plans: request.services.plans.list() };
  });

  /**
   * Replace the whole set.
   *
   * An empty array is refused. The client sends its full list on every change,
   * so an empty one almost always means "state was lost on this end" rather
   * than "delete everything" — and honouring it would wipe every scenario.
   */
  app.put('/api/plans', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const parsed = syncBody.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.status(400).send({ error: `${issue.path.join('.')}: ${issue.message}` });
    }

    if (parsed.data.plans.length === 0) {
      return reply
        .status(400)
        .send({ error: 'Refusing to store an empty plan list. Delete plans individually instead.' });
    }

    request.services.plans.replaceAll(parsed.data.plans as unknown as Plan[]);
    return { ok: true, count: parsed.data.plans.length };
  });

  app.delete('/api/plans/:id', async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    if (!(await requireCsrf(request, reply))) return;

    const { plans } = request.services;
    const { id } = request.params as { id: string };

    // Never leave the app with nothing to render.
    if (plans.count() <= 1) {
      return reply.status(400).send({ error: 'Cannot delete the last plan.' });
    }

    plans.delete(id);
    return { ok: true };
  });
}
