import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LineItem, PlanEvent, YearSnapshot } from '@northstar/engine';
import { DataTable, type TableRow } from './DataTable';
import { tableMoney, signedTableMoney, percent, ZERO_DASH } from '../format';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
import {
  lifeChangeRows,
  savedThisYear,
  savingsRateNote,
  savingsRatePercent,
  spendingThisYear,
  stubYearLabel,
} from '../ledger';
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
  highlightYear,
  onEdit,
  onEditAssumptions,
  startYear,
  asOfDate,
}: {
  window: YearSnapshot[];
  events: PlanEvent[];
  /** The scrubbed year (docs/REDESIGN.md §4.1) — null/undefined highlights
      nothing. */
  highlightYear?: number | null;
  onEdit(event: PlanEvent): void;
  onEditAssumptions(): void;
  /** The plan's own `settings.startYear`/`settings.asOfDate` — flags the
      stub first year's column header (docs/ROADMAP-10.md C7). Optional so a
      caller that hasn't wired them yet just gets no sub-label. */
  startYear?: number;
  asOfDate?: string;
}) {
  const years = window.map((y) => y.year);
  const rows: TableRow[] = [];
  const eventById = new Map(events.map((e) => [e.id, e]));
  // Which life-change rows are open (docs/REDESIGN-V4.md §1.5). Collapsed by
  // default: the point is one row per decision, with the detail on demand.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * Income or expense lines as life-change rows: one row per event, summed,
   * expandable into its own lines when it produced more than one.
   */
  const pushLines = (prefix: string, lines: GroupedLine[], tone: 'income' | 'cost') => {
    for (const row of lifeChangeRows(lines, (id) => eventById.get(id))) {
      const key = `${prefix}-${row.key}`;
      const open = expanded.has(key);
      rows.push({
        key,
        kind: 'child',
        label: row.parts ? (
          <span className="ns-group-cell">
            <button
              type="button"
              className="ns-group-toggle"
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${row.label}`}
              onClick={() => toggle(key)}
            >
              <ChevronRight size={13} strokeWidth={2} aria-hidden />
            </button>
            {rowLabel(row.label, row.sourceEventId)}
          </span>
        ) : (
          rowLabel(row.label, row.sourceEventId)
        ),
        cells: row.cells.map(tableMoney),
        values: row.cells,
        bar: { tone, direction: 'diverging' },
      });
      if (!row.parts || !open) continue;
      for (const part of row.parts) {
        rows.push({
          key: `${key}-${part.label}`,
          kind: 'grandchild',
          label: part.label,
          cells: part.cells.map(tableMoney),
        });
      }
    }
  };

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
  // Diverging (docs/REDESIGN.md §4.1): every income line grows toward the
  // SAME side, from a baseline shared across the whole table, so the table
  // as a whole reads as one two-sided chart rather than each row inventing
  // its own zero point the way Accounts' bars do.
  pushLines('i', groupLines(window, (y) => y.income), 'income');

  const expenseTotals = window.map((y) => spendingThisYear(y) + y.totalTaxes);
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
    values: window.map((y) => y.totalTaxes),
    bar: { tone: 'cost', direction: 'diverging' },
  });
  pushLines('e', groupLines(window, (y) => y.expenses), 'cost');

  const hasWithdrawals = window.some((y) => y.withdrawals.length > 0);
  if (hasWithdrawals) {
    rows.push({
      key: 'withdrawals',
      kind: 'group',
      label: 'Withdrawals',
      cells: window.map((y) => tableMoney(total(y.withdrawals))),
    });
    for (const { label, cells } of groupLines(window, (y) => y.withdrawals)) {
      rows.push({
        key: `w-${label}`,
        kind: 'child',
        label,
        cells: cells.map(tableMoney),
        // A withdrawal is money becoming available to spend that year —
        // the same direction as income, even though it's leaving an
        // account rather than being earned.
        values: cells,
        bar: { tone: 'income', direction: 'diverging' },
      });
    }
  }

  // Styled as a group row, the same weight as Income/Expenses above
  // (docs/REDESIGN-V3.md "Cash Flow" — "section headers Income / Expenses /
  // Savings styled as group rows") rather than the heavier tinted `total`
  // treatment `.ns-row-total` reserves for Accounts' Net worth line.
  rows.push({
    key: 'savings',
    kind: 'group',
    label: 'Savings',
    cells: window.map((y) => signedTableMoney(savedThisYear(y))),
    // The one row that can genuinely flip sign year to year — its bar's
    // side and tone follow each cell's own value rather than a fixed
    // per-row direction (see `RowBar.signed` in DataTable.tsx).
    values: window.map((y) => savedThisYear(y)),
    bar: { direction: 'diverging', signed: true },
  });
  rows.push({
    key: 'savings-rate',
    kind: 'child',
    label: 'Savings rate',
    cells: window.map((y) => {
      const rate = savingsRatePercent(y);
      return rate === undefined ? ZERO_DASH : percent(rate, 0);
    }),
    // A negative rate (a house-purchase year, say) reads as an error out of
    // context — this names what actually caused it (docs/ROADMAP-10.md C7).
    cellTitles: window.map((y) => savingsRateNote(y)),
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
      values: window.map((y) => y.unfundedShortfall ?? 0),
      bar: { tone: 'cost', direction: 'diverging' },
    });
  }

  // The page's SectionCard already titles this "Annual cash flow" — this
  // column header just needs to say what its own rows are.
  return (
    <DataTable
      caption="Category"
      years={years}
      rows={rows}
      highlightYear={highlightYear}
      columnSubLabel={
        startYear !== undefined ? (y) => stubYearLabel(y, startYear, asOfDate)?.short : undefined
      }
    />
  );
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
