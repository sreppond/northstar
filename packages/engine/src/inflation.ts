import type { PlanResult, YearSnapshot } from './types.js';

/**
 * Presentation-time deflation.
 *
 * The engine always runs in NOMINAL dollars. `dollarMode: 'todaysDollars'`
 * divides through here instead. Running the simulation in real dollars would
 * eventually double-deflate something -- see docs/PLAN.md §4.3.
 */
export function presentValue(
  nominal: number,
  year: number,
  startYear: number,
  inflationRate: number,
): number {
  return nominal / Math.pow(1 + inflationRate / 100, year - startYear);
}

/** Rewrites a whole result into today's dollars. */
export function deflate(result: PlanResult, inflationRate: number): PlanResult {
  const factorFor = (year: number) => Math.pow(1 + inflationRate / 100, year - result.startYear);

  return {
    ...result,
    years: result.years.map((snapshot): YearSnapshot => {
      const f = factorFor(snapshot.year);
      const scaleLines = (items: YearSnapshot['income']) =>
        items.map((l) => ({ ...l, amount: l.amount / f }));

      return {
        ...snapshot,
        income: scaleLines(snapshot.income),
        expenses: scaleLines(snapshot.expenses),
        taxes: scaleLines(snapshot.taxes),
        withdrawals: scaleLines(snapshot.withdrawals),
        allocations: scaleLines(snapshot.allocations),
        totalIncome: snapshot.totalIncome / f,
        totalExpenses: snapshot.totalExpenses / f,
        totalTaxes: snapshot.totalTaxes / f,
        netCashFlow: snapshot.netCashFlow / f,
        accounts: snapshot.accounts.map((a) => ({
          ...a,
          open: a.open / f,
          growth: a.growth / f,
          contributions: a.contributions / f,
          withdrawals: a.withdrawals / f,
          interest: a.interest / f,
          principal: a.principal / f,
          close: a.close / f,
        })),
        assets: snapshot.assets / f,
        liabilities: snapshot.liabilities / f,
        netWorth: snapshot.netWorth / f,
        ...(snapshot.unfundedShortfall !== undefined
          ? { unfundedShortfall: snapshot.unfundedShortfall / f }
          : {}),
      };
    }),
  };
}
