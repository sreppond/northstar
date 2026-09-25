import { describe, expect, it } from 'vitest';
import type { Plan, PlanEvent, PlanResult, YearSnapshot } from '@northstar/engine';
import type { MonarchStatus } from '../api/client';
import type { FanSeries } from './NetWorthChart';
import { accountClassColor } from './ui';
import {
  accountMixToday,
  describeAge,
  horizonPoints,
  monarchHeaderStatus,
  retirementReadout,
  savingsRateThisYear,
  spreadPercent,
  upcomingEvents,
} from './dashboard';

// --- fixtures ----------------------------------------------------------------
// Same shape as packages/engine/test/markers.test.ts's `result()` stub — a
// PlanResult carrying only the fields the function under test actually reads.

function snapshot(year: number, over: Partial<YearSnapshot> = {}): YearSnapshot {
  return {
    year,
    ages: {},
    income: [],
    expenses: [],
    taxes: [],
    withdrawals: [],
    allocations: [],
    totalIncome: 0,
    totalExpenses: 0,
    totalTaxes: 0,
    netCashFlow: 0,
    accounts: [],
    assets: 0,
    liabilities: 0,
    netWorth: 0,
    ...over,
  };
}

function resultFrom(startYear: number, years: YearSnapshot[]): PlanResult {
  return { startYear, endYear: years[years.length - 1]?.year ?? startYear, years, warnings: [] };
}

function planFixture(over: Partial<Plan> = {}): Plan {
  return {
    id: 'test',
    name: 'Test plan',
    settings: {
      startYear: 2026,
      projectionYears: 10,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 0,
      ...over.settings,
    },
    participants: over.participants ?? [
      { id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 90, isIncluded: true },
    ],
    accounts: over.accounts ?? [],
    events: over.events ?? [],
    rules: over.rules ?? [],
    goals: over.goals,
  };
}

// --- spreadPercent -----------------------------------------------------------

describe('spreadPercent', () => {
  it('is the low-to-high gap as a percentage of the midpoint', () => {
    expect(spreadPercent(90, 110, 100)).toBeCloseTo(20, 9);
  });

  it('is undefined against a non-positive midpoint, where a percentage of it is meaningless', () => {
    expect(spreadPercent(-10, 10, 0)).toBeUndefined();
    expect(spreadPercent(-10, 10, -5)).toBeUndefined();
  });
});

// --- horizonPoints -----------------------------------------------------------

describe('horizonPoints', () => {
  const years = [2026, 2031, 2036, 2046].map((y, i) => snapshot(y, { netWorth: 100_000 * (i + 1) }));
  const result = resultFrom(2026, years);

  it('offers +5 / +10 / horizon when the plan is long enough to hold all three', () => {
    const points = horizonPoints(result, undefined, 2026);
    expect(points.map((p) => p.year)).toEqual([2031, 2036, 2046]);
    expect(points[0].isHorizon).toBe(false);
    expect(points[2].isHorizon).toBe(true);
  });

  it('drops a +5/+10 candidate that would land on or past the horizon, rather than duplicate it', () => {
    const short = resultFrom(2026, [snapshot(2026, { netWorth: 100 }), snapshot(2030, { netWorth: 200 })]);
    const points = horizonPoints(short, undefined, 2026);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ year: 2030, isHorizon: true });
  });

  it('carries no spread when no fan was supplied', () => {
    const points = horizonPoints(result, undefined, 2026);
    expect(points.every((p) => p.low === undefined && p.high === undefined && p.spreadPercent === undefined)).toBe(
      true,
    );
  });

  it('reads low/high off the fan at the same year, and derives the spread percentage', () => {
    const low = resultFrom(2026, [2026, 2031, 2036, 2046].map((y) => snapshot(y, { netWorth: 90_000 })));
    const high = resultFrom(2026, [2026, 2031, 2036, 2046].map((y) => snapshot(y, { netWorth: 110_000 })));
    const fan: FanSeries = { shift: 2, low, high };

    const points = horizonPoints(result, fan, 2026);
    const at2031 = points.find((p) => p.year === 2031)!;
    expect(at2031.low).toBe(90_000);
    expect(at2031.high).toBe(110_000);
    // p50 at 2031 is 200_000 (second snapshot, see `years` above).
    expect(at2031.spreadPercent).toBeCloseTo(spreadPercent(90_000, 110_000, 200_000)!, 9);
  });
});

// --- accountMixToday ---------------------------------------------------------

describe('accountMixToday', () => {
  it('is empty when the projection has no years', () => {
    expect(accountMixToday(resultFrom(2026, []))).toEqual({ segments: [], liabilitiesTotal: 0 });
  });

  it('groups today\'s asset balances by class and totals liabilities separately', () => {
    const today = snapshot(2026, {
      accounts: [
        { accountId: 'c1', name: 'Cash', accountClass: 'cash', isLiability: false, open: 0, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close: 10_000 },
        { accountId: 'c2', name: 'More cash', accountClass: 'cash', isLiability: false, open: 0, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close: 5_000 },
        { accountId: 'b1', name: 'Brokerage', accountClass: 'taxableInvestment', isLiability: false, open: 0, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close: 90_000 },
        { accountId: 'm1', name: 'Mortgage', accountClass: 'mortgage', isLiability: true, open: 0, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close: 400_000 },
      ],
    });
    const mix = accountMixToday(resultFrom(2026, [today]));

    expect(mix.liabilitiesTotal).toBe(400_000);
    expect(mix.segments).toEqual([
      { key: 'cash', label: expect.any(String), value: 15_000, color: accountClassColor('cash') },
      {
        key: 'taxableInvestment',
        label: expect.any(String),
        value: 90_000,
        color: accountClassColor('taxableInvestment'),
      },
    ]);
  });

  it('drops classes with nothing in them rather than showing a zero-width segment', () => {
    const today = snapshot(2026, {
      accounts: [
        { accountId: 'c1', name: 'Cash', accountClass: 'cash', isLiability: false, open: 0, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close: 0 },
      ],
    });
    expect(accountMixToday(resultFrom(2026, [today])).segments).toEqual([]);
  });
});

// --- upcomingEvents -----------------------------------------------------------

function event(over: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind' | 'name' | 'startYear'>): PlanEvent {
  return { isIncluded: true, config: {}, ...over };
}

describe('upcomingEvents', () => {
  it('sorts by year and takes the earliest, excluding the plan horizon marker', () => {
    const plan = planFixture({
      events: [
        event({ id: 'a', kind: 'buyAHome', name: 'Buy a home', startYear: 2031 }),
        event({ id: 'b', kind: 'haveAKid', name: 'Kid', startYear: 2028 }),
        event({ id: 'end', kind: 'endOfPlan', name: 'End of plan', startYear: 2046 }),
      ],
    });
    const upcoming = upcomingEvents(plan, 2026);
    expect(upcoming.map((u) => u.event.id)).toEqual(['b', 'a']);
    expect(upcoming[0].yearsOut).toBe(2);
  });

  it('excludes events before today, not-included, or hidden', () => {
    const plan = planFixture({
      events: [
        event({ id: 'past', kind: 'haveAKid', name: 'Past', startYear: 2020 }),
        event({ id: 'excluded', kind: 'haveAKid', name: 'Excluded', startYear: 2030, isIncluded: false }),
        event({ id: 'hidden', kind: 'haveAKid', name: 'Hidden', startYear: 2030, isHidden: true }),
        event({ id: 'live', kind: 'haveAKid', name: 'Live', startYear: 2030 }),
      ],
    });
    expect(upcomingEvents(plan, 2026).map((u) => u.event.id)).toEqual(['live']);
  });

  it('respects the limit', () => {
    const plan = planFixture({
      events: Array.from({ length: 8 }, (_, i) =>
        event({ id: `e${i}`, kind: 'haveAKid', name: `Event ${i}`, startYear: 2026 + i }),
      ),
    });
    expect(upcomingEvents(plan, 2026, 3)).toHaveLength(3);
  });
});

// --- savingsRateThisYear ------------------------------------------------------

describe('savingsRateThisYear', () => {
  it('is net cash flow as a percentage of income', () => {
    const result = resultFrom(2026, [snapshot(2026, { totalIncome: 100_000, netCashFlow: 15_000 })]);
    expect(savingsRateThisYear(result, 2026)).toBeCloseTo(15, 9);
  });

  it('is undefined with no income to take a percentage of', () => {
    const result = resultFrom(2026, [snapshot(2026, { totalIncome: 0, netCashFlow: 0 })]);
    expect(savingsRateThisYear(result, 2026)).toBeUndefined();
  });

  it('can go negative — spending more than you make is a real answer, not an error', () => {
    const result = resultFrom(2026, [snapshot(2026, { totalIncome: 100_000, netCashFlow: -5_000 })]);
    expect(savingsRateThisYear(result, 2026)).toBeCloseTo(-5, 9);
  });
});

// --- retirementReadout ---------------------------------------------------------

describe('retirementReadout', () => {
  it('reads the age off the plan\'s own retirement event', () => {
    const plan = planFixture({
      participants: [{ id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 90, isIncluded: true }],
      events: [event({ id: 'r', kind: 'retirement', name: 'Retire', startYear: 2042 })],
    });
    expect(retirementReadout(plan)).toEqual({ age: 52, year: 2042 });
  });

  it('is undefined without an included retirement event', () => {
    const plan = planFixture({ events: [] });
    expect(retirementReadout(plan)).toBeUndefined();
  });
});

// --- Monarch header status ----------------------------------------------------

function monarch(over: Partial<MonarchStatus> = {}): MonarchStatus {
  return {
    connected: true,
    needsReconnect: false,
    connectedAt: null,
    lastCapturedAt: '2026-08-01',
    lastSource: 'live',
    netWorth: 100_000,
    ageDays: 2,
    stale: false,
    stalenessDays: 30,
    snapshotCount: 4,
    ...over,
  };
}

describe('monarchHeaderStatus', () => {
  it('reads as manual balances with no backend at all', () => {
    expect(monarchHeaderStatus(null)).toEqual({ text: 'Manual balances', action: undefined });
  });

  it('offers Connect when there is a backend but no connection yet', () => {
    const status = monarchHeaderStatus(monarch({ connected: false }));
    expect(status.text).toBe('Manual balances');
    expect(status.action).toEqual({ label: 'Connect', kind: 'connect' });
  });

  it('asks to reconnect when the session died', () => {
    const status = monarchHeaderStatus(monarch({ needsReconnect: true }));
    expect(status.action).toEqual({ label: 'Reconnect', kind: 'connect' });
  });

  it('offers a refresh, without alarm, once connected and current', () => {
    const status = monarchHeaderStatus(monarch());
    expect(status.text).toContain('Monarch');
    expect(status.action).toEqual({ label: 'Refresh', kind: 'refresh' });
  });
});

describe('describeAge', () => {
  it('reads today/yesterday/days/weeks/months in increasingly rounded terms', () => {
    expect(describeAge(0)).toBe('synced today');
    expect(describeAge(1)).toBe('synced a day ago');
    expect(describeAge(5)).toBe('synced 5 days ago');
    expect(describeAge(21)).toBe('synced 3 weeks ago');
    expect(describeAge(90)).toBe('synced 3 months ago');
    expect(describeAge(null)).toBe('unknown age');
  });
});
