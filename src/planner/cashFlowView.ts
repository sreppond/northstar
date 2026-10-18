/**
 * The numbers behind the Cash Flow page (docs/REDESIGN-V5.md §5.2): one year's
 * flow for the waterfall and readout, the grouped row tree for the table, and
 * the /mo divisor. Pure, so the reconciliation is tested without a component.
 *
 * Nothing here classifies money itself. Spending groups come from
 * `spendingGroups` (§7.1; a single-item snapshot gives one line's group, so a
 * line can never land in two places) and tax comes from `incomeWithTax` (§7.2).
 * What this adds is the arithmetic that ties them to the engine's totals:
 *
 *   gross       = totalIncome
 *   after tax   = gross - (totalTaxes - withdrawalTax)
 *   saved       = after tax - withdrawal tax - spending      (= `savedThisYear`)
 *
 * Withdrawal tax is a cost of covering a gap, not a tax on income, so it hangs
 * under Withdrawals rather than under the income it didn't come from.
 */
import type { LineItem, Plan, YearSnapshot } from '@northstar/engine';
import { SAVED_COLOR } from './budgetView';
import { incomeWithTax } from './incomeTax';
import { spendingGroups, type GroupKey } from './spendingGroups';

/** What a waterfall bar and a table row can both point at (shared hover). */
export type FlowKey =
  | 'gross'
  | 'tax'
  | 'afterTax'
  | 'home'
  | 'kids'
  | 'shared'
  | 'personal'
  | 'oneTime'
  | 'wtax'
  | 'saved'
  | 'unfunded';

export type SpendKey = Exclude<GroupKey, 'saving'>;

export interface FlowGroup {
  key: SpendKey;
  label: string;
  color: string;
  total: number;
}

export interface YearFlow {
  year: number;
  /** `snapshot.totalIncome`. */
  gross: number;
  /** Tax on income: every tax line but the withdrawal tax. */
  incomeTax: number;
  /** Tax paid on money drawn from accounts to cover a gap. */
  withdrawalTax: number;
  afterTax: number;
  /** Spending groups, saving left out, in display order. */
  groups: FlowGroup[];
  spent: number;
  /** The `saving` group: contributions routed into accounts on purpose. */
  savedOnPurpose: number;
  /**
   * Lump sums inside `spent` (a down payment, arrival costs, annuity charges):
   * the same lines Budget sets apart as `oneTime`. The hero chart draws
   * `spent - lumps` as a line and these as capped columns, so one lump cannot
   * flatten sixty years of living costs (V5-REVIEW-1 F11).
   */
  lumps: number;
  /** After tax, less withdrawal tax and spending. Negative is a draw-down. */
  saved: number;
  /** `snapshot.unfundedShortfall`, 0 when the year is funded. */
  unfunded: number;
}

/** budgetView.ts's `oneTime` rule: a lump sum, or an annuity surrender charge. */
const isLump = (item: LineItem) => !!item.oneTime || item.category === 'annuityCharge';

export function yearFlow(plan: Plan, snapshot: YearSnapshot): YearFlow {
  const inc = incomeWithTax(snapshot);
  const incomeTax = inc.total.tax - inc.withdrawalTax;
  const all = spendingGroups(plan, snapshot);
  const groups = all
    .filter((g): g is typeof g & { key: SpendKey } => g.key !== 'saving')
    .map((g) => ({ key: g.key, label: g.label, color: g.color, total: g.total }));
  const spent = groups.reduce((sum, g) => sum + g.total, 0);
  const afterTax = inc.total.gross - incomeTax;
  return {
    year: snapshot.year,
    gross: inc.total.gross,
    incomeTax,
    withdrawalTax: inc.withdrawalTax,
    afterTax,
    groups,
    spent,
    savedOnPurpose: all.find((g) => g.key === 'saving')?.total ?? 0,
    lumps: snapshot.expenses.filter(isLump).reduce((sum, e) => sum + e.amount, 0),
    saved: afterTax - inc.withdrawalTax - spent,
    unfunded: snapshot.unfundedShortfall ?? 0,
  };
}

// --- /mo -------------------------------------------------------------------

/**
 * Months a year's figures cover. The plan's first year runs from `asOfDate`
 * to Dec 31, so its income and spending are a fraction of a year; dividing
 * that by 12 would show a /mo number a third too low (docs/MATH.md "Today vs.
 * years[0]"). Every other year is 12.
 */
export function monthsInYear(year: number, startYear: number, asOfDate?: string): number {
  if (year !== startYear || !asOfDate) return 12;
  const [y, m, d] = asOfDate.split('-').map(Number);
  if (y !== startYear || !m || !d) return 12;
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  const daysInYear = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000);
  const remaining = daysInYear - dayOfYear + 1;
  return Math.max(0.25, (12 * remaining) / daysInYear);
}

// --- the waterfall ----------------------------------------------------------

export interface WaterfallBarSpec {
  key: FlowKey;
  label: string;
  /** `delta` floats between the running totals; `total` stands on zero. */
  kind: 'total' | 'delta';
  /** The bar spans these two values on the running scale. */
  from: number;
  to: number;
  /** Signed amount printed on the bar: negative takes money away. */
  amount: number;
  color: string;
  tone?: 'danger';
  /** A total split in two (saved: on purpose, and what was left over). */
  segments?: { from: number; to: number; color: string }[];
  note?: string;
}

const EPS = 0.5;

/**
 * Gross -> tax -> after tax -> each spending group -> where the year ended up.
 * A short year ends on a red "Unfunded" bar: the draw-down that the accounts
 * covered, then what they could not (docs/REDESIGN-V5.md §5.2, §4.2).
 */
export function waterfallBars(flow: YearFlow, noteMoney: (v: number) => string): WaterfallBarSpec[] {
  const bars: WaterfallBarSpec[] = [];
  bars.push({ key: 'gross', label: 'Gross', kind: 'total', from: 0, to: flow.gross, amount: flow.gross, color: 'var(--in)' });
  if (flow.incomeTax > EPS) {
    bars.push({
      key: 'tax',
      label: 'Tax',
      kind: 'delta',
      from: flow.gross,
      to: flow.afterTax,
      amount: -flow.incomeTax,
      color: 'var(--out)',
    });
  }
  bars.push({ key: 'afterTax', label: 'After tax', kind: 'total', from: 0, to: flow.afterTax, amount: flow.afterTax, color: 'var(--in)' });

  let running = flow.afterTax;
  for (const g of flow.groups) {
    if (g.total < EPS) continue;
    bars.push({ key: g.key, label: g.label, kind: 'delta', from: running, to: running - g.total, amount: -g.total, color: g.color });
    running -= g.total;
  }
  if (flow.withdrawalTax > EPS) {
    bars.push({
      key: 'wtax',
      label: 'Tax on withdrawals',
      kind: 'delta',
      from: running,
      to: running - flow.withdrawalTax,
      amount: -flow.withdrawalTax,
      color: 'var(--out)',
    });
    running -= flow.withdrawalTax;
  }

  if (running >= -EPS) {
    const onPurpose = flow.savedOnPurpose;
    const split = onPurpose > EPS && onPurpose < running - EPS;
    bars.push({
      key: 'saved',
      label: 'Saved',
      kind: 'total',
      from: 0,
      to: Math.max(0, running),
      amount: Math.max(0, running),
      color: SAVED_COLOR,
      ...(split
        ? {
            segments: [
              { from: 0, to: onPurpose, color: SAVED_COLOR },
              { from: onPurpose, to: running, color: 'color-mix(in srgb, var(--in) 50%, var(--surface))' },
            ],
          }
        : {}),
      ...(onPurpose > EPS ? { note: `${noteMoney(Math.min(onPurpose, running))} on purpose` } : {}),
    });
  } else {
    const deficit = -running;
    const unfunded = Math.min(flow.unfunded, deficit);
    const covered = deficit - unfunded;
    if (covered > EPS || unfunded <= EPS) {
      bars.push({
        key: 'saved',
        label: 'Drawn down',
        kind: 'total',
        from: 0,
        to: -covered,
        amount: -covered,
        color: 'var(--out)',
      });
    }
    if (unfunded > EPS) {
      bars.push({
        key: 'unfunded',
        label: 'Unfunded',
        kind: 'delta',
        from: -covered,
        to: -deficit,
        amount: -unfunded,
        color: 'var(--danger)',
        tone: 'danger',
      });
    }
  }
  return bars;
}

// --- the table's row tree ---------------------------------------------------

export interface FlowNode {
  /** Unique across the tree; the table's expand state is keyed by it. */
  key: string;
  label: string;
  /** One per year, parallel to the years passed in. */
  values: number[];
  children?: FlowNode[];
  /** Hover-links this row to a waterfall bar. */
  link?: FlowKey;
  /** The gear opens this event. */
  sourceEventId?: string;
  /** The gear opens the plan assumptions (baseline lines have no event). */
  planDriven?: boolean;
  /** `taxShare` carries the "brackets are household-wide" hover card. */
  note?: 'taxShare';
  /** Print negative (a deduction under a net headline). */
  negate?: boolean;
}

export interface CashFlowTree {
  years: number[];
  /** After-tax income: the headline, with one node per source under it. */
  income: FlowNode;
  /** Spending, saving left out: Home, Kids, Shared, Personal, One-time. */
  spending: FlowNode;
  saving?: FlowNode;
  withdrawals?: FlowNode;
  /** Present only when some year is short. */
  unfunded?: number[];
  /** `flow.saved` per year. */
  saved: number[];
  flows: YearFlow[];
}

const SPEND_ORDER: SpendKey[] = ['home', 'kids', 'shared', 'personal', 'oneTime'];
const GROUP_LABEL: Record<SpendKey, string> = {
  home: 'Home',
  kids: 'Kids',
  shared: 'Shared living',
  personal: 'Personal',
  oneTime: 'One-time',
};
/** Rows the engine writes from plan settings, not from an event: their gear opens the assumptions. */
const PLAN_DRIVEN = new Set(['Living expenses', 'Baseline income']);

interface Acc {
  key: string;
  label: string;
  values: number[];
  sourceEventId?: string;
}

const isZero = (values: number[]) => values.every((v) => Math.abs(v) < 1);
const total = (values: number[]) => values.reduce((a, b) => a + b, 0);

function accumulate(map: Map<string, Acc>, key: string, label: string, i: number, n: number, amount: number, sourceEventId?: string) {
  let acc = map.get(key);
  if (!acc) {
    acc = { key, label, values: new Array<number>(n).fill(0), ...(sourceEventId ? { sourceEventId } : {}) };
    map.set(key, acc);
  }
  acc.values[i] += amount;
}

/**
 * How an income source reads in the tree (V5-REVIEW-2 N5). The engine's label
 * is "Required minimum distribution — Tax-deferred investments", which truncated
 * to "Required minimum distribution — T…" and read as an ordinary withdrawal. As
 * "Required distributions · Tax-deferred investments" it says what the money is
 * and which account it came from, and fits.
 */
export function incomeSourceLabel(label: string): string {
  const m = /^Required minimum distribution — (.+)$/.exec(label);
  return m ? `Required distributions · ${m[1]}` : label;
}

function lineNodes(prefix: string, map: Map<string, Acc>): FlowNode[] {
  return [...map.values()]
    .filter((a) => !isZero(a.values))
    .sort((a, b) => total(b.values) - total(a.values))
    .map((a) => ({
      key: `${prefix}:${a.key}`,
      label: a.label,
      values: a.values,
      ...(a.sourceEventId ? { sourceEventId: a.sourceEventId } : {}),
      ...(PLAN_DRIVEN.has(a.label) ? { planDriven: true } : {}),
    }));
}

export function cashFlowTree(plan: Plan, snapshots: YearSnapshot[]): CashFlowTree {
  const n = snapshots.length;
  const flows = snapshots.map((s) => yearFlow(plan, s));
  const people = plan.participants.filter((p) => p.isIncluded);
  const personIndex = new Map(people.map((p, i) => [p.id, i]));
  const eventName = new Map(plan.events.map((e) => [e.id, e.name]));

  // --- income -------------------------------------------------------------
  interface SourceAcc {
    key: string;
    label: string;
    gross: number[];
    tax: number[];
    sourceEventId?: string;
  }
  const sources = new Map<string, SourceAcc>();
  snapshots.forEach((s, i) => {
    for (const src of incomeWithTax(s).sources) {
      let acc = sources.get(src.key);
      if (!acc) {
        acc = {
          key: src.key,
          label: src.label,
          gross: new Array<number>(n).fill(0),
          tax: new Array<number>(n).fill(0),
          ...(src.sourceEventId ? { sourceEventId: src.sourceEventId } : {}),
        };
        sources.set(src.key, acc);
      }
      acc.gross[i] += src.gross;
      acc.tax[i] += src.tax;
    }
  });
  const incomeChildren: FlowNode[] = [...sources.values()]
    .filter((a) => !isZero(a.gross) || !isZero(a.tax))
    .map((a) => ({
      key: `income:${a.key}`,
      label: incomeSourceLabel(a.label),
      values: a.gross.map((g, i) => g - a.tax[i]),
      ...(a.sourceEventId ? { sourceEventId: a.sourceEventId } : {}),
      ...(PLAN_DRIVEN.has(a.label) ? { planDriven: true } : {}),
      children: [
        { key: `income:${a.key}:gross`, label: 'Gross', values: a.gross, link: 'gross' as const },
        { key: `income:${a.key}:tax`, label: 'Tax (share)', values: a.tax, link: 'tax' as const, note: 'taxShare' as const, negate: true },
      ],
    }));

  // --- spending -----------------------------------------------------------
  // One bucket per line: a kid's (or an adult's) lines nest under that person.
  const lineMaps = new Map<GroupKey, Map<string, Acc>>();
  interface Bucket {
    key: string;
    label: string;
    order: number;
    lines: Map<string, Acc>;
  }
  const buckets = new Map<GroupKey, Map<string, Bucket>>();
  snapshots.forEach((s, i) => {
    for (const item of s.expenses) {
      const group = groupOf(plan, s, item);
      const owner = item.ownerId ? people.find((p) => p.id === item.ownerId) : undefined;
      // Same rule as spendingGroups: kids/personal lines with an owner (or an
      // event) fold under that person (or event).
      if ((group === 'kids' || group === 'personal') && (owner || item.sourceEventId)) {
        const bucketKey = owner ? `person:${owner.id}` : `event:${item.sourceEventId}`;
        const byKey = buckets.get(group) ?? new Map<string, Bucket>();
        buckets.set(group, byKey);
        let b = byKey.get(bucketKey);
        if (!b) {
          b = {
            key: bucketKey,
            label: owner ? owner.name : (eventName.get(item.sourceEventId!) ?? item.label),
            order: owner ? (personIndex.get(owner.id) ?? 0) : 1000 + byKey.size,
            lines: new Map(),
          };
          byKey.set(bucketKey, b);
        }
        accumulate(b.lines, `${item.sourceEventId ?? ''}|${item.label}`, item.label, i, n, item.amount, item.sourceEventId);
        continue;
      }
      const map = lineMaps.get(group) ?? new Map<string, Acc>();
      lineMaps.set(group, map);
      accumulate(map, `${item.sourceEventId ?? ''}|${item.label}`, item.label, i, n, item.amount, item.sourceEventId);
    }
  });

  const groupNode = (key: SpendKey): FlowNode | undefined => {
    const values = flows.map((f) => f.groups.find((g) => g.key === key)?.total ?? 0);
    if (isZero(values)) return undefined;
    const bucketNodes: FlowNode[] = [...(buckets.get(key)?.values() ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((b) => {
        const kids = lineNodes(`spend:${key}:${b.key}`, b.lines);
        return {
          key: `spend:${key}:${b.key}`,
          label: b.label,
          values: kids.reduce((acc, k) => acc.map((v, i) => v + k.values[i]), new Array<number>(n).fill(0)),
          children: kids,
        };
      })
      .filter((b) => !isZero(b.values));
    const lines = lineNodes(`spend:${key}`, lineMaps.get(key) ?? new Map());
    return { key: `spend:${key}`, label: GROUP_LABEL[key], values, link: key, children: [...bucketNodes, ...lines] };
  };
  const spendChildren = SPEND_ORDER.map(groupNode).filter((g): g is FlowNode => g !== undefined);

  // --- saving on purpose --------------------------------------------------
  const savingValues = flows.map((f) => f.savedOnPurpose);
  const savingLines = lineNodes('saving', lineMaps.get('saving') ?? new Map());
  const saving: FlowNode | undefined = isZero(savingValues)
    ? undefined
    : { key: 'saving', label: 'Saved on purpose', values: savingValues, link: 'saved', children: savingLines };

  // --- withdrawals --------------------------------------------------------
  const wdMap = new Map<string, Acc>();
  snapshots.forEach((s, i) => {
    for (const w of s.withdrawals) accumulate(wdMap, w.label, w.label, i, n, w.amount, w.sourceEventId);
  });
  const wdLines = lineNodes('wd', wdMap);
  const wtax = flows.map((f) => f.withdrawalTax);
  const wdTotal = snapshots.map((s) => s.withdrawals.reduce((sum, w) => sum + w.amount, 0));
  const withdrawals: FlowNode | undefined = isZero(wdTotal)
    ? undefined
    : {
        key: 'withdrawals',
        label: 'Withdrawals',
        values: wdTotal,
        children: [
          ...wdLines,
          ...(isZero(wtax) ? [] : [{ key: 'wd:tax', label: 'Withdrawal tax', values: wtax, link: 'wtax' as const, negate: true }]),
        ],
      };

  const shortfalls = snapshots.map((s) => s.unfundedShortfall ?? 0);

  return {
    years: snapshots.map((s) => s.year),
    income: {
      key: 'income',
      label: 'Income (after tax)',
      values: flows.map((f) => f.afterTax),
      link: 'afterTax',
      children: incomeChildren,
    },
    spending: { key: 'spending', label: 'Spending', values: flows.map((f) => f.spent), children: spendChildren },
    ...(saving ? { saving } : {}),
    ...(withdrawals ? { withdrawals } : {}),
    ...(shortfalls.some((v) => v > 0) ? { unfunded: shortfalls } : {}),
    saved: flows.map((f) => f.saved),
    flows,
  };
}

/** Which spending group one line belongs to, by asking `spendingGroups` about a snapshot holding only it. */
function groupOf(plan: Plan, snapshot: YearSnapshot, item: LineItem): GroupKey {
  return spendingGroups(plan, { ...snapshot, expenses: [item] })[0].key;
}
