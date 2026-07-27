import type { LineItem, PlanEvent, YearSnapshot } from '@northstar/engine';
import { DataTable, type TableRow } from './DataTable';
import { tableMoney, signedTableMoney } from '../format';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
import type { Detail } from '../detail';

/**
 * Rows the engine produces from plan settings rather than from an event, so
 * their gear belongs to the assumptions drawer. Matched by the exact labels
 * `run.ts` emits — see steps 3, 4 and 7 of the year loop.
 */
const PLAN_DRIVEN = new Set(['Living expenses', 'Baseline income', 'Taxes']);

/**
 * The tab that pays off the engine's provenance work: every LineItem carries a
 * sourceEventId, so income and expenses break out by the event that caused
 * them instead of collapsing into two totals (docs/PLAN.md §4.7).
 */
export function CashFlowTab({
  window,
  events,
  onEdit,
  onEditAssumptions,
}: {
  window: YearSnapshot[];
  events: PlanEvent[];
  onEdit(event: PlanEvent): void;
  onEditAssumptions(): void;
}) {
  const years = window.map((y) => y.year);
  const rows: TableRow[] = [];
  const eventById = new Map(events.map((e) => [e.id, e]));

  /**
   * Every cash flow row carries a gear, and it always leads somewhere useful:
   * to the event that produced the line, or — for baseline living costs, tax
   * and baseline income — to the plan assumptions that did.
   */
  const rowLabel = (label: string, sourceEventId?: string) => {
    const event = sourceEventId ? eventById.get(sourceEventId) : undefined;
    if (event) {
      return (
        <LineLabel
          text={label}
          detail={eventDetail(event)}
          ariaLabel={`${event.name} settings`}
          onClick={() => onEdit(event)}
        />
      );
    }
    if (PLAN_DRIVEN.has(label)) {
      return (
        <LineLabel
          text={label}
          ariaLabel={`${label} — plan assumptions`}
          onClick={onEditAssumptions}
        />
      );
    }
    return label;
  };

  rows.push({
    key: 'income',
    kind: 'group',
    label: 'Income',
    cells: window.map((y) => tableMoney(y.totalIncome)),
  });
  for (const { label, cells, sourceEventId } of groupLines(window, (y) => y.income)) {
    rows.push({
      key: `i-${label}`,
      kind: 'child',
      label: rowLabel(label, sourceEventId),
      cells: cells.map(tableMoney),
    });
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
    label: rowLabel('Taxes'),
    cells: window.map((y) => tableMoney(y.totalTaxes)),
  });
  for (const { label, cells, sourceEventId } of groupLines(window, (y) => y.expenses)) {
    rows.push({
      key: `e-${label}`,
      kind: 'child',
      label: rowLabel(label, sourceEventId),
      cells: cells.map(tableMoney),
    });
  }

  const hasWithdrawals = window.some((y) => y.withdrawals.length > 0);
  if (hasWithdrawals) {
    rows.push({
      key: 'withdrawals',
      kind: 'group',
      label: 'Withdrawals',
      cells: window.map((y) => tableMoney(total(y.withdrawals))),
    });
    for (const { label, cells } of groupLines(window, (y) => y.withdrawals)) {
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

/** A cash flow row label with its gear. Detail is optional — the assumptions
 *  rows have no single event to describe, so they get the gear alone. */
function LineLabel({
  text,
  detail,
  ariaLabel,
  onClick,
}: {
  text: string;
  detail?: Detail;
  ariaLabel: string;
  onClick(): void;
}) {
  const gear = (
    <button type="button" className="ns-gear" aria-label={ariaLabel} onClick={onClick}>
      <GearIcon />
    </button>
  );

  return (
    <span className="ns-line-cell">
      <span className="ns-line-name" title={text}>
        {text}
      </span>
      {detail ? <HoverCard detail={detail}>{gear}</HoverCard> : gear}
    </span>
  );
}

export interface GroupedLine {
  label: string;
  cells: number[];
  /**
   * The event that produced this line, when there is one. Baseline living
   * expenses and income tax have none — they come from plan settings, and the
   * gear on those rows opens the assumptions drawer instead.
   */
  sourceEventId?: string;
}

/**
 * Collapse line items to one row per distinct label, aligned across the
 * window. Rows that are zero everywhere in view are dropped.
 */
function groupLines(
  window: YearSnapshot[],
  pick: (snapshot: YearSnapshot) => LineItem[],
): GroupedLine[] {
  const labels: string[] = [];
  const sourceByLabel = new Map<string, string | undefined>();

  for (const snapshot of window) {
    for (const item of pick(snapshot)) {
      if (!labels.includes(item.label)) {
        labels.push(item.label);
        sourceByLabel.set(item.label, item.sourceEventId);
      }
    }
  }

  return labels
    .map((label) => ({
      label,
      sourceEventId: sourceByLabel.get(label),
      cells: window.map((snapshot) =>
        pick(snapshot)
          .filter((i) => i.label === label)
          .reduce((sum, i) => sum + i.amount, 0),
      ),
    }))
    .filter(({ cells }) => cells.some((v) => Math.abs(v) >= 1));
}

function total(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}
