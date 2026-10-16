/**
 * Pure arc geometry for DonutChart (docs/REDESIGN-V5.md §3.5). Angles are
 * radians, 0 at 12 o'clock, increasing clockwise — so a slice's angles can
 * be sprung as plain numbers and turned into a path only at draw time.
 */

const TAU = Math.PI * 2;

export interface ArcAngles {
  start: number;
  end: number;
}

/** Each value's share of the circle, in order. Non-positive and non-finite
    values take no angle (a zero-width arc at the running position), so a key
    that drops to 0 collapses in place instead of vanishing. */
export function sliceAngles(values: number[]): ArcAngles[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return clean.map((v) => {
    const start = cursor;
    cursor += total > 0 ? (v / total) * TAU : 0;
    return { start, end: cursor };
  });
}

export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

export interface VisibleArc {
  /** Sweep drawn, radians, after the pad (and the round caps' own length). */
  start: number;
  end: number;
  /** Whether the ends are round caps. A slice too short to hold a pill falls
      back to butt ends so a 1% slice stays 1% wide instead of a 28px dot. */
  round: boolean;
}

/**
 * The part of a slice that is actually stroked.
 *
 * The ring is drawn as stroked arcs with `stroke-linecap: round`, which makes
 * the ends pill-shaped but pushes them half a stroke-width PAST the path's
 * end. So the path is pulled in by that cap length on each side, plus half
 * the pad, and the visible gap between neighbours comes out as exactly the
 * pad angle. Returns null when nothing is left to draw (an empty slice, or
 * mid-sweep before it has any width).
 */
export function visibleArc(
  angles: ArcAngles,
  padAngle: number,
  radius: number,
  thickness: number,
): VisibleArc | null {
  const sweep = angles.end - angles.start;
  const pad = (padAngle * Math.PI) / 180;
  const avail = sweep - pad;
  if (!(avail > 1e-4)) return null;

  const cap = thickness / 2 / radius;
  if (avail * radius >= thickness * 0.6) {
    // Round: the capped path may be zero-length (a pure dot), never negative.
    const inner = Math.max(0, avail - 2 * cap);
    const mid = (angles.start + angles.end) / 2;
    return { start: mid - inner / 2, end: mid + inner / 2, round: true };
  }
  return { start: angles.start + pad / 2, end: angles.end - pad / 2, round: false };
}

/** SVG path for one stroked arc. Clamped just under a full turn: a 360° `A`
    command has coincident endpoints and draws nothing. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = Math.min(end - start, TAU - 1e-3);
  const a = polar(cx, cy, r, start);
  const b = polar(cx, cy, r, start + sweep);
  if (sweep <= 1e-6) return `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${a.x.toFixed(2)},${a.y.toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}A${r},${r} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

/** Unit vector pointing out from the centre through a slice's middle — the
    direction a hovered slice pushes out along. */
export function bisector(angles: ArcAngles): { x: number; y: number } {
  const mid = (angles.start + angles.end) / 2;
  return { x: Math.sin(mid), y: -Math.cos(mid) };
}
