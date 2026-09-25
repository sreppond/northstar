/**
 * Pure derivations for the Retirement lens (docs/REDESIGN-V3.md
 * "Retirement"), pulled out of `RetirementForecastView.tsx` for the same
 * reason `chartMath.ts` is kept out of `NetWorthChart.tsx`: this repo's test
 * runner only collects `src/**\/*.test.ts` (vitest.config.ts), so a `.tsx`
 * component can't easily be unit tested here, a plain module can.
 */
import type { Plan, PlanEvent } from '@northstar/engine';

/** Clamp `value` into `[a, b]`, normalising the bounds first so a degenerate `a > b` never inverts the result. */
export function clampYear(value: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(hi, Math.max(lo, value));
}

/** A copy of `plan` whose simulated horizon reaches at least `targetEndYear`
    (B2) — bumping whichever of the two things `runPlan` actually reads
    determines the horizon (see run.ts): an included `endOfPlan` event's
    year, if the plan has one, else `settings.projectionYears`. A no-op when
    the plan already reaches far enough. */
export function extendPlanHorizon(plan: Plan, targetEndYear: number): Plan {
  const endOfPlanEvent = plan.events.find((e) => e.kind === 'endOfPlan' && e.isIncluded);
  if (endOfPlanEvent) {
    if (endOfPlanEvent.startYear >= targetEndYear) return plan;
    return {
      ...plan,
      events: plan.events.map((e) => (e.id === endOfPlanEvent.id ? { ...e, startYear: targetEndYear } : e)),
    };
  }
  const neededProjectionYears = targetEndYear - plan.settings.startYear + 1;
  if (neededProjectionYears <= plan.settings.projectionYears) return plan;
  return { ...plan, settings: { ...plan.settings, projectionYears: neededProjectionYears } };
}

/**
 * The plan actually simulated for the Retirement view's read (must fix #1,
 * `docs/REVIEW.md` B2 regression): before a retirement event is persisted,
 * `plan` itself has no retirement event at all, so simulating `plan`
 * verbatim — which an earlier version of this view did — shows the plan
 * working straight through retirement rather than retiring in it. This
 * appends the live preview event (same year the slider is currently at,
 * same default config `onSetRetirementYear` would persist) so the view
 * always simulates exactly what committing right now would produce. A
 * no-op once a real event exists — `plan` already has it.
 */
export function planForRetirementPreview(
  plan: Plan,
  retirementEvent: PlanEvent | undefined,
  liveEvent: PlanEvent,
): Plan {
  if (retirementEvent) return plan;
  return { ...plan, events: [...plan.events, liveEvent] };
}
