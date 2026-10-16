/**
 * Plan checks (docs/REDESIGN-V4.md §1.8): modelling mistakes the app can see
 * and the household can't — surfaced with a one-click fix instead of a
 * silently wrong forecast. Pure, so each check is unit tested here rather
 * than through a component.
 */
import type { Plan } from '@northstar/engine';
import { DEFAULT_HORIZON_AGE, eventsPastHorizon, planEndYear, withHorizon } from '@northstar/engine';

export interface PlanCheck {
  id: string;
  message: string;
  fixLabel: string;
  /** The plan with the problem fixed — handed straight to `replacePlan`. */
  fixed: Plan;
}

/**
 * Events dated after the horizon never run: a retirement in 2058 inside a
 * plan that stops in 2046 just isn't in the forecast. The fix prefers the
 * lifetime horizon new plans default to; only if even that ends too early
 * does it fall back to "the latest event plus thirty years".
 */
export function horizonCheck(plan: Plan): PlanCheck | null {
  const late = eventsPastHorizon(plan);
  if (late.length === 0) return null;

  const end = planEndYear(plan);
  const latest = Math.max(...late.map((e) => e.startYear));
  const lifetime = withHorizon(plan, { mode: 'age', age: DEFAULT_HORIZON_AGE });
  const fixed =
    planEndYear(lifetime) >= latest ? lifetime : withHorizon(plan, { mode: 'year', year: latest + 30 });

  const message =
    late.length === 1
      ? `${late[0].name} (${late[0].startYear}) is after the plan ends in ${end}, so the forecast never reaches it.`
      : `${late.length} events are after the plan ends in ${end}, so the forecast never reaches them: ${late
          .map((e) => `${e.name} (${e.startYear})`)
          .join(', ')}.`;

  return { id: 'horizon', message, fixLabel: `Run through ${planEndYear(fixed)}`, fixed };
}
