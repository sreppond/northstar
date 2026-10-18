import type { ReactNode } from 'react';

/**
 * Shared chart-kit types (docs/REDESIGN-V5.md §3.2).
 *
 * `ChartSeries` lives here, not in views/MiniChart.tsx, so TimeSeriesChart
 * (which MiniChart now wraps) can import it without a MiniChart <->
 * TimeSeriesChart import cycle. MiniChart re-exports it, so every existing
 * `import { type ChartSeries } from '../views/MiniChart'` keeps working.
 */
export interface ChartSeries {
  /** Stable identity for draw-in and the readout. Defaults to `label`. */
  id?: string;
  label: string;
  color: string;
  /** `NaN` marks a gap — no data at that x position (Progress's "Actual"
      series, when the shared x-domain includes anchor points before or
      after the actual logged readings). The line breaks rather than
      interpolating across a gap, and no dot is drawn there. */
  values: number[];
  /** `line` (default), `area` (a line with the gradient wash) or `column`.
      `fill: true` is the older spelling of `area` and still works. */
  kind?: 'line' | 'area' | 'column';
  /** Fills the area under the line, for the one series that reads as a volume. */
  fill?: boolean;
  /** The area's lower edge, index for index — 0 when unset. A stacked chart
      (Accounts' balances by bucket) passes the layer below's running total,
      so each fill covers only its own band rather than reaching to zero.
      (The chart's own `stacked` prop computes this for you.) */
  fillTo?: number[];
  /** Flat fill opacity. Unset gives the hero gradient (0.28 at the line
      fading to 0 at the baseline, docs/REDESIGN-V5.md §3.2). A stacked
      chart's bands ARE the data and need to read as solid colour. */
  fillOpacity?: number;
  /** Line width in px; 0 draws the fill alone. Defaults to 2. */
  lineWidth?: number;
  dashed?: boolean;
  /** `false` keeps the hover dot (and its halo) off this series. For a fill that
      only shades a band between two lines (Cash Flow's gain/gap wash): the
      lines carry the dots, and a second dot on the same spot would be noise. */
  activeDot?: boolean;
  /** A filled dot at every real (non-`NaN`) data point — Progress's "actual"
      series, where each point is a real logged reading rather than an
      annual sample of a smooth projection. */
  dots?: boolean;
  /** The index whose INCOMING segment (from the previous point) should draw
      as a step — flat at the prior value out to this x, then a vertical
      jump — instead of the usual curve. House's home-value and
      mortgage-balance lines (docs/ROADMAP-10.md C7): the account springs
      into existence at its full purchase-year value, it doesn't appreciate
      up from zero over the prior year. */
  stepAt?: number;
  /** In a `stacked` chart, draw this series on its own scale instead of adding
      it to the stack: Budget's after-tax income line over the spending
      columns (docs/REDESIGN-V5.md §5.3). Ignored when the chart isn't stacked. */
  overlay?: boolean;
}

/** A labelled background stretch of the x-axis, such as a child's
    daycare / school / college years (docs/REDESIGN-V5.md §5.3). `from` and
    `to` are x-axis values, drawn exactly as given. */
export interface ChartBand {
  from: number;
  to: number;
  label: string;
}

/** The shortfall region (docs/REDESIGN-V5.md §4.2.4): hatched and tinted
    over the years the plan can't fund its spending. */
export interface DangerBand {
  /** First short year. */
  from: number;
  /** Last short year; defaults to the chart's last year. Superseded by
      `years` whenever that is given. */
  to?: number;
  /** Every short year, ascending (V5-REVIEW-1 F2). A plan can run dry, recover
      and run dry again, so the band is the set of years, not `from..to`:
      each contiguous run is hatched as its own rect (the chip sits on the
      first), and the readout's red "Short" pill appears only for members.
      Build it with `healthDangerBand` (planner/health.ts). Without it the
      band is the single stretch `from..to`, the pre-F2 behaviour. */
  years?: number[];
  /** Chip text, default "Runs dry". The year is appended. */
  label?: string;
  /** The unfunded amount in a given year, for the readout's red
      `✗ Short $X` pill. Undefined (or no callback) shows the bare pill. */
  shortFor?(year: number): number | undefined;
}

export interface ChartMarker {
  year: number;
  label: string;
  tone: 'income' | 'cost' | 'neutral';
}

/** What the readout above a chart shows (docs/REDESIGN-V5.md §3.3). */
export interface ReadoutSpec {
  /** Heading above the number; ReactNode so a page can pass its
      "Net worth ▾" series menu. Defaults to the primary series' label. */
  label?: ReactNode;
  /** Which series is the big number. Defaults to the first area series, else the first. */
  primaryId?: string;
  /** Number formatter, default `money`. */
  format?(value: number): string;
  /** Adult ages for a year, e.g. "Spencer 40 · Sarah 40". */
  agesFor?(year: number): string | undefined;
  /** `hero` is 44–56px, `compact` is for in-card charts. Default `hero`. */
  size?: 'hero' | 'compact';
  /** Right-hand slot — the RangePicker, a What-if button. */
  actions?: ReactNode;
  /** Hide the small `●label value` row for the other series. */
  hideSecondary?: boolean;
}
