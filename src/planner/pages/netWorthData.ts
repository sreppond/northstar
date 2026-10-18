/**
 * Pure derivations for the Net Worth page and its sheets (docs/REDESIGN-V5.md
 * §5.1). Split out of the components so the pieces with real logic — which
 * account classes to show, the spending donut's stable slice set, the account
 * sheet's waterfall — are written once and tested without a component tree.
 */
import type {
  Account,
  AccountClass,
  AccountYear,
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
import { spendingGroups, type GroupKey, type SpendingGroup } from '../spendingGroups';

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

/* --- spending donut -------------------------------------------------------- */

/** Display order of the spending slices; `saving` is deliberately absent (it isn't spending). */
const SPENDING_ORDER: Exclude<GroupKey, 'saving'>[] = ['home', 'kids', 'shared', 'personal', 'oneTime'];

export const UNFUNDED_KEY = 'unfunded';

export interface SpendingModel {
  /** Slices that have money in at least one year, in display order. Stable across years. */
  meta: { key: Exclude<GroupKey, 'saving'>; label: string; color: string }[];
  /** Per `result.years` index: that year's groups, `saving` removed. */
  groups: SpendingGroup[][];
  /** Months in each year (a stub first year is short), the divisor for the monthly view. */
  months: number[];
}

export function spendingModel(plan: Plan, result: PlanResult): SpendingModel {
  const groups = result.years.map((snapshot) => spendingGroups(plan, snapshot).filter((g) => g.key !== 'saving'));
  const seen = new Map<string, SpendingGroup>();
  for (const perYear of groups) {
    for (const g of perYear) if (g.total > 0 && !seen.has(g.key)) seen.set(g.key, g);
  }
  const meta = SPENDING_ORDER.filter((k) => seen.has(k)).map((key) => {
    const g = seen.get(key)!;
    return { key, label: g.label, color: g.color };
  });
  return { meta, groups, months: result.years.map((y) => monthsIn(plan, y.year) || 12) };
}

/** A group's monthly total per year, zero where it has nothing: the category sheet's line. */
export function groupMonthlySeries(model: SpendingModel, key: string): number[] {
  return model.groups.map((perYear, i) => (perYear.find((g) => g.key === key)?.total ?? 0) / model.months[i]);
}

/* --- account sheet waterfall ---------------------------------------------- */

export interface FlowStep {
  key: string;
  label: string;
  /** Signed contribution to the balance; for `open` and `close`, the balance itself. */
  value: number;
  kind: 'total' | 'in' | 'out';
  /** Where the bar starts and ends on the running balance. */
  from: number;
  to: number;
}

/**
 * Open -> contributions -> growth -> withdrawals -> close for one class in one
 * year (docs/REDESIGN-V5.md §5.1.4), summed over its accounts. A liability
 * flows differently — interest is paid in cash, only the principal moves the
 * balance — so it gets its own steps. Anything the engine moved that these don't name lands in
 * "Other" rather than the bars quietly failing to add up.
 */
export function flowSteps(rows: AccountYear[], liability: boolean): FlowStep[] {
  const sum = (pick: (r: AccountYear) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const open = sum((r) => r.open);
  const close = sum((r) => r.close);

  const parts: { key: string; label: string; value: number }[] = liability
    ? [{ key: 'paid', label: 'Principal paid', value: -sum((r) => r.principal) }]
    : [
        { key: 'contributions', label: 'Contributions', value: sum((r) => r.contributions) },
        { key: 'growth', label: 'Growth', value: sum((r) => r.growth) },
        { key: 'withdrawals', label: 'Withdrawals', value: -sum((r) => r.withdrawals) },
      ];
  const named = parts.reduce((a, p) => a + p.value, 0);
  const other = close - open - named;
  if (Math.abs(other) >= 1) parts.push({ key: 'other', label: 'Other', value: other });

  let running = open;
  const steps: FlowStep[] = [{ key: 'open', label: 'Opening', value: open, kind: 'total', from: 0, to: open }];
  for (const p of parts) {
    if (Math.abs(p.value) < 0.5 && p.key !== 'growth' && p.key !== 'contributions') continue;
    const from = running;
    running += p.value;
    steps.push({ ...p, kind: p.value >= 0 ? 'in' : 'out', from, to: running });
  }
  steps.push({ key: 'close', label: 'Closing', value: close, kind: 'total', from: 0, to: close });
  return steps;
}
