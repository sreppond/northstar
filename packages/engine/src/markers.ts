/**
 * The moments on a projection worth pointing at.
 *
 * A net worth line is thousands of pixels of gentle curve, and almost all of
 * it is unremarkable. Three things are not: the year the plan runs out of
 * money, the year it stops growing, and the size of the worst fall along the
 * way. Those are the whole reason to read the chart, and until now the first
 * one appeared only as a row in a table if the right years happened to be in
 * view.
 *
 * Derived from a PlanResult rather than computed during the run, so it stays
 * out of the year loop — same category as `deflate`.
 */
import type { PlanResult } from './types.js';

export interface DrawdownMarker {
  /** Year of the high-water mark the fall started from. */
  fromYear: number;
  /** Year of the low point. */
  toYear: number;
  peak: number;
  trough: number;
  /** Positive magnitude of the fall. */
  amount: number;
  /** Fall as a percent of the peak. */
  percent: number;
}

export interface PathMarkers {
  /**
   * The high-water year, given only when the plan DECLINES after it. On a
   * plan that grows to the end the peak is just the last point, and marking
   * it says nothing.
   */
  peakYear?: number;
  peakValue?: number;
  /** The largest peak-to-trough fall, when there is one worth naming. */
  drawdown?: DrawdownMarker;
  /** Years the withdrawal waterfall ran dry. The plan fails in these years. */
  shortfallYears: number[];
  /** Total unfunded across those years. */
  shortfallTotal: number;
}

/** A fall smaller than this is noise, not a story. */
const MIN_DRAWDOWN_PERCENT = 2;

export function pathMarkers(result: PlanResult): PathMarkers {
  const years = result.years;
  const out: PathMarkers = { shortfallYears: [], shortfallTotal: 0 };
  if (years.length === 0) return out;

  for (const y of years) {
    if (y.unfundedShortfall && y.unfundedShortfall > 0) {
      out.shortfallYears.push(y.year);
      out.shortfallTotal += y.unfundedShortfall;
    }
  }

  // Peak, but only when it is not simply the end of a rising line.
  let peakIndex = 0;
  for (let i = 1; i < years.length; i++) {
    if (years[i].netWorth > years[peakIndex].netWorth) peakIndex = i;
  }
  if (peakIndex < years.length - 1) {
    out.peakYear = years[peakIndex].year;
    out.peakValue = years[peakIndex].netWorth;
  }

  // Largest peak-to-trough fall, walked in one pass.
  let runningPeak = years[0].netWorth;
  let runningPeakYear = years[0].year;
  let best: DrawdownMarker | undefined;

  for (const y of years) {
    if (y.netWorth > runningPeak) {
      runningPeak = y.netWorth;
      runningPeakYear = y.year;
      continue;
    }
    const amount = runningPeak - y.netWorth;
    // A fall from a peak of zero or less has no meaningful percentage.
    if (runningPeak <= 0 || amount <= 0) continue;
    const percent = (amount / runningPeak) * 100;
    if (percent >= MIN_DRAWDOWN_PERCENT && (!best || amount > best.amount)) {
      best = {
        fromYear: runningPeakYear,
        toYear: y.year,
        peak: runningPeak,
        trough: y.netWorth,
        amount,
        percent,
      };
    }
  }
  out.drawdown = best;

  return out;
}
