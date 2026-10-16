import { useEffect, useRef, useState } from 'react';
import { axisMoney, money } from '../format';
import { niceAxisTicks } from '../chartMath';
import { nicePrice } from '../homeView';

export interface MapPoint {
  year: number;
  /** Display dollars; 0 when nothing fits. */
  comfortable: number;
  stretch: number;
}

const HEIGHT = 300;
const LEFT = 58;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 30;

/**
 * When can we buy, and for how much (docs/REDESIGN-V4.md §4.6): each year a
 * column, shaded comfortable / a stretch / house-poor up the price axis by
 * what the whole plan can carry if the home is bought that year. The dot is
 * the purchase being looked at; click anywhere to try a different one.
 */
export function AffordabilityMap({
  points,
  selected,
  saved,
  onPick,
}: {
  points: MapPoint[];
  selected: { year: number; price: number };
  /** The plan's own purchase, drawn as a ring when the selection has moved off it. */
  saved?: { year: number; price: number };
  onPick(year: number, price: number): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;

  const top = Math.max(
    1,
    ...points.map((p) => p.stretch * 1.25),
    selected.price * 1.15,
    saved ? saved.price * 1.15 : 0,
  );
  const ticks = niceAxisTicks(top, 4);
  const ceiling = Math.max(top, ticks[ticks.length - 1]?.value ?? top);
  const plotW = width - LEFT - RIGHT;
  const slot = plotW / points.length;
  const xOf = (i: number) => LEFT + slot * i;
  const yOf = (v: number) => TOP + (1 - Math.min(v, ceiling) / ceiling) * (HEIGHT - TOP - BOTTOM);
  const indexOf = (year: number) => points.findIndex((p) => p.year === year);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 56))));

  const edge = (key: 'comfortable' | 'stretch') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p[key]).toFixed(1)} L${(xOf(i) + slot).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - svg.left) / svg.width) * width;
    const y = ((e.clientY - svg.top) / svg.height) * HEIGHT;
    const i = Math.max(0, Math.min(points.length - 1, Math.floor((x - LEFT) / slot)));
    const price = Math.max(0, (1 - (y - TOP) / (HEIGHT - TOP - BOTTOM)) * ceiling);
    onPick(points[i].year, Math.round(price / 25_000) * 25_000);
  };

  const dot = (p: { year: number; price: number }) => {
    const i = indexOf(p.year);
    return i < 0 ? undefined : { x: xOf(i) + slot / 2, y: yOf(p.price) };
  };
  const sel = dot(selected);
  const ring = saved && (saved.year !== selected.year || Math.abs(saved.price - selected.price) > 1) ? dot(saved) : undefined;

  return (
    <div ref={ref} className="ns-amap">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        style={{ width: '100%', height: HEIGHT }}
        role="img"
        aria-label={`Affordability by purchase year. Selected: ${selected.year} at ${money(nicePrice(selected.price))}.`}
        onClick={pick}
      >
        {points.map((p, i) => (
          <g key={p.year}>
            <rect x={xOf(i)} y={TOP} width={slot + 0.5} height={yOf(p.stretch) - TOP} className="ns-amap-poor" />
            <rect x={xOf(i)} y={yOf(p.stretch)} width={slot + 0.5} height={yOf(p.comfortable) - yOf(p.stretch)} className="ns-amap-stretch" />
            <rect x={xOf(i)} y={yOf(p.comfortable)} width={slot + 0.5} height={yOf(0) - yOf(p.comfortable)} className="ns-amap-comfortable" />
          </g>
        ))}

        {ticks.map((t) => (
          <g key={t.value}>
            <line x1={LEFT} x2={width - RIGHT} y1={yOf(t.value)} y2={yOf(t.value)} className="ns-amap-grid" />
            <text x={LEFT - 8} y={yOf(t.value)} dy="0.32em" textAnchor="end" className="ns-mini-axis">
              {axisMoney(t.value)}
            </text>
          </g>
        ))}

        <path d={edge('comfortable')} className="ns-amap-edge ns-amap-edge-comfortable" fill="none" />
        <path d={edge('stretch')} className="ns-amap-edge ns-amap-edge-stretch" fill="none" />

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.year} x={xOf(i) + slot / 2} y={HEIGHT - 9} textAnchor="middle" className="ns-mini-axis">
              {p.year}
            </text>
          ) : null,
        )}

        {ring && <circle cx={ring.x} cy={ring.y} r={6} className="ns-amap-ring" />}
        {sel && (
          <g>
            <line x1={sel.x} x2={sel.x} y1={sel.y} y2={yOf(0)} className="ns-amap-stem" />
            <circle cx={sel.x} cy={sel.y} r={6.5} className="ns-amap-dot" />
            <text
              x={sel.x + (sel.x > width - 140 ? -12 : 12)}
              y={sel.y}
              dy="0.32em"
              textAnchor={sel.x > width - 140 ? 'end' : 'start'}
              className="ns-amap-label"
            >
              {money(nicePrice(selected.price))} · {selected.year}
            </text>
          </g>
        )}
      </svg>
      <div className="ns-mini-legend">
        <span className="ns-mini-legend-item">
          <span className="ns-mini-legend-swatch ns-amap-comfortable-swatch" />
          Comfortable
        </span>
        <span className="ns-mini-legend-item">
          <span className="ns-mini-legend-swatch ns-amap-stretch-swatch" />A stretch
        </span>
        <span className="ns-mini-legend-item">
          <span className="ns-mini-legend-swatch ns-amap-poor-swatch" />
          House-poor
        </span>
        <span className="ns-amap-hint">Click the map to try a year and price</span>
      </div>
    </div>
  );
}
