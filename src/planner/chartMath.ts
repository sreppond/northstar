/**
 * Pure screen <-> plan-year geometry shared by the chart's scrub and drag
 * gestures (docs/REDESIGN.md §4.1, §5.4).
 *
 * Pulled out of NetWorthChart.tsx for two reasons:
 *  1. It is the one piece of this interaction most likely to hide an
 *     off-by-one or a sign flip, and this repo's test runner only collects
 *     `src/**\/*.test.ts` (see vitest.config.ts) — a `.tsx` component can't
 *     easily be unit tested here, a plain module can.
 *  2. `build()` in NetWorthChart.tsx and the live drag/scrub handlers both
 *     need the SAME year<->x mapping. Two independent implementations of
 *     that formula would be a standing invitation for the static line and
 *     the live-dragged dot to quietly disagree about where a year sits.
 *
 * Screen -> year is a two-step conversion, deliberately kept as two
 * functions: `yearForClientX` turns a raw pointer `clientX` into a FRACTION
 * of the chart's rendered box, then hands that fraction to `yearForViewBoxX`
 * (via the known viewBox width) to get a year. Going through a fraction
 * first, rather than assuming any fixed px-per-viewBox-unit ratio, is what
 * keeps this correct under `preserveAspectRatio="none"` (see the comment on
 * `.ns-chart svg` in planner.css): the chart's svg stretches non-uniformly
 * to fill whatever box the page gives it, so the true pixel-per-viewBox-unit
 * ratio changes with viewport width. A fraction of the rendered box cancels
 * that stretch out; only the viewBox's own (constant) width has to be known.
 */

export interface PlotBounds {
  plotLeft: number;
  plotRight: number;
}

/** Plan year -> viewBox x. The one formula every horizontal position in the
    chart is built from. Mirrors the local `xFor` NetWorthChart.tsx's own
    `build()` used to compute — that function now delegates here instead of
    keeping its own copy. */
export function xForYear(
  year: number,
  startYear: number,
  endYear: number,
  bounds: PlotBounds,
): number {
  const span = Math.max(1, endYear - startYear);
  return bounds.plotLeft + ((year - startYear) / span) * (bounds.plotRight - bounds.plotLeft);
}

/** Inverse of `xForYear`, from a viewBox x (not a screen pixel — see
    `yearForClientX` for the screen-to-viewBox step). Continuous: callers
    that want a whole year call `quantiseYear` themselves. */
export function yearForViewBoxX(
  x: number,
  startYear: number,
  endYear: number,
  bounds: PlotBounds,
): number {
  const span = Math.max(1, endYear - startYear);
  const plotSpan = bounds.plotRight - bounds.plotLeft;
  if (plotSpan === 0) return startYear;
  return startYear + ((x - bounds.plotLeft) / plotSpan) * span;
}

export interface ChartBounds extends PlotBounds {
  viewBoxWidth: number;
}

/** The subset of `DOMRect` this module actually reads — real DOM rects
    satisfy it, and so does a plain object in a test. */
export interface ClientRect {
  left: number;
  width: number;
}

/**
 * Screen `clientX` -> plan year. Continuous: not rounded, not clamped to the
 * plan's bounds. Scrub and drag each quantise/clamp differently (drag
 * rubber-bands past a bound before the eventual hard clamp; scrub clamps
 * straight away), so that is left to the caller.
 */
export function yearForClientX(
  clientX: number,
  rect: ClientRect,
  bounds: ChartBounds,
  startYear: number,
  endYear: number,
): number {
  const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const vbX = frac * bounds.viewBoxWidth;
  return yearForViewBoxX(vbX, startYear, endYear, bounds);
}

/** Nearest whole year — every event's `startYear` is an integer, so a
    continuous pointer position always quantises before it can be written. */
export function quantiseYear(year: number): number {
  return Math.round(year);
}

/** Hard bound: an event can never sit before the plan starts or after it
    ends. This is the value actually written to the plan, on both the live
    preview and the eventual commit — `rubberBandYear` below is a DIFFERENT,
    softer bound used only for where something is drawn. */
export function clampYear(year: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, year));
}

/**
 * iOS-style diminishing-returns resistance: the classic UIScrollView bounce
 * formula, `f(x) = x·d·c / (d + c·x)`, which starts linear near zero and
 * bends toward an asymptote at `d` as `x` grows — pulling further past the
 * edge always moves the drawn position a little more, but never past `d`
 * years beyond the bound, and never suddenly (docs/REDESIGN.md §4.1 /
 * DESIGN-DIRECTION.md move 5: "rubber-band at the bounds").
 *
 * Only ever applied to where something is DRAWN. The year actually written
 * to the plan (the live reprojection and the eventual commit) always goes
 * through the hard `clampYear` instead — an event's `startYear` has no
 * concept of "a little past the edge."
 */
export function rubberBandYear(year: number, min: number, max: number): number {
  const d = 2; // years — the asymptotic cap on visible overshoot
  const c = 0.55; // resistance constant (the standard UIScrollView value)
  const overflow = (x: number) => (x * d * c) / (d + c * x);

  if (year < min) return min - overflow(min - year);
  if (year > max) return max + overflow(year - max);
  return year;
}
