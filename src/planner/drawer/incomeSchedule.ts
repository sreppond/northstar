/**
 * Pure edits to an income line's raise rules and per-year overrides, plus the
 * year-by-year preview the editor shows. Every edit returns a new config; the
 * drawer writes it through the event draft, so Save and Cancel behave as they
 * do for every other field.
 *
 * The amounts come from the engine's `incomeAmounts`, the same function the
 * compiler runs, so the preview cannot disagree with the projection.
 */
import { incomeAmounts, type IncomeOverride, type IncomeRaise } from '@northstar/engine';

/** The slice of an income config this editor reads and writes. Loose because
    the drawer's draft config is untyped until it is validated. */
export interface ScheduleConfig {
  amount?: number;
  growthRate?: number;
  raises?: IncomeRaise[];
  overrides?: IncomeOverride[];
}

/** The years a rule may start in: after the first year, through the last. */
export interface Span {
  startYear: number;
  endYear: number;
}

export interface PreviewRow {
  year: number;
  amount: number;
  /** Change from the previous year's amount; null for the first year. */
  change: number | null;
  overridden: boolean;
}

function sortRaises(raises: IncomeRaise[]): IncomeRaise[] {
  // Array.prototype.sort is stable, so rules sharing a year keep their order
  // (the engine lets the later one win).
  return [...raises].sort((a, b) => a.fromYear - b.fromYear);
}

function sortOverrides(overrides: IncomeOverride[]): IncomeOverride[] {
  return [...overrides].sort((a, b) => a.year - b.year);
}

/** Clamps a rule's start year to `[startYear + 1, endYear]`. */
export function clampRaiseYear(year: number, span: Span): number {
  const lo = span.startYear + 1;
  const hi = Math.max(lo, span.endYear);
  if (!Number.isFinite(year)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(year)));
}

/**
 * Adds a rule. It starts the year after the last rule (clamped to the span)
 * and copies the kind of the rule before it. The value starts at 0 for the
 * user to set.
 */
export function addRaise<T extends ScheduleConfig>(config: T, span: Span): T {
  const raises = sortRaises(config.raises ?? []);
  const last = raises.at(-1);
  const lastYear = last ? last.fromYear : span.startYear;
  const fromYear = clampRaiseYear(lastYear + 1, span);
  return {
    ...config,
    raises: sortRaises([...raises, { fromYear, kind: last?.kind ?? 'percent', value: 0 }]),
  };
}

/** Patches one rule and keeps the list sorted by start year. */
export function updateRaise<T extends ScheduleConfig>(config: T, index: number, patch: Partial<IncomeRaise>): T {
  const raises = config.raises ?? [];
  if (index < 0 || index >= raises.length) return config;
  const next = raises.map((r, i) => (i === index ? { ...r, ...patch } : r));
  return { ...config, raises: sortRaises(next) };
}

/** Removes one rule. The key is dropped once the list is empty. */
export function removeRaise<T extends ScheduleConfig>(config: T, index: number): T {
  const raises = config.raises ?? [];
  if (index < 0 || index >= raises.length) return config;
  const next = raises.filter((_, i) => i !== index);
  const out: ScheduleConfig = { ...config, raises: sortRaises(next) };
  if (next.length === 0) delete out.raises;
  return out as T;
}

/**
 * Pins one year to an exact amount, replacing any override already there.
 * Negative amounts floor at 0, as the engine does.
 */
export function setOverride<T extends ScheduleConfig>(config: T, year: number, amount: number): T {
  if (!Number.isFinite(amount)) return config;
  const others = (config.overrides ?? []).filter((o) => o.year !== year);
  return {
    ...config,
    overrides: sortOverrides([...others, { year, amount: Math.max(0, amount) }]),
  };
}

/** Removes a year's override. The key is dropped once the list is empty. */
export function clearOverride<T extends ScheduleConfig>(config: T, year: number): T {
  const overrides = config.overrides ?? [];
  if (!overrides.some((o) => o.year === year)) return config;
  const next = overrides.filter((o) => o.year !== year);
  const out: ScheduleConfig = { ...config, overrides: sortOverrides(next) };
  if (next.length === 0) delete out.overrides;
  return out as T;
}

/**
 * One row per year from `startYear` through `endYear`: the engine's amount,
 * the change from the year before, and whether an override sets that year.
 */
export function previewRows(config: ScheduleConfig, startYear: number, endYear: number): PreviewRow[] {
  const amounts = incomeAmounts(
    {
      amount: config.amount ?? 0,
      growthRate: config.growthRate ?? 0,
      raises: config.raises,
      overrides: config.overrides,
    },
    startYear,
    endYear,
  );
  const overridden = new Set((config.overrides ?? []).map((o) => o.year));

  const rows: PreviewRow[] = [];
  let prev: number | null = null;
  for (let year = startYear; year <= endYear; year++) {
    const amount = amounts.get(year) ?? 0;
    rows.push({
      year,
      amount,
      change: prev === null ? null : amount - prev,
      overridden: overridden.has(year),
    });
    prev = amount;
  }
  return rows;
}
