/**
 * How stale a plan's own "today" is, relative to the real calendar.
 *
 * `settings.asOfDate` is a snapshot the user typed in on some particular day;
 * every day after that, the plan's "today" balances (`PlanResult.opening`)
 * and its "today" cash-flow year (`startYear`) drift further from reality.
 * Nothing here reads the clock itself — `today` is an explicit argument, the
 * same purity rule every other derived module in this package follows (no
 * `Date.now()` in the hot path) — so this stays as testable as `markers.ts`
 * or `goals.ts`, and the UI is the one place that actually knows what "now"
 * is.
 */

/** Past this many days since `asOfDate`, a plan is stale enough to flag. */
export const STALE_AFTER_DAYS = 35;

export interface PlanFreshness {
  /** Whole days from `settings.asOfDate` (or Jan 1st of `startYear` when
   * unset) to `today`. Negative if `today` precedes the as-of date. */
  daysSinceAsOf: number;
  /** `daysSinceAsOf > STALE_AFTER_DAYS`. */
  isStale: boolean;
  /** The real calendar has moved into a year after the plan's own
   * `startYear` — `startYear` should roll forward. */
  needsRollover: boolean;
}

/** Parses a `YYYY-MM-DD` string as a UTC-midnight timestamp, matching
 * `partialYear.ts`'s own date handling so the two modules never disagree
 * about what a given `asOfDate` string means. Invalid or missing input falls
 * back to `fallback`, the same "nothing to measure against" behaviour
 * `yearFractionRemaining` uses for a missing or out-of-range `asOfDate`. */
function parseISODateUTC(date: string | undefined, fallback: number): number {
  if (!date) return fallback;
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed) return fallback;
  return Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]));
}

/** The subset of `Plan` `planFreshness` reads — narrower than `Pick<Plan,
 * 'settings'>` so a test (or any caller) can pass a bare `{ startYear,
 * asOfDate }` without constructing a whole `PlanSettings`. */
export interface FreshnessSource {
  settings: { startYear: number; asOfDate?: string };
}

/**
 * `plan`'s freshness as of `today`. Pure and cheap enough to call on every
 * render — no `runPlan`, no allocation beyond the returned object.
 *
 * `today` is a `Date` — a moment in time, usually fresh off `new Date()` at
 * the call site — read here by its LOCAL calendar date (`getFullYear`/
 * `getMonth`/`getDate`), not UTC (W3#6: "Use local dates, not UTC"). A plan's
 * `asOfDate` has no timezone of its own — it is just a calendar date someone
 * typed — so comparing it against the UTC calendar date of "now" misdates
 * every evening west of Greenwich: in the Pacific timezone after ~4-8pm
 * local, the UTC calendar has already turned over to tomorrow, so a sync
 * done this evening read as happening tomorrow, and this plan's own
 * rollover banner could fire a day early at each year boundary.
 */
export function planFreshness(plan: FreshnessSource, today: Date): PlanFreshness {
  const startYear = plan.settings.startYear;
  const asOfUTC = parseISODateUTC(plan.settings.asOfDate, Date.UTC(startYear, 0, 1));
  const todayLocal = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceAsOf = Math.round((todayLocal - asOfUTC) / 86_400_000);

  return {
    daysSinceAsOf,
    isStale: daysSinceAsOf > STALE_AFTER_DAYS,
    needsRollover: today.getFullYear() > startYear,
  };
}
