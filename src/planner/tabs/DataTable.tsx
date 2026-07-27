import type { ReactNode } from 'react';
import { ZERO_DASH } from '../format';

export type RowKind = 'total' | 'group' | 'child';

/**
 * One numeric cell. A nil balance is dimmed as well as dashed — the point of
 * the dash is that empty rows stop competing with the figures around them.
 */
export function Cell({ value }: { value: string }) {
  return <div className={value === ZERO_DASH ? 'ns-zero' : undefined}>{value}</div>;
}

export interface TableRow {
  key: string;
  kind: RowKind;
  label: ReactNode;
  cells: string[];
}

/**
 * The shared shape behind Accounts and Cash Flow: a 268px label column plus one
 * column per year in the visible window (docs/PLAN.md §7.5).
 */
export function DataTable({
  caption,
  years,
  rows,
  empty,
}: {
  caption: string;
  years: number[];
  rows: TableRow[];
  empty?: string;
}) {
  const style = { ['--cols' as string]: years.length };

  return (
    <div className="ns-table-scroll">
      <div className="ns-grid ns-row-head" style={style}>
        <div>{caption}</div>
        {years.map((y) => (
          <div key={y}>{y}</div>
        ))}
      </div>

      {rows.length === 0 && <div className="ns-empty">{empty ?? 'Nothing to show.'}</div>}

      {rows.map((row) => (
        <div key={row.key} className={`ns-grid ns-row-${row.kind}`} style={style}>
          <div title={typeof row.label === 'string' ? row.label : undefined}>{row.label}</div>
          {row.cells.map((cell, i) => (
            <Cell key={i} value={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}
