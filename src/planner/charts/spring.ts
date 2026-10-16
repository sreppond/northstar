/**
 * Critically damped spring stepper + cubic-bezier easing, pure (no DOM, no
 * React) so the maths is unit tested (docs/REDESIGN-V5.md §3.8).
 *
 * Parameterised the way the apple-design skill (§4) does it — a damping
 * ratio and a response in seconds — rather than mass/stiffness/damping.
 * `dampingRatio: 1` is critically damped (no overshoot); below 1 it bounces.
 *
 * The step is the closed-form solution of the damped oscillator, not an
 * integrator, so it is exact for any `dt` — a dropped frame or a
 * background-tab catch-up can't blow it up the way explicit Euler would.
 * State (value AND velocity) is separate from the target, which is what lets
 * a re-target mid-flight carry its velocity instead of hard-cutting
 * (apple-design §3 "avoid the brick wall").
 */

export interface SpringState {
  value: number;
  velocity: number;
}

export interface SpringConfig {
  /** 1 = critically damped (default). < 1 overshoots; ≥ 1 is treated as 1. */
  dampingRatio?: number;
  /** Seconds to (roughly) reach the target — not a duration. Default 0.4. */
  response?: number;
}

export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  { dampingRatio = 1, response = 0.4 }: SpringConfig = {},
): SpringState {
  if (dt <= 0) return state;
  const omega = (2 * Math.PI) / Math.max(response, 1e-3);
  const x0 = state.value - target;
  const v0 = state.velocity;

  if (dampingRatio >= 1) {
    const decay = Math.exp(-omega * dt);
    const c2 = v0 + omega * x0;
    return {
      value: target + (x0 + c2 * dt) * decay,
      velocity: (c2 - omega * (x0 + c2 * dt)) * decay,
    };
  }

  const zeta = Math.max(dampingRatio, 0);
  const omegaD = omega * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * omega * dt);
  const cos = Math.cos(omegaD * dt);
  const sin = Math.sin(omegaD * dt);
  const b = (v0 + zeta * omega * x0) / omegaD;
  return {
    value: target + decay * (x0 * cos + b * sin),
    velocity: decay * (-zeta * omega * (x0 * cos + b * sin) + (-x0 * omegaD * sin + b * omegaD * cos)),
  };
}

/** At rest close enough that another frame can't be seen. `eps` is in the
    value's own units — callers pass something around a tenth of a pixel. */
export function isSettled(state: SpringState, target: number, eps: number): boolean {
  return Math.abs(state.value - target) < eps && Math.abs(state.velocity) < eps * 4;
}

/**
 * CSS-style `cubic-bezier(x1, y1, x2, y2)` as a function of progress,
 * solved with Newton's method (bisection fallback). Used for the draw-in
 * reveal, which is a fixed-duration ease (docs/REDESIGN-V5.md §3.2) rather
 * than a spring: it plays once and nothing grabs it.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return sampleY(s);
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 24; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) break;
      if (err > 0) hi = s;
      else lo = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

/** The draw-in curve, docs/REDESIGN-V5.md §3.2: `cubic-bezier(.2,.8,.2,1)`. */
export const easeDrawIn = cubicBezier(0.2, 0.8, 0.2, 1);
