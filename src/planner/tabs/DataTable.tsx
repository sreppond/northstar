import type { ReactNode } from 'react';
import { ZERO_DASH } from '../format';

export type RowKind = 'total' | 'group' | 'child';

/**
 * A magnitude bar behind one cell (docs/REDESIGN.md §4.1, DESIGN-DIRECTION.md
 * move 6). Reuses the income/cost hue convention `.ns-bar-income`/
 * `.ns-bar-cost` established in EventsTab.tsx's Gantt bars — but this is a
 * different, unrelated component: those bars encode a TIME SPAN on a Gantt
 * row; this encodes a DOLLAR MAGNITUDE behind a data-table row. Same colour
 * language, different mechanism, never conflated.
 */
export interface CellMagnitude {
  /** 0..1 — this cell's value relative to the ROW's own max across its
      visible columns, never the whole table's ("scaled per row"). */
  fraction: number;
  tone: 'income' | 'cost';
  /** Diverging rows (Cash Flow) grow from the cell's own centre, toward
      whichever side `positive` names. Single-direction rows (the default,
      Accounts) grow from the cell's left edge instead. */
  diverging?: boolean;
  positive?: boolean;
}

/**
 * One numeric cell. A nil balance is dimmed as well as dashed — the point of
 * the dash is that empty rows stop competing with the figures around them.
 * `highlighted` marks the scrubbed year's column (docs/REDESIGN.md §4.1);
 * the value is wrapped in its own positioned span so it paints above the
 * (absolutely positioned) magnitude bar regardless of DOM order.
 */
export function Cell({
  value,
  magnitude,
  highlighted,
}: {
  value: string;
  magnitude?: CellMagnitude;
  highlighted?: boolean;
}) {
  const classes = [value === ZERO_DASH ? 'ns-zero' : null, highlighted ? 'ns-col-scrub' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes || undefined}>
      {magnitude && magnitude.fraction > 0 && (
        <span
          aria-hidden="true"
          className={[
            'ns-mag-bar',
            `ns-mag-bar-${magnitude.tone}`,
            magnitude.diverging
              ? magnitude.positive
                ? 'ns-mag-bar-pos'
                : 'ns-mag-bar-neg'
              : 'ns-mag-bar-single',
          ].join(' ')}
          style={{ ['--mag' as string]: magnitude.fraction }}
        />
      )}
      <span className="ns-cell-value">{value}</span>
    </div>
  );
}

/** How a row's magnitude bar is drawn (see `CellMagnitude`). Omit `bar` on a
    `TableRow` for no bar at all — this app only puts one on the granular
    child rows, never the bold total/group rows. */
export interface RowBar {
  /** Single-direction rows use this tone for every cell, and it is required
      for them. Diverging rows use it too, UNLESS `signed` is set — a signed
      row (Net cash flow) has no fixed tone, since each cell's own sign
      picks both the side and the tone. */
  tone?: 'income' | 'cost';
  /** 'single': grows from the cell's left edge (Accounts). 'diverging':
      grows from the cell's centre (Cash Flow) — see `signed` for which side. */
  direction: 'single' | 'diverging';
  /** Diverging + unsigned (the common case: an income or expense LINE, whose
      displayed amounts are always positive magnitudes even though the row
      itself is fundamentally a "money in" or "money out" kind) — every cell
      grows toward the side implied by `tone`, regardless of its own sign.
      Diverging + signed (the one row that can actually flip between years —
      Net cash flow) — each cell's own sign picks the side, and `tone` above
      is ignored per-cell. */
  signed?: boolean;
}

export interface TableRow {
  key: string;
  kind: RowKind;
  label: ReactNode;
  cells: string[];
  /** Raw numbers parallel to `cells` — only needed when `bar` is set, since
      a magnitude bar is computed from real values and `cells` is already
      display-formatted text. */
  values?: number[];
  bar?: RowBar;
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
  highlightYear,
}: {
  caption: string;
  years: number[];
  rows: TableRow[];
  empty?: string;
  /** The scrubbed year (docs/REDESIGN.md §4.1). `null`/`undefined`
      highlights nothing — nobody's pointing at the chart, or the scrubbed
      year has paged out of this table's visible window. */
  highlightYear?: number | null;
}) {
  const style = { ['--cols' as string]: years.length };

  return (
    <div className="ns-table-scroll">
      <div className="ns-grid ns-row-head" style={style}>
        <div>{caption}</div>
        {years.map((y) => (
          <div key={y} className={y === highlightYear ? 'ns-col-scrub' : undefined}>
            {y}
          </div>
        ))}
      </div>

      {rows.length === 0 && <div className="ns-empty">{empty ?? 'Nothing to show.'}</div>}

      {rows.map((row) => {
        // Scaled per ROW, across its own visible columns — never per table,
        // or one outlier row would flatten every other row's bars to
        // invisible slivers (docs/REDESIGN.md §4.1).
        const rowMax =
          row.bar && row.values ? Math.max(1, ...row.values.map((v) => Math.abs(v))) : 0;

        return (
          <div key={row.key} className={`ns-grid ns-row-${row.kind}`} style={style}>
            <div title={typeof row.label === 'string' ? row.label : undefined}>{row.label}</div>
            {row.cells.map((cell, i) => {
              const value = row.values?.[i];
              // Non-signed rows always set `bar.tone` — the fallback below
              // only exists to satisfy the type, since `signed` is what
              // actually makes `tone` optional on `RowBar`.
              const magnitude: CellMagnitude | undefined =
                row.bar && value !== undefined
                  ? {
                      fraction: Math.abs(value) / rowMax,
                      tone:
                        row.bar.direction === 'diverging' && row.bar.signed
                          ? value >= 0
                            ? 'income'
                            : 'cost'
                          : (row.bar.tone ?? 'income'),
                      diverging: row.bar.direction === 'diverging',
                      positive:
                        row.bar.direction === 'diverging'
                          ? row.bar.signed
                            ? value >= 0
                            : row.bar.tone === 'income'
                          : undefined,
                    }
                  : undefined;
              return (
                <Cell key={i} value={cell} magnitude={magnitude} highlighted={years[i] === highlightYear} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
