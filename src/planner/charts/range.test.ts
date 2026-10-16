import { describe, expect, it } from 'vitest';
import { availableRanges, effectiveRange, rangeWindow } from './range';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// Spencer's plan shape: opens 2026, runs through 2091 (66 annual points).
const YEARS = range(2026, 2091);

describe('rangeWindow', () => {
  it('"all" is the whole domain', () => {
    expect(rangeWindow(YEARS, 2026, 'all')).toEqual({ from: 2026, to: 2091 });
  });

  it('counts N years forward from today, not back from the end', () => {
    expect(rangeWindow(YEARS, 2026, '10y')).toEqual({ from: 2026, to: 2036 });
    expect(rangeWindow(YEARS, 2026, '40y')).toEqual({ from: 2026, to: 2066 });
  });

  it('1Y is never fewer than three points (today + two closes)', () => {
    const w = rangeWindow(YEARS, 2026, '1y');
    const inside = YEARS.filter((y) => y >= w.from && y <= w.to);
    expect(inside.length).toBe(3);
    expect(w.from).toBe(2026);
  });

  it('anchors at the opening year even when history precedes it', () => {
    expect(rangeWindow(range(2020, 2060), 2026, '5y')).toEqual({ from: 2026, to: 2031 });
  });

  it('clamps to the end of a short plan', () => {
    expect(rangeWindow(range(2026, 2031), 2026, '20y')).toEqual({ from: 2026, to: 2031 });
  });

  it('grows backwards when the opening year is near the end and few points remain', () => {
    const w = rangeWindow(range(2026, 2040), 2039, '1y');
    expect(w.to).toBe(2040);
    expect(range(2026, 2040).filter((y) => y >= w.from && y <= w.to).length).toBe(3);
  });

  it('returns the whole domain when there are no more than three points', () => {
    expect(rangeWindow([2026, 2027], 2026, '1y')).toEqual({ from: 2026, to: 2027 });
  });

  it('survives an empty domain', () => {
    expect(rangeWindow([], 2026, '5y')).toEqual({ from: 2026, to: 2026 });
  });
});

describe('availableRanges', () => {
  it('offers everything on a plan longer than 40 years', () => {
    expect(availableRanges(YEARS, 2026)).toEqual(['1y', '3y', '5y', '10y', '20y', '40y', 'all']);
  });

  it('hides options as long as or longer than the plan, and always keeps All', () => {
    // A 30-year plan: 40Y collapses into All.
    expect(availableRanges(range(2026, 2056), 2026)).toEqual(['1y', '3y', '5y', '10y', '20y', 'all']);
    // Exactly 20 years: 20Y would equal All, so it goes too.
    expect(availableRanges(range(2026, 2046), 2026)).toEqual(['1y', '3y', '5y', '10y', 'all']);
    expect(availableRanges([2026], 2026)).toEqual(['all']);
  });
});

describe('effectiveRange', () => {
  it('falls back to All when the saved range no longer exists', () => {
    expect(effectiveRange('40y', ['1y', '3y', 'all'])).toBe('all');
    expect(effectiveRange('3y', ['1y', '3y', 'all'])).toBe('3y');
  });
});
