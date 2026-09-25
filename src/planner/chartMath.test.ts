import { describe, expect, it } from 'vitest';
import {
  actualPointYear,
  clampYear,
  domainStartYear,
  niceAxisTicks,
  packLabelLanes,
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

describe('niceAxisTicks', () => {
  it('never uses the ceiling itself as the step — always a 1/2/2.5/5 x 10^n multiple', () => {
    for (const ceiling of [4_290_000, 1_070_000, 999_999, 3_000_000, 61_000]) {
      const ticks = niceAxisTicks(ceiling);
      const step = ticks[1]?.value ?? 0;
      const exponent = Math.floor(Math.log10(step));
      const fraction = step / 10 ** exponent;
      expect([1, 2, 2.5, 5, 10]).toContain(Number(fraction.toFixed(6)));
    }
  });

  it('always starts at zero', () => {
    expect(niceAxisTicks(4_290_000)[0]?.value).toBe(0);
  });

  it('produces 3-5 nice lines for a typical ceiling', () => {
    // Excludes a possible trailing "actual ceiling" line, which is a
    // separate, deliberate addition rather than part of the nice sequence.
    const ticks = niceAxisTicks(4_290_000);
    const lastNice = ticks[ticks.length - 1]?.value === 4_290_000 ? ticks.length - 1 : ticks.length;
    expect(lastNice).toBeGreaterThanOrEqual(3);
    expect(lastNice).toBeLessThanOrEqual(6);
  });

  it('adds the actual ceiling as its own line only when it is far from the last nice one', () => {
    // 4.29M is well clear of a $4M nice line (~7.25% away — just under the
    // threshold, no extra line).
    const close = niceAxisTicks(4_290_000);
    expect(close[close.length - 1]?.value).not.toBe(4_290_000);

    // 4.6M is comfortably more than 8% past a $4M nice line.
    const far = niceAxisTicks(4_600_000);
    expect(far[far.length - 1]?.value).toBe(4_600_000);
  });

  it('degenerates to a single zero line rather than dividing by zero on a non-positive ceiling', () => {
    expect(niceAxisTicks(0)).toEqual([{ value: 0 }]);
    expect(niceAxisTicks(-5)).toEqual([{ value: 0 }]);
  });
});

describe('packLabelLanes', () => {
  it('keeps non-overlapping labels in the same lane', () => {
    const result = packLabelLanes(
      [
        { id: 'a', x: 100, width: 60 },
        { id: 'b', x: 300, width: 60 },
      ],
      14,
    );
    expect(result.map((r) => r.lane)).toEqual([0, 0]);
  });

  it('drops a colliding label to the next lane down', () => {
    const result = packLabelLanes(
      [
        { id: 'a', x: 100, width: 80 },
        { id: 'b', x: 120, width: 80 }, // well within 80px of `a` — must collide
      ],
      14,
    );
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });

  it('reuses an earlier lane once there is room again, rather than stacking new lanes forever', () => {
    const result = packLabelLanes(
      [
        { id: 'a', x: 100, width: 60 }, // lane 0, right edge ~130+gap
        { id: 'b', x: 110, width: 60 }, // collides with a -> lane 1
        { id: 'c', x: 400, width: 60 }, // far clear of both -> lane 0 again
      ],
      14,
    );
    expect(result.map((r) => r.lane)).toEqual([0, 1, 0]);
  });

  it('leaves a label alone when it is already clear of minLeft', () => {
    const result = packLabelLanes([{ id: 'a', x: 500, width: 60 }], 14, 66);
    expect(result[0].left).toBe(500 - 30);
  });

  it('clamps a label centred near the plot edge instead of letting it spill into the gutter', () => {
    // An event right at the plot's left edge (x=66) centres a 60-wide label
    // at left=36 — well past the axis into the tick gutter without a clamp.
    const result = packLabelLanes([{ id: 'a', x: 66, width: 60 }], 14, 70);
    expect(result[0].left).toBe(70);
  });

  it('tracks lane occupancy from the CLAMPED left, not the raw one, so a later label still collides correctly', () => {
    const result = packLabelLanes(
      [
        { id: 'a', x: 66, width: 60 }, // clamped to left=70, occupies to ~130+gap
        { id: 'b', x: 100, width: 60 }, // left=70 unclamped — collides with a's clamped span
      ],
      14,
      70,
    );
    expect(result[0].lane).toBe(0);
    expect(result[1].lane).toBe(1);
  });
});

describe('domainStartYear', () => {
  it('is the projection start when there are no actuals', () => {
    expect(domainStartYear([], START)).toBe(START);
  });

  it('extends back to the earliest actual, never forward past the projection start', () => {
    expect(domainStartYear([2023.4, 2024.8], START)).toBe(2023.4);
    expect(domainStartYear([START + 5], START)).toBe(START);
  });
});

describe('actualPointYear', () => {
  it('places a point logged exactly on asOf at startYear, not at its own raw calendar fraction', () => {
    // The bug this guards: `years[0]` sits at `startYear` on the chart, but
    // `asOf` (when it falls mid-year) is a larger number — plotting the raw
    // fraction put "today" to the right of the projection's own start.
    const asOf = START + 0.73;
    expect(actualPointYear(asOf, asOf, START)).toBe(START);
  });

  it('offsets earlier and later points by the same distance from asOf', () => {
    const asOf = START + 0.73;
    expect(actualPointYear(asOf - 1, asOf, START)).toBeCloseTo(START - 1, 9);
    expect(actualPointYear(asOf + 0.5, asOf, START)).toBeCloseTo(START + 0.5, 9);
  });
});
