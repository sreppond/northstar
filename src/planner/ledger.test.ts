import { describe, expect, it } from 'vitest';
import type { Account, AccountYear, OpeningSnapshot, PlanEvent, YearSnapshot } from '@northstar/engine';
import {
  assetMixToday,
  cashFlowStats,
  classBalances,
  deltaTone,
  eventStats,
  missingAccountClasses,
  moneyDelta,
  netWorthStats,
  savingsRateNote,
  stubYearLabel,
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

  it('prefers `opening` over years[0] once a caller passes it — "today" is the as-of-date balance, not the projected close of the stub year', () => {
    // A stub year projects growth on top of the true opening balance, so
    // years[0].netWorth (500,000, per the fixture above) is already AHEAD
    // of what "today" actually is. `opening` carries the real figure.
    const years = [
      year({ year: 2026, netWorth: 500_000, assets: 520_000, liabilities: 20_000 }),
      year({ year: 2046, netWorth: 2_000_000 }),
    ];
    const opening: OpeningSnapshot = {
      asOfDate: '2026-08-23',
      accounts: [
        { accountId: 'cash', name: 'Cash', accountClass: 'cash', isLiability: false, balance: 30_000 },
        { accountId: 'brokerage', name: 'Brokerage', accountClass: 'taxableInvestment', isLiability: false, balance: 80_000 },
        { accountId: '401k', name: '401(k)', accountClass: 'taxDeferredInvestment', isLiability: false, balance: 250_000 },
        { accountId: 'mortgage', name: 'Mortgage', accountClass: 'mortgage', isLiability: true, balance: 18_000 },
      ],
      assets: 360_000,
      liabilities: 18_000,
      netWorth: 342_000,
    };

    const stats = netWorthStats(years, opening);
    expect(stats.netWorthToday).toBe(342_000);
    expect(stats.assetsToday).toBe(360_000);
    expect(stats.liabilitiesToday).toBe(18_000);
    expect(stats.liquidToday).toBe(110_000); // cash + taxable, not the 401(k)
    expect(stats.netWorthAtEnd).toBe(2_000_000); // horizon still reads the last YEAR, unaffected
    // Proof it actually differs from the old years[0]-based reading.
    expect(stats.netWorthToday).not.toBe(years[0].netWorth);
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

  it('reads opening.accounts instead of years[0] once a caller passes it', () => {
    const years = [
      year({
        year: 2026,
        accounts: [accountYear({ accountId: 'a', accountClass: 'cash', close: 999_999 })], // NOT read once `opening` is passed
      }),
    ];
    const opening: OpeningSnapshot = {
      asOfDate: '2026-08-23',
      accounts: [
        { accountId: 'a', name: 'Cash', accountClass: 'cash', isLiability: false, balance: 1_000 },
        { accountId: 'b', name: 'Brokerage', accountClass: 'taxableInvestment', isLiability: false, balance: 500 },
      ],
      assets: 1_500,
      liabilities: 0,
      netWorth: 1_500,
    };
    const segments = assetMixToday(years, opening);
    expect(segments.find((s) => s.key === 'cash')?.value).toBe(1_000);
    expect(segments.find((s) => s.key === 'taxableInvestment')?.value).toBe(500);
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

  // W3#5 (review item 12): a 401(k)/allocation contribution is booked as an
  // "expense" line so the waterfall treats it as a cash outflow, but it is
  // SAVING, not SPENDING. On the sample plan's 2027 this showed a 34%
  // savings rate where the true rate (contributions counted as saved) is
  // 39% — this is that exact shape of case, with round hand-derivable
  // numbers.
  it('excludes a 401(k) contribution from "spending" and credits it into "saved" (W3#5)', () => {
    const cur = year({
      year: 2026,
      totalIncome: 100_000,
      totalExpenses: 60_000, // $40k living + a $20k 401(k) contribution
      totalTaxes: 10_000,
      netCashFlow: 100_000 - 60_000 - 10_000, // 30,000 — contribution already netted out here
      expenses: [
        { label: 'Living expenses', amount: 40_000, category: 'living' },
        { label: '401(k) — contribution', amount: 20_000, category: 'contribution' },
      ],
    });
    const stats = cashFlowStats(cur, undefined);

    // Hand check: spending = totalExpenses - contributions = 60,000 - 20,000 = 40,000.
    expect(stats.spending).toBe(40_000);
    // Hand check: saved = netCashFlow + contributions = 30,000 + 20,000 = 50,000.
    expect(stats.saved).toBe(50_000);
    // Hand check: savings rate = saved / income = 50,000 / 100,000 = 50%.
    expect(stats.savingsRate).toBeCloseTo(50, 6);
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

describe('stubYearLabel', () => {
  it('labels the start year as a stub when asOfDate falls mid-year', () => {
    const label = stubYearLabel(2026, 2026, '2026-09-25');
    expect(label).toEqual({ date: 'Sep 25', short: 'from Sep 25', long: 'Sep 25 – Dec 31 · partial year' });
  });

  it('is undefined for any year after the start year', () => {
    expect(stubYearLabel(2027, 2026, '2026-09-25')).toBeUndefined();
  });

  it('is undefined when asOfDate is unset (full first year)', () => {
    expect(stubYearLabel(2026, 2026, undefined)).toBeUndefined();
  });

  it('is undefined when asOfDate is exactly Jan 1 (full first year)', () => {
    expect(stubYearLabel(2026, 2026, '2026-01-01')).toBeUndefined();
  });

  it('is undefined when asOfDate falls in a different year than startYear', () => {
    expect(stubYearLabel(2026, 2026, '2025-12-15')).toBeUndefined();
  });
});

describe('savingsRateNote', () => {
  it('is undefined when cash flow is not negative', () => {
    expect(savingsRateNote(year({ year: 2027, netCashFlow: 5000 }))).toBeUndefined();
    expect(savingsRateNote(year({ year: 2027, netCashFlow: 0 }))).toBeUndefined();
  });

  it('names the year\'s biggest expense when cash flow is negative', () => {
    const note = savingsRateNote(
      year({
        year: 2026,
        netCashFlow: -120_000,
        expenses: [
          { label: 'Living expenses', amount: 60_000 },
          { label: 'Down payment', amount: 150_000 },
        ],
      }),
    );
    expect(note).toBe('Negative because spending outpaced income this year — largely Down payment.');
  });

  it('falls back to a generic note when there are no expense line items to name', () => {
    expect(savingsRateNote(year({ year: 2026, netCashFlow: -500, expenses: [] }))).toBe(
      'Negative because spending outpaced income this year.',
    );
  });

  // W3#5: a contribution credited back into "saved" can flip a negative
  // cash-flow year into a non-negative savings year, and must never be
  // named as the "culprit" even when it isn't.
  it('is undefined once a contribution credited back into "saved" covers the cash-flow gap', () => {
    expect(
      savingsRateNote(
        year({
          year: 2026,
          netCashFlow: -5_000,
          expenses: [{ label: '401(k) — contribution', amount: 20_000, category: 'contribution' }],
        }),
      ),
    ).toBeUndefined(); // saved = -5,000 + 20,000 = 15,000, not negative
  });

  it('never blames a contribution as the biggest expense, even when it dwarfs every other line', () => {
    const note = savingsRateNote(
      year({
        year: 2026,
        netCashFlow: -200_000,
        expenses: [
          { label: 'Living expenses', amount: 60_000 },
          { label: '401(k) — contribution', amount: 20_000, category: 'contribution' },
        ],
      }),
    );
    // saved = -200,000 + 20,000 = -180,000 -- still negative, so the note
    // fires, but "Living expenses" (the biggest NON-contribution line) is
    // named, not the bigger-looking contribution.
    expect(note).toBe('Negative because spending outpaced income this year — largely Living expenses.');
  });
});
