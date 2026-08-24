import { describe, expect, it } from 'vitest';
import {
  clampYear,
  quantiseYear,
  rubberBandYear,
  xForYear,
  yearForClientX,
  yearForViewBoxX,
} from './chartMath';

// Same numbers as NetWorthChart.tsx's own constants, duplicated here rather
// than imported so this file never has to import a .tsx module.
const BOUNDS = { plotLeft: 66, plotRight: 1168 };
const VB_W = 1176;
const CHART_BOUNDS = { ...BOUNDS, viewBoxWidth: VB_W };
const START = 2026;
const END = 2046; // a 20-year plan, the same span the sample plan uses

describe('xForYear / yearForViewBoxX', () => {
  it('round-trips a year through x and back', () => {
    for (const year of [START, START + 5, START + 10, END]) {
      const x = xForYear(year, START, END, BOUNDS);
      expect(yearForViewBoxX(x, START, END, BOUNDS)).toBeCloseTo(year, 9);
    }
  });

  it('places the start and end years exactly at the plot edges', () => {
    expect(xForYear(START, START, END, BOUNDS)).toBe(BOUNDS.plotLeft);
    expect(xForYear(END, START, END, BOUNDS)).toBe(BOUNDS.plotRight);
  });

  it('is linear in between', () => {
    const mid = xForYear(START + 10, START, END, BOUNDS); // halfway through a 20-year span
    expect(mid).toBeCloseTo((BOUNDS.plotLeft + BOUNDS.plotRight) / 2, 6);
  });

  it('does not divide by zero for a one-year (or zero-span) plan', () => {
    expect(() => xForYear(START, START, START, BOUNDS)).not.toThrow();
    expect(Number.isFinite(xForYear(START, START, START, BOUNDS))).toBe(true);
  });
});

describe('yearForClientX', () => {
  it('recovers the plan bounds from the edges of the rendered box, regardless of stretch', () => {
    // A rect far narrower than the viewBox's own 1176 units — this is
    // exactly the non-uniform preserveAspectRatio="none" stretch the chart
    // relies on (see planner.css's ".ns-chart svg" comment). Going through
    // a FRACTION of the rect first is what has to make this still land
    // exactly on the plot's edges.
    const rect = { left: 100, width: 500 };
    const leftClientX = 100 + (BOUNDS.plotLeft / VB_W) * 500;
    const rightClientX = 100 + (BOUNDS.plotRight / VB_W) * 500;

    expect(yearForClientX(leftClientX, rect, CHART_BOUNDS, START, END)).toBeCloseTo(START, 6);
    expect(yearForClientX(rightClientX, rect, CHART_BOUNDS, START, END)).toBeCloseTo(END, 6);
  });

  it('agrees with xForYear at a wide variety of rendered widths', () => {
    for (const width of [320, 800, 1176, 2200]) {
      const rect = { left: 40, width };
      for (const year of [START, START + 3, START + 12, END]) {
        const vbX = xForYear(year, START, END, BOUNDS);
        const clientX = rect.left + (vbX / VB_W) * width;
        expect(yearForClientX(clientX, rect, CHART_BOUNDS, START, END)).toBeCloseTo(year, 6);
      }
    }
  });

  it('never divides by zero on a zero-width rect (a chart mid-layout)', () => {
    // The guard defines the fraction as 0 (not NaN) when the rect has no
    // width yet, which lands on viewBox x=0 — a hair left of `plotLeft`,
    // so slightly before `startYear`, not exactly on it. The contract this
    // is actually protecting is "finite, no NaN/Infinity, no throw."
    const rect = { left: 0, width: 0 };
    const year = yearForClientX(50, rect, CHART_BOUNDS, START, END);
    expect(Number.isFinite(year)).toBe(true);
  });
});

describe('quantiseYear', () => {
  it('rounds to the nearest whole year', () => {
    expect(quantiseYear(2030.2)).toBe(2030);
    expect(quantiseYear(2030.5)).toBe(2031);
    expect(quantiseYear(2030.49)).toBe(2030);
    expect(quantiseYear(2030.9)).toBe(2031);
  });
});

describe('clampYear', () => {
  it('leaves an in-range year untouched', () => {
    expect(clampYear(2030, START, END)).toBe(2030);
  });

  it('hard-clamps before the start and after the end — an event can never sit outside the plan', () => {
    expect(clampYear(START - 50, START, END)).toBe(START);
    expect(clampYear(END + 50, START, END)).toBe(END);
    expect(clampYear(START, START, END)).toBe(START);
    expect(clampYear(END, START, END)).toBe(END);
  });
});

describe('rubberBandYear', () => {
  it('is the identity inside the bounds', () => {
    expect(rubberBandYear(START, START, END)).toBe(START);
    expect(rubberBandYear(END, START, END)).toBe(END);
    expect(rubberBandYear(2030, START, END)).toBe(2030);
  });

  it('gives some but not all of the requested overflow just past a bound', () => {
    const pulled = rubberBandYear(START - 1, START, END);
    expect(pulled).toBeLessThan(START); // creeps past the edge...
    expect(pulled).toBeGreaterThan(START - 1); // ...but resisted, not 1:1
  });

  it('is monotonic — pulling further always creeps further, never snaps back', () => {
    const near = rubberBandYear(START - 1, START, END);
    const far = rubberBandYear(START - 10, START, END);
    const veryFar = rubberBandYear(START - 1000, START, END);
    expect(far).toBeLessThan(near);
    expect(veryFar).toBeLessThan(far);
  });

  it('approaches but never reaches a bounded asymptote, however hard you pull', () => {
    const veryFar = rubberBandYear(START - 100_000, START, END);
    // Never more than a couple of "years" of visible give, no matter how
    // far past the edge the raw pointer position is.
    expect(START - veryFar).toBeLessThan(3);
  });

  it('mirrors above the end bound the same way it resists below the start', () => {
    const above = rubberBandYear(END + 1, START, END);
    const below = rubberBandYear(START - 1, START, END);
    expect(above - END).toBeCloseTo(START - below, 9);
  });
});
