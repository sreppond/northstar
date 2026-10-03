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

// ---------------------------------------------------------------------------
// Nice axis ticks (docs/REVIEW.md S2)
// ---------------------------------------------------------------------------

export interface AxisTick {
  value: number;
}

/**
 * Gridlines at a 1/2/2.5/5 × 10ⁿ step below `ceiling`, rather than the
 * ceiling's own robotic quarters (which drew lines at $1.07M / $2.15M /
 * $3.22M / $4.29M — numbers nobody would ever choose by hand). Always
 * includes zero; targets `targetLines` steps above it, so 3-5 gridlines in
 * practice depending on how `ceiling` falls between two nice steps.
 *
 * The ceiling itself only gets its own line when it clears the topmost nice
 * one by more than a quarter of the step between nice lines — close enough
 * and that nice line already reads as "the top"; a second line a few pixels
 * away would just be clutter.
 *
 * This threshold is relative to `step`, not to `ceiling` (docs/W3-REVIEW.md
 * "Axis ceiling ticks"): a flat percentage of `ceiling` let a gap as small as
 * ~20% of the normal gridline spacing through whenever `step` happened to be
 * large relative to `ceiling` (a $4.4M ceiling landed its own line a mere
 * $400K past the $4M nice one — a fifth of the $2M step apart — reading as
 * "$4.4M" crowding "$4M"). Sized against `step` instead, the extra line only
 * appears when it would actually read as its own gridline.
 */
export function niceAxisTicks(ceiling: number, targetLines = 4): AxisTick[] {
  if (ceiling <= 0) return [{ value: 0 }];

  const rough = ceiling / Math.max(1, targetLines);
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const fraction = rough / base;
  const niceFractions = [1, 2, 2.5, 5, 10];
  const niceFraction = niceFractions.find((f) => f >= fraction) ?? 10;
  const step = niceFraction * base;

  // Count-based rather than accumulating `v += step` — repeated float
  // addition drifts just enough, over enough steps, to occasionally land a
  // hair past `ceiling` or short of it.
  const count = Math.floor(ceiling / step + 1e-9);
  const ticks: AxisTick[] = Array.from({ length: count + 1 }, (_, i) => ({ value: i * step }));

  const topNice = ticks[ticks.length - 1]?.value ?? 0;
  if (ceiling - topNice > step * 0.25) {
    ticks.push({ value: ceiling });
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Event label lane-packing (docs/REVIEW.md M7)
// ---------------------------------------------------------------------------

export interface LabelPackItem {
  id: string;
  /** Centre x, in the same unit space as `width`/`gap` (viewBox units,
      already converted from real px by the caller — see
      NetWorthChart.tsx's `unitsPerPx`). */
  x: number;
  width: number;
}

export interface LabelPackResult {
  id: string;
  /** The label's left edge, in the same units `x`/`width` were given in. */
  left: number;
  /** 0 = the top lane, 1 = the next one down, etc. */
  lane: number;
}

/**
 * Left-to-right lane packing for standing chart labels: a label drops to the
 * next lane down only when it would overlap the last label already placed in
 * its current lane. `items` must already be given in the order they should
 * be considered (NetWorthChart.tsx passes them sorted by year).
 *
 * `minLeft` clamps a label's left edge so a centred pill near the plot's own
 * left edge can never spill into the y-axis tick gutter — the first event in
 * a plan commonly sits right at `startYear`, and without this its label
 * drew over the top y-tick's own text (docs/REVIEW.md, top tick hidden under
 * the first event label). Defaults to no clamp, so every existing caller
 * that doesn't pass one sees byte-identical output.
 *
 * Pure geometry — no text measurement, no DOM, no viewBox-vs-pixel
 * conversion — so the collision rule itself can be unit tested without a
 * component tree; NetWorthChart.tsx is responsible for measuring real label
 * widths and converting them to this function's unit space first.
 */
export function packLabelLanes(items: LabelPackItem[], gap: number, minLeft = -Infinity): LabelPackResult[] {
  const laneRightEdges: number[] = [];
  return items.map((item) => {
    const left = Math.max(minLeft, item.x - item.width / 2);
    let lane = laneRightEdges.findIndex((edge) => left >= edge);
    if (lane === -1) lane = laneRightEdges.length;
    laneRightEdges[lane] = left + item.width + gap;
    return { id: item.id, left, lane };
  });
}

// ---------------------------------------------------------------------------
// Actual-vs-forecast domain (docs/REVIEW.md B1)
// ---------------------------------------------------------------------------

/**
 * How far left the chart's x-domain must extend to fit every logged actual
 * point, as a fractional year — never later than the projection's own start,
 * since a projection with no actuals (or none earlier than today) never
 * needs more room than it already has.
 *
 * Takes the actual points' dates already re-anchored onto the chart's own
 * frame (`actualPointYear` below) rather than the dates themselves, so this
 * module never has to import `progress.ts` just for that conversion.
 */
export function domainStartYear(actualYearFractions: number[], startYear: number): number {
  if (actualYearFractions.length === 0) return startYear;
  return Math.min(startYear, ...actualYearFractions);
}

/**
 * Re-anchors a logged actual's raw calendar-year fraction (`progress.ts`'s
 * `yearFraction`) onto the SAME frame the projection's own `years[0]` sits
 * in: `startYear`, not the fraction's own value. `runPlan` prorates
 * `years[0]` forward from the plan's `asOf` date, not from January 1st (see
 * `progress.ts`'s `planAsOfFraction`), so a point logged exactly on `asOf`
 * has to land exactly at `startYear` here too — plotting the raw fraction
 * instead left a point logged today sitting to the right of the "Today"
 * marker, with a backwards bridge connecting it to the projection's start.
 */
export function actualPointYear(dateFraction: number, asOf: number, startYear: number): number {
  return startYear + (dateFraction - asOf);
}
