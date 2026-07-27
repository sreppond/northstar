import type { LineItem, YearSnapshot } from '@northstar/engine';
import { DataTable, type TableRow } from './DataTable';
import { tableMoney, signedTableMoney } from '../format';

/**
 * The tab that pays off the engine's provenance work: every LineItem carries a
 * sourceEventId, so income and expenses break out by the event that caused
 * them instead of collapsing into two totals (docs/PLAN.md §4.7).
 */
export function CashFlowTab({ window }: { window: YearSnapshot[] }) {
  const years = window.map((y) => y.year);
  const rows: TableRow[] = [];

  rows.push({
    key: 'income',
    kind: 'group',
    label: 'Income',
    cells: window.map((y) => tableMoney(y.totalIncome)),
  });
  for (const [label, cells] of groupLines(window, (y) => y.income)) {
    rows.push({ key: `i-${label}`, kind: 'child', label, cells: cells.map(tableMoney) });
  }

  const expenseTotals = window.map((y) => y.totalExpenses + y.totalTaxes);
  rows.push({
    key: 'expenses',
    kind: 'group',
    label: 'Expenses',
    cells: expenseTotals.map(tableMoney),
  });
  rows.push({
    key: 'e-taxes',
    kind: 'child',
    label: 'Taxes',
    cells: window.map((y) => tableMoney(y.totalTaxes)),
  });
  for (const [label, cells] of groupLines(window, (y) => y.expenses)) {
    rows.push({ key: `e-${label}`, kind: 'child', label, cells: cells.map(tableMoney) });
  }

  const hasWithdrawals = window.some((y) => y.withdrawals.length > 0);
  if (hasWithdrawals) {
    rows.push({
      key: 'withdrawals',
      kind: 'group',
      label: 'Withdrawals',
      cells: window.map((y) => tableMoney(total(y.withdrawals))),
    });
    for (const [label, cells] of groupLines(window, (y) => y.withdrawals)) {
      rows.push({ key: `w-${label}`, kind: 'child', label, cells: cells.map(tableMoney) });
    }
  }

  rows.push({
    key: 'net',
    kind: 'total',
    label: 'Net cash flow',
    cells: window.map((y) => signedTableMoney(y.netCashFlow)),
  });

  const shortfalls = window.filter((y) => y.unfundedShortfall);
  if (shortfalls.length > 0) {
    rows.push({
      key: 'shortfall',
      kind: 'child',
      label: 'Unfunded shortfall',
      // A year with no shortfall now falls out as the same en-dash every other
      // nil cell uses, so this no longer needs its own placeholder.
      cells: window.map((y) => tableMoney(y.unfundedShortfall ?? 0)),
    });
  }

  return <DataTable caption="Annual cash flow" years={years} rows={rows} />;
}

/**
 * Collapse line items to one row per distinct label, aligned across the
 * window. Rows that are zero everywhere in view are dropped.
 */
function groupLines(
  window: YearSnapshot[],
  pick: (snapshot: YearSnapshot) => LineItem[],
): [string, number[]][] {
  const labels: string[] = [];
  for (const snapshot of window) {
    for (const item of pick(snapshot)) {
      if (!labels.includes(item.label)) labels.push(item.label);
    }
  }

  return labels
    .map((label): [string, number[]] => [
      label,
      window.map((snapshot) =>
        pick(snapshot)
          .filter((i) => i.label === label)
          .reduce((sum, i) => sum + i.amount, 0),
      ),
    ])
    .filter(([, cells]) => cells.some((v) => Math.abs(v) >= 1));
}

function total(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}
