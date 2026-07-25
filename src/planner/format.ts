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

/** Same scale, but always carrying an explicit sign — for net cash flow. */
export function signedMoney(value: number): string {
  if (Math.abs(value) < 50) return '$0';
  return value > 0 ? `+${money(value)}` : money(value);
}

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Compound annual growth rate between two values over a span of years. */
export function cagr(start: number, end: number, years: number): number | undefined {
  if (years <= 0 || start <= 0 || end <= 0) return undefined;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}
