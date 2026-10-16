import { describe, expect, it } from 'vitest';
import { centerScrollLeft, scrollEdges } from './useScrollToYear';

describe('scrollEdges', () => {
  it('shows no fades when nothing overflows', () => {
    expect(scrollEdges(0, 800, 800)).toEqual({ start: false, end: false });
  });
  it('fades only the right edge at the start', () => {
    expect(scrollEdges(0, 800, 2000)).toEqual({ start: false, end: true });
  });
  it('fades both edges in the middle', () => {
    expect(scrollEdges(500, 800, 2000)).toEqual({ start: true, end: true });
  });
  it('fades only the left edge at the end, tolerating sub-pixel rounding', () => {
    expect(scrollEdges(1200, 800, 2000)).toEqual({ start: true, end: false });
    expect(scrollEdges(1199.4, 800, 2000)).toEqual({ start: true, end: false });
  });
  it('ignores a sub-pixel scrollLeft at the very start', () => {
    expect(scrollEdges(0.5, 800, 2000).start).toBe(false);
  });
});

describe('centerScrollLeft', () => {
  const base = { clientWidth: 800, scrollWidth: 4000, labelWidth: 200, cellWidth: 100 };
  it('centres in the area right of the label', () => {
    // Visible centre = 200 + 300 = 500; a column at x=1000 (centre 1050) needs +550.
    expect(centerScrollLeft({ ...base, scrollLeft: 0, cellLeft: 1000 })).toBe(550);
  });
  it('accounts for the current scroll position', () => {
    expect(centerScrollLeft({ ...base, scrollLeft: 300, cellLeft: 700 })).toBe(550);
  });
  it('clamps to the scrollable range', () => {
    expect(centerScrollLeft({ ...base, scrollLeft: 0, cellLeft: 250 })).toBe(0);
    expect(centerScrollLeft({ ...base, scrollLeft: 0, cellLeft: 3900 })).toBe(3200);
  });
});
