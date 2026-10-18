import { useId, useMemo, useState } from 'react';
import { AnimatedFigure } from '../AnimatedFigure';
import { money } from '../format';
import { arcPath, bisector, sliceAngles, visibleArc } from './donutMath';
import { usePrefersReducedMotion, useSpringValues } from './useSpring';
import './charts.css';

/**
 * A donut with the total (or the hovered slice) in the middle
 * (docs/REDESIGN-V5.md §3.5).
 *
 * Each slice is a stroked arc with round caps rather than a filled annular
 * sector: the caps give the pill ends the plan asks for with no corner
 * geometry, and `donutMath.visibleArc` pulls the path in by the cap length so
 * the gap between neighbours is exactly the pad angle.
 *
 * Every slice's start and end angle is a spring. A data change (the focus
 * year moves, before/after flips) retargets the springs and the arcs MORPH —
 * the elements are keyed by segment key and never remount, which is what
 * makes a scrub across years feel alive. On first render the springs start
 * at zero, so the arcs sweep in. Indices map by position: a key added or
 * removed mid-list shifts its neighbours rather than morphing in place
 * (callers keep one key set per donut and zero a slice to remove it).
 */

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** A CSS colour or token, e.g. `var(--mix-1)`. */
  color: string;
  /** `danger` is the unfunded slice: the `--out` colour, hatched. */
  tone?: 'danger';
}

export interface DonutChartProps {
  segments: DonutSegment[];
  /** The idle centre text; defaults to the total + "Total". */
  center?: { value: string; label: string; tone?: 'danger' };
  /** Slice or legend row clicked (the Sheet drill-down, §3.6). */
  onSelect?(key: string): void;
  size?: number;
  thickness?: number;
  /** Degrees of gap between slices. */
  padAngle?: number;
  legend?: 'side' | 'below' | false;
  /** Controlled hover, so a neighbouring list can highlight a slice and be
      highlighted by it (Budget's envelope rows). Uncontrolled when omitted. */
  hoveredKey?: string | null;
  onHoverKey?(key: string | null): void;
  /** Value formatter for the legend and the centre; default `money`. */
  format?(value: number): string;
  ariaLabel?: string;
}

/** How far a hovered slice pushes out along its bisector, px. */
const PUSH_OUT = 4;

export function DonutChart({
  segments,
  center,
  onSelect,
  size = 260,
  thickness = 28,
  padAngle = 2,
  legend = 'side',
  hoveredKey,
  onHoverKey,
  format = money,
  ariaLabel = 'Breakdown',
}: DonutChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = usePrefersReducedMotion();
  const [ownHover, setOwnHover] = useState<string | null>(null);
  const hovered = hoveredKey !== undefined ? hoveredKey : ownHover;
  const setHovered = (key: string | null) => {
    setOwnHover(key);
    onHoverKey?.(key);
  };

  const total = useMemo(
    () => segments.reduce((a, s) => a + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0), 0),
    [segments],
  );
  const targets = useMemo(() => sliceAngles(segments.map((s) => s.value)), [segments]);

  const flat = targets.flatMap((a) => [a.start, a.end]);
  const current = useSpringValues(flat, {
    response: 0.5,
    dampingRatio: 1,
    eps: 1e-3,
    snap: reduced,
    // First paint starts collapsed at 12 o'clock and sweeps out.
    seed: new Array(flat.length).fill(0),
  });

  const r = size / 2 - thickness / 2 - PUSH_OUT - 2;
  const c = size / 2;
  const active = hovered ? segments.find((s) => s.key === hovered) : undefined;

  const centerValue = active ? format(active.value) : (center?.value ?? format(total));
  const centerLabel = active ? active.label : (center?.label ?? 'Total');
  const centerShare = active && total > 0 ? shareLabel(active.value / total) : null;
  const centerDanger = !active && center?.tone === 'danger';

  const select = (key: string) => onSelect?.(key);

  return (
    <div className={`ns-donut${legend === 'below' ? ' ns-donut-below' : ''}`}>
      <div className="ns-donut-stage" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="ns-donut-svg"
          aria-hidden={legend === false ? undefined : true}
          role={legend === false ? 'img' : undefined}
          aria-label={
            legend === false
              ? `${ariaLabel}: ${segments.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`
              : undefined
          }
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            {segments.map((s) =>
              s.tone === 'danger' ? (
                <pattern
                  key={s.key}
                  id={`${uid}h${s.key}`}
                  patternUnits="userSpaceOnUse"
                  width={6}
                  height={6}
                  patternTransform="rotate(45)"
                >
                  <rect width={6} height={6} fill={s.color} opacity={0.22} />
                  <line x1={0} y1={0} x2={0} y2={6} stroke={s.color} strokeWidth={3} />
                </pattern>
              ) : null,
            )}
          </defs>

          <circle cx={c} cy={c} r={r} strokeWidth={thickness} className="ns-donut-track" opacity={total > 0 ? 0 : 0.6} />

          {segments.map((s, i) => {
            const animated = { start: current[i * 2] ?? 0, end: current[i * 2 + 1] ?? 0 };
            const arc = visibleArc(animated, padAngle, r, thickness);
            const push = bisector(targets[i]);
            const isActive = hovered === s.key;
            const dim = hovered !== null && !isActive;
            return (
              <path
                key={s.key}
                d={arc ? arcPath(c, c, r, arc.start, arc.end) : ''}
                className={`ns-donut-arc${onSelect ? ' ns-donut-arc-live' : ''}`}
                stroke={s.tone === 'danger' ? `url(#${uid}h${s.key})` : s.color}
                strokeWidth={thickness}
                strokeLinecap={arc?.round ? 'round' : 'butt'}
                style={{
                  opacity: dim ? 0.5 : 1,
                  transform: isActive ? `translate(${push.x * PUSH_OUT}px, ${push.y * PUSH_OUT}px)` : 'translate(0, 0)',
                }}
                // Highlight on press, not release (apple-design §1) — also
                // what gives touch, which has no hover, a way in.
                onPointerEnter={() => setHovered(s.key)}
                onPointerDown={() => setHovered(s.key)}
                onClick={() => select(s.key)}
              />
            );
          })}
        </svg>

        <div className="ns-donut-center" aria-hidden="true">
          <AnimatedFigure
            className={`ns-donut-center-value${centerDanger ? ' ns-donut-short' : ''}`}
            value={centerValue}
          />
          <div className="ns-donut-center-label">{centerLabel}</div>
          {centerShare && <div className="ns-donut-center-share">{centerShare}</div>}
        </div>
      </div>

      {legend !== false && (
        <ul className="ns-donut-legend" aria-label={`${ariaLabel} legend`}>
          {segments.map((s) => {
            // V5-REVIEW-1 F16: a $0 / 0% row is noise. Hidden from the legend
            // only; the segment keeps its (zero-width) arc so the Before/After
            // morph still has something to grow from.
            if (Math.abs(s.value) < 0.5) return null;
            const on = hovered === s.key;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  className={`ns-donut-row${on ? ' ns-donut-row-on' : ''}${hovered !== null && !on ? ' ns-donut-row-dim' : ''}`}
                  onPointerEnter={() => setHovered(s.key)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s.key)}
                  onBlur={() => setHovered(null)}
                  onClick={() => select(s.key)}
                >
                  <span
                    className={`ns-donut-dot${s.tone === 'danger' ? ' ns-donut-dot-danger' : ''}`}
                    style={{ ['--dot' as string]: s.color }}
                    aria-hidden="true"
                  />
                  <span className="ns-donut-row-label">
                    {s.tone === 'danger' && <span aria-hidden="true">✗ </span>}
                    {s.label}
                  </span>
                  <span className="ns-donut-row-value">{format(s.value)}</span>
                  <span className="ns-donut-row-pct">{total > 0 ? shareLabel(s.value / total) : '–'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function shareLabel(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}
