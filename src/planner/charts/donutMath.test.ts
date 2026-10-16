import { describe, expect, it } from 'vitest';
import { arcPath, bisector, polar, sliceAngles, visibleArc } from './donutMath';

const TAU = Math.PI * 2;

describe('sliceAngles', () => {
  it('shares the circle in proportion and closes it', () => {
    const a = sliceAngles([1, 1, 2]);
    expect(a[0]).toEqual({ start: 0, end: TAU / 4 });
    expect(a[2].end).toBeCloseTo(TAU, 9);
    expect(a[1].end).toBeCloseTo(a[2].start, 9);
  });

  it('gives a zero, negative or NaN value no width but keeps its place', () => {
    const a = sliceAngles([2, 0, NaN, -5, 2]);
    expect(a[1].end - a[1].start).toBe(0);
    expect(a[2].end - a[2].start).toBe(0);
    expect(a[3].end - a[3].start).toBe(0);
    expect(a[4].end).toBeCloseTo(TAU, 9);
  });

  it('is all zero-width when nothing is positive', () => {
    expect(sliceAngles([0, 0]).every((s) => s.start === 0 && s.end === 0)).toBe(true);
  });
});

describe('polar', () => {
  it('puts 0 at 12 o\'clock and goes clockwise', () => {
    const top = polar(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100, 9);
    expect(top.y).toBeCloseTo(50, 9);
    const right = polar(100, 100, 50, Math.PI / 2);
    expect(right.x).toBeCloseTo(150, 9);
    expect(right.y).toBeCloseTo(100, 9);
  });
});

describe('visibleArc', () => {
  const R = 100;
  const T = 28;

  it('leaves exactly the pad angle between two round-capped neighbours', () => {
    const [a, b] = sliceAngles([1, 1]);
    const va = visibleArc(a, 2, R, T)!;
    const vb = visibleArc(b, 2, R, T)!;
    expect(va.round && vb.round).toBe(true);
    // Each end grows by the cap's own angle (half the stroke / radius) when
    // stroked, so the gap between the two drawn shapes is the 2deg pad.
    const cap = T / 2 / R;
    const gap = vb.start - cap - (va.end + cap);
    expect((gap * 180) / Math.PI).toBeCloseTo(2, 6);
  });

  it('falls back to butt ends for a slice too short to hold a pill', () => {
    const tiny = visibleArc({ start: 0, end: (3 * Math.PI) / 180 }, 2, R, T)!;
    expect(tiny.round).toBe(false);
    expect(tiny.end - tiny.start).toBeCloseTo((1 * Math.PI) / 180, 9);
  });

  it('draws nothing for an empty or pad-swallowed slice', () => {
    expect(visibleArc({ start: 1, end: 1 }, 2, R, T)).toBeNull();
    expect(visibleArc({ start: 0, end: (1.5 * Math.PI) / 180 }, 2, R, T)).toBeNull();
  });
});

describe('arcPath', () => {
  it('uses the large-arc flag past a half turn', () => {
    expect(arcPath(0, 0, 10, 0, Math.PI * 0.5)).toContain(' 0 0 1 ');
    expect(arcPath(0, 0, 10, 0, Math.PI * 1.5)).toContain(' 0 1 1 ');
  });
  it('never emits a degenerate 360 degree arc', () => {
    const d = arcPath(0, 0, 10, 0, TAU);
    const [, ex, ey] = /A10,10 0 1 1 ([\d.-]+),([\d.-]+)/.exec(d)!;
    // The end must differ from the start (0,-10) or the browser draws nothing.
    expect(Math.abs(Number(ex)) + Math.abs(Number(ey) + 10)).toBeGreaterThan(0);
  });
  it('collapses to a point for a zero sweep (a pure round cap)', () => {
    expect(arcPath(0, 0, 10, 1, 1)).toMatch(/^M[\d.-]+,[\d.-]+L[\d.-]+,[\d.-]+$/);
  });
});

describe('bisector', () => {
  it('points out through the slice middle', () => {
    const right = bisector({ start: 0, end: Math.PI });
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.y).toBeCloseTo(0, 9);
  });
});
