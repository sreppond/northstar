import { useId, useLayoutEffect, useRef, useState } from 'react';
import { axisMoney, money } from '../format';
import { ZONE_LABEL, type Zone } from '../homeView';
import { ChartReadout, useScrub, type ReadoutItem } from '../charts';
import { linePath, nearestIndex, pickXTicks } from '../charts/seriesMath';
import '../pages/decisions.css';

/** One price on the curve, already in the units the user reads. */
export interface CurveDatum {
  price: number;
  /** Housing cost ÷ take-home, percent. Non-finite when nothing is coming in. */
  share: number;
  zone: Zone;
  /** Mortgage + tax + insurance + upkeep + HOA, per month. */
  monthly: number;
  /** Cash and taxable investments left after closing. */
  cashLeft: number;
  /** First year across the whole plan horizon that it can't pay its bills (V5-REVIEW-1 F7). */
  shortfallYear?: number;
}

const LEFT = 56;
const RIGHT = 12;
const TOP = 26;
const BOTTOM = 40;
/** Zone edges: DEFAULT_ZONES' housing-share rules (docs/REDESIGN-V4.md §8). */
const COMFORTABLE = 25;
const STRETCH = 35;

const ZONE_COLOR: Record<Zone, string> = {
  comfortable: 'var(--in-deep)',
  stretch: 'var(--warn)',
  housePoor: 'var(--out-deep)',
};

/**
 * The price curve (docs/REDESIGN-V5.md §5.5): for the chosen purchase year, x
 * is the home price and y is housing cost as a share of take-home, drawn over
 * the comfortable / stretch / house-poor bands. It answers "how much" straight
 * off the page: slide right until the line leaves the green.
 *
 * The x-axis is a price, not a year, so this is not a `TimeSeriesChart`; it is
 * built to the same visual spec (glow copy under the line, dashed grid,
 * dashed cursor, a pinned line with a chip) and drives the same `useScrub`,
 * with prices standing where years do. Hovering reads a price in the readout
 * above; clicking (or ←/→) previews it as the page's draft.
 */
export function PriceCurve({
  data,
  current,
  saved,
  onPick,
  height,
  year,
  endYear,
}: {
  data: CurveDatum[];
  /** The price being tried, read off the real draft plan (so it is exact, not a grid neighbour). */
  current: CurveDatum;
  /** The plan's own purchase price, drawn as a ring once the draft has moved off it. */
  saved?: number;
  onPick(price: number): void;
  height: number;
  year: number;
  /** The plan's last year, for "pays every bill through …". */
  endYear: number;
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
  const prices = data.map((d) => d.price);
  const x0 = prices[0] ?? 0;
  const x1 = prices[prices.length - 1] ?? 1;

  const finiteMax = Math.max(0, ...data.map((d) => d.share).filter(Number.isFinite), Number.isFinite(current.share) ? current.share : 0);
  // Always room for the 35% edge and a little house-poor above it.
  const ceiling = Math.min(90, Math.max(45, Math.ceil((finiteMax * 1.08) / 5) * 5));
  const xFor = (price: number) => L + ((price - x0) / (x1 - x0 || 1)) * (R - L);
  const yFor = (share: number) => B - (Math.min(Number.isFinite(share) ? share : ceiling, ceiling) / ceiling) * (B - TOP);

  const snapped = prices.length ? prices[nearestIndex(prices, current.price)] : null;
  const scrub = useScrub({
    years: prices,
    domain: [x0, x1],
    plot: { left: L, right: R },
    focusYear: snapped,
    // The hook reports a click on the already-previewed price as an unpin;
    // there is nothing to un-preview here, so only real prices count.
    onFocusYear: (price) => {
      if (price !== null) onPick(price);
    },
  });
  const { bind } = scrub;

  if (data.length === 0) return null;

  const hovered = scrub.hoverYear !== null ? data[prices.indexOf(scrub.hoverYear)] : undefined;
  const shown = hovered ?? current;

  const xs = data.map((d) => xFor(d.price));
  const ys = data.map((d) => yFor(d.share));
  const d = linePath(xs, ys);
  // Tighter dots when the points crowd (a phone).
  const dotR = (R - L) / data.length < 10 ? 2.4 : 3.5;
  const xTickIdx = pickXTicks(data.map((p, i) => ({ x: xs[i], label: axisMoney(p.price) })), R - L, 56);
  const yTicks = [0, COMFORTABLE, STRETCH, ...(ceiling >= 60 ? [60] : [])].filter((v) => v <= ceiling);

  const secondary: ReadoutItem[] = [
    { id: 'zone', label: 'House-poor check', color: ZONE_COLOR[shown.zone], value: ZONE_LABEL[shown.zone] },
    {
      id: 'plan',
      label: 'Plan',
      color: shown.shortfallYear ? 'var(--danger)' : 'var(--in)',
      // The full horizon, so it agrees with the rail pill (V5-REVIEW-1 F7).
      value: shown.shortfallYear ? `✗ Short from ${shown.shortfallYear}` : `✓ Pays every bill through ${endYear}`,
    },
  ];
  const sharePct = Number.isFinite(shown.share) ? `${Math.round(shown.share)}% of take-home` : 'No take-home yet';

  const markX = xFor(Math.min(x1, Math.max(x0, current.price)));
  const markY = yFor(current.share);
  const ringX = saved !== undefined && Math.abs(saved - current.price) > 1 ? xFor(Math.min(x1, Math.max(x0, saved))) : undefined;
  const hoverX = hovered && hovered.price !== snapped ? xFor(hovered.price) : undefined;

  return (
    <div className="ns-pc">
      <ChartReadout
        label={hovered ? `Buy in ${year} for` : `Your price, buying in ${year}`}
        labelText="Home price"
        value={money(shown.price)}
        yearLabel={sharePct}
        ages={`${money(shown.monthly)}/mo to own · ${money(shown.cashLeft)} left after closing`}
        secondary={secondary}
      />
      <div className="ns-tsc-stage" ref={stageRef} style={{ height }}>
        <svg
          ref={scrub.svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="ns-tsc-svg ns-pc-svg"
          style={{ width: '100%', height, ...bind.style }}
          role="img"
          aria-label={`Housing cost as a share of take-home, by home price, buying in ${year}. Arrow keys step through prices and preview each one.`}
          tabIndex={bind.tabIndex}
          onPointerDown={bind.onPointerDown}
          onPointerMove={bind.onPointerMove}
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

          <rect x={L} y={yFor(COMFORTABLE)} width={R - L} height={yFor(0) - yFor(COMFORTABLE)} className="ns-pc-band-comfortable" />
          <rect x={L} y={yFor(STRETCH)} width={R - L} height={yFor(COMFORTABLE) - yFor(STRETCH)} className="ns-pc-band-stretch" />
          <rect x={L} y={TOP} width={R - L} height={yFor(STRETCH) - TOP} className="ns-pc-band-poor" />
          <line x1={L} x2={R} y1={yFor(COMFORTABLE)} y2={yFor(COMFORTABLE)} className="ns-pc-edge" />
          <line x1={L} x2={R} y1={yFor(STRETCH)} y2={yFor(STRETCH)} className="ns-pc-edge" />

          {/* The curve only rises, so the empty corners are top-left and
              bottom-right: the house-poor label sits left, the other two right. */}
          <text x={R - 10} y={yFor(COMFORTABLE) + 17} textAnchor="end" className="ns-pc-band-label ns-pc-band-label-comfortable">
            ✓ Comfortable
          </text>
          <text x={R - 10} y={yFor(STRETCH) + 17} textAnchor="end" className="ns-pc-band-label ns-pc-band-label-stretch">
            ~ A stretch
          </text>
          <text x={L + 10} y={TOP + 17} className="ns-pc-band-label ns-pc-band-label-poor">
            ✗ House-poor
          </text>

          {yTicks.map((v) => (
            <g key={v}>
              <line x1={L} x2={R} y1={yFor(v)} y2={yFor(v)} className="ns-tsc-grid" />
              <text x={L - 8} y={yFor(v)} dy="0.32em" textAnchor="end" className="ns-mini-axis">
                {v}%
              </text>
            </g>
          ))}
          <text x={L} y={14} className="ns-pc-axis-title">
            Housing cost ÷ take-home
          </text>

          {xTickIdx.map((i) => (
            <text
              key={data[i].price}
              x={xs[i]}
              y={B + 20}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              className="ns-mini-axis"
            >
              {axisMoney(data[i].price)}
            </text>
          ))}

          <g className="ns-dec-reveal" key={`${year}`}>
            <path d={d} className="ns-pc-glow" filter={`url(#${uid}glow)`} />
            <path d={d} className="ns-pc-line" />
            {data.map((p, i) => (
              <circle key={p.price} cx={xs[i]} cy={ys[i]} r={dotR} className={`ns-pc-dot ns-pc-dot-${p.zone}`} />
            ))}
          </g>

          {hoverX !== undefined && <line x1={hoverX} x2={hoverX} y1={TOP} y2={B} className="ns-tsc-cursor" />}
          <line x1={markX} x2={markX} y1={TOP - 4} y2={B} className="ns-tsc-pin" />
          {ringX !== undefined && <line x1={ringX} x2={ringX} y1={TOP} y2={B} className="ns-pc-ring" />}
          {hovered && hoverX !== undefined && (
            <g>
              <circle cx={hoverX} cy={yFor(hovered.share)} r={11} fill={ZONE_COLOR[hovered.zone]} opacity={0.18} />
              <circle cx={hoverX} cy={yFor(hovered.share)} r={5} fill={ZONE_COLOR[hovered.zone]} className="ns-tsc-active-dot" />
            </g>
          )}
          <circle cx={markX} cy={markY} r={6.5} className="ns-pc-mark" />
        </svg>
        <div className="ns-tsc-overlay">
          <span className="ns-tsc-chip ns-tsc-chip-pin" style={{ left: Math.min(Math.max(markX, L + 20), width - 30), top: 2 }}>
            {money(current.price)}
          </span>
        </div>
      </div>
    </div>
  );
}
