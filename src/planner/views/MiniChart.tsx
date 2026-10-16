import { axisMoney, money } from '../format';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import type { RangeKey } from '../charts/range';
import type { ChartSeries, DangerBand } from '../charts/types';

/**
 * The in-card multi-series chart for the focused forecast views (Retirement,
 * House, SEPP, Reports, Progress, Cash Flow). Since docs/REDESIGN-V5.md §3 it
 * is a thin wrapper over the chart kit's `TimeSeriesChart`: the same props
 * every caller already passes, but each chart now scrubs, pins a year, shows
 * a compact readout and draws itself in, with no page edits (§8, unit A1).
 *
 * The drawing code that used to live here (ticks, paths, end labels, the
 * stub-year and band decorations) moved into the kit; `ChartSeries` moved to
 * `charts/types.ts` and is re-exported below so every existing import keeps
 * working.
 */

export type { ChartSeries } from '../charts/types';

const HEIGHT_DEFAULT = 280;

export function MiniChart({
  years,
  series,
  height = HEIGHT_DEFAULT,
  formatX = String,
  formatY = axisMoney,
  endLabels = false,
  bandFrom,
  bandLabel,
  stubYear,
  markYear,
  readout = true,
  range,
  danger,
  focusYear,
  onFocusYear,
}: {
  /** The shared x-domain every series' `values` is sampled at, index for
      index — real numeric positions (a plain year, or Progress's fractional
      year), not just ordinal labels: two points 5 years apart and two a
      week apart are spaced proportionally, not identically. */
  years: number[];
  series: ChartSeries[];
  /** The plot's height. The scrub readout sits above it, adding ~40px. */
  height?: number;
  /** Ticks default to the bare `years` value — Progress's fractional-year x-axis passes a date formatter instead. */
  formatX?: (year: number) => string;
  /** Y-axis tick labels default to money — every series this chart has drawn
      so far has been a dollar figure. Reports' contribution-rate chart is a
      percentage, not a balance, and needs its own formatter or its ticks
      read "$45 / $40 / $20" for a rate. The readout uses it too. */
  formatY?: (value: number) => string;
  /** Goodcast's end-label idiom (docs/REDESIGN-V3.md): a small dot + the
      series name at the line's own end, in place of a `ChartLegend` below
      the chart. Callers that turn this on should not also render
      `ChartLegend` for the same chart. */
  endLabels?: boolean;
  /** A lighter background band from this x-domain value to the chart's right
      edge, with an optional eyebrow at the band's start — Retirement's
      "beyond plan horizon" marker (B2), where this view runs the plan past
      its own configured end so the page always has something to show, and
      needs to say so rather than let the extension pass as more real data. */
  bandFrom?: number;
  bandLabel?: string;
  /** Marks the plan's stub first year (docs/ROADMAP-10.md C7 "the stub year
      is invisible") — whichever x-tick lands on `year` gets a small second
      line under its own label, e.g. "2026" / "from Sep 25", instead of
      letting a partial year's chart pass as a full one. Built from
      `stubYearLabel` (`ledger.ts`) so every page uses the same wording. */
  stubYear?: { year: number; label: string };
  /** A dashed vertical rule at this x-domain value — the year a page is
      currently looking at (Cash Flow's year stepper). */
  markYear?: number;
  /** New in v5, all optional: `false` hides the compact readout; `range`,
      `danger` and the app-wide pinned year (`focusYear`/`onFocusYear`, §4.1)
      pass straight through to the kit for pages that adopt them. */
  readout?: boolean;
  range?: RangeKey;
  danger?: DangerBand;
  focusYear?: number | null;
  onFocusYear?: (year: number | null) => void;
}) {
  return (
    <TimeSeriesChart
      years={years}
      series={series}
      height={height}
      formatX={formatX}
      yFormat={formatY}
      endLabels={endLabels}
      bandFrom={bandFrom}
      bandLabel={bandLabel}
      stubYear={stubYear}
      markYear={markYear}
      range={range}
      danger={danger}
      focusYear={focusYear}
      onFocusYear={onFocusYear}
      ariaLabel="Forecast chart"
      // A compact header, not a hero: these charts sit inside SectionCards
      // and are read for their shape. The readout uses the axis formatter
      // unless it is the default money axis, whose labels are too terse
      // ("$1.5M") for a value you are reading off.
      readout={readout ? { size: 'compact', format: formatY === axisMoney ? money : formatY } : false}
    />
  );
}

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="ns-mini-legend">
      {series.map((s) => (
        <span key={s.label} className="ns-mini-legend-item">
          <span className="ns-mini-legend-swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
