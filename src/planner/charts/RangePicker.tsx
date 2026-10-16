import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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

  useLayoutEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(`[data-range="${current}"]`);
    if (!el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
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
      className="ns-rp"
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
