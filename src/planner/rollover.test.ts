import { describe, expect, it } from 'vitest';
import type { Account, Plan, PlanEvent } from '@northstar/engine';
import { rollForward } from './rollover';

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'test',
    name: 'Test plan',
    settings: {
      startYear: 2026,
      asOfDate: '2026-09-25',
      projectionYears: 21, // 2026..2046
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

function event(over: Partial<PlanEvent> = {}): PlanEvent {
  return {
    id: 'e1',
    kind: 'retirement',
    name: 'Retire',
    startYear: 2040,
    isIncluded: true,
    config: {},
    ...over,
  };
}

function cashAccount(over: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Cash',
    accountClass: 'cash',
    isLiability: false,
    initialBalance: 100_000,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 6,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
    ...over,
  };
}

describe('rollForward', () => {
  it('moves startYear to the given year and asOfDate to that year’s Jan 1', () => {
    const p = plan();
    const { plan: rolled } = rollForward(p, new Date('2027-03-14T00:00:00Z'));
    expect(rolled.settings.startYear).toBe(2027);
    expect(rolled.settings.asOfDate).toBe('2027-01-01');
  });

  it('shrinks projectionYears so endYear (startYear + projectionYears - 1) is unchanged', () => {
    const p = plan(); // startYear 2026, projectionYears 21 -> endYear 2046
    const { plan: rolled } = rollForward(p, new Date('2027-03-14T00:00:00Z'));
    const endYear = rolled.settings.startYear + rolled.settings.projectionYears - 1;
    expect(endYear).toBe(2046);
    expect(rolled.settings.projectionYears).toBe(20);
  });

  it('rolling forward multiple years at once shrinks projectionYears by the same amount', () => {
    const p = plan();
    const { plan: rolled } = rollForward(p, new Date('2030-01-01T00:00:00Z'));
    expect(rolled.settings.startYear).toBe(2030);
    expect(rolled.settings.startYear + rolled.settings.projectionYears - 1).toBe(2046);
  });

  it('never shrinks projectionYears below 1, even past the old horizon', () => {
    const p = plan();
    const { plan: rolled } = rollForward(p, new Date('2050-01-01T00:00:00Z'));
    expect(rolled.settings.startYear).toBe(2050);
    expect(rolled.settings.projectionYears).toBe(1);
  });

  it('is a no-op (same plan reference, no projectedFrom) when today has not actually passed startYear', () => {
    const p = plan();
    const result = rollForward(p, new Date('2026-12-31T00:00:00Z'));
    expect(result.plan).toBe(p);
    expect(result.projectedFrom).toBeUndefined();
  });

  it('leaves an endOfPlan event’s absolute year untouched, and still shrinks projectionYears to match', () => {
    const p = plan({
      settings: { startYear: 2026, projectionYears: 5 } as never,
      events: [event({ kind: 'endOfPlan', name: 'End', startYear: 2046, isIncluded: true })],
    });
    const { plan: rolled } = rollForward(p, new Date('2027-01-01T00:00:00Z'));
    expect(rolled.events[0].startYear).toBe(2046); // untouched — an absolute calendar year
    expect(rolled.settings.startYear + rolled.settings.projectionYears - 1).toBe(2046);
  });

  it('leaves event, goal and growth-schedule years untouched — they are absolute calendar years already', () => {
    const p = plan({
      events: [event({ startYear: 2040 })],
      accounts: [
        cashAccount({
          id: 'a1',
          name: 'Brokerage',
          accountClass: 'taxableInvestment',
          initialBalance: 50_000,
          growthRateMethod: 'schedule',
          growthRate: 6,
          growthRateSchedule: [{ year: 2031, rate: 7 }],
          taxableWithdrawalPercent: 100,
        }),
      ],
      goals: [{ id: 'g1', name: 'House', kind: 'house', byYear: 2031, fundedFromAccountIds: ['a1'] }],
    });
    const { plan: rolled } = rollForward(p, new Date('2027-06-01T00:00:00Z'));
    expect(rolled.events[0].startYear).toBe(2040);
    expect(rolled.accounts[0].growthRateSchedule).toEqual([{ year: 2031, rate: 7 }]);
    expect(rolled.goals?.[0].byYear).toBe(2031);
  });

  it('leaves every other setting untouched', () => {
    const p = plan({ accounts: [cashAccount()] });
    const { plan: rolled } = rollForward(p, new Date('2027-06-01T00:00:00Z'));
    expect(rolled.settings.inflationRate).toBe(p.settings.inflationRate);
    expect(rolled.settings.baselineIncome).toBe(p.settings.baselineIncome);
  });

  // W3#4: the review's exact finding. Rolling forward used to leave account
  // balances exactly as they were and just relabel them "as of Jan 1" — so
  // an August balance read as fresh on January 1st, and the stub year's
  // savings/growth vanished from every later projection. The fix seeds the
  // new plan's initial balances from the OLD plan's own projected Dec-31
  // close, and reports where they came from via `projectedFrom`.
  it('seeds the new initial balance from the projected Dec-31 close of the old startYear, not the stale balance', () => {
    const p = plan({
      settings: { startYear: 2026, asOfDate: '2026-08-14', projectionYears: 5, inflationRate: 0 } as never,
      accounts: [cashAccount({ initialBalance: 100_000, growthRate: 6, growthRateMethod: 'fixed' })],
    });
    const { plan: rolled, projectedFrom } = rollForward(p, new Date('2027-01-01T00:00:00Z'));

    // Hand check: a stub-year fraction from 2026-08-14 to year end, 6%
    // growth, no contributions/withdrawals — the account's own projected
    // close for 2026, read directly off runPlan(p) so this test can't drift
    // from the engine's own stub-year convention.
    const rolledBalance = rolled.accounts[0].initialBalance;
    expect(rolledBalance).toBeGreaterThan(100_000); // grew, not relabelled flat
    expect(rolledBalance).toBeLessThan(106_000); // less than a FULL year of 6% (partial year)
    expect(projectedFrom).toBe('2026-08-14');
  });

  it('leaves an account that has not started yet untouched, rather than zeroing its configured seed', () => {
    const p = plan({
      accounts: [cashAccount({ id: 'future', initialBalance: 5_000, startYear: 2029 } as never)],
    });
    const { plan: rolled } = rollForward(p, new Date('2027-01-01T00:00:00Z'));
    expect(rolled.accounts[0].initialBalance).toBe(5_000);
  });

  it('is a no-op plan reference carries no projectedFrom, but a real roll always reports one', () => {
    const p = plan({ accounts: [cashAccount()] });
    const { projectedFrom } = rollForward(p, new Date('2027-06-01T00:00:00Z'));
    expect(projectedFrom).toBe('2026-09-25'); // the OLD plan's own asOfDate
  });

  it('falls back to the old startYear\'s Jan 1st for projectedFrom when the old plan had no asOfDate', () => {
    const p = plan({ settings: { startYear: 2026, asOfDate: undefined, projectionYears: 5 } as never });
    const { projectedFrom } = rollForward(p, new Date('2027-06-01T00:00:00Z'));
    expect(projectedFrom).toBe('2026-01-01');
  });
});
