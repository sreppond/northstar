/**
 * Pure derivations for the ledger pages (Accounts / Cash Flow / Events —
 * `pages/*.tsx`, `tabs/*.tsx`). Split out of the page components so the
 * StatStrip figures, the "missing account type" rule the header's Add-account
 * menu and the balance sheet's trailing pills both apply, and the little
 * money/tone helpers a delta tag needs, are each written and tested once
 * rather than re-derived per page (docs/REDESIGN-V3.md "Accounts" / "Cash
 * Flow" / "Events").
 */
import type { Account, AccountClass, PlanEvent, YearSnapshot } from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES } from '@northstar/engine';
import { toneFor } from './presentation';
import { signedMoney } from './format';
import { accountClassColor, type DeltaTone, type StackedBarSegment } from './ui';

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

export interface NetWorthStats {
  netWorthToday: number;
  assetsToday: number;
  liabilitiesToday: number;
  /** Cash plus taxable investments — the two buckets someone could actually
      spend without a withdrawal penalty or triggering a tax event. */
  liquidToday: number;
  netWorthAtEnd: number;
}

const LIQUID_CLASSES: AccountClass[] = ['cash', 'taxableInvestment'];

/** Today's balance-sheet headline figures — Accounts' StatStrip. `years[0]`
    is "today": the projection's first year is never an estimate. */
export function netWorthStats(years: YearSnapshot[]): NetWorthStats {
  const today = years[0];
  const end = years[years.length - 1];
  const liquidToday = today
    ? today.accounts
        .filter((a) => !a.isLiability && LIQUID_CLASSES.includes(a.accountClass))
        .reduce((sum, a) => sum + a.close, 0)
    : 0;
  return {
    netWorthToday: today?.netWorth ?? 0,
    assetsToday: today?.assets ?? 0,
    liabilitiesToday: today?.liabilities ?? 0,
    liquidToday,
    netWorthAtEnd: end?.netWorth ?? 0,
  };
}

/**
 * "Where it sits" — today's asset balances by class, for the account-mix
 * `StackedBar` (docs/REDESIGN-V3.md "Accounts"). Liabilities have no honest
 * place in a composition-of-assets bar; `StackedBar` itself already drops
 * zero/negative segments, so an empty class just doesn't appear.
 */
export function assetMixToday(years: YearSnapshot[]): StackedBarSegment[] {
  const today = years[0];
  if (!today) return [];
  return ASSET_CLASSES.map((accountClass) => ({
    key: accountClass,
    label: ACCOUNT_TYPES[accountClass].label,
    value: today.accounts
      .filter((a) => !a.isLiability && a.accountClass === accountClass)
      .reduce((sum, a) => sum + a.close, 0),
    color: accountClassColor(accountClass),
  })).filter((s) => s.value >= 1);
}

export interface CashFlowStats {
  year: number;
  income: number;
  spending: number;
  taxes: number;
  saved: number;
  /** Percent, undefined when there is no income to divide by. */
  savingsRate: number | undefined;
  deltaIncome: number | undefined;
  deltaSpending: number | undefined;
  deltaTaxes: number | undefined;
  deltaSaved: number | undefined;
}

/** The selected year's headline figures — Cash Flow's StatStrip. `previous`
    is the prior year in the projection, when there is one, for the delta
    tags; omit it for the first year in the plan. */
export function cashFlowStats(snapshot: YearSnapshot, previous: YearSnapshot | undefined): CashFlowStats {
  const saved = snapshot.netCashFlow;
  return {
    year: snapshot.year,
    income: snapshot.totalIncome,
    spending: snapshot.totalExpenses,
    taxes: snapshot.totalTaxes,
    saved,
    savingsRate: snapshot.totalIncome > 0 ? (saved / snapshot.totalIncome) * 100 : undefined,
    deltaIncome: previous ? snapshot.totalIncome - previous.totalIncome : undefined,
    deltaSpending: previous ? snapshot.totalExpenses - previous.totalExpenses : undefined,
    deltaTaxes: previous ? snapshot.totalTaxes - previous.totalTaxes : undefined,
    deltaSaved: previous ? saved - previous.netCashFlow : undefined,
  };
}

export interface EventStats {
  total: number;
  income: number;
  cost: number;
  next: { name: string; yearsAway: number } | undefined;
}

/**
 * The plan's events, counted the way a human would describe them — Events'
 * StatStrip. `endOfPlan` is always present and isn't really "an event," so it
 * is left out of every count here (and is what makes the EmptyState's "no
 * events besides End of plan" check correct).
 */
export function eventStats(events: PlanEvent[], todayYear: number): EventStats {
  const live = events.filter((e) => e.isIncluded && !e.isHidden && e.kind !== 'endOfPlan');
  // Prefer an event that hasn't started yet — "Next up" was surfacing an
  // event that already started this year ahead of a genuinely upcoming one,
  // because both satisfied `startYear >= todayYear` and the earlier start
  // year sorted first (REVIEW.md S19). Only fall back to "started this
  // year" when nothing is still ahead.
  const future = live.filter((e) => e.startYear > todayYear).sort((a, b) => a.startYear - b.startYear)[0];
  const thisYear = live.filter((e) => e.startYear === todayYear).sort((a, b) => a.startYear - b.startYear)[0];
  const upcoming = future ?? thisYear;
  return {
    total: live.length,
    income: live.filter((e) => toneFor(e.kind) === 'income').length,
    cost: live.filter((e) => toneFor(e.kind) === 'cost').length,
    next: upcoming ? { name: upcoming.name, yearsAway: upcoming.startYear - todayYear } : undefined,
  };
}

/** Sign of a change in money -> a `DeltaTag` tone (docs/REDESIGN-V3.md
    "Delta tag": these encode a change in money, not whether that change is
    welcome — a positive delta is always `in`, a negative one always `out`,
    regardless of which stat it's attached to). */
export function deltaTone(delta: number | undefined): DeltaTone {
  if (delta === undefined || Math.abs(delta) < 50) return 'neutral';
  return delta > 0 ? 'in' : 'out';
}

/** A ready-to-render `Stat`/`StatCard` delta prop, or undefined when there's
    nothing to compare against (no previous year, no horizon spread). */
export function moneyDelta(delta: number | undefined): { value: string; tone: DeltaTone } | undefined {
  if (delta === undefined) return undefined;
  return { value: signedMoney(delta), tone: deltaTone(delta) };
}
