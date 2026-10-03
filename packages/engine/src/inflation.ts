import type { PlanResult, YearSnapshot } from './types.js';
import { yearFractionRemaining } from './partialYear.js';

/**
 * Presentation-time deflation.
 *
 * The engine always runs in NOMINAL dollars. `dollarMode: 'todaysDollars'`
 * divides through here instead. Running the simulation in real dollars would
 * eventually double-deflate something -- see docs/PLAN.md §4.3.
 *
 * `startYearFraction` is the fraction of `startYear` still ahead of the
 * plan's `asOfDate` (`yearFractionRemaining`, docs/MATH.md "Inflation
 * deflation in the stub year") -- 1 for the ordinary case where `startYear`
 * is a genuine full year. Every `YearSnapshot` is that year's Dec 31 CLOSE,
 * which is `startYearFraction` years of inflation away from "today" for
 * `startYear` itself, and one more full year for every year after that --
 * NOT `year - startYear` years, which silently claims `startYear`'s own
 * close needs no deflation at all. Optional and defaulting to 1 so a caller
 * that predates this parameter keeps getting a full year at `startYear`,
 * same as it always has.
 */
export function presentValue(
  nominal: number,
  year: number,
  startYear: number,
  inflationRate: number,
  startYearFraction = 1,
): number {
  const elapsedYears = startYearFraction + (year - startYear);
  return nominal / Math.pow(1 + inflationRate / 100, elapsedYears);
}

/**
 * Rewrites a whole result into today's dollars.
 *
 * Two different quantities need two different deflators (docs/MATH.md
 * "Inflation and both dollar modes" / W3#2):
 *
 * - A BALANCE (`accounts[].open/close`, `assets`, `liabilities`, `netWorth`,
 *   `unfundedShortfall`) is a snapshot AT Dec 31 of `year` -- `startYear`'s
 *   own close is still only `startYearFraction` years of inflation away from
 *   `asOfDate` (a stub year's close arrives sooner than a full year would),
 *   so it uses `factorFor` (the balance deflator, unchanged, PASS per the
 *   review).
 * - A FLOW (`income`/`expenses`/`taxes`/`withdrawals`/`allocations`, the
 *   `total*` figures, `netCashFlow`, and the per-account
 *   `growth`/`contributions`/`withdrawals`/`interest`/`principal`) is an
 *   amount that occurred DURING `year`, already nominal-inflated by
 *   `run.ts`'s `inflationAt(year) = (1+i)^(year-startYear)` -- note: NOT
 *   scaled by any stub fraction, which only shrinks a flow's SIZE (fewer
 *   months to earn/spend it), not the PRICE LEVEL it was priced at. Dividing
 *   back out by that exact same exponent, `flowFactor`, undoes only the
 *   inflation and leaves the proration alone -- so a $100k "today" income
 *   reads back as flat $100k every year, stub or not, `asOfDate` present or
 *   absent (W3#2's 5c/5e cases). Using the balance deflator here instead
 *   (the old bug) divided a stub-year flow by an extra `(1+i)^f`, since
 *   `startYearFraction` is 1 only when `asOfDate` is unset -- so a $100k
 *   income misread as $97.1k with no `asOfDate` at all, a regression from
 *   `main`.
 */
export function deflate(result: PlanResult, inflationRate: number): PlanResult {
  // `result.opening` (additive -- absent only for a PlanResult hand-built
  // without it) carries the real `asOfDate`; without it there is nothing to
  // measure a stub against, so fall back to "startYear is a full year".
  const startYearFraction = result.opening
    ? yearFractionRemaining(result.startYear, result.startYear, result.opening.asOfDate)
    : 1;
  const factorFor = (year: number) =>
    Math.pow(1 + inflationRate / 100, startYearFraction + (year - result.startYear));
  const flowFactor = (year: number) =>
    Math.pow(1 + inflationRate / 100, year - result.startYear);

  return {
    ...result,
    years: result.years.map((snapshot): YearSnapshot => {
      const balanceF = factorFor(snapshot.year);
      const flowF = flowFactor(snapshot.year);
      const scaleLines = (items: YearSnapshot['income']) =>
        items.map((l) => ({ ...l, amount: l.amount / flowF }));

      return {
        ...snapshot,
        income: scaleLines(snapshot.income),
        expenses: scaleLines(snapshot.expenses),
        taxes: scaleLines(snapshot.taxes),
        withdrawals: scaleLines(snapshot.withdrawals),
        allocations: scaleLines(snapshot.allocations),
        totalIncome: snapshot.totalIncome / flowF,
        totalExpenses: snapshot.totalExpenses / flowF,
        totalTaxes: snapshot.totalTaxes / flowF,
        netCashFlow: snapshot.netCashFlow / flowF,
        accounts: snapshot.accounts.map((a) => ({
          ...a,
          open: a.open / balanceF,
          growth: a.growth / flowF,
          contributions: a.contributions / flowF,
          withdrawals: a.withdrawals / flowF,
          interest: a.interest / flowF,
          principal: a.principal / flowF,
          close: a.close / balanceF,
        })),
        assets: snapshot.assets / balanceF,
        liabilities: snapshot.liabilities / balanceF,
        netWorth: snapshot.netWorth / balanceF,
        ...(snapshot.unfundedShortfall !== undefined
          ? { unfundedShortfall: snapshot.unfundedShortfall / flowF }
          : {}),
      };
    }),
  };
}
