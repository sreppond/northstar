/**
 * How much of the plan's first year is still ahead.
 *
 * The engine is pure and has no clock (packages/engine/src/run.ts), so "now"
 * enters the projection here and nowhere else. A plan whose first year is the
 * current calendar year is part-spent: opening it on 28 July leaves ~0.42 of
 * the year, and the first row should return that share rather than a full one.
 *
 * A first year in the past or the future gets the whole year. A stale plan is
 * not a stub, and a plan that starts in 2030 has all of 2030 ahead of it.
 */
export function firstYearFraction(startYear: number, now: Date = new Date()): number {
  if (now.getFullYear() !== startYear) return 1;

  const opened = new Date(startYear, 0, 1).getTime();
  const closes = new Date(startYear + 1, 0, 1).getTime();
  return (closes - now.getTime()) / (closes - opened);
}
