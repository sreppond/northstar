/**
 * Pure derivations shared by the ledger tables (`tabs/*.tsx`) and the pages
 * that sit on them: per-class balances, the "missing account type" rule the
 * balance sheet's Add pills apply, the one definition of spending / saved /
 * savings rate, and the stub-year label. Written and tested once rather than
 * re-derived per page. (The v3 StatStrip figures that used to live here went
 * with the stat strips in v5, V5-REVIEW-1 D1.)
 */
import type { Account, AccountClass, YearSnapshot } from '@northstar/engine';
import type { DeltaTone } from './ui';

/**
 * One account type's balance across a window of years, summed across every
 * account of that class/liability-ness. The same per-type grouping
 * `AccountsTab` draws its rows from — reused here so the header's
 * Add-account menu and the table's own trailing "+ Add" pills never disagree
 * about which types already have a balance in view.
 */
export function classBalances(years: YearSnapshot[], accountClass: AccountClass, liability: boolean): number[] {
  return years.map((y) =>
    y.accounts
      .filter((a) => a.isLiability === liability && a.accountClass === accountClass)
      .reduce((sum, a) => sum + a.close, 0),
  );
}

/**
 * Account types with no balance anywhere in `years` and no account the user
 * set up by hand — "not yet on the balance sheet." Shared by `AccountsTab`'s
 * trailing pills and `AccountsPage`'s header Add-account menu.
 */
export function missingAccountClasses(
  classes: AccountClass[],
  liability: boolean,
  accounts: Account[],
  years: YearSnapshot[],
): AccountClass[] {
  return classes.filter((accountClass) => {
    const hasValue = classBalances(years, accountClass, liability).some((v) => Math.abs(v) >= 1);
    const owned = accounts.some((a) => a.accountClass === accountClass && !a.isSynthetic);
    return !hasValue && !owned;
  });
}

/**
 * Contributions paid from a paycheck or an allocation rule this year.
 * `run.ts` pushes these into `expenses` (category `'contribution'`) so the
 * ordinary waterfall treats them as a cash outflow — but a dollar routed
 * into a 401(k) is SAVED, not SPENT: it moves net worth from cash to a
 * retirement account, it doesn't reduce it. The one shared definition
 * (docs/MATH.md "Savings rate and spending", W3#5) that `spendingThisYear`/
 * `savedThisYear`/`savingsRatePercent` below, `reports.ts` and
 * `cashFlowView.ts` all read off instead of each
 * re-deriving its own (previously divergent) number.
 */
function contributionsThisYear(snapshot: Pick<YearSnapshot, 'expenses'>): number {
  return snapshot.expenses
    .filter((e) => e.category === 'contribution')
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Spending — living expenses plus event costs, contributions excluded (see
 * `contributionsThisYear`). Taxes are tracked separately (`totalTaxes`), the same way `netCashFlow` has always kept them
 * apart from "expenses," so this doesn't double them into "spending" either.
 */
export function spendingThisYear(snapshot: Pick<YearSnapshot, 'totalExpenses' | 'expenses'>): number {
  return snapshot.totalExpenses - contributionsThisYear(snapshot);
}

/**
 * Savings — income minus spending (taxes already netted out via
 * `netCashFlow`, exactly as before), WITH paycheck/allocation contributions
 * added back in: `netCashFlow` already has contributions subtracted out as
 * an "expense," so crediting them back here is what makes a $20k 401(k)
 * contribution count as $20k saved rather than $20k spent.
 */
export function savedThisYear(snapshot: Pick<YearSnapshot, 'netCashFlow' | 'expenses'>): number {
  return snapshot.netCashFlow + contributionsThisYear(snapshot);
}

/** `savedThisYear` ÷ income, as a percent — undefined when there's no income
    to divide by rather than a misleading divide-by-zero-flavoured number. */
export function savingsRatePercent(
  snapshot: Pick<YearSnapshot, 'netCashFlow' | 'expenses' | 'totalIncome'>,
): number | undefined {
  if (snapshot.totalIncome <= 0) return undefined;
  return (savedThisYear(snapshot) / snapshot.totalIncome) * 100;
}

/** Sign of a change in money -> a `DeltaTag` tone (docs/REDESIGN-V3.md
    "Delta tag": these encode a change in money, not whether that change is
    welcome — a positive delta is always `in`, a negative one always `out`,
    regardless of which stat it's attached to). */
export function deltaTone(delta: number | undefined): DeltaTone {
  if (delta === undefined || Math.abs(delta) < 50) return 'neutral';
  return delta > 0 ? 'in' : 'out';
}

export interface StubYearLabel {
  /** "Sep 25" — the bare date, for a column header's small mono sub-label
      ("from Sep 25") or a sub line's own composition. */
  date: string;
  /** "from Sep 25" — a column header's sub-label under "2026". */
  short: string;
  /** "Sep 25 – Dec 31 · partial year" — the Cash Flow/Reports sub line. */
  long: string;
}

/**
 * Whether `year` is the plan's STUB first year — it runs from
 * `settings.asOfDate` to Dec 31 rather than Jan 1 to Dec 31, so its income,
 * spending and savings rate are a fraction of a full year's
 * (docs/MATH.md "Today vs. years[0]", docs/ROADMAP-10.md C7 "the stub year
 * is invisible"). Returns `undefined` for every other year, and for the
 * first year too when `asOfDate` is unset or falls on Jan 1 (a plan that
 * starts exactly at the top of the year has no stub to label).
 *
 * Pure and only depends on the plan's own settings, so every page/table/
 * chart that shows the first plan year's figures can call this once and
 * render the same label rather than each re-deriving "is this the partial
 * year?" its own slightly different way.
 */
export function stubYearLabel(year: number, startYear: number, asOfDate?: string): StubYearLabel | undefined {
  if (year !== startYear) return undefined;
  const asOf = asOfDate ?? `${startYear}-01-01`;
  const [asOfYear, month, day] = asOf.split('-').map(Number);
  if (asOfYear !== startYear) return undefined;
  if (month === 1 && day === 1) return undefined;

  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(asOfYear, month - 1, day)),
  );
  return {
    date,
    short: `from ${date}`,
    long: `${date} – Dec 31 · partial year`,
  };
}

/**
 * A one-line explainer for a negative "Savings rate" cell — Cash Flow's
 * table (docs/ROADMAP-10.md C7): a negative rate reads as alarming out of
 * context, when it's often just a single large one-time cost (a house's
 * down payment, say) outspending that year's income. Names the year's
 * single biggest expense line when there is one, so the number points at
 * its own cause instead of leaving the reader to guess. `undefined` for a
 * year whose cash flow wasn't negative — nothing to explain.
 */
export function savingsRateNote(snapshot: YearSnapshot): string | undefined {
  // `savedThisYear`, not raw `netCashFlow` (W3#5): a year whose cash flow
  // alone is negative can still be a POSITIVE savings year once paycheck
  // contributions are credited back in, so this must agree with the same
  // "saved" `savingsRatePercent` shows, not a looser reading.
  if (savedThisYear(snapshot) >= 0) return undefined;
  // A contribution is never the "culprit" named here — it isn't spending,
  // so blaming it for a negative savings year would contradict the fix
  // right above.
  const biggest = snapshot.expenses
    .filter((item) => item.category !== 'contribution')
    .reduce<YearSnapshot['expenses'][number] | undefined>(
      (best, item) => (item.amount > (best?.amount ?? 0) ? item : best),
      undefined,
    );
  return biggest
    ? `Negative because spending outpaced income this year — largely ${biggest.label}.`
    : 'Negative because spending outpaced income this year.';
}
