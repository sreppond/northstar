import { describe, expect, it } from 'vitest';
import type { Plan, PlanEvent } from '@northstar/engine';
import { runPlan } from '@northstar/engine';
import { clampYear, extendPlanHorizon, planForRetirementPreview } from './retirement';

// Same shape as diff.test.ts's own `plan()` fixture — a real, runnable Plan
// carrying only the fields these tests actually vary.
function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'test',
    name: 'Test plan',
    settings: {
      startYear: 2026,
      projectionYears: 10,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 100_000,
      baselineExpenses: 40_000,
      incomeTaxRate: 0,
      ...over.settings,
    },
    participants: over.participants ?? [
      { id: 'p1', name: 'A', birthYear: 1970, lifeExpectancy: 90, isIncluded: true },
    ],
    accounts: over.accounts ?? [],
    events: over.events ?? [],
    rules: over.rules ?? [],
  };
}

describe('clampYear', () => {
  it('leaves an in-range value untouched', () => {
    expect(clampYear(2030, 2026, 2046)).toBe(2030);
  });

  it('clamps to the nearer bound outside the range', () => {
    expect(clampYear(2000, 2026, 2046)).toBe(2026);
    expect(clampYear(3000, 2026, 2046)).toBe(2046);
  });

  it('normalises a degenerate a > b bound rather than inverting the result', () => {
    expect(clampYear(2030, 2046, 2026)).toBe(2030);
    expect(clampYear(2000, 2046, 2026)).toBe(2026);
  });
});

describe('extendPlanHorizon', () => {
  it('extends projectionYears when there is no endOfPlan event and the target is past it', () => {
    const p = plan({ settings: { startYear: 2026, projectionYears: 10 } as never });
    const extended = extendPlanHorizon(p, 2060);
    expect(extended.settings.projectionYears).toBeGreaterThanOrEqual(2060 - 2026 + 1);
  });

  it('is a no-op when the plan already reaches far enough', () => {
    const p = plan({ settings: { startYear: 2026, projectionYears: 40 } as never });
    expect(extendPlanHorizon(p, 2060)).toBe(p);
  });

  it('pushes an included endOfPlan event out to the target year instead of touching projectionYears', () => {
    const endOfPlan: PlanEvent = {
      id: 'eop',
      kind: 'endOfPlan',
      name: 'End of plan',
      startYear: 2040,
      isIncluded: true,
      config: {},
    };
    const p = plan({ events: [endOfPlan] });
    const extended = extendPlanHorizon(p, 2060);
    expect(extended.events.find((e) => e.id === 'eop')?.startYear).toBe(2060);
  });

  it('leaves an endOfPlan event alone when it already reaches the target', () => {
    const endOfPlan: PlanEvent = {
      id: 'eop',
      kind: 'endOfPlan',
      name: 'End of plan',
      startYear: 2070,
      isIncluded: true,
      config: {},
    };
    const p = plan({ events: [endOfPlan] });
    expect(extendPlanHorizon(p, 2060)).toBe(p);
  });
});

describe('planForRetirementPreview', () => {
  const liveEvent: PlanEvent = {
    id: 'retirement-preview',
    kind: 'retirement',
    name: 'Retire',
    startYear: 2035,
    isIncluded: true,
    config: { spendingChangePercent: -20, participantId: 'p1' },
  };

  it('returns the plan unchanged once a real retirement event is persisted', () => {
    const persisted: PlanEvent = { ...liveEvent, id: 'real-one' };
    const p = plan({ events: [persisted] });
    expect(planForRetirementPreview(p, persisted, liveEvent)).toBe(p);
  });

  it('appends the live preview event when nothing is persisted yet', () => {
    const p = plan();
    const withPreview = planForRetirementPreview(p, undefined, liveEvent);
    expect(withPreview.events).toContainEqual(liveEvent);
    expect(p.events).toHaveLength(0); // the original plan is untouched
  });
});

// This is must-fix #1's actual regression, run through the real engine: the
// Retirement view's default landing state (no persisted event, previewing a
// slider year) has to simulate retiring at that year, not run the plan
// straight through as if it never happened.
describe('a previewed retirement year, run through runPlan', () => {
  const retirementYear = 2032;
  const liveEvent: PlanEvent = {
    id: 'retirement-preview',
    kind: 'retirement',
    name: 'Retire',
    startYear: retirementYear,
    isIncluded: true,
    config: { spendingChangePercent: -20, participantId: 'p1' },
  };

  it('drops income at and after the previewed year once the preview event is injected', () => {
    const base = plan();
    const before = runPlan(base).years.find((y) => y.year === retirementYear - 1);
    expect(before?.totalIncome).toBeGreaterThan(50_000); // still working, pre-retirement

    const simPlan = planForRetirementPreview(base, undefined, liveEvent);
    const after = runPlan(simPlan).years.find((y) => y.year === retirementYear);
    expect(after?.totalIncome ?? Infinity).toBeLessThan(10_000); // retired: baseline income suppressed
  });

  it('would have kept full income at the previewed year had the preview event never been injected — the bug this guards', () => {
    const base = plan();
    // Simulating `base` itself, the way the pre-fix view did, never retires —
    // this is exactly the wrong read must-fix #1 caught.
    const stillWorking = runPlan(base).years.find((y) => y.year === retirementYear);
    expect(stillWorking?.totalIncome).toBeGreaterThan(50_000);
  });
});
