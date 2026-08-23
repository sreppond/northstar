/**
 * How much of the plan's current year is still ahead of us.
 *
 * The engine used to treat every projected year, including the first, as a
 * full Jan-1-to-Dec-31 span. That is wrong for the one year that matters most
 * to the reader: if it is August and the plan starts this year, only the
 * months from August to December can still earn a return, accrue interest, or
 * pay a salary — not the whole twelve. Every other year in the projection
 * really is a full year, so this only ever bites `startYear` (docs/PLAN.md
 * §4.3).
 */

/** Whole days in the given calendar year (accounts for leap years). */
function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Fraction of `year` remaining as of `asOfDate`, inclusive of the as-of date
 * itself (a balance "as of August 23" has not yet earned August 23's return).
 *
 * Returns 1 (a full year) whenever:
 *   - `year` is not the plan's `startYear` — every later year is whole, and
 *   - `asOfDate` is missing or falls outside `startYear` — nothing to prorate
 *     against, so fall back to the historical full-year behaviour.
 */
export function yearFractionRemaining(
  year: number,
  startYear: number,
  asOfDate: string | undefined,
): number {
  if (year !== startYear || !asOfDate) return 1;

  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOfDate);
  if (!parsed) return 1;
  const y = Number(parsed[1]);
  const m = Number(parsed[2]);
  const d = Number(parsed[3]);
  if (y !== startYear) return 1;

  const total = daysInYear(y);
  const startOfYear = Date.UTC(y, 0, 1);
  const asOf = Date.UTC(y, m - 1, d);
  const elapsedDays = Math.round((asOf - startOfYear) / 86_400_000);

  return Math.max(0, Math.min(1, (total - elapsedDays) / total));
}

/** Whole months of debt service left in a year that is `fraction` complete. */
export function monthsRemaining(fraction: number): number {
  return Math.max(0, Math.min(12, Math.round(fraction * 12)));
}
