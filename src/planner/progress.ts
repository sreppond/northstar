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

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
    object satisfies it in a test without constructing a full engine result. */
export interface NetWorthSeries {
  years: { year: number; netWorth: number }[];
}

/**
 * What the plan projects net worth to be at a given fractional year —
 * linearly interpolated between the two annual snapshots straddling it,
 * since the projection only has one point per calendar year. Clamps to the
 * first/last snapshot outside the projected range rather than extrapolating.
 *
 * `asOf` (from `planAsOfFraction`) anchors WHERE `years[0]` sits on the
 * x-axis: at `asOf` itself, not at `years[0].year` on the nose (M14). Every
 * later snapshot N follows at `asOf + (N - years[0].year)` — one full year
 * per snapshot, starting from that same anchor, so a fraction exactly at
 * `asOf` reads back exactly `years[0].netWorth` (a point logged "today"
 * compares at zero delta against a plan whose first snapshot IS "today").
 */
export function projectedNetWorthAt(result: NetWorthSeries, fraction: number, asOf: number): number {
  const years = result.years;
  if (years.length === 0) return 0;
  const startYear = years[0].year;
  const xFor = (year: number) => asOf + (year - startYear);

  const first = years[0];
  const last = years[years.length - 1];
  if (fraction <= xFor(first.year)) return first.netWorth;
  if (fraction >= xFor(last.year)) return last.netWorth;

  const offset = fraction - asOf;
  const y0 = startYear + Math.floor(offset);
  const s0 = years.find((y) => y.year === y0) ?? first;
  const s1 = years.find((y) => y.year === y0 + 1) ?? s0;
  const t = offset - Math.floor(offset);
  return s0.netWorth + (s1.netWorth - s0.netWorth) * t;
}

/** The subset of `Plan`/`PlanResult` `progressPointFromPlan` reads. */
export interface CurrentNetWorthSource {
  settings: { startYear: number };
  years: { year: number; netWorth: number; accounts: { close: number; isLiability: boolean }[] }[];
}

/**
 * A progress point pre-filled from the plan itself — today's date, and the
 * plan's own current-year snapshot for net worth/assets/liabilities — for
 * Progress's "Log today's net worth" primary action
 * (docs/REDESIGN-V3.md "Progress"). The user can still edit every field
 * before saving; this only removes the "start from zero" friction.
 */
export function progressPointFromPlan(source: CurrentNetWorthSource): ProgressPoint {
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
