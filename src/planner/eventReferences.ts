import type { Plan, RetirementConfig } from '@northstar/engine';

/**
 * "Referenced by" — the reverse-lookup Northstar v2's milestone usage list
 * does (`milestoneUsage.ts`), adapted to what actually points at an event id
 * in this engine's own model: a `Goal.linkedEventId` (a house/retirement goal
 * standing for the event that funds it) and a `retirement` event's
 * `incomeRetentionByEvent` map (which OTHER income events it has an opinion
 * on retaining). Both are real, existing cross-references — this reads them,
 * it does not invent a new one.
 *
 * Pure and read-only, same as `eventDetail`'s own field list — a hover card
 * only ever describes the plan, never edits it from here.
 */
export function eventReferences(plan: Plan, eventId: string): string[] {
  const refs: string[] = [];

  for (const goal of plan.goals) {
    if (goal.linkedEventId === eventId) refs.push(`Goal "${goal.name}"`);
  }

  for (const event of plan.events) {
    if (event.kind !== 'retirement' || event.id === eventId) continue;
    const config = event.config as Partial<RetirementConfig> | undefined;
    if (config?.incomeRetentionByEvent && eventId in config.incomeRetentionByEvent) {
      refs.push(`${event.name} (income retention)`);
    }
  }

  return refs;
}
