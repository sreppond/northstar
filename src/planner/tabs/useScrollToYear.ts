import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Behaviour behind the sideways-scrolling year tables (docs/REDESIGN-V5.md
 * §3.7): which edges have more content to fade in, where to scroll so a year
 * column sits centred, and the hook that wires both to a native scroller.
 */

export interface ScrollEdges {
  /** More content hidden off the left edge. */
  start: boolean;
  /** More content hidden off the right edge. */
  end: boolean;
}

/** Sub-pixel scroll positions (zoomed displays) must not flicker a fade on. */
const EDGE_EPSILON = 1;

/** Pure: which scroll-edge fades should show. Nothing overflowing, no fades. */
export function scrollEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollEdges {
  return {
    start: scrollLeft > EDGE_EPSILON,
    end: scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON,
  };
}

/**
 * Pure: the `scrollLeft` that centres a column in the part of the scroller NOT
 * covered by the sticky label column. `scrollIntoView({inline:'center'})`
 * centres in the whole viewport, which parks the column half under the label.
 * Clamped to what the scroller can actually reach.
 */
export function centerScrollLeft({
  scrollLeft,
  clientWidth,
  scrollWidth,
  labelWidth,
  cellLeft,
  cellWidth,
}: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  labelWidth: number;
  /** The column's left edge relative to the scroller's left edge, as scrolled now. */
  cellLeft: number;
  cellWidth: number;
}): number {
  const visibleCentre = labelWidth + (clientWidth - labelWidth) / 2;
  const target = scrollLeft + cellLeft + cellWidth / 2 - visibleCentre;
  return Math.min(Math.max(0, target), Math.max(0, scrollWidth - clientWidth));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Drives one scroller. Year header cells carry `data-year`; the first column
 * is the sticky label column. `focusYear` changing from outside smooth-scrolls
 * that column to centre (instant under reduced motion, and on mount); a year
 * the user just picked through `pickYear` doesn't, since it's already under
 * their pointer. Spread `scrollerProps` on the scroller element.
 */
export function useScrollToYear(
  focusYear: number | null | undefined,
  onFocusYear?: (year: number | null) => void,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  const frame = useRef(0);
  const internalYear = useRef<number | null>(null);
  const mounted = useRef(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = scrollEdges(el.scrollLeft, el.clientWidth, el.scrollWidth);
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  /** rAF-throttled: scroll fires far faster than the fades need to move. */
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }, [measure]);

  // Columns can appear (a different plan, a changed range) without a resize.
  useLayoutEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure]);

  useLayoutEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (focusYear == null) {
      internalYear.current = null;
      return;
    }
    if (internalYear.current === focusYear) {
      internalYear.current = null;
      return;
    }
    const el = ref.current;
    const cell = el?.querySelector<HTMLElement>(`[data-year="${focusYear}"]`);
    const label = el?.querySelector<HTMLElement>('.ns-row-head > div:first-child');
    if (!el || !cell || !label) return;
    const box = cell.getBoundingClientRect();
    const left = centerScrollLeft({
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      labelWidth: label.getBoundingClientRect().width,
      cellLeft: box.left - el.getBoundingClientRect().left,
      cellWidth: box.width,
    });
    el.scrollTo({ left, behavior: first || prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [focusYear]);

  /** The header-click handler: remembers the pick so the resulting `focusYear`
      change doesn't scroll the column the user just clicked. `undefined` when
      the caller gave no `onFocusYear`, so headers stay plain text. */
  const pickYear = onFocusYear
    ? (year: number | null) => {
        internalYear.current = year;
        onFocusYear(year);
      }
    : undefined;

  return {
    pickYear,
    scrollerProps: {
      ref,
      onScroll,
      className: 'ns-table-scroll ns-scroll-table',
      'data-fade-start': edges.start || undefined,
      'data-fade-end': edges.end || undefined,
    },
  };
}
