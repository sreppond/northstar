/**
 * Pure derivations for the Net Worth page and its sheets (docs/REDESIGN-V5.md
 * §5.1). Split out of the components so the pieces with real logic — which
 * account classes to show, the account sheet's waterfall — are written once and
 * tested without a component tree.
 */
import type {
  Account,
  AccountClass,
  AccountYear,
  LineItem,
  OpeningSnapshot,
  Plan,
  PlanResult,
  YearSnapshot,
} from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES, LIABILITY_CLASSES } from '@northstar/engine';
import { monthsIn } from '../budgetView';
import type { ChartMarker, DangerBand } from '../charts';
import { healthDangerBand, type PlanHealth } from '../health';
import { classBalances } from '../ledger';
import { toneFor } from '../presentation';

/** "Spencer 40 · Sarah 40" — the included adults' ages at the year's close. */
export function agesLabel(plan: Plan, snapshot: YearSnapshot | undefined): string | undefined {
  if (!snapshot) return undefined;
  const parts = plan.participants
    .filter((p) => p.isIncluded && p.role !== 'child')
    .map((p) => {
      const age = snapshot.ages[p.id] ?? snapshot.year - p.birthYear;
      return `${p.name.split(' ')[0]} ${age}`;
    });
  return parts.length ? parts.join(' · ') : undefined;
}

/** The hatched shortfall band (docs/REDESIGN-V5.md §4.2.4) for any chart over `result`'s years.
    Delegates to `healthDangerBand` so every page hatches only the short years (V5-REVIEW-1 F2). */
export function dangerBand(health: PlanHealth, result: PlanResult): DangerBand | undefined {
  return healthDangerBand(health, result);
}

/** Event ticks on the baseline: not draggable here, dragging moved to Timeline (§5.1.1). */
export function eventMarkers(plan: Plan, years: number[]): ChartMarker[] {
  const first = years[0];
  const last = years[years.length - 1];
  return plan.events
    .filter((e) => e.isIncluded && e.kind !== 'endOfPlan' && e.startYear >= first && e.startYear <= last)
    .map((e) => {
      const tone = toneFor(e.kind);
      return { year: e.startYear, label: e.name, tone: tone === 'end' ? ('neutral' as const) : tone };
    });
}

export interface ClassRow {
  accountClass: AccountClass;
  liability: boolean;
  label: string;
}

/**
 * The account classes worth a row: any with value somewhere in the plan, or
 * that the user set up by hand even while zero — the same test the balances
 * table applies. Assets first, then liabilities, in the engine's own order.
 */
export function presentClasses(accounts: Account[], years: YearSnapshot[]): ClassRow[] {
  const rows: ClassRow[] = [];
  const consider = (classes: AccountClass[], liability: boolean) => {
    for (const accountClass of classes) {
      const hasValue = classBalances(years, accountClass, liability).some((v) => Math.abs(v) >= 1);
      const owned = accounts.some((a) => a.accountClass === accountClass && !a.isSynthetic);
      if (hasValue || owned) rows.push({ accountClass, liability, label: ACCOUNT_TYPES[accountClass].label });
    }
  };
  consider(ASSET_CLASSES, false);
  consider(LIABILITY_CLASSES, true);
  return rows;
}

/** One class's balance at `year`, summed over its accounts (a liability is a positive magnitude). */
export function classBalanceAt(snapshot: YearSnapshot | undefined, accountClass: AccountClass, liability: boolean): number {
  if (!snapshot) return 0;
  return snapshot.accounts
    .filter((a) => a.accountClass === accountClass && a.isLiability === liability)
    .reduce((sum, a) => sum + a.close, 0);
}

/** The plan's real "today" balance for a class, from the opening snapshot (the table's first column). */
export function openingClassBalance(
  opening: OpeningSnapshot | undefined,
  accountClass: AccountClass,
  liability: boolean,
): number {
  return (opening?.accounts ?? [])
    .filter((a) => a.accountClass === accountClass && a.isLiability === liability)
    .reduce((sum, a) => sum + a.balance, 0);
}

/* --- account sheet waterfall ---------------------------------------------- */

export interface FlowStep {
  key: string;
  label: string;
  /** Signed contribution to the balance; for `open` and `close`, the balance itself. */
  value: number;
  /** `info` is a figure beside the balance that moves nothing on it (interest is paid from cash). */
  kind: 'total' | 'in' | 'out' | 'info';
  /** Where the bar starts and ends on the running balance. */
  from: number;
  to: number;
}

/** Smallest row worth showing: under a dollar it is rounding, not a flow (V5-REVIEW-2 N5). */
const MIN_ROW = 1;

/**
 * Open -> contributions -> growth -> withdrawals -> close for one class in one
 * year (docs/REDESIGN-V5.md §5.1.4), summed over its accounts. A liability
 * flows differently — interest is paid in cash, only the principal moves the
 * balance — so it gets its own steps.
 *
 * V5-REVIEW-2 N5: money the engine is *required* to pull out (an RMD, a SEPP
 * payment) gets its own row, so a "never withdraw" account doesn't show a plain
 * "Withdrawals" line that contradicts its setting. `income` is the year's
 * income lines; they are matched to `rows` by account id.
 *
 * V5-REVIEW-2 N16: the residual that no named step explains (a deflation
 * artefact) is folded into Growth when it is small, and otherwise shown as
 * "Inflation adjustment", so the bars still add up without an unexplained row.
 */
export function flowSteps(rows: AccountYear[], liability: boolean, income: readonly LineItem[] = []): FlowStep[] {
  const sum = (pick: (r: AccountYear) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const open = sum((r) => r.open);
  const close = sum((r) => r.close);

  // `info` parts are shown but never move the running balance, so they stay out of `other` and the crumbs.
  let parts: { key: string; label: string; value: number; info?: boolean }[];
  if (liability) {
    // Principal is what the balance fell by, so a loan opened this year shows as Borrowed:
    // open + borrowed − principal = close.
    const principal = sum((r) => r.principal);
    parts = [
      { key: 'borrowed', label: 'Borrowed', value: Math.max(0, close - open + principal) },
      { key: 'paid', label: 'Principal paid', value: -principal },
      { key: 'interest', label: 'Interest (paid from cash)', value: sum((r) => r.interest), info: true },
    ];
  } else {
    const ids = new Set(rows.map((r) => r.accountId));
    const mine = income.filter((l) => l.accountId !== undefined && ids.has(l.accountId));
    const required = mine
      .filter((l) => l.category !== 'sepp' && l.label.startsWith('Required minimum distribution'))
      .reduce((a, l) => a + l.amount, 0);
    const sepp = mine.filter((l) => l.category === 'sepp').reduce((a, l) => a + l.amount, 0);
    const withdrawn = sum((r) => r.withdrawals);
    parts = [
      { key: 'contributions', label: 'Contributions', value: sum((r) => r.contributions) },
      { key: 'growth', label: 'Growth (net of fees)', value: sum((r) => r.growth) },
      { key: 'rmd', label: 'Required distributions', value: -required },
      { key: 'sepp', label: 'SEPP payments', value: -sepp },
      { key: 'withdrawals', label: 'Withdrawals', value: -(withdrawn - required - sepp) },
    ];
  }

  const other = close - open - parts.filter((p) => !p.info).reduce((a, p) => a + p.value, 0);
  const growth = parts.find((p) => p.key === 'growth');
  if (growth && Math.abs(other) < Math.max(1000, 0.005 * Math.abs(open))) {
    growth.value += other;
  } else if (Math.abs(other) >= MIN_ROW) {
    parts.push({ key: 'other', label: 'Inflation adjustment', value: other });
  }

  // A sub-dollar row isn't drawn, but its cents still move the running balance
  // somewhere: Growth (always drawn) takes them, so the bars land on `close`.
  const visible = (p: { key: string; value: number }) =>
    p.key === 'growth' || p.key === 'contributions' || Math.abs(p.value) >= MIN_ROW;
  const crumbs = parts.filter((p) => !p.info && !visible(p)).reduce((a, p) => a + p.value, 0);
  if (growth) growth.value += crumbs;

  let running = open;
  const steps: FlowStep[] = [{ key: 'open', label: 'Opening', value: open, kind: 'total', from: 0, to: open }];
  for (const p of parts) {
    if (!visible(p)) continue;
    const from = running;
    if (p.info) {
      steps.push({ key: p.key, label: p.label, value: p.value, kind: 'info', from, to: from });
      continue;
    }
    running += p.value;
    steps.push({ key: p.key, label: p.label, value: p.value, kind: p.value >= 0 ? 'in' : 'out', from, to: running });
  }
  steps.push({ key: 'close', label: 'Closing', value: close, kind: 'total', from: 0, to: close });
  return steps;
}

/**
 * One class's flow steps in year `index`. An account that starts this year
 * opens at its initial balance, not last year's close (0). That balance is
 * money put in this year: a loan borrowed, or a deposit made. So the class
 * reads the same whether the balances table or the account sheet asks.
 *
 * In the first projected year the prior close is `opening` ("today"), so an
 * account that is not open yet today (a loan taken out in the stub year) reads
 * as Borrowed or Additions there too. Without `opening` the first year is
 * taken as it comes.
 */
export function classFlowSteps(
  years: YearSnapshot[],
  index: number,
  accountClass: AccountClass,
  liability: boolean,
  opening?: OpeningSnapshot,
): FlowStep[] {
  const snapshot = years[index];
  const priorClose = (accountId: string): number | undefined => {
    if (index > 0) return years[index - 1].accounts.find((p) => p.accountId === accountId)?.close ?? 0;
    return opening ? (opening.accounts.find((p) => p.accountId === accountId)?.balance ?? 0) : undefined;
  };
  const rows = snapshot.accounts
    .filter((r) => r.accountClass === accountClass && r.isLiability === liability)
    .map((r) => {
      const before = priorClose(r.accountId);
      if (before === undefined) return r;
      const started = r.open - before;
      if (Math.abs(started) < 1) return r;
      return liability ? { ...r, open: before } : { ...r, open: before, contributions: r.contributions + started };
    });
  return flowSteps(rows, liability, snapshot.income);
}

/** One line under an account class in the balances table; `values` parallel the years. */
export interface AccountFlowRow {
  key: string;
  label: string;
  values: number[];
}

/**
 * The flows under one account class, year by year, for the balances table's
 * expanded rows. Each year's `flowSteps` is regrouped into the few lines a
 * reader scans, with the same signs the table prints: asset withdrawals
 * (required distributions, SEPP and plain withdrawals together) and principal
 * paid are negative. Assets get Additions, Withdrawals and Growth, plus
 * Inflation adjustment only when some year has one. Liabilities get Borrowed,
 * Principal paid and Interest.
 *
 * Filters by class the way `classBalances` does, so each year's flows
 * reconcile to the class row: last year's close + flows = close. The engine
 * opens a new account at its initial balance, so that balance is taken as
 * money in this year (Borrowed for a loan, Additions for a deposit).
 */
export function accountFlowRows(
  years: YearSnapshot[],
  accountClass: AccountClass,
  liability: boolean,
  opening?: OpeningSnapshot,
): AccountFlowRow[] {
  const perYear = years.map((_snapshot, i) => classFlowSteps(years, i, accountClass, liability, opening));
  const row = (key: string, label: string, keys: string[]): AccountFlowRow => ({
    key,
    label,
    values: perYear.map((steps) => steps.filter((s) => keys.includes(s.key)).reduce((a, s) => a + s.value, 0)),
  });

  if (liability) {
    return [
      row('borrowed', 'Borrowed', ['borrowed']),
      row('paid', 'Principal paid', ['paid']),
      row('interest', 'Interest (paid from cash)', ['interest']),
    ];
  }
  const rows = [
    row('additions', 'Additions', ['contributions']),
    row('withdrawals', 'Withdrawals', ['rmd', 'sepp', 'withdrawals']),
    row('growth', 'Growth (net of fees)', ['growth']),
  ];
  if (perYear.some((steps) => steps.some((s) => s.key === 'other'))) {
    rows.push(row('inflation', 'Inflation adjustment', ['other']));
  }
  return rows;
}

/**
 * The danger band re-unitised per month, for the sheets that sit over this
 * page's "/mo" figures (V5-REVIEW-2 N10). `shortFor` divides each short year's
 * unfunded total by that year's months.
 */
export function monthlyDangerBand(health: PlanHealth, plan: Plan, result: PlanResult): DangerBand | undefined {
  const band = healthDangerBand(health, result);
  if (!band) return undefined;
  const perMonth = new Map(result.years.map((y) => [y.year, (y.unfundedShortfall ?? 0) / (monthsIn(plan, y.year) || 12)]));
  return { ...band, shortFor: (year) => perMonth.get(year) };
}
