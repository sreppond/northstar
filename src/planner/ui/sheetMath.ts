/**
 * The pure maths behind `Sheet`'s drag-to-dismiss (docs/REDESIGN-V5.md §3.6;
 * apple-design skill §5, §6, §9). Kept out of the component so the
 * close-or-snap-back decision can be tested without a DOM.
 *
 * Positions are along the sheet's dismiss axis, in px: 0 is open, `size` is
 * fully closed (off-screen), and negative is past the open edge.
 */

/** Apple's momentum projection (the "Designing Fluid Interfaces" sample
    code): where a release at `velocity` (px/s) would coast to rest, as an
    exponential decay. NOT v²/2a. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less
    the element follows. Sign-preserving; `dimension` is the surface size. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = overshoot < 0 ? -1 : 1;
  const o = Math.abs(overshoot);
  return (sign * (o * dimension * constant)) / (dimension + constant * o);
}

/** The on-screen offset for a raw 1:1 pointer-tracked offset: free toward
    closed, rubber-banded past the open edge (raw < 0). */
export function resistedOffset(raw: number, size: number): number {
  return raw >= 0 ? raw : rubberband(raw, size);
}

/** Close or snap back? Project the release forward and take whichever of the
    two rest positions (open = 0, closed = size) the projection lands nearer —
    so a short fast flick closes it and a long slow drag that stopped doesn't. */
export function shouldDismiss(current: number, velocity: number, size: number): boolean {
  return current + project(velocity) > size / 2;
}

export interface PointerSample {
  t: number; // ms
  p: number; // px along the dismiss axis
}

/** Release velocity (px/s) from recent pointer samples. Only the last 100ms
    count; a pointer that sat still before release has no velocity to hand off
    (otherwise a pause-then-lift would still fling). */
export function releaseVelocity(samples: PointerSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= 100);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (now - last.t > 60) return 0;
  const dt = last.t - first.t;
  return dt > 0 ? ((last.p - first.p) / dt) * 1000 : 0;
}
