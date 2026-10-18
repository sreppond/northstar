/**
 * Pure screen <-> plan-year geometry shared by the chart kit's scrub
 * (`charts/useScrub.ts`) and the Timeline's drag (docs/REDESIGN.md §4.1, §5.4).
 *
 * Kept as a plain module because this repo's test runner only collects
 * `src/**\/*.test.ts` (see vitest.config.ts): a `.tsx` component can't easily
 * be unit tested here, a plain module can.
 *
 * Screen -> year is a two-step conversion, deliberately kept as two
 * functions: `yearForClientX` turns a raw pointer `clientX` into a FRACTION
 * of the chart's rendered box, then hands that fraction to `yearForViewBoxX`
 * (via the known viewBox width) to get a year. Going through a fraction
 * first, rather than assuming any fixed px-per-viewBox-unit ratio, keeps this
 * correct however the svg is stretched to fill its box.
 */

export interface PlotBounds {
  plotLeft: number;
  plotRight: number;
}

/** viewBox x -> plan year (not a screen pixel — see `yearForClientX` for the
    screen-to-viewBox step). Continuous: callers that want a whole year call
    `quantiseYear` themselves. */
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
    preview and the eventual commit. */
export function clampYear(year: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, year));
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
      already converted from real px by the caller). */
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
 * be considered (callers pass them sorted by year).
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
 * component tree; the caller measures real label widths first.
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
