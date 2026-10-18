import { useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { PlanEvent, YearSnapshot } from '@northstar/engine';
import { DataTable, type TableRow } from './DataTable';
import { tableMoney, signedTableMoney, percent, ZERO_DASH } from '../format';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
import { savingsRateNote, savingsRatePercent, stubYearLabel } from '../ledger';
import type { CashFlowTree, FlowKey, FlowNode } from '../cashFlowView';

/**
 * Cash Flow's year-by-year table (docs/REDESIGN-V5.md §5.2): every year in a
 * sideways-scrolling `DataTable`, in groups that open on demand.
 *
 * Top to bottom: Income (after tax) with one row per source and its gross and
 * tax underneath, Spending by group, Saved on purpose, Withdrawals, then the
 * totals. Tax lives under the income it came from, so there is no standalone
 * Taxes row (§7.2). Unfunded sits above the net line, in red, and only
 * exists when a year is short (§4.2 item 7).
 *
 * Rows are tagged `data-cf-row` on their label so the page can hover-link a
 * row to its waterfall bar without `DataTable` knowing about either.
 */
export function CashFlowTab({
  tree,
  snapshots,
  events,
  perColumn,
  focusYear,
  onFocusYear,
  dangerYears,
  hot,
  onHot,
  onEdit,
  onEditAssumptions,
  startYear,
  asOfDate,
}: {
  tree: CashFlowTree;
  /** The same years `tree` was built from, for the savings-rate cells. */
  snapshots: YearSnapshot[];
  events: PlanEvent[];
  /** What each column's figures are divided by: months in the year for /mo, else 1. */
  perColumn: number[];
  focusYear?: number | null;
  onFocusYear?(year: number | null): void;
  dangerYears?: number[];
  /** The waterfall bar being pointed at, so its row can light up. */
  hot: FlowKey | null;
  onHot(key: FlowKey | null): void;
  onEdit(event: PlanEvent): void;
  onEditAssumptions(): void;
  startYear?: number;
  asOfDate?: string;
}) {
  const eventById = new Map(events.map((e) => [e.id, e]));
  // Income and Spending open; everything under them is one click away.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['income', 'spending']));
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows: TableRow[] = [];
  const scaled = (values: number[]) => values.map((v, i) => v / perColumn[i]);

  const labelFor = (node: FlowNode, depth: number, open: boolean, link: FlowKey | undefined): ReactNode => {
    const event = node.sourceEventId ? eventById.get(node.sourceEventId) : undefined;
    const hasKids = !!node.children?.length;

    let name: ReactNode = (
      <span className="ns-line-name" title={node.label}>
        {node.label}
      </span>
    );
    if (node.note === 'taxShare') {
      name = (
        <HoverCard content={<TaxShareNote />} side="bottom">
          <span className="ns-line-name ns-cf-hint" tabIndex={0}>
            {node.label}
          </span>
        </HoverCard>
      );
    }

    let gear: ReactNode = null;
    if (event) {
      gear = (
        <HoverCard detail={eventDetail(event)}>
          <button type="button" className="ns-gear" aria-label={`${event.name} settings`} onClick={() => onEdit(event)}>
            <GearIcon />
          </button>
        </HoverCard>
      );
    } else if (node.planDriven || node.note === 'taxShare') {
      gear = (
        <button
          type="button"
          className="ns-gear"
          aria-label={`${node.label}: plan assumptions`}
          onClick={onEditAssumptions}
        >
          <GearIcon />
        </button>
      );
    }

    return (
      <span className="ns-cf-label" data-cf-row={link} style={{ paddingLeft: depth * 16 }}>
        {hasKids ? (
          <button
            type="button"
            className="ns-group-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`}
            onClick={() => toggle(node.key)}
          >
            <ChevronRight size={13} strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="ns-cf-spacer" aria-hidden="true" />
        )}
        {name}
        {gear}
      </span>
    );
  };

  /** One node, then (if open) its children, depth-first. */
  const push = (node: FlowNode, depth: number, tone: 'income' | 'cost', inherited?: FlowKey) => {
    const link = node.link ?? inherited;
    const open = expanded.has(node.key);
    const display = node.negate ? node.values.map((v) => -v) : node.values;
    const kind: TableRow['kind'] = depth === 0 ? 'group' : depth === 1 ? 'child' : 'grandchild';
    const shown = scaled(display);
    rows.push({
      key: node.key,
      kind,
      label: labelFor(node, depth, open, link),
      cells: shown.map((v) => (node.negate ? signedTableMoney(v) : tableMoney(v))),
      ...(depth === 1 ? { values: node.values, bar: { tone: node.negate ? 'cost' : tone, direction: 'diverging' as const } } : {}),
    });
    if (open) for (const child of node.children ?? []) push(child, depth + 1, tone, link);
  };

  push(tree.income, 0, 'income');
  push(tree.spending, 0, 'cost');
  if (tree.saving) push(tree.saving, 0, 'cost');
  if (tree.withdrawals) push(tree.withdrawals, 0, 'income');

  if (tree.unfunded) {
    rows.push({
      key: 'unfunded',
      kind: 'group',
      label: (
        <span className="ns-cf-label" data-cf-row="unfunded">
          <span className="ns-cf-spacer" aria-hidden="true" />
          <span className="ns-line-name">
            <span aria-hidden="true">✗</span> Unfunded
          </span>
        </span>
      ),
      cells: scaled(tree.unfunded).map(tableMoney),
    });
  }

  rows.push({
    key: 'saved',
    kind: 'total',
    label: (
      <span className="ns-cf-label" data-cf-row="saved">
        <span className="ns-cf-spacer" aria-hidden="true" />
        <span className="ns-line-name">Saved / drawn down</span>
      </span>
    ),
    cells: scaled(tree.saved).map(signedTableMoney),
    // The one row that flips sign year to year: each cell's own sign picks its side.
    values: tree.saved,
    bar: { direction: 'diverging', signed: true },
  });
  rows.push({
    key: 'rate',
    kind: 'child',
    label: 'Savings rate',
    cells: snapshots.map((s) => {
      const rate = savingsRatePercent(s);
      return rate === undefined ? ZERO_DASH : percent(rate, 0);
    }),
    // A negative rate reads as an error out of context; this names its cause.
    cellTitles: snapshots.map((s) => savingsRateNote(s)),
  });

  const hotRow = (e: PointerEvent<HTMLDivElement>) => {
    const grid = (e.target as HTMLElement).closest('.ns-grid');
    const key = grid?.querySelector<HTMLElement>('[data-cf-row]')?.dataset.cfRow as FlowKey | undefined;
    onHot(key ?? null);
  };

  return (
    <div className="ns-cf-table" data-hot={hot ?? undefined} onPointerOver={hotRow} onPointerLeave={() => onHot(null)}>
      <DataTable
        caption="Per year"
        years={tree.years}
        rows={rows}
        focusYear={focusYear}
        onFocusYear={onFocusYear}
        dangerYears={dangerYears}
        columnSubLabel={startYear !== undefined ? (y) => stubYearLabel(y, startYear, asOfDate)?.short : undefined}
      />
    </div>
  );
}

/** Why "Tax (share)" is a share and not a bill (docs/REDESIGN-V5.md §7.2). */
function TaxShareNote() {
  return (
    <div className="ns-cf-note">
      <strong>Tax (share)</strong>
      <p>
        The brackets are household-wide, so no source owes its own tax. This is the household’s income tax split by
        each source’s share of taxable income. It is not what the job costs you at the margin.
      </p>
    </div>
  );
}
