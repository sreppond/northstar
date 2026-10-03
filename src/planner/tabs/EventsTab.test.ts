import { describe, expect, it } from 'vitest';
import { yearFromDragDelta } from './EventsTab';

/**
 * `yearFromDragDelta` is `EventsTab`'s Gantt-bar drag math (docs/
 * ROADMAP-10.md C7: "bars drag along the timeline to change start year:
 * pointer events, quantized to years"). DELTA-based: how far the pointer
 * has moved since the drag started, converted to a year offset from the
 * event's ORIGINAL year — not an absolute pointer-position-to-year mapping,
 * which would snap the bar's start to wherever it was grabbed (see the
 * function's own doc comment for why that's wrong for a bar with width).
 */
describe('yearFromDragDelta', () => {
  const startYear = 2026;
  const endYear = 2046;
  const pxPerYear = 50; // a 1000px track over a 20-year span

  it('returns the origin year when the pointer has not moved', () => {
    expect(yearFromDragDelta(0, pxPerYear, 2030, startYear, endYear)).toBe(2030);
  });

  it('moves forward by whole years for a rightward drag', () => {
    expect(yearFromDragDelta(150, pxPerYear, 2030, startYear, endYear)).toBe(2033);
  });

  it('moves backward by whole years for a leftward drag', () => {
    expect(yearFromDragDelta(-100, pxPerYear, 2030, startYear, endYear)).toBe(2028);
  });

  it('quantizes to the nearest whole year rather than a fractional one', () => {
    // 55px at 50px/yr is 1.1 years — rounds down to +1, not up to +2.
    expect(yearFromDragDelta(55, pxPerYear, 2030, startYear, endYear)).toBe(2031);
    // 80px at 50px/yr is 1.6 years — rounds up to +2.
    expect(yearFromDragDelta(80, pxPerYear, 2030, startYear, endYear)).toBe(2032);
  });

  it('clamps to startYear rather than a year before the plan begins', () => {
    expect(yearFromDragDelta(-1000, pxPerYear, 2030, startYear, endYear)).toBe(startYear);
  });

  it('clamps to endYear rather than a year past the plan horizon', () => {
    expect(yearFromDragDelta(1000, pxPerYear, 2030, startYear, endYear)).toBe(endYear);
  });

  it('is independent of WHERE on the bar the pointer grabbed it — only the delta matters', () => {
    // Grabbing near the bar's left edge vs. deep into its width, then
    // dragging the same 150px, lands on the same year either way: the
    // offset from the origin year is all that's tracked, never the
    // pointer's absolute position.
    const originYear = 2028; // a long haveAKid-style bar starting here
    const draggedSameAmount = yearFromDragDelta(150, pxPerYear, originYear, startYear, endYear);
    expect(draggedSameAmount).toBe(2031);
  });

  it('treats a zero px-per-year (not yet measured) as no movement rather than dividing by zero', () => {
    expect(yearFromDragDelta(200, 0, 2030, startYear, endYear)).toBe(2030);
  });
});
