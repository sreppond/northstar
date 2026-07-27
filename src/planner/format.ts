/** Compact money used across the KPI strip, chart axis, tooltip and tables. */
export function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  if (abs < 50) return '$0';
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Terser money for the chart's y-axis, where the label sits in a ~54px gutter
 * next to the pin row. `$10.00M` collides; `$10M` does not.
 */
export function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return '$0';
  if (abs >= 1e6) return `$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `$${trim(abs / 1e3)}K`;
  return `$${Math.round(abs)}`;
}

/** Whole thousands, no decimal — for prose notes like "$920K financed". */
export function roundMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function trim(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Money for prose and hover cards: drops a trailing .0 so it reads "$148K"
 * rather than "$148.0K", while keeping "$98.6K" precise.
 */
export function detailMoney(value: number): string {
  return money(value).replace(/\.0+([KM])$/, '$1');
}

/** Same scale, but always carrying an explicit sign — for net cash flow. */
export function signedMoney(value: number): string {
  if (Math.abs(value) < 50) return '$0';
  return value > 0 ? `+${money(value)}` : money(value);
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

/** `tableMoney` with an explicit sign — for the net cash flow row. */
export function signedTableMoney(value: number): string {
  if (Math.abs(value) < 50) return ZERO_DASH;
  return value > 0 ? `+${tableMoney(value)}` : tableMoney(value);
}

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Compound annual growth rate between two values over a span of years. */
export function cagr(start: number, end: number, years: number): number | undefined {
  if (years <= 0 || start <= 0 || end <= 0) return undefined;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}
