import { describe, expect, it } from 'vitest';
import type { AccountYear, PlanResult, YearSnapshot } from '@northstar/engine';
import { buildExploreRows, EXPLORE_COLUMNS, exploreRowsToCsv, exploreRowsToJson } from './reports';

function account(over: Partial<AccountYear> = {}): AccountYear {
  return {
    accountId: 'a1',
    name: 'Brokerage',
    accountClass: 'taxableInvestment',
    isLiability: false,
    open: 0,
    growth: 0,
    contributions: 0,
    withdrawals: 0,
    interest: 0,
    principal: 0,
    close: 0,
    ...over,
  };
}

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

function result(years: YearSnapshot[]): PlanResult {
  return { startYear: years[0]?.year ?? 2026, endYear: years.at(-1)?.year ?? 2026, years, warnings: [] };
}

describe('buildExploreRows', () => {
  it('sums contributions/withdrawals across accounts and reads totals straight off the snapshot', () => {
    const rows = buildExploreRows(
      result([
        snapshot(2026, {
          totalIncome: 100_000,
          totalExpenses: 60_000,
          totalTaxes: 15_000,
          netWorth: 250_000,
          accounts: [account({ contributions: 20_000, withdrawals: 0 }), account({ contributions: 5_000, withdrawals: 3_000 })],
        }),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2026,
      netWorth: 250_000,
      income: 100_000,
      expenses: 60_000,
      taxes: 15_000,
      contributions: 25_000,
      withdrawals: 3_000,
    });
  });

  // S5: this is contributions ÷ income, a DIFFERENT figure from the
  // "savings rate" Overview/Cash Flow show (net cash flow ÷ income) — see
  // the `contributionRatePercent` field doc in reports.ts. Naming and value
  // both matter here, since the two are easy to conflate.
  it("names its ratio contribution rate, distinct from Overview/Cash Flow's savings rate", () => {
    const rows = buildExploreRows(
      result([
        snapshot(2026, {
          totalIncome: 100_000,
          accounts: [account({ contributions: 25_000 })],
        }),
      ]),
    );
    expect(rows[0].contributionRatePercent).toBeCloseTo(25, 6);
    expect(EXPLORE_COLUMNS.find((c) => c.key === 'contributionRatePercent')?.label).toBe('Contribution Rate');
  });

  it('reads a 0% rate rather than dividing by zero when a year has no income', () => {
    const rows = buildExploreRows(result([snapshot(2026, { totalIncome: 0, accounts: [account({ contributions: 1_000 })] })]));
    expect(rows[0].contributionRatePercent).toBe(0);
  });
});

describe('CSV/JSON export', () => {
  const rows = buildExploreRows(
    result([snapshot(2026, { totalIncome: 100_000, netWorth: 250_000, accounts: [account({ contributions: 25_000 })] })]),
  );

  it('renders one CSV line per row, headed by the column labels', () => {
    const csv = exploreRowsToCsv(rows);
    const [header, dataLine] = csv.split('\n');
    expect(header).toBe(EXPLORE_COLUMNS.map((c) => c.label).join(','));
    expect(dataLine.split(',')).toHaveLength(EXPLORE_COLUMNS.length);
  });

  it('round-trips through JSON', () => {
    const parsed = JSON.parse(exploreRowsToJson(rows));
    expect(parsed).toEqual(rows);
  });
});
