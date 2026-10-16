/**
 * The plan's horizon — the last year `runPlan` simulates — resolved in one
 * place (docs/REDESIGN-V4.md §3).
 *
 * Three sources, strongest first:
 *   1. `settings.horizon`, the explicit setting ("through 2091", "until the
 *      younger of us turns 95").
 *   2. An included `endOfPlan` event — how every plan saved before the
 *      setting existed expresses it.
 *   3. `settings.projectionYears`.
 *
 * Never earlier than `startYear`: a one-year plan is the floor.
 */
import type { HorizonSetting, Participant, Plan } from './types.js';

export const DEFAULT_HORIZON_AGE = 95;

export function planEndYear(plan: Pick<Plan, 'settings' | 'events' | 'participants'>): number {
  const { settings } = plan;
  const startYear = settings.startYear;

  const fromSetting = settings.horizon ? horizonYear(settings.horizon, plan.participants) : undefined;
  if (fromSetting !== undefined) return Math.max(startYear, fromSetting);

  const endOfPlanEvent = plan.events.find((e) => e.kind === 'endOfPlan' && e.isIncluded);
  if (endOfPlanEvent) return Math.max(startYear, endOfPlanEvent.startYear);

  return startYear + Math.max(1, settings.projectionYears) - 1;
}

/**
 * The calendar year a horizon setting lands on, or `undefined` when an
 * age-based one has nobody to measure against (no included participants, or
 * a `participantId` that no longer exists) — the caller then falls back to
 * the older sources rather than guessing.
 */
export function horizonYear(horizon: HorizonSetting, participants: Participant[]): number | undefined {
  if (horizon.mode === 'year') return horizon.year;

  const included = participants.filter((p) => p.isIncluded);
  if (horizon.participantId) {
    const p = included.find((x) => x.id === horizon.participantId);
    return p ? p.birthYear + horizon.age : undefined;
  }
  if (included.length === 0) return undefined;
  const youngestBirthYear = Math.max(...included.map((p) => p.birthYear));
  return youngestBirthYear + horizon.age;
}

/**
 * `plan` with its horizon set explicitly. Drops any `endOfPlan` event: once
 * the setting exists that event no longer decides anything, and leaving it
 * on the timeline would show a stale "End of plan" year next to the real one.
 * `projectionYears` is kept in step so anything still reading it directly
 * sees the same span.
 */
export function withHorizon(plan: Plan, horizon: HorizonSetting): Plan {
  const next: Plan = {
    ...plan,
    settings: { ...plan.settings, horizon },
    events: plan.events.filter((e) => e.kind !== 'endOfPlan'),
  };
  const end = planEndYear(next);
  return { ...next, settings: { ...next.settings, projectionYears: end - plan.settings.startYear + 1 } };
}

/** `plan` simulated through at least `targetEndYear`; a no-op when it already reaches. */
export function withHorizonAtLeast(plan: Plan, targetEndYear: number): Plan {
  if (planEndYear(plan) >= targetEndYear) return plan;
  return withHorizon(plan, { mode: 'year', year: targetEndYear });
}

/**
 * Included, non-hidden events that start after the plan ends — they never
 * run, which is almost never what someone meant (a retirement set for 2058
 * in a plan that stops in 2046).
 */
export function eventsPastHorizon(plan: Plan): Plan['events'] {
  const end = planEndYear(plan);
  return plan.events.filter(
    (e) => e.isIncluded && !e.isHidden && e.kind !== 'endOfPlan' && e.startYear > end,
  );
}
