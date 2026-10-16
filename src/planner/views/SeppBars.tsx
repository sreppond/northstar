import { useEffect, useRef, useState } from 'react';
import { axisMoney, money } from '../format';
import { niceAxisTicks } from '../chartMath';

const HEIGHT = 200;
const LEFT = 52;
const RIGHT = 8;
const TOP = 12;
const BOTTOM = 34;

/**
 * "How much is the SEPP I could begin taking that year?" (docs/REDESIGN-V4.md
 * §4.8): one bar per start year, its height the largest yearly payment the
 * method allows on the balance the account would have by then. Click a bar
 * (or use ←/→) to look at that start year below.
 */
export function SeppBars({
  options,
  selectedYear,
  onSelect,
}: {
  options: { startYear: number; age: number; annualPayment: number }[];
  selectedYear: number;
  onSelect(year: number): void;
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
  if (options.length === 0) return null;

  const max = Math.max(1, ...options.map((o) => o.annualPayment));
  const ticks = niceAxisTicks(max, 3);
  const ceiling = Math.max(max, ticks[ticks.length - 1]?.value ?? max);
  const plotW = width - LEFT - RIGHT;
  const slot = plotW / options.length;
  const barW = Math.max(3, Math.min(26, slot * 0.7));
  const x = (i: number) => LEFT + slot * i + slot / 2;
  const y = (v: number) => TOP + (1 - v / ceiling) * (HEIGHT - TOP - BOTTOM);
  const sel = options.findIndex((o) => o.startYear === selectedYear);
  const every = Math.max(1, Math.ceil(options.length / Math.max(2, Math.floor(plotW / 64))));

  return (
    <div ref={ref} className="ns-sbars">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        style={{ width: '100%', height: HEIGHT }}
        role="slider"
        tabIndex={0}
        aria-label="SEPP start year"
        aria-valuemin={options[0].startYear}
        aria-valuemax={options[options.length - 1].startYear}
        aria-valuenow={selectedYear}
        aria-valuetext={sel >= 0 ? `${selectedYear}: ${money(options[sel].annualPayment)} a year` : String(selectedYear)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = options[sel + (e.key === 'ArrowLeft' ? -1 : 1)];
          if (next) onSelect(next.startYear);
        }}
      >
        {ticks.map((t) => (
          <g key={t.value}>
            <line x1={LEFT} x2={width - RIGHT} y1={y(t.value)} y2={y(t.value)} className="ns-mini-grid" />
            <text x={LEFT - 8} y={y(t.value)} dy="0.32em" textAnchor="end" className="ns-mini-axis">
              {axisMoney(t.value)}
            </text>
          </g>
        ))}
        {options.map((o, i) => (
          <g key={o.startYear} className="ns-sbars-col" onClick={() => onSelect(o.startYear)}>
            <rect x={x(i) - slot / 2} y={TOP} width={slot} height={HEIGHT - TOP - BOTTOM} fill="transparent" />
            <rect
              x={x(i) - barW / 2}
              y={y(o.annualPayment)}
              width={barW}
              height={y(0) - y(o.annualPayment)}
              rx={2}
              className={i === sel ? 'ns-sbars-bar ns-sbars-bar-selected' : 'ns-sbars-bar'}
            />
            <title>
              Start {o.startYear} (age {o.age}): {money(o.annualPayment)} a year
            </title>
          </g>
        ))}
        {options.map((o, i) =>
          i === sel || (i % every === 0 && Math.abs(i - sel) * slot > 40) ? (
            <text key={o.startYear} x={x(i)} y={HEIGHT - 18} textAnchor="middle" className={`ns-mini-axis${i === sel ? ' ns-cols-axis-selected' : ''}`}>
              {o.startYear}
              <tspan x={x(i)} dy="1.2em" className="ns-mini-axis-sub">
                age {o.age}
              </tspan>
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
