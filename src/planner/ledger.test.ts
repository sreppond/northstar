import { describe, expect, it } from 'vitest';
import type { Account, AccountYear, OpeningSnapshot, PlanEvent, YearSnapshot } from '@northstar/engine';
import {
  classBalances,
  deltaTone,
  missingAccountClasses,
  savedThisYear,
  savingsRateNote,
  savingsRatePercent,
  spendingThisYear,
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

describe('savings rate', () => {
  it('is saved ÷ income', () => {
    const cur = year({ year: 2026, totalIncome: 110_000, totalExpenses: 75_000, totalTaxes: 21_000, netCashFlow: 14_000 });
    expect(savingsRatePercent(cur)).toBeCloseTo((14_000 / 110_000) * 100);
  });

  it('is undefined with no income to divide by', () => {
    const cur = year({ year: 2026, totalIncome: 0, totalExpenses: 0, totalTaxes: 0, netCashFlow: 0 });
    expect(savingsRatePercent(cur)).toBeUndefined();
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

    // Hand check: spending = totalExpenses - contributions = 60,000 - 20,000 = 40,000.
    expect(spendingThisYear(cur)).toBe(40_000);
    // Hand check: saved = netCashFlow + contributions = 30,000 + 20,000 = 50,000.
    expect(savedThisYear(cur)).toBe(50_000);
    // Hand check: savings rate = saved / income = 50,000 / 100,000 = 50%.
    expect(savingsRatePercent(cur)).toBeCloseTo(50, 6);
  });
});

describe('deltaTone', () => {
  it('is sign-based, not "good vs bad"', () => {
    expect(deltaTone(500)).toBe('in');
    expect(deltaTone(-500)).toBe('out');
    expect(deltaTone(0)).toBe('neutral');
    expect(deltaTone(undefined)).toBe('neutral');
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
