import { memo, type ReactNode } from 'react';
import { ZERO_DASH } from '../format';
import { useScrollToYear } from './useScrollToYear';

/** `grandchild`: one line inside an expanded life-change row (Cash Flow). */
export type RowKind = 'total' | 'group' | 'child' | 'grandchild';

/**
 * A magnitude bar behind one cell (docs/REDESIGN.md §4.1, DESIGN-DIRECTION.md
 * move 6). Drawn as `.ns-mag-bar` plus a tone (`.ns-mag-bar-income` in
 * `--in`, `.ns-mag-bar-cost` in `--out`) and a direction (`-pos` / `-neg`
 * grow from a shared centre on diverging rows, `-single` from the left edge).
 * It encodes a DOLLAR MAGNITUDE behind a data-table cell, not a time span.
 * (V5-REVIEW-2 N15: this named `.ns-bar-income`/`.ns-bar-cost`, which no
 * longer exist.)
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
  danger,
  title,
  divider,
}: {
  value: string;
  magnitude?: CellMagnitude;
  highlighted?: boolean;
  /** A short year's column (docs/REDESIGN-V5.md §4.2 item 7) — a quiet
      danger wash, so the shortfall reads down the whole column. */
  danger?: boolean;
  /** A native tooltip for this one cell — Cash Flow's negative "Savings
      rate" cells (docs/ROADMAP-10.md C7), which name why that year went
      negative rather than leaving a bare "-12%" to look like an error. */
  title?: string;
  /** A rule on this cell's right edge — Accounts' leading "Today" column
      (docs/W3-REVIEW.md), which is a different KIND of figure (today's real
      balance) from the projected years beside it and reads as one of them
      without a seam marking where "today" ends and "projected" begins. */
  divider?: boolean;
}) {
  const classes = [
    value === ZERO_DASH ? 'ns-zero' : null,
    highlighted ? 'ns-col-scrub' : null,
    danger ? 'ns-col-danger' : null,
    divider ? 'ns-col-divider' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes || undefined} title={title}>
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
  /** Per-cell tooltips parallel to `cells` — `undefined` entries get no
      tooltip. Cash Flow's "Savings rate" row uses this for a negative
      year's one-line explainer (docs/ROADMAP-10.md C7). */
  cellTitles?: (string | undefined)[];
}

/**
 * A year column's header cell (docs/REDESIGN-V5.md §3.7). Carries `data-year`
 * so `useScrollToYear` can find the column, and is the snap target for the
 * scroller. With `onFocusYear` it is a toggle: click pins the year, click the
 * pinned year again lets go. Without it, plain text, as before.
 */
export function YearHeadCell({
  year,
  focused,
  danger,
  sub,
  onFocusYear,
}: {
  year: number;
  focused?: boolean;
  danger?: boolean;
  sub?: string;
  onFocusYear?(year: number | null): void;
}) {
  const classes = [focused ? 'ns-col-scrub' : null, danger ? 'ns-col-danger' : null]
    .filter(Boolean)
    .join(' ');
  const label = (
    <>
      {danger && (
        <span className="ns-year-short" role="img" aria-label="Plan runs short this year">
          ✗
        </span>
      )}
      {year}
    </>
  );
  // V5-REVIEW-1 F19: the stub year's "from Oct 18" used to stack under the year
  // and turn the header into three lines. The header is the year, nothing
  // else; the note is one hover away.
  return (
    <div data-year={year} className={classes || undefined} title={sub ? `${year} ${sub}` : undefined}>
      {onFocusYear ? (
        <button
          type="button"
          className="ns-year-btn"
          aria-pressed={focused === true}
          onClick={() => onFocusYear(focused ? null : year)}
        >
          {label}
        </button>
      ) : (
        label
      )}
    </div>
  );
}

/**
 * The shared shape behind Cash Flow (and, via `Cell`/`YearHeadCell`, Accounts):
 * a sticky label column plus one fixed-width column for EVERY year it is given,
 * in a native sideways scroller (docs/REDESIGN-V5.md §3.7). A caller that still
 * passes a paged window simply gets a table that scrolls if it overflows.
 */
export const DataTable = memo(function DataTable({
  caption,
  years,
  rows,
  empty,
  highlightYear,
  focusYear,
  onFocusYear,
  dangerYears,
  columnSubLabel,
}: {
  caption: string;
  years: number[];
  rows: TableRow[];
  empty?: string;
  /** The scrubbed year (docs/REDESIGN.md §4.1). `null`/`undefined`
      highlights nothing — nobody's pointing at the chart, or the scrubbed
      year has paged out of this table's visible window. */
  highlightYear?: number | null;
  /** The focused year: its column is highlighted, and when it changes from
      outside the table scrolls it to centre. Wins over `highlightYear` (kept
      as an alias) whenever it is passed, `null` included. */
  focusYear?: number | null;
  /** Called with a year when its header is clicked, or `null` when the
      already-focused year's header is. Omit for non-interactive headers. */
  onFocusYear?(year: number | null): void;
  /** Years the plan runs short (docs/REDESIGN-V5.md §4.2 item 7): a danger
      wash down the column and a ✗ in its header. */
  dangerYears?: number[];
  /** The stub-year flag (docs/ROADMAP-10.md C7 "the stub year is invisible"),
      shown as the header's tooltip rather than a second line (V5-REVIEW-1 F19), built from
      `stubYearLabel` (`ledger.ts`) by the caller so every table renders the
      same wording. Returns `undefined` for every ordinary year. */
  columnSubLabel?(year: number): string | undefined;
}) {
  const style = { ['--cols' as string]: years.length };
  const focus = focusYear !== undefined ? focusYear : highlightYear;
  const { pickYear, scrollerProps } = useScrollToYear(focus, onFocusYear);
  const isDanger = (y: number) => dangerYears?.includes(y) === true;

  return (
    <div {...scrollerProps}>
      <div className="ns-grid ns-row-head" style={style}>
        <div>{caption}</div>
        {years.map((y) => (
          <YearHeadCell
            key={y}
            year={y}
            focused={y === focus}
            danger={isDanger(y)}
            sub={columnSubLabel?.(y)}
            onFocusYear={pickYear}
          />
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
          <div
            key={row.key}
            className={`ns-grid ${row.kind === 'grandchild' ? 'ns-row-child ns-row-grandchild' : `ns-row-${row.kind}`}`}
            style={style}
          >
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
                <Cell
                  key={i}
                  value={cell}
                  magnitude={magnitude}
                  highlighted={years[i] === focus}
                  danger={isDanger(years[i])}
                  title={row.cellTitles?.[i]}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
});
