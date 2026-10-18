import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { availableRanges, effectiveRange, rangeLabel, type RangeKey } from './range';
import './charts.css';

/**
 * `1Y 3Y 5Y 10Y 20Y 40Y All` (docs/REDESIGN-V5.md §3.4). A radiogroup — one
 * tab stop, arrows move the selection — with a pill that slides to the
 * chosen option.
 *
 * The plan names `motion`'s `layoutId` for the slide; the kit avoids that
 * dependency for charts, and a measured transform with a CSS spring curve
 * (`--spring`, planner.css) does the same job: CSS transitions retarget from
 * the current computed value, so a second press mid-slide redirects rather
 * than waits. Selecting fires on pointer-DOWN (apple-design §1), with click
 * kept for keyboard activation.
 */
export function RangePicker({
  value,
  onChange,
  years,
  openingYear,
  options,
  ariaLabel = 'Chart time range',
  compact = false,
}: {
  value: RangeKey;
  onChange(range: RangeKey): void;
  /** The chart's x-domain, to hide options longer than the plan. */
  years?: number[];
  /** "Today" in that domain; defaults to its first year. */
  openingYear?: number;
  /** Explicit option list, overriding the plan-length rule. */
  options?: RangeKey[];
  ariaLabel?: string;
  /** V5-REVIEW-1 F5: a long plan offers up to seven options, which on a phone
      pushed "What if" and "…" off-screen. Compact lets the picker shrink to
      the room it has and scroll sideways inside itself, with edge fades that
      show there is more. Under 480px the same rules apply to every picker
      (charts.css), so a page only needs this to force it wider up. */
  compact?: boolean;
}) {
  const shown = useMemo(
    () => options ?? (years?.length ? availableRanges(years, openingYear ?? years[0]) : availableRanges([], 0)),
    [options, years, openingYear],
  );
  // A saved range this plan has outgrown still highlights "All" rather than nothing.
  const current = effectiveRange(value, shown);

  const root = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  // The pill snaps into place on first measure, and only slides afterwards.
  const [armed, setArmed] = useState(false);
  // Which edges have more options beyond them (the fades).
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(`[data-range="${current}"]`);
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, [current, shown]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () =>
      setEdges((prev) => {
        const next = {
          left: el.scrollLeft > 1,
          right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
        };
        return prev.left === next.left && prev.right === next.right ? prev : next;
      });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [shown]);

  // Keep the chosen option on screen when the track scrolls.
  useEffect(() => {
    const el = root.current;
    const opt = el?.querySelector<HTMLElement>(`[data-range="${current}"]`);
    if (!el || !opt || el.scrollWidth <= el.clientWidth) return;
    const left = opt.offsetLeft - 8;
    const right = opt.offsetLeft + opt.offsetWidth + 8;
    if (left < el.scrollLeft) el.scrollTo({ left, behavior: 'smooth' });
    else if (right > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right - el.clientWidth, behavior: 'smooth' });
  }, [current, shown]);

  function move(delta: number) {
    const i = shown.indexOf(current);
    const next = shown[Math.min(shown.length - 1, Math.max(0, i + delta))];
    if (next === undefined || next === current) return;
    onChange(next);
    root.current?.querySelector<HTMLButtonElement>(`[data-range="${next}"]`)?.focus();
  }

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`ns-rp${compact ? ' ns-rp-compact' : ''}`}
      data-fade-left={edges.left || undefined}
      data-fade-right={edges.right || undefined}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {pill && (
        <span
          className={`ns-rp-pill${armed ? ' ns-rp-pill-armed' : ''}`}
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
          aria-hidden="true"
        />
      )}
      {shown.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={r === current}
          data-range={r}
          tabIndex={r === current ? 0 : -1}
          className={`ns-rp-opt${r === current ? ' ns-rp-opt-active' : ''}`}
          onPointerDown={(e) => {
            if (e.button === 0) onChange(r);
          }}
          onClick={() => onChange(r)}
        >
          {rangeLabel(r)}
        </button>
      ))}
    </div>
  );
}
