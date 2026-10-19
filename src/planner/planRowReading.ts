import type { PlanResult } from '@northstar/engine';

export interface PlanRowReading {
  /** The last year both plans have. */
  year: number;
  /** The other plan's net worth at `year`. */
  value: number;
  /** `value` minus the active plan's net worth at the same `year`. */
  delta: number;
  /** The other plan's net worth for each year up to `year` (the sparkline). */
  values: number[];
}

/**
 * V5-REVIEW-3 M1: the Scenarios landing row compares two plans at ONE year, the
 * last year they both have, and in ONE dollar mode. Both results must already
 * be in the same mode (the caller deflates the other plan with the ACTIVE plan's
 * settings, exactly as the opened comparison does). Comparing the other plan's
 * 2086 to the active plan's 2091, or nominal to today's dollars, produced a
 * nonsense "+$23.17M".
 */
export function planRowReading(active: PlanResult, other: PlanResult): PlanRowReading | null {
  const lastShared = Math.min(active.years.at(-1)?.year ?? -Infinity, other.years.at(-1)?.year ?? -Infinity);
  const activeAt = active.years.find((y) => y.year === lastShared);
  const otherAt = other.years.find((y) => y.year === lastShared);
  if (!activeAt || !otherAt) return null;
  return {
    year: lastShared,
    value: otherAt.netWorth,
    delta: otherAt.netWorth - activeAt.netWorth,
    values: other.years.filter((y) => y.year <= lastShared).map((y) => y.netWorth),
  };
}
