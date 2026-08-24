/**
 * The retirement freedom age (docs/REDESIGN.md §4.2): "the earliest age you
 * can retire and have the money last to life expectancy."
 *
 * Mirrors `seppStartAgeSweep`'s sweep-and-pick shape (sepp.ts): rather than
 * estimate an answer, this runs one real projection per candidate retirement
 * year and reads back whether it ever ran dry (`pathMarkers`). The earliest
 * candidate that never runs dry, all the way through the retiree's life
 * expectancy, is the freedom year -- the caller just takes the first
 * `survivesToLifeExpectancy` entry, the same way a SEPP sweep's caller picks
 * a row.
 *
 * This deliberately DOES call `runPlan` itself, unlike the rest of the
 * engine's plan-transform helpers (`withReturnShift` / `withExpenseShift` in
 * sensitivity.ts), which hand back a modified `Plan` and leave running it to
 * the caller. Here the loop-and-run IS the reusable unit -- exactly the way
 * `seppStartAgeSweep` owns its own loop over `planSepp` rather than making
 * every caller re-run it by hand. A single one-off counterfactual (one
 * `runPlan` call) belongs at the call site, the way `HouseForecastView`'s
 * "cost of buying" stage does it; a sweep across N candidate years is engine
 * logic worth testing in isolation.
 */
import type { Participant, Plan, PlanEvent } from './types.js';
import { runPlan } from './run.js';
import { pathMarkers } from './markers.js';
import type { RetirementConfig } from './events/work.js';

export interface FreedomAgeCandidate {
  year: number;
  age: number;
  /** True when this candidate's plan never runs dry through life expectancy. */
  survivesToLifeExpectancy: boolean;
}

/**
 * Sweeps a range of candidate retirement years for one participant, holding
 * everything else about the plan fixed -- including, deliberately, the
 * retirement event's own config (`spendingChangePercent` and the rest): only
 * `startYear` moves between candidates, the same way `seppStartAgeSweep` holds
 * the assumed growth and SEPP rate fixed while only the start year sweeps.
 *
 * Each candidate plan's horizon is extended -- never shortened -- to at least
 * `lifeExpectancyYear`, so "never runs dry" is checked against the retiree's
 * actual life expectancy rather than whatever shorter horizon the active plan
 * happens to have configured today (a plan built around a nearer decision,
 * like a house purchase, commonly ends its projection well short of that).
 *
 * Candidates outside `[plan.settings.startYear, lifeExpectancyYear]` are
 * dropped, the same boundary `seppStartAgeSweep` applies to its own window.
 */
export function retirementAgeSweep(params: {
  plan: Plan;
  participantId: string;
  birthYear: number;
  lifeExpectancyYear: number;
  candidateStartYears: number[];
  /** Held fixed across every candidate; only `startYear` varies per run. */
  retirementConfig?: Partial<RetirementConfig>;
}): FreedomAgeCandidate[] {
  return params.candidateStartYears
    .filter((year) => year >= params.plan.settings.startYear && year <= params.lifeExpectancyYear)
    .map((year) => {
      const candidatePlan = planForRetirementCandidate(params.plan, {
        year,
        participantId: params.participantId,
        config: params.retirementConfig,
        throughYear: params.lifeExpectancyYear,
      });
      const result = runPlan(candidatePlan);
      return {
        year,
        age: year - params.birthYear,
        survivesToLifeExpectancy: pathMarkers(result).shortfallYears.length === 0,
      };
    });
}

/**
 * `plan` with every existing `retirement` event replaced by one candidate
 * retirement at `year`, and the horizon extended to at least `throughYear`.
 * Every other event, account and rule is untouched -- this is the plan's own
 * projection, not a hypothetical rebuild, apart from the one thing the sweep
 * is testing.
 */
function planForRetirementCandidate(
  plan: Plan,
  opts: { year: number; participantId: string; config?: Partial<RetirementConfig>; throughYear: number },
): Plan {
  const candidate: PlanEvent = {
    id: 'retirement-sweep-candidate',
    kind: 'retirement',
    name: 'Retire',
    startYear: opts.year,
    isIncluded: true,
    config: { ...opts.config, participantId: opts.participantId },
  };

  return {
    ...plan,
    events: [
      ...plan.events.filter((e) => e.kind !== 'retirement' && e.kind !== 'endOfPlan'),
      candidate,
      endOfPlanAtLeast(plan, opts.throughYear),
    ],
  };
}

/** The plan's own `endOfPlan` event, pushed out to `throughYear` if it is shorter. */
function endOfPlanAtLeast(plan: Plan, throughYear: number): PlanEvent {
  const existing = plan.events.find((e) => e.kind === 'endOfPlan');
  return {
    id: existing?.id ?? 'retirement-sweep-horizon',
    kind: 'endOfPlan',
    name: existing?.name ?? 'End of plan',
    startYear: Math.max(existing?.startYear ?? -Infinity, throughYear),
    isIncluded: true,
    isRequired: true,
    config: {},
  };
}

// Re-exported only so callers importing from `@northstar/engine` can resolve
// the sweep's own life-expectancy boundary the same way this module does,
// without duplicating the arithmetic.
export function lifeExpectancyYearFor(participant: Pick<Participant, 'birthYear' | 'lifeExpectancy'>): number {
  return participant.birthYear + participant.lifeExpectancy;
}
