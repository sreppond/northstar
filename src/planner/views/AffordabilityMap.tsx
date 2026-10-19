import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { axisMoney, money } from '../format';
import { niceAxisTicks } from '../chartMath';
import { nicePrice } from '../homeView';
import { ChartReadout, useScrub } from '../charts';
import { pickXTicks } from '../charts/seriesMath';
import '../pages/decisions.css';

export interface MapPoint {
  year: number;
  /** Display dollars; 0 when nothing fits. */
  comfortable: number;
  stretch: number;
}

const LEFT = 56;
const RIGHT = 8;
/** Headroom above the plot for the pinned year's chip (same as the kit). */
const TOP = 26;
const BOTTOM = 40;
const PRICE_STEP = 25_000;

/**
 * When can we buy, and for how much (docs/REDESIGN-V4.md §4.6, rebuilt for
 * docs/REDESIGN-V5.md §5.5): each year a column, shaded comfortable / a
 * stretch / house-poor up the price axis by what the whole plan can carry if
 * the home is bought that year.
 *
 * The readout above it IS the tooltip (§1): hover a year and it reads that
 * year's ceilings; idle it reads the year being tried. Scrubbing is the
 * kit's `useScrub`, so pointer, touch and the arrow keys all work, and the
 * pinned year is the app-wide focus year. A click still does what it always
 * did on this map (try that year AND the price under the pointer); the pin
 * rides along, because `useScrub` reports a click as a pin.
 */
export function AffordabilityMap({
  points,
  selected,
  saved,
  onPick,
  height,
  focusYear,
  onFocusYear,
  agesFor,
  actions,
}: {
  points: MapPoint[];
  selected: { year: number; price: number };
  /** The plan's own purchase, drawn as a ring when the selection has moved off it. */
  saved?: { year: number; price: number };
  onPick(year: number, price: number): void;
  height: number;
  /** The app-wide pinned year (§4.1). */
  focusYear?: number | null;
  onFocusYear?(year: number | null): void;
  agesFor?(year: number): string | undefined;
  /** The range picker, top right of the readout. */
  actions?: ReactNode;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = LEFT;
  const R = width - RIGHT;
  const B = height - BOTTOM;
  const n = points.length;
  const years = points.map((p) => p.year);
  const domain: [number, number] = n ? [years[0] - 0.5, years[n - 1] + 0.5] : [0, 1];

  const top = Math.max(1, ...points.map((p) => p.stretch * 1.25), selected.price * 1.15, saved ? saved.price * 1.15 : 0);
  const ticks = niceAxisTicks(top, 4);
  const ceiling = Math.max(top, ticks[ticks.length - 1]?.value ?? top);
  const slot = n ? (R - L) / n : 0;
  const xOf = (i: number) => L + slot * i;
  const yOf = (v: number) => B - (Math.min(v, ceiling) / ceiling) * (B - TOP);
  const indexOf = (year: number) => years.indexOf(year);
  const priceAtY = (y: number) => Math.max(100_000, Math.round(Math.max(0, ((B - y) / (B - TOP)) * ceiling) / PRICE_STEP) * PRICE_STEP);

  // A click is "try this year at the price under the pointer"; the hook only
  // reports the year, so the pointer's last y is tracked beside it.
  const lastY = useRef<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const trackY = (e: React.PointerEvent<SVGSVGElement>) => {
    lastY.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
  };
  const pick = (year: number) => onPick(year, lastY.current === null ? selected.price : priceAtY(lastY.current));

  const scrub = useScrub({
    years,
    domain,
    plot: { left: L, right: R },
    focusYear,
    onFocusYear: (year) => {
      if (year !== null) {
        pick(year);
        onFocusYear?.(year);
      } else if (hoverRef.current !== null) {
        // Pressing the pinned column again re-tries the price under the
        // pointer rather than letting go: unpinning is Esc's job here.
        pick(hoverRef.current);
      } else {
        onFocusYear?.(null);
      }
    },
  });
  hoverRef.current = scrub.hoverYear;
  const { bind } = scrub;

  useEffect(() => {
    if (scrub.hoverYear === null) lastY.current = null;
  }, [scrub.hoverYear]);

  if (n === 0) return null;

  const readYear = scrub.activeYear ?? selected.year;
  const at = points.find((p) => p.year === readYear) ?? points[0];

  const edge = (key: 'comfortable' | 'stretch') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p[key]).toFixed(1)} L${(xOf(i) + slot).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');

  const dot = (p: { year: number; price: number }) => {
    const i = indexOf(p.year);
    return i < 0 ? undefined : { x: xOf(i) + slot / 2, y: yOf(p.price) };
  };
  const sel = dot(selected);
  const ring = saved && (saved.year !== selected.year || Math.abs(saved.price - selected.price) > 1) ? dot(saved) : undefined;
  const xTickIdx = pickXTicks(points.map((p, i) => ({ x: xOf(i) + slot / 2, label: String(p.year) })), R - L);
  const pinned = scrub.pinnedYear !== null ? dot({ year: scrub.pinnedYear, price: 0 }) : undefined;
  const hover = scrub.hoverYear !== null && scrub.hoverYear !== scrub.pinnedYear ? dot({ year: scrub.hoverYear, price: 0 }) : undefined;

  return (
    <div className="ns-amap">
      <ChartReadout
        label="Comfortable up to"
        value={at.comfortable > 0 ? money(nicePrice(at.comfortable)) : 'Nothing yet'}
        yearLabel={String(readYear)}
        ages={agesFor?.(readYear)}
        secondary={[
          {
            id: 'stretch',
            label: 'Stretch to',
            color: 'var(--warn)',
            value: at.stretch > 0 ? money(nicePrice(at.stretch)) : '–',
          },
        ]}
        actions={actions}
      />
      <div className="ns-tsc-stage ns-amap-stage" ref={stageRef} style={{ height }}>
        <svg
          ref={scrub.svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="ns-tsc-svg ns-amap-svg"
          style={{ width: '100%', height, ...bind.style }}
          role="img"
          aria-label={`Affordability by purchase year. Trying ${selected.year} at ${money(selected.price)}. Arrow keys step through the years; a click tries that year and price.`}
          tabIndex={bind.tabIndex}
          onPointerDown={(e) => {
            trackY(e);
            bind.onPointerDown(e);
          }}
          onPointerMove={(e) => {
            trackY(e);
            bind.onPointerMove(e);
          }}
          onPointerUp={bind.onPointerUp}
          onPointerCancel={bind.onPointerCancel}
          onPointerLeave={bind.onPointerLeave}
          onKeyDown={bind.onKeyDown}
          onBlur={bind.onBlur}
        >
          <defs>
            <filter id={`${uid}glow`} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <feGaussianBlur stdDeviation={5} />
            </filter>
          </defs>

          <g className="ns-dec-reveal">
            {points.map((p, i) => (
              <g key={p.year}>
                <rect x={xOf(i)} y={TOP} width={slot + 0.5} height={yOf(p.stretch) - TOP} className="ns-amap-poor" />
                <rect x={xOf(i)} y={yOf(p.stretch)} width={slot + 0.5} height={yOf(p.comfortable) - yOf(p.stretch)} className="ns-amap-stretch" />
                <rect x={xOf(i)} y={yOf(p.comfortable)} width={slot + 0.5} height={yOf(0) - yOf(p.comfortable)} className="ns-amap-comfortable" />
              </g>
            ))}
          </g>

          {ticks.map((t) => (
            <g key={t.value}>
              <line x1={L} x2={R} y1={yOf(t.value)} y2={yOf(t.value)} className="ns-tsc-grid" />
              <text x={L - 8} y={yOf(t.value)} dy="0.32em" textAnchor="end" className="ns-mini-axis">
                {axisMoney(t.value)}
              </text>
            </g>
          ))}

          <g className="ns-dec-reveal">
            <path d={edge('comfortable')} className="ns-amap-edge-glow ns-amap-edge-comfortable" fill="none" filter={`url(#${uid}glow)`} />
            <path d={edge('stretch')} className="ns-amap-edge-glow ns-amap-edge-stretch" fill="none" filter={`url(#${uid}glow)`} />
            <path d={edge('comfortable')} className="ns-amap-edge ns-amap-edge-comfortable" fill="none" />
            <path d={edge('stretch')} className="ns-amap-edge ns-amap-edge-stretch" fill="none" />
          </g>

          {xTickIdx.map((i) => (
            <text
              key={years[i]}
              x={xOf(i) + slot / 2}
              y={B + 20}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className="ns-mini-axis"
            >
              {years[i]}
            </text>
          ))}

          {hover && <line x1={hover.x} x2={hover.x} y1={TOP} y2={B} className="ns-tsc-cursor" />}
          {pinned && <line x1={pinned.x} x2={pinned.x} y1={TOP - 4} y2={B} className="ns-tsc-pin" />}

          {ring && <circle cx={ring.x} cy={ring.y} r={6} className="ns-amap-ring" />}
          {sel && (
            <g>
              <line x1={sel.x} x2={sel.x} y1={sel.y} y2={yOf(0)} className="ns-amap-stem" />
              <circle cx={sel.x} cy={sel.y} r={6.5} className="ns-amap-dot" />
              <text
                x={sel.x + (sel.x > width - 150 ? -12 : 12)}
                y={sel.y}
                dy="0.32em"
                textAnchor={sel.x > width - 150 ? 'end' : 'start'}
                className="ns-amap-label"
              >
                {/* V5-REVIEW-3 M3: `selected.price` is already HousePage's `shownPrice`; rounding it with nicePrice made this read $1.01M beside the slider's $1.02M. */}
                {money(selected.price)} · {selected.year}
              </text>
            </g>
          )}
        </svg>
        {pinned && (
          <div className="ns-tsc-overlay">
            <span className="ns-tsc-chip ns-tsc-chip-pin" style={{ left: Math.min(Math.max(pinned.x, L + 20), width - 24), top: 2 }}>
              {scrub.pinnedYear}
            </span>
          </div>
        )}
      </div>
      <div className="ns-dec-legend">
        <span className="ns-dec-legend-item">
          <span className="ns-dec-swatch ns-amap-comfortable-swatch" />
          Comfortable
        </span>
        <span className="ns-dec-legend-item">
          <span className="ns-dec-swatch ns-amap-stretch-swatch" />A stretch
        </span>
        <span className="ns-dec-legend-item">
          <span className="ns-dec-swatch ns-amap-poor-swatch" />
          House-poor
        </span>
      </div>
    </div>
  );
}
