import type { Plan, PlanResult } from '@northstar/engine';
import { withReturnShift } from '@northstar/engine';

/**
 * "What if" (docs/ROADMAP-10.md C5): three independent knobs on a plan, each
 * a no-op at its default (0, 0, `undefined`) so a caller can apply all three
 * unconditionally without checking which ones the user actually touched.
 */
export interface LeverInputs {
  /** Percentage points added to every market-exposed account's growth rate
      — the same shift `sensitivity.ts`'s return fan already applies, just
      user-steered instead of fixed at ±2. 0 leaves every account untouched. */
  returnDelta: number;
  /** Dollars per YEAR added to `settings.baselineExpenses` (not per month —
      unlike `sensitivity.ts`'s `withExpenseShift`, which this deliberately
      doesn't reuse, the Levers slider steps in whole annual dollars). 0
      leaves it untouched. */
  spendingDelta: number;
  /** New `startYear` for the plan's retirement event. `undefined` (not 0)
      is the no-op here, since 0 is a plausible calendar year nobody means —
      and a plan with no retirement event ignores this regardless. */
  retireYear?: number;
}

/**
 * A copy of `plan` with every Lever applied. Pure and additive — each knob is
 * independent of the other two, applied in any order, and a lever left at
 * its no-op value touches nothing it owns.
 *
 * Returns the same `plan` reference, not a new object, when every lever is a
 * no-op — the same convention `withReturnShift` already follows, and what
 * lets a caller diff "did anything change" with `!==` rather than a deep
 * equality check.
 *
 * Never mutates `plan`: every branch below produces a new object via spread,
 * exactly once per touched slice (`accounts`, `settings`, `events`), and
 * untouched slices keep their original reference.
 */
export function applyLevers(plan: Plan, levers: LeverInputs): Plan {
  // `withReturnShift` already does exactly this — shift every market-exposed
  // account's growth rate (fixed and schedule methods; `noChange` cash and
  // liabilities untouched) — so the return lever reuses it outright rather
  // than re-deriving the same narrow rule here.
  let next = withReturnShift(plan, levers.returnDelta);

  if (levers.spendingDelta !== 0) {
    next = {
      ...next,
      settings: {
        ...next.settings,
        // Spending can't go negative — a big enough cut lever shouldn't be
        // able to turn baseline living expenses into phantom income.
        baselineExpenses: Math.max(0, next.settings.baselineExpenses + levers.spendingDelta),
      },
    };
  }

  if (levers.retireYear !== undefined) {
    const retirement = next.events.find((e) => e.kind === 'retirement');
    // No retirement event: the lever has nothing to move, and the caller
    // (`Levers.tsx`) never shows the slider in this case anyway.
    if (retirement && retirement.startYear !== levers.retireYear) {
      const movedYear = levers.retireYear;
      next = {
        ...next,
        events: next.events.map((e) => (e.id === retirement.id ? { ...e, startYear: movedYear } : e)),
      };
    }
  }

  return next;
}

/**
 * How much a lever-shifted plan moves the ending net worth, against the same
 * plan's own un-levered projection — the live readout's "+$310K by 2046"
 * (docs/ROADMAP-10.md C5). Mirrors `NetWorthChart.tsx`'s `rankImpact`, which
 * answers the identical question for a single event's counterfactual.
 *
 * Reads off `base.endYear` rather than each series' own last year: the two
 * results are projections of the SAME plan (one lever-shifted), so they
 * share a horizon in every case that matters here — a lever never changes
 * `endYear` itself (only `endOfPlan`'s own year does that, and nothing here
 * touches it). Falls back to the last snapshot either series actually has,
 * so a mismatched horizon degrades gracefully instead of reading `undefined`.
 */
export function horizonDelta(base: PlanResult, ghost: PlanResult): { endYear: number; delta: number } {
  const endOf = (r: PlanResult): number =>
    r.years.find((y) => y.year === base.endYear)?.netWorth ?? r.years[r.years.length - 1]?.netWorth ?? 0;

  return { endYear: base.endYear, delta: endOf(ghost) - endOf(base) };
}
