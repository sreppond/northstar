import { describe, expect, it } from 'vitest';
import { cubicBezier, easeDrawIn, isSettled, stepSpring, type SpringState } from './spring';

/** Runs the spring at 60fps until it settles (or `maxFrames`), returning every state. */
function simulate(
  from: SpringState,
  target: number,
  config: { dampingRatio?: number; response?: number },
  maxFrames = 600,
): SpringState[] {
  const states = [from];
  let s = from;
  for (let i = 0; i < maxFrames; i++) {
    s = stepSpring(s, target, 1 / 60, config);
    states.push(s);
    if (isSettled(s, target, 0.001)) break;
  }
  return states;
}

describe('stepSpring', () => {
  it('settles on the target', () => {
    const states = simulate({ value: 0, velocity: 0 }, 100, { dampingRatio: 1, response: 0.4 });
    const last = states[states.length - 1];
    expect(last.value).toBeCloseTo(100, 2);
    expect(Math.abs(last.velocity)).toBeLessThan(0.01);
    // ~response-ish: a 0.4s spring is at rest well inside two seconds.
    expect(states.length / 60).toBeLessThan(2);
  });

  it('never overshoots at damping ratio 1, from rest', () => {
    const states = simulate({ value: 0, velocity: 0 }, 100, { dampingRatio: 1, response: 0.4 });
    for (const s of states) expect(s.value).toBeLessThanOrEqual(100 + 1e-9);
    // And it only ever moves toward the target.
    for (let i = 1; i < states.length; i++) expect(states[i].value).toBeGreaterThanOrEqual(states[i - 1].value - 1e-9);
  });

  it('does overshoot when under-damped, so the test above is not vacuous', () => {
    const states = simulate({ value: 0, velocity: 0 }, 100, { dampingRatio: 0.5, response: 0.4 });
    expect(Math.max(...states.map((s) => s.value))).toBeGreaterThan(100.5);
    expect(states[states.length - 1].value).toBeCloseTo(100, 1);
  });

  it('is exact for any dt: one big step equals many small ones', () => {
    const cfg = { dampingRatio: 1, response: 0.4 };
    const big = stepSpring({ value: 0, velocity: 30 }, 50, 0.5, cfg);
    let small: SpringState = { value: 0, velocity: 30 };
    for (let i = 0; i < 50; i++) small = stepSpring(small, 50, 0.01, cfg);
    expect(big.value).toBeCloseTo(small.value, 6);
    expect(big.velocity).toBeCloseTo(small.velocity, 6);
  });

  it('carries velocity through a re-target instead of restarting from rest', () => {
    const cfg = { dampingRatio: 1, response: 0.4 };
    let s: SpringState = { value: 0, velocity: 0 };
    for (let i = 0; i < 10; i++) s = stepSpring(s, 100, 1 / 60, cfg);
    expect(s.velocity).toBeGreaterThan(0);

    // Re-target to a point behind it: velocity is still the value the state
    // had a frame ago (the next step's velocity is continuous with it),
    // not zero — no brick wall at the reversal.
    const before = s.velocity;
    const after = stepSpring(s, 0, 1 / 1000, cfg);
    expect(Math.abs(after.velocity - before)).toBeLessThan(Math.abs(before) * 0.5);
    expect(after.value).toBeGreaterThan(s.value - 1); // still coasting forward for an instant
  });

  it('leaves the state untouched for a zero or negative dt', () => {
    const s = { value: 3, velocity: 2 };
    expect(stepSpring(s, 10, 0)).toBe(s);
    expect(stepSpring(s, 10, -1)).toBe(s);
  });
});

describe('cubicBezier', () => {
  it('pins the endpoints and is monotone for the draw-in curve', () => {
    expect(easeDrawIn(0)).toBe(0);
    expect(easeDrawIn(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const y = easeDrawIn(i / 20);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    // Ease-out: most of the distance is covered early.
    expect(easeDrawIn(0.3)).toBeGreaterThan(0.5);
  });

  it('is the identity for a linear bezier', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.37)).toBeCloseTo(0.37, 4);
  });
});
