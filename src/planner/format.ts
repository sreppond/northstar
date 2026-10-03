/**
 * "Sep 2, 2026" for a plan's `settings.asOfDate` (an ISO `YYYY-MM-DD`, or
 * undefined for the plan's start of year) in every page header's mono meta
 * line. Parsed as UTC-midnight-of-the-date rather than via `new Date(str)`
 * directly — the latter treats a bare date string as UTC internally but
 * *renders* it in the browser's local zone, which rolls the date back a day
 * for anyone west of Greenwich.
 */
export function asOfDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

/**
 * The mono meta line every `PageHeader` shows below its title:
 * "{plan name} · as of {date} · {start}–{end}" (docs/REDESIGN-V3.md "Target
 * information architecture"). One helper rather than ten copies of the same
 * `asOfDate ?? \`${startYear}-01-01\`` fallback each page would otherwise
 * repeat — `planDetail` in detail.ts uses the same fallback for its "As of"
 * row, so this mirrors it rather than inventing a second convention.
 */
export function planMetaLine(
  plan: { name: string; settings: { startYear: number; asOfDate?: string } },
  endYear: number,
): string {
  const asOf = plan.settings.asOfDate ?? `${plan.settings.startYear}-01-01`;
  return `${plan.name} · as of ${asOfDateLabel(asOf)} · ${plan.settings.startYear}–${endYear}`;
}

/**
 * ONE NUMBER LANGUAGE (docs/ROADMAP-10.md C2). Every dollar figure in the app
 * is built on one of these two primitives — nothing else formats money:
 *
 *   - `money`: stats, hero figures, cards and prose. Up to 4 significant
 *     figures, and a trailing ".0" is always dropped ($204.5K, $12K, $230K,
 *     $1.85M, $4.05M) — a lone figure read on its own is never padded with a
 *     fake zero. `signedMoney` below wraps it for a change rather than a
 *     balance.
 *   - `tableMoney`: dense year grids (Accounts, Cash Flow, Reports). Compact
 *     to about 3 significant figures — thousands round to a whole number
 *     ($204K), millions keep two decimals ($1.65M) so adjacent years in a
 *     column stay distinct — and a near-zero cell reads as an en-dash rather
 *     than "$0", so a grid of real zeros stands out from rounding noise.
 *     `signedTableMoney` wraps it the same way `signedMoney` wraps `money`.
 *
 * `axisMoney` is the one exception, for a chart gridline: ticks are already
 * "nice" round numbers (`niceTicks`/`niceStep`), so it only ever needs to
 * print that value back without adding false precision — never a formatting
 * choice a reader has to parse. `percent`/`signedPercent` are the same two
 * shapes (plain, and explicitly signed) for a rate instead of a dollar figure.
 */
export function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 50) return '$0';
  if (abs >= 1e6) return `${sign}$${trimTrailingZero(abs / 1e6, 2)}M`;
  if (abs >= 1e3) return `${sign}$${trimTrailingZero(abs / 1e3, 1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** `toFixed`, but a trailing ".0"/".00" never survives — the one thing that
    turns "$12.0K" or "$230.0K" into "$12K"/"$230K" while leaving genuine
    precision ("$204.5K") alone. */
function trimTrailingZero(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$/, '');
}

/**
 * Terser money for a chart's y-axis, where the label sits in a narrow gutter
 * next to the plot. Ticks are already round numbers by the time they reach
 * here (`niceTicks`), so this only ever has to print that value back:
 * thousands as a whole number (`$925K`, never `$922.71K`), millions to one
 * decimal only when the tick itself isn't a whole million (`$1.5M`, but
 * `$40M` not `$40.0M`).
 */
export function axisMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs === 0) return '$0';
  if (abs >= 1e6) return `${sign}$${trimTrailingZero(abs / 1e6, 1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** A real minus sign (U+2212), not a hyphen — typography deltas use
    everywhere they carry an explicit sign (docs/ROADMAP-10.md C2). */
const MINUS = '−';

/** `money`, always carrying an explicit sign — for a change, not a balance
    (net cash flow, a stat's horizon delta). */
export function signedMoney(value: number): string {
  if (Math.abs(value) < 50) return '$0';
  const formatted = money(Math.abs(value));
  return value > 0 ? `+${formatted}` : `${MINUS}${formatted}`;
}

/**
 * En-dash, the accounting convention for a nil balance. A grid of "$0"s pulls
 * the eye toward rows holding nothing; a dash lets them recede.
 */
export const ZERO_DASH = '–';

/**
 * Money for the dense year grids in Accounts and Cash Flow.
 *
 * Differs from `money()` in two ways, both about reading a wall of figures at
 * a glance rather than one number in isolation:
 *   - thousands carry no decimal, so a row scans as $238K / $345K / $451K
 *   - anything that would print as zero becomes an en-dash
 *
 * Millions keep two decimals deliberately. Consecutive years in a balance
 * sheet often differ by well under $100K, so rounding $1.09M and $1.14M both
 * to "$1M" would flatten a growing row into a column of identical values.
 */
export function tableMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 50) return ZERO_DASH;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) {
    const thousands = Math.round(abs / 1e3);
    // 999,500 rounds to 1000K. Roll it up rather than print a four-digit K.
    return thousands >= 1000 ? `${sign}$1.00M` : `${sign}$${thousands}K`;
  }
  // Under $1K there is nothing to compact, so show it exactly.
  return `${sign}$${Math.round(abs)}`;
}

/** `tableMoney` with an explicit sign, and the real minus (docs/ROADMAP-10.md
    C2) — for the net cash flow row. */
export function signedTableMoney(value: number): string {
  if (Math.abs(value) < 50) return ZERO_DASH;
  const formatted = tableMoney(Math.abs(value));
  return value > 0 ? `+${formatted}` : `${MINUS}${formatted}`;
}

/** At most `digits` decimals, and a trailing ".0" never survives — "40%",
    never "40.0%" (docs/ROADMAP-10.md C2). */
export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(/\.0+$/, '')}%`;
}

/**
 * `percent`, but for a dense table COLUMN rather than a lone figure —
 * always exactly `digits` decimals, trailing zero included
 * (docs/W3-REVIEW.md "One precision per table column": Reports' Contribution
 * Rate column used to mix "39%", "46.1%" and "14%" because `percent` trims a
 * trailing ".0" row by row, with no notion that its neighbours in the same
 * column didn't round as cleanly. A column read top to bottom needs one
 * consistent precision throughout, not each cell independently choosing its
 * own — the same reasoning `tableMoney` already applies to dollar grids.
 */
export function tablePercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** `percent`, always carrying an explicit sign and the real minus — for a
    delta expressed as a rate (an assumption's before/after change). Rounds
    first so an exact 0 after rounding reads as a plain "0%", never "+0%" or
    "−0%". */
export function signedPercent(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return percent(0, digits);
  return rounded > 0 ? `+${percent(rounded, digits)}` : `${MINUS}${percent(-rounded, digits)}`;
}

/** Compound annual growth rate between two values over a span of years. */
export function cagr(start: number, end: number, years: number): number | undefined {
  if (years <= 0 || start <= 0 || end <= 0) return undefined;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/**
 * Oxford-free "and" join, the way someone would say a short list out loud —
 * "brokerage and cash" rather than "brokerage, and cash". Shared by the House
 * and Retirement lenses' goal-progress notes ("earmarked from X and Y").
 */
export function joinNames(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
