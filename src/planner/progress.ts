/**
 * The historical counterpart to the forward-looking projection: what net
 * worth actually was, as of a given date, distinct from what the plan
 * projects it to be. Nothing computes this — it is purely user-entered,
 * meant for backfilling an old statement or logging today's real balance.
 *
 * Lives outside `@northstar/engine` on purpose: `runPlan` never reads it,
 * so it has no business in the engine package.
 */
export interface ProgressPoint {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

/** Local calendar date, not UTC (W3#6/docs/W3-REVIEW.md "Use local dates,
    not UTC") — `toISOString` reads the date in UTC, so an evening Monarch
    sync west of Greenwich (anywhere in the Americas, after ~4-8pm local)
    dated the logged progress point tomorrow. `en-CA` is just the locale
    whose built-in format happens to be YYYY-MM-DD — the same fix and the
    same reasoning as `planStore.ts`'s own (separate, unexported) `todayISO`. */
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function newProgressId(): string {
  return `pp-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyProgressPoint(): ProgressPoint {
  return { id: newProgressId(), date: todayISO(), netWorth: 0, assets: 0, liabilities: 0 };
}

export interface ProgressSummary {
  sortedAscending: ProgressPoint[];
  sortedDescending: ProgressPoint[];
  latest: ProgressPoint | undefined;
  allTimeChange: number;
}

export function summarizeProgress(points: ProgressPoint[]): ProgressSummary {
  const sortedAscending = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const sortedDescending = [...sortedAscending].reverse();
  const latest = sortedDescending[0];
  const earliest = sortedAscending[0];
  const allTimeChange = latest && earliest ? latest.netWorth - earliest.netWorth : 0;
  return { sortedAscending, sortedDescending, latest, allTimeChange };
}

/** A calendar date as a fractional year (`2026-07-02` -> `2026.5`ish) — the
    x-axis every progress point and the plan's own annual snapshots share, so
    an actual point can be laid against the projection's line even though one
    is dated to the day and the other only to the year. */
export function yearFraction(date: string): number {
  const d = new Date(`${date}T00:00:00`);
  const startOfYear = new Date(`${d.getFullYear()}-01-01T00:00:00`);
  const dayOfYear = (d.getTime() - startOfYear.getTime()) / 86_400_000;
  return d.getFullYear() + dayOfYear / 365;
}

/** The plan's own "today", as the same fractional year `yearFraction` reads
    a progress point's date into — `asOfDate`, or Jan 1st of `startYear` when
    unset (the same fallback `format.ts`'s `planMetaLine` uses). This is
    where the plan's first annual snapshot (`years[0]`) actually sits on the
    x-axis: `runPlan` prorates that first year FROM this date, not from
    January 1st, so anchoring anywhere else is what made "vs. plan" wrong on
    the day you log (M14). */
export function planAsOfFraction(settings: { startYear: number; asOfDate?: string }): number {
  return yearFraction(settings.asOfDate ?? `${settings.startYear}-01-01`);
}

/** The subset of `PlanResult` this module reads — kept narrow (rather than
    importing the real type from `@northstar/engine`) so a plain fixture
    object satisfies it in a test without constructing a full engine result.
    `opening` is optional so a caller/fixture that predates it still
    type-checks and gets the old (slightly-wrong) `years[0]`-as-today
    fallback, same convention as `CurrentNetWorthSource` below. */
export interface NetWorthSeries {
  years: { year: number; netWorth: number }[];
  opening?: { netWorth: number };
}

/**
 * What the plan projects net worth to be at a given fractional year.
 *
 * The x-axis has one knot per "today" plus one per annual CLOSE:
 * `(asOf, opening.netWorth)`, then `(year + 1, netWorth)` for every snapshot
 * in `years` — `year + 1` because `yearFraction` reads Dec 31 of `year` as
 * just under `year + 1` (day 364/365), so anchoring a year's close there is
 * consistent with how a logged `ProgressPoint`'s own date is read onto this
 * same axis. Interpolated linearly between consecutive knots; clamped to the
 * first/last knot outside the projected range rather than extrapolating.
 *
 * Fixes M14/W3#1: the previous version anchored `years[0]` (the stub year's
 * projected Dec-31 CLOSE) AT `asOf` itself, so a point logged exactly on the
 * as-of date — which already holds only `opening`'s balances, not a whole
 * year's projected growth/income — compared against the wrong number and
 * read "behind plan" on every sync. `opening` is the true value at `asOf`;
 * `years[0]` only arrives a full year of simulation later than that.
 */
export function projectedNetWorthAt(result: NetWorthSeries, fraction: number, asOf: number): number {
  const years = result.years;
  const openingNetWorth = result.opening?.netWorth ?? years[0]?.netWorth ?? 0;
  if (years.length === 0) return openingNetWorth;

  const knots: { x: number; netWorth: number }[] = [
    { x: asOf, netWorth: openingNetWorth },
    ...years.map((y) => ({ x: y.year + 1, netWorth: y.netWorth })),
  ];

  const first = knots[0];
  const last = knots[knots.length - 1];
  if (fraction <= first.x) return first.netWorth;
  if (fraction >= last.x) return last.netWorth;

  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i];
    const b = knots[i + 1];
    if (fraction <= b.x) {
      const t = (fraction - a.x) / (b.x - a.x);
      return a.netWorth + (b.netWorth - a.netWorth) * t;
    }
  }
  return last.netWorth;
}

/** The subset of `Plan`/`PlanResult` `progressPointFromPlan` reads. */
export interface CurrentNetWorthSource {
  settings: { startYear: number };
  years: { year: number; netWorth: number; accounts: { close: number; isLiability: boolean }[] }[];
  /**
   * The plan's real "today" — `PlanResult.opening`, balances as of
   * `settings.asOfDate` — preferred over `years` below when present.
   * `years[...]` is a projected year's CLOSE (Dec 31), which is not "today"
   * even for `settings.startYear` itself once that year is partial
   * (docs/MATH.md "Today vs. years[0]"). Optional so a caller that has not
   * been updated to pass `result.opening` yet still gets a value, from the
   * old (slightly-wrong) reading.
   */
  opening?: { netWorth: number; accounts: { balance: number; isLiability: boolean }[] };
}

/**
 * A progress point pre-filled from the plan itself — today's date, and the
 * plan's own opening snapshot for net worth/assets/liabilities — for
 * Progress's "Log today's net worth" primary action
 * (docs/REDESIGN-V3.md "Progress"). The user can still edit every field
 * before saving; this only removes the "start from zero" friction.
 */
export function progressPointFromPlan(source: CurrentNetWorthSource): ProgressPoint {
  if (source.opening) {
    const assets = source.opening.accounts
      .filter((a) => !a.isLiability)
      .reduce((s, a) => s + Math.max(0, a.balance), 0);
    const liabilities = source.opening.accounts
      .filter((a) => a.isLiability)
      .reduce((s, a) => s + Math.abs(a.balance), 0);
    return {
      id: newProgressId(),
      date: todayISO(),
      netWorth: Math.round(source.opening.netWorth),
      assets: Math.round(assets),
      liabilities: Math.round(liabilities),
    };
  }

  const snapshot = source.years.find((y) => y.year === source.settings.startYear) ?? source.years[0];
  const assets = snapshot ? snapshot.accounts.filter((a) => !a.isLiability).reduce((s, a) => s + Math.max(0, a.close), 0) : 0;
  const liabilities = snapshot
    ? snapshot.accounts.filter((a) => a.isLiability).reduce((s, a) => s + Math.abs(a.close), 0)
    : 0;
  return {
    id: newProgressId(),
    date: todayISO(),
    // Rounded to the dollar — the engine carries sub-cent float residue
    // (partial-year proration, compounding) that has no business showing up
    // as an editable draft value a user is about to look at and adjust.
    netWorth: Math.round(snapshot?.netWorth ?? 0),
    assets: Math.round(assets),
    liabilities: Math.round(liabilities),
  };
}
