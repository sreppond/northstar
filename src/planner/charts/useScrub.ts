import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { yearForClientX } from '../chartMath';
import { keyboardYear, nearestIndex } from './seriesMath';

/**
 * The scrub gesture every time chart shares (docs/REDESIGN-V5.md §3.1),
 * lifted from NetWorthChart's `scrubTo` / `handleScrub*` and generalised to
 * snap to data points, pin a year, and take keyboard input.
 *
 * - Pointer-DOWN sets hover immediately (apple-design §1: respond on press).
 * - Movement tracks 1:1, snapped to the nearest data year.
 * - A press that travels under `TAP_SLOP` px is a click: it pins the year,
 *   and clicking the already-pinned year unpins it.
 * - Leaving clears hover only; the pin stays.
 * - The svg gets `touch-action: pan-y`, so vertical page scroll still works,
 *   and a touch drag captures the pointer so it keeps scrubbing off-chart.
 */

/** Pointer travel (px) under which a press-and-release is a click, not a drag. */
const TAP_SLOP = 4;

export interface UseScrubOptions {
  /** Data years inside the current window, ascending — the only years a
      scrub can land on ("the nearest data point in the current window"). */
  years: number[];
  /** The x-domain currently drawn across the plot. Pass the ANIMATED value
      mid-range-change so the pointer matches what is under it. */
  domain: [number, number];
  /** Plot edges in px within the measured svg. */
  plot: { left: number; right: number };
  /** The pinned year. Controlled when `onFocusYear` is given (the
      app-wide focus year, §4.1); otherwise the hook keeps its own pin. */
  focusYear?: number | null;
  onFocusYear?(year: number | null): void;
  onHoverYear?(year: number | null): void;
}

export interface ScrubBind {
  onPointerDown(e: PointerEvent<SVGSVGElement>): void;
  onPointerMove(e: PointerEvent<SVGSVGElement>): void;
  onPointerUp(e: PointerEvent<SVGSVGElement>): void;
  onPointerCancel(e: PointerEvent<SVGSVGElement>): void;
  onPointerLeave(e: PointerEvent<SVGSVGElement>): void;
  onKeyDown(e: KeyboardEvent<SVGSVGElement>): void;
  onBlur(): void;
  tabIndex: 0;
  style: { touchAction: 'pan-y' };
}

export interface ScrubState {
  /** The year under the pointer, snapped; null when not hovering. */
  hoverYear: number | null;
  /** The pinned year if it falls inside the window (snapped), else null. */
  pinnedYear: number | null;
  /** hover, else pin — what the cursor, dots and readout follow. */
  activeYear: number | null;
  bind: ScrubBind;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

export function useScrub({
  years,
  domain,
  plot,
  focusYear,
  onFocusYear,
  onHoverYear,
}: UseScrubOptions): ScrubState {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverYear, setHover] = useState<number | null>(null);
  const [ownPin, setOwnPin] = useState<number | null>(null);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);

  const rawPin = focusYear !== undefined ? focusYear : ownPin;
  // A pin outside the drawn window, or on a chart with no data there, is
  // simply not shown here (it still exists app-wide).
  const pinnedYear =
    rawPin !== null && years.length > 0 && rawPin >= years[0] - 1e-9 && rawPin <= years[years.length - 1] + 1e-9
      ? years[nearestIndex(years, rawPin)]
      : null;

  const setPin = useCallback(
    (year: number | null) => {
      if (focusYear === undefined) setOwnPin(year);
      onFocusYear?.(year);
    },
    [focusYear, onFocusYear],
  );

  // Tell the page what is being hovered (hero readouts it owns itself).
  useEffect(() => {
    onHoverYear?.(hoverYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on hover changes only
  }, [hoverYear]);

  const yearAt = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || years.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    // chartMath's yearForClientX over a normalised 0..1000 domain: it floors
    // its span at one year, which a fractional-year domain (Progress) or a
    // mid-spring window can dip under. The viewBox IS pixels here, so the
    // rect width is the viewBox width.
    const u = yearForClientX(
      clientX,
      rect,
      { plotLeft: plot.left, plotRight: plot.right, viewBoxWidth: rect.width },
      0,
      1000,
    );
    const year = domain[0] + (u / 1000) * (domain[1] - domain[0]);
    return years[nearestIndex(years, year)];
  };

  const bind: ScrubBind = {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (e.pointerType !== 'mouse') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone.
        }
      }
      setHover(yearAt(e.clientX));
    },
    onPointerMove(e) {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP_SLOP) p.moved = true;
      setHover(yearAt(e.clientX));
    },
    onPointerUp(e) {
      const p = press.current;
      press.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Already released.
      }
      if (p && !p.moved) {
        const year = yearAt(e.clientX);
        if (year !== null) setPin(pinnedYear !== null && year === pinnedYear ? null : year);
      }
      // A mouse keeps hovering after the button comes up; touch has no such
      // thing, so lifting the finger is its only "done pointing" signal.
      if (e.pointerType !== 'mouse') setHover(null);
    },
    onPointerCancel() {
      press.current = null;
      setHover(null);
    },
    onPointerLeave() {
      // A mouse that leaves mid-press abandons it (no pointerup will arrive
      // here); captured touch/pen pointers only report leave after release.
      press.current = null;
      setHover(null);
    },
    onKeyDown(e) {
      if (e.key === 'Escape') {
        if (rawPin !== null) {
          e.preventDefault();
          setPin(null);
        }
        setHover(null);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const next = keyboardYear(years, pinnedYear ?? hoverYear, e.key);
      setHover(null);
      if (next !== null) setPin(next);
    },
    onBlur() {
      setHover(null);
    },
    tabIndex: 0,
    style: { touchAction: 'pan-y' },
  };

  return {
    hoverYear,
    pinnedYear,
    activeYear: hoverYear ?? pinnedYear,
    bind,
    svgRef,
  };
}
