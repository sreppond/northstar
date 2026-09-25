import { describe, expect, it } from 'vitest';
import type { Account, AccountYear, PlanEvent, YearSnapshot } from '@northstar/engine';
import {
  assetMixToday,
  cashFlowStats,
  classBalances,
  deltaTone,
  eventStats,
  missingAccountClasses,
  moneyDelta,
  netWorthStats,
} from './ledger';

function accountYear(overrides: Partial<AccountYear> & Pick<AccountYear, 'accountId' | 'accountClass' | 'close'>): AccountYear {
  return {
    name: overrides.accountId,
    isLiability: false,
    open: overrides.close,
    growth: 0,
    contributions: 0,
    withdrawals: 0,
    interest: 0,
    principal: 0,
    ...overrides,
  };
}

function year(overrides: Partial<YearSnapshot> & Pick<YearSnapshot, 'year'>): YearSnapshot {
  return {
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
    ...overrides,
  };
}

function account(overrides: Partial<Account> & Pick<Account, 'id' | 'accountClass'>): Account {
  return {
    name: overrides.id,
    isLiability: false,
    initialBalance: 0,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 0,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 100,
    penaltyRate: 0,
    ...overrides,
  };
}

function event(overrides: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind' | 'startYear'>): PlanEvent {
  return {
    name: overrides.id,
    isIncluded: true,
    config: {},
    ...overrides,
  };
}

describe('classBalances', () => {
  it('sums only accounts matching the class and liability-ness, per year', () => {
    const years = [
      year({
        year: 2026,
        accounts: [
          accountYear({ accountId: 'a', accountClass: 'cash', close: 1000 }),
          accountYear({ accountId: 'b', accountClass: 'cash', close: 500 }),
          accountYear({ accountId: 'c', accountClass: 'mortgage', isLiability: true, close: 9000 }),
        ],
      }),
      year({ year: 2027, accounts: [accountYear({ accountId: 'a', accountClass: 'cash', close: 1100 })] }),
    ];

    expect(classBalances(years, 'cash', false)).toEqual([1500, 1100]);
    expect(classBalances(years, 'mortgage', true)).toEqual([9000, 0]);
  });
});

describe('missingAccountClasses', () => {
  const years = [year({ year: 2026, accounts: [accountYear({ accountId: 'a', accountClass: 'cash', close: 1000 })] })];

  it('excludes a class with a balance in view', () => {
    expect(missingAccountClasses(['cash', 'realEstate'], false, [], years)).toEqual(['realEstate']);
  });

  it('excludes a class the user owns even at zero balance', () => {
    const owned = [account({ id: 'a', accountClass: 'realEstate' })];
    expect(missingAccountClasses(['realEstate'], false, owned, years)).toEqual([]);
  });

  it('still offers a class whose only balance comes from a synthetic account', () => {
    // A synthetic account (created by an event) contributes to `years`, but
    // isn't something the user "owns" by hand — the class should still show
    // up as missing there, and only be excluded via the balance check.
    const synthetic = [account({ id: 's', accountClass: 'cash', isSynthetic: true })];
    expect(missingAccountClasses(['cash'], false, synthetic, [year({ year: 2026, accounts: [] })])).toEqual(['cash']);
  });
});

describe('netWorthStats', () => {
  it('reads today from the first year and the horizon from the last', () => {
    const years = [
      year({
        year: 2026,
        netWorth: 500_000,
        assets: 520_000,
        liabilities: 20_000,
        accounts: [
          accountYear({ accountId: 'cash', accountClass: 'cash', close: 40_000 }),
          accountYear({ accountId: 'brokerage', accountClass: 'taxableInvestment', close: 100_000 }),
          accountYear({ accountId: '401k', accountClass: 'taxDeferredInvestment', close: 380_000 }),
        ],
      }),
      year({ year: 2046, netWorth: 2_000_000 }),
    ];

    const stats = netWorthStats(years);
    expect(stats.netWorthToday).toBe(500_000);
    expect(stats.assetsToday).toBe(520_000);
    expect(stats.liabilitiesToday).toBe(20_000);
    expect(stats.liquidToday).toBe(140_000); // cash + taxable, not the 401(k)
    expect(stats.netWorthAtEnd).toBe(2_000_000);
  });

  it('is zero-safe on an empty projection', () => {
    expect(netWorthStats([])).toEqual({
      netWorthToday: 0,
      assetsToday: 0,
      liabilitiesToday: 0,
      liquidToday: 0,
      netWorthAtEnd: 0,
    });
  });

  it('regression (M1): "today" must not follow a paged table window', () => {
    // AccountsPage's balance-sheet table pages through an 8-year slice of
    // `result.years` via its year-window pager; `netWorthStats` and
    // `assetMixToday` must always be called with the FULL projection, not
    // that slice — passing the paged window (as AccountsPage.tsx once did)
    // reads a later year's balance as "today" after clicking "Later years"
    // (REVIEW.md M1: "Net worth today" read a 2034 balance, "at 2046" read
    // the 2041 value).
    const years = Array.from({ length: 21 }, (_, i) => year({ year: 2026 + i, netWorth: 100_000 * (i + 1) }));
    const laterYearsPage = years.slice(8, 16); // what the pager shows after paging forward

    expect(netWorthStats(years).netWorthToday).toBe(years[0].netWorth);
    expect(netWorthStats(years).netWorthAtEnd).toBe(years[years.length - 1].netWorth);

    // Documents the bug this guards against: calling with the paged window
    // instead of the full projection silently reports a different year as
    // "today". A caller must pass `result.years`, never a windowed slice.
    expect(netWorthStats(laterYearsPage).netWorthToday).not.toBe(years[0].netWorth);
    expect(netWorthStats(laterYearsPage).netWorthToday).toBe(laterYearsPage[0].netWorth);
  });
});

describe('assetMixToday', () => {
  it('sums today\'s asset balances by class and colours them', () => {
    const years = [
      year({
        year: 2026,
        accounts: [
          accountYear({ accountId: 'a', accountClass: 'cash', close: 1000 }),
          accountYear({ accountId: 'b', accountClass: 'cash', close: 500 }),
          accountYear({ accountId: 'c', accountClass: 'mortgage', isLiability: true, close: 9000 }),
        ],
      }),
    ];
    const segments = assetMixToday(years);
    const cash = segments.find((s) => s.key === 'cash');
    expect(cash?.value).toBe(1500);
    expect(cash?.color).toMatch(/^var\(--mix-/);
    // A liability class never appears in the asset mix.
    expect(segments.find((s) => s.key === 'mortgage')).toBeUndefined();
  });

  it('returns nothing for an empty projection', () => {
    expect(assetMixToday([])).toEqual([]);
  });
});

describe('cashFlowStats', () => {
  it('computes savings rate and deltas against the previous year', () => {
    const prev = year({ year: 2025, totalIncome: 100_000, totalExpenses: 70_000, totalTaxes: 20_000, netCashFlow: 10_000 });
    const cur = year({ year: 2026, totalIncome: 110_000, totalExpenses: 75_000, totalTaxes: 21_000, netCashFlow: 14_000 });

    const stats = cashFlowStats(cur, prev);
    expect(stats.income).toBe(110_000);
    expect(stats.savingsRate).toBeCloseTo((14_000 / 110_000) * 100);
    expect(stats.deltaIncome).toBe(10_000);
    expect(stats.deltaSpending).toBe(5_000);
    expect(stats.deltaTaxes).toBe(1_000);
    expect(stats.deltaSaved).toBe(4_000);
  });

  it('leaves deltas and savings rate undefined with nothing to compare', () => {
    const cur = year({ year: 2026, totalIncome: 0, totalExpenses: 0, totalTaxes: 0, netCashFlow: 0 });
    const stats = cashFlowStats(cur, undefined);
    expect(stats.savingsRate).toBeUndefined();
    expect(stats.deltaIncome).toBeUndefined();
  });
});

describe('eventStats', () => {
  it('counts included, non-hidden, non-endOfPlan events by tone and finds what is next', () => {
    const events: PlanEvent[] = [
      event({ id: 'job', kind: 'job', startYear: 2020 }), // in the past — not "next"
      event({ id: 'kid', kind: 'haveAKid', startYear: 2028 }),
      event({ id: 'house', kind: 'buyAHome', startYear: 2030 }),
      event({ id: 'hidden', kind: 'windfall', startYear: 2027, isHidden: true }),
      event({ id: 'excluded', kind: 'windfall', startYear: 2027, isIncluded: false }),
      event({ id: 'end', kind: 'endOfPlan', startYear: 2050, isRequired: true }),
    ];

    const stats = eventStats(events, 2026);
    expect(stats.total).toBe(3); // job, kid, house — hidden/excluded/endOfPlan don't count
    expect(stats.income).toBe(1); // job
    expect(stats.cost).toBe(2); // kid, house
    expect(stats.next).toEqual({ name: 'kid', yearsAway: 2 });
  });

  it('has no "next" event when nothing upcoming remains', () => {
    const events: PlanEvent[] = [event({ id: 'job', kind: 'job', startYear: 2010 })];
    expect(eventStats(events, 2026).next).toBeUndefined();
  });

  it('regression (S19): prefers an event that has not started yet over one that already started this year', () => {
    const events: PlanEvent[] = [
      event({ id: 'amazon', kind: 'job', startYear: 2026 }), // started this year
      event({ id: 'kid', kind: 'haveAKid', startYear: 2028 }), // genuinely upcoming
    ];
    expect(eventStats(events, 2026).next).toEqual({ name: 'kid', yearsAway: 2 });
  });

  it('falls back to an event that started this year when nothing is still ahead', () => {
    const events: PlanEvent[] = [event({ id: 'amazon', kind: 'job', startYear: 2026 })];
    expect(eventStats(events, 2026).next).toEqual({ name: 'amazon', yearsAway: 0 });
  });
});

describe('deltaTone / moneyDelta', () => {
  it('is sign-based, not "good vs bad"', () => {
    expect(deltaTone(500)).toBe('in');
    expect(deltaTone(-500)).toBe('out');
    expect(deltaTone(0)).toBe('neutral');
    expect(deltaTone(undefined)).toBe('neutral');
  });

  it('moneyDelta formats the value and reuses the same tone rule', () => {
    expect(moneyDelta(1200)).toEqual({ value: '+$1.2K', tone: 'in' });
    expect(moneyDelta(undefined)).toBeUndefined();
  });
});
