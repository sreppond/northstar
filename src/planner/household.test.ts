import { describe, expect, it } from 'vitest';
import type { Plan, PlanEvent } from '@northstar/engine';
import { runPlan } from '@northstar/engine';
import { toHouseholdModel } from './household';

function ev(over: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind' | 'startYear'>): PlanEvent {
  return { name: over.kind, isIncluded: true, config: {}, ...over };
}

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 't',
    name: 'T',
    settings: {
      startYear: 2026,
      projectionYears: 30,
      inflationRate: 2.5,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 80_000,
      incomeTaxRate: 25,
    },
    participants: [
      { id: 'p1', name: 'Spencer', birthYear: 1996, lifeExpectancy: 95, isIncluded: true },
      { id: 'p2', name: 'Sarah', birthYear: 1996, lifeExpectancy: 95, isIncluded: true },
    ],
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        accountClass: 'cash',
        isLiability: false,
        initialBalance: 100_000,
        isIncluded: true,
        growthRateMethod: 'fixed',
        growthRate: 4,
        withdrawalTiming: 'always',
        withdrawalTaxRate: 0,
        taxableWithdrawalPercent: 0,
        penaltyRate: 0,
      },
    ],
    events: [],
    rules: [],
    ...over,
  };
}

const netWorths = (p: Plan) => runPlan(p).years.map((y) => Math.round(y.netWorth));

describe('toHouseholdModel', () => {
  it('turns living expenses into a budget line without moving a single number', () => {
    const before = plan({
      events: [
        ev({ id: 'job', kind: 'job', name: 'Amazon', startYear: 2026, config: { salary: 200_000 } }),
        ev({ id: 'r', kind: 'retirement', startYear: 2040, config: { spendingChangePercent: -20 } }),
      ],
    });
    const { plan: after, changes } = toHouseholdModel(before);
    expect(after.settings.baselineExpenses).toBe(0);
    expect(after.budget?.[0]).toMatchObject({ name: 'Other shared spending', amount: 80_000 / 12 });
    expect(netWorths(after)).toEqual(netWorths(before));
    expect(changes.some((c) => c.includes('Other shared spending'))).toBe(true);
  });

  it('makes a kid born this year a member, with identical numbers', () => {
    const before = plan({
      events: [
        ev({
          id: 'kid',
          kind: 'haveAKid',
          name: 'First child',
          startYear: 2026,
          config: { upfrontCost: 4_500, annualCost: 30_000, supportYears: 18, costGrowthRate: 3, collegeStartAge: 18, collegeAnnualCost: 30_000, collegeYears: 4 },
        }),
      ],
    });
    const { plan: after } = toHouseholdModel(before);
    expect(after.events.some((e) => e.kind === 'haveAKid')).toBe(false);
    expect(after.participants.find((p) => p.role === 'child')).toMatchObject({ name: 'First child', birthYear: 2026 });
    expect(after.budget?.filter((l) => l.owner === 'kid-kid').map((l) => l.name)).toEqual([
      'First child — arrival',
      'First child — everyday costs',
      'First child — college',
    ]);
    expect(netWorths(after)).toEqual(netWorths(before));
  });

  it('flags that a later kid\'s costs now read as today\'s dollars', () => {
    const { needsReview } = toHouseholdModel(
      plan({ events: [ev({ id: 'kid', kind: 'haveAKid', name: 'Second child', startYear: 2030, config: { annualCost: 25_000 } })] }),
    );
    expect(needsReview.some((n) => n.includes("Second child's costs now read as today's dollars"))).toBe(true);
  });

  it('assigns pay to the one person a name points at, and asks about the rest', () => {
    const { plan: after, needsReview } = toHouseholdModel(
      plan({
        events: [
          ev({ id: 'a', kind: 'income', name: 'Amazon', startYear: 2026, config: { amount: 1 } }),
          ev({ id: 's', kind: 'income', name: 'Sarah’s Income', startYear: 2027, config: { amount: 1 } }),
          ev({ id: 'sp', kind: 'income', name: 'Sarah Part-Time', startYear: 2028, config: { amount: 1 } }),
        ],
      }),
    );
    const owner = (id: string) => (after.events.find((e) => e.id === id)!.config as { participantId?: string }).participantId;
    expect(owner('s')).toBe('p2');
    expect(owner('sp')).toBe('p2');
    expect(owner('a')).toBeUndefined();
    expect(needsReview).toContain('Say whose Amazon is.');
  });

  it('re-points a leave that started with a kid event at the child\'s birth', () => {
    const { plan: after } = toHouseholdModel(
      plan({
        events: [
          ev({ id: 'kid', kind: 'haveAKid', name: 'First child', startYear: 2028, config: { annualCost: 0 } }),
          ev({
            id: 'job',
            kind: 'job',
            name: 'Sarah job',
            startYear: 2026,
            config: { salary: 100_000, phases: [{ from: { kind: 'event', eventId: 'kid' }, mode: 'leave' }] },
          }),
        ],
      }),
    );
    const phases = (after.events.find((e) => e.id === 'job')!.config as { phases: { from: unknown }[] }).phases;
    expect(phases[0].from).toEqual({ kind: 'age', participantId: 'kid-kid', age: 0 });
    // …and the leave still lands in 2028.
    const sarahIn = (year: number) =>
      runPlan(after).years.find((y) => y.year === year)!.income.find((l) => l.sourceEventId === 'job')?.amount ?? 0;
    expect(sarahIn(2027)).toBeGreaterThan(0);
    expect(sarahIn(2028)).toBe(0);
  });
});
