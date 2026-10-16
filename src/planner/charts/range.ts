/**
 * Chart time ranges (docs/REDESIGN-V5.md §3.4).
 *
 * The engine is annual, so a range can only ever pick whole year points:
 * 1Y is "today, this year's close, next year's close" — a handful of dots,
 * not an interpolated monthly line (Q5 in the plan). Pure so it is tested
 * without a component tree.
 */

import type { ChartRangeKey } from '@northstar/engine';

/** The engine's own key, since the range persists on `PlanSettings.chartRange`. */
export type RangeKey = ChartRangeKey;

export const RANGE_KEYS: RangeKey[] = ['1y', '3y', '5y', '10y', '20y', '40y', 'all'];

const RANGE_YEARS: Record<Exclude<RangeKey, 'all'>, number> = {
  '1y': 1,
  '3y': 3,
  '5y': 5,
  '10y': 10,
  '20y': 20,
  '40y': 40,
};

export function rangeLabel(range: RangeKey): string {
  return range === 'all' ? 'All' : range.toUpperCase();
}

/** Fewest points a window may hold. Two points is a line segment with no
    shape; three is the plan's own definition of 1Y (today + two closes). */
export const MIN_WINDOW_POINTS = 3;

/**
 * The x-window a range selects. Counts from `openingYear` — "today", the
 * opening snapshot — not from the plan's far end, so the same range always
 * starts at the same place. `years` is the chart's sorted x-domain.
 *
 * A window that would hold fewer than `MIN_WINDOW_POINTS` points is grown
 * (forward first, then back) so a 1Y view of annual data still has a
 * today -> close -> close shape to draw. "all" is the whole domain.
 */
export function rangeWindow(
  years: number[],
  openingYear: number,
  range: RangeKey,
): { from: number; to: number } {
  if (years.length === 0) return { from: openingYear, to: openingYear };
  const first = years[0];
  const last = years[years.length - 1];
  if (range === 'all' || years.length <= MIN_WINDOW_POINTS) return { from: first, to: last };

  const from = Math.min(last, Math.max(first, openingYear));
  const to = Math.min(last, from + RANGE_YEARS[range]);

  let lo = years.findIndex((y) => y >= from);
  if (lo < 0) lo = years.length - 1;
  let hi = years.length - 1;
  while (hi > lo && years[hi] > to) hi--;

  while (hi - lo + 1 < MIN_WINDOW_POINTS && hi < years.length - 1) hi++;
  while (hi - lo + 1 < MIN_WINDOW_POINTS && lo > 0) lo--;
  return { from: years[lo], to: years[hi] };
}

/**
 * Which options to offer. "All" is always offered — Spencer's plan runs dry
 * in 2071, past 40 years, so without it the failure could sit outside every
 * window (§3.4). Any option as long as or longer than the plan is hidden,
 * since it would just be "All" again; 40Y collapses into All on a 30-year
 * plan.
 */
export function availableRanges(years: number[], openingYear: number): RangeKey[] {
  const last = years.length ? years[years.length - 1] : openingYear;
  const span = last - openingYear;
  const keys = RANGE_KEYS.filter((k) => k !== 'all' && RANGE_YEARS[k as Exclude<RangeKey, 'all'>] < span);
  return [...keys, 'all'];
}

/** A persisted range the plan has since outgrown (shorter horizon) reads as "all". */
export function effectiveRange(range: RangeKey, available: RangeKey[]): RangeKey {
  return available.includes(range) ? range : 'all';
}
