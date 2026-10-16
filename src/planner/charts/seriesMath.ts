/**
 * Pure geometry for TimeSeriesChart: snapping a pointer to a data year,
 * curve/area paths, stacking, axis ticks. Kept out of the component for the
 * same reason chartMath.ts is — the runner only collects `*.test.ts`, and
 * this is where an off-by-one or a sign flip would hide.
 * (docs/REDESIGN-V5.md §3.1, §3.2)
 */
import { niceAxisTicks } from '../chartMath';
import { axisMoney } from '../format';

/** `axisMoney`, but 3 significant figures on the M-scale — used only for the
    y-axis' real-data-ceiling tick, which already sits close to the nice tick
    below it, so `axisMoney`'s one decimal would read "$1.9M" for a $1.85M
    top (docs/W3-REVIEW.md "Axis ceiling ticks"). Moved here from MiniChart
    unchanged now that the kit draws the axis. */
export function tightCeilingMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) {
    const sign = value < 0 ? '-' : '';
    const millions = abs / 1e6;
    if (millions >= 100) return `${sign}$${Math.round(millions)}M`;
    if (millions >= 10) return `${sign}$${millions.toFixed(1).replace(/\.0$/, '')}M`;
    return `${sign}$${millions.toFixed(2)}M`;
  }
  return axisMoney(value);
}

/** Index of the entry in ascending `sorted` closest to `x`. Clamped, so a
    pointer past either edge snaps to the end year (never undefined). */
export function nearestIndex(sorted: number[], x: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first entry >= x; the one before it may be closer.
  if (lo > 0 && x - sorted[lo - 1] <= sorted[lo] - x) return lo - 1;
  return lo;
}

/**
 * The next pinned year for a key press (docs/REDESIGN-V5.md §3.1): ←/→ move
 * one data point, Home/End jump to the window ends. With nothing pinned yet,
 * → starts at the first year and ← at the last, so the first press always
 * lands somewhere visible.
 */
export function keyboardYear(
  years: number[],
  current: number | null,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End',
): number | null {
  if (years.length === 0) return null;
  if (key === 'Home') return years[0];
  if (key === 'End') return years[years.length - 1];
  if (current === null) return key === 'ArrowRight' ? years[0] : years[years.length - 1];
  const i = nearestIndex(years, current);
  const next = Math.min(years.length - 1, Math.max(0, i + (key === 'ArrowRight' ? 1 : -1)));
  return years[next];
}

/** Stacks series bottom-to-top. A `NaN` counts as 0 so one gap doesn't
    blank every band above it. `bases[i]` is the running total below series
    i; `tops[i]` is that plus its own value. */
export function stackSeries(valuesList: number[][]): { bases: number[][]; tops: number[][] } {
  const len = Math.max(0, ...valuesList.map((v) => v.length));
  const running = new Array<number>(len).fill(0);
  const bases: number[][] = [];
  const tops: number[][] = [];
  for (const values of valuesList) {
    bases.push(running.slice());
    for (let i = 0; i < len; i++) running[i] += Number.isFinite(values[i]) ? values[i] : 0;
    tops.push(running.slice());
  }
  return { bases, tops };
}

/**
 * Y-axis gridline values for the domain `[min, max]` (min ≤ 0 ≤ max in
 * practice — every chart here anchors at zero). Positive ticks come from
 * chartMath's `niceAxisTicks`, so the chart and NetWorthChart agree on what
 * a nice gridline is; if the domain dips below zero, ticks continue at the
 * same step down to `min`.
 */
export function yTicks(min: number, max: number): number[] {
  const ceiling = Math.max(max, -min);
  const up = niceAxisTicks(max > 0 ? max : 0).map((t) => t.value);
  if (!(min < 0)) return up;
  const step = niceAxisTicks(ceiling)[1]?.value ?? ceiling;
  const down: number[] = [];
  for (let k = 1; step > 0 && -k * step >= min - step * 0.25 && k < 12; k++) down.push(-k * step);
  return [...down.reverse(), ...up];
}

export interface TickCandidate {
  /** x position in the layout that decides collisions (the TARGET window's
      layout, so labels don't flicker while the domain springs). */
  x: number;
  label: string;
}

/**
 * Which x labels to draw: about one per `pxPerLabel` of room, plus always
 * the last (the domain's real end is worth naming even off-rhythm). When two
 * would collide — same text (fractional years that round to one calendar
 * year) or fewer than `minGap` px apart — the EARLIER of the pair goes: the
 * later one is either the true end or reads the same regardless. Same rule
 * MiniChart's x-axis used before the kit.
 */
export function pickXTicks(candidates: TickCandidate[], plotWidth: number, minGap = 42): number[] {
  const n = candidates.length;
  if (n === 0) return [];
  const target = Math.max(2, Math.min(7, Math.floor(plotWidth / 70)));
  const every = Math.max(1, Math.round(n / target));
  const picked: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i % every !== 0 && i !== n - 1) continue;
    const prev = picked[picked.length - 1];
    if (prev !== undefined) {
      const p = candidates[prev];
      if (p.label === candidates[i].label || candidates[i].x - p.x < minGap) picked.pop();
    }
    picked.push(i);
  }
  return picked;
}

/**
 * Fritsch–Carlson monotone cubic through `pts`, as path commands AFTER the
 * starting point (so callers can chain runs). Monotone, not Catmull-Rom:
 * a balance never dips below the data between two points, so a curve can't
 * suggest a negative balance that no year had (docs/REDESIGN-V5.md §3.2).
 */
export function monotoneCommands(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return '';
  const f = (v: number) => v.toFixed(1);
  if (n === 2) return `L${f(xs[1])},${f(ys[1])}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    slope.push(dx[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / dx[i]);
  }
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let d = '';
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(xs[i] + h)},${f(ys[i] + m[i] * h)} ${f(xs[i + 1] - h)},${f(ys[i + 1] - m[i + 1] * h)} ${f(xs[i + 1])},${f(ys[i + 1])}`;
  }
  return d;
}

/**
 * A line through `(xs[i], ys[i])` in px. A non-finite y is a gap: the path
 * breaks there and never interpolates across it. `stepAt` makes that
 * index's incoming segment a step (flat at the prior y, then a vertical
 * jump) with the curve resuming from it; every other segment is the
 * monotone curve.
 */
export function linePath(xs: number[], ys: number[], stepAt?: number): string {
  let d = '';
  let i = 0;
  const n = Math.min(xs.length, ys.length);
  while (i < n) {
    if (!Number.isFinite(ys[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && Number.isFinite(ys[j + 1])) j++;

    // Split the run at the step so the curve never rounds the jump.
    const cuts: number[] = [i];
    if (stepAt !== undefined && stepAt > i && stepAt <= j) cuts.push(stepAt);
    cuts.push(j + 1);
    for (let c = 0; c < cuts.length - 1; c++) {
      const a = cuts[c];
      const b = cuts[c + 1];
      if (c === 0) d += `M${xs[a].toFixed(1)},${ys[a].toFixed(1)}`;
      else d += `L${xs[a].toFixed(1)},${ys[a - 1].toFixed(1)}L${xs[a].toFixed(1)},${ys[a].toFixed(1)}`;
      d += monotoneCommands(xs.slice(a, b), ys.slice(a, b));
    }
    i = j + 1;
  }
  return d;
}

/** A filled band between `topYs` and `baseYs` (px). The lower edge is the
    SAME monotone curve run backwards, not straight segments, or stacked
    bands would leave slivers against the band below. '' if either edge has a gap. */
export function areaPath(xs: number[], topYs: number[], baseYs: number[], stepAt?: number): string {
  if (xs.length < 2) return '';
  if (!topYs.every(Number.isFinite) || !baseYs.every(Number.isFinite)) return '';
  const top = linePath(xs, topYs, stepAt);
  const back = linePath(xs.slice().reverse(), baseYs.slice().reverse()).replace(/^M/, 'L');
  return `${top}${back}Z`;
}
