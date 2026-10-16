import { useEffect, useRef, useState } from 'react';
import { axisMoney } from '../format';
import { niceAxisTicks } from '../chartMath';

export interface ColumnLayer {
  key: string;
  label: string;
  color: string;
}

export interface ColumnYear {
  year: number;
  /** After-tax income, per month — drawn as the line the columns sit under. */
  afterTax: number;
  /** Monthly spending per layer key. */
  values: Record<string, number>;
}

const HEIGHT = 240;
const LEFT = 52;
const RIGHT = 8;
const TOP = 12;
const BOTTOM = 28;

/**
 * Budget by year (docs/REDESIGN-V4.md §4.2): one column per year, stacked by
 * whose spending it is, under a line for after-tax income — the gap between
 * the column's top and the line is what's left to save. Click a column to
 * read that year below. Keyboard: ←/→ when focused.
 */
export function BudgetColumns({
  years,
  layers,
  selectedYear,
  onSelect,
}: {
  years: ColumnYear[];
  layers: ColumnLayer[];
  selectedYear: number;
  onSelect(year: number): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (years.length === 0) return null;

  const totals = years.map((y) => layers.reduce((sum, l) => sum + Math.max(0, y.values[l.key] ?? 0), 0));
  const max = Math.max(1, ...totals, ...years.map((y) => y.afterTax));
  const ticks = niceAxisTicks(max, 4);
  const ceiling = Math.max(max, ticks[ticks.length - 1]?.value ?? max);

  const plotW = width - LEFT - RIGHT;
  const slot = plotW / years.length;
  const barW = Math.max(2, Math.min(22, slot * 0.72));
  const x = (i: number) => LEFT + slot * i + slot / 2;
  const y = (v: number) => TOP + (1 - v / ceiling) * (HEIGHT - TOP - BOTTOM);
  const labelEvery = Math.max(1, Math.ceil(years.length / Math.max(2, Math.floor(plotW / 56))));
  const selectedIndex = years.findIndex((yr) => yr.year === selectedYear);

  const line = years.map((yr, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Math.max(0, yr.afterTax)).toFixed(1)}`).join(' ');

  return (
    <div ref={ref} className="ns-cols">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        style={{ width: '100%', height: HEIGHT }}
        role="slider"
        tabIndex={0}
        aria-label="Budget year"
        aria-valuemin={years[0].year}
        aria-valuemax={years[years.length - 1].year}
        aria-valuenow={selectedYear}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const next = years[selectedIndex + (e.key === 'ArrowLeft' ? -1 : 1)];
          if (next) onSelect(next.year);
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

        {selectedIndex >= 0 && (
          <rect x={x(selectedIndex) - slot / 2} y={TOP} width={slot} height={HEIGHT - TOP - BOTTOM} className="ns-cols-selected" />
        )}

        {years.map((yr, i) => {
          let base = 0;
          return (
            <g key={yr.year} className="ns-cols-col" onClick={() => onSelect(yr.year)}>
              <rect x={x(i) - slot / 2} y={TOP} width={slot} height={HEIGHT - TOP - BOTTOM} fill="transparent" />
              {layers.map((l) => {
                const v = Math.max(0, yr.values[l.key] ?? 0);
                if (v <= 0) return null;
                const top = y(base + v);
                const h = y(base) - top;
                base += v;
                return <rect key={l.key} x={x(i) - barW / 2} y={top} width={barW} height={Math.max(0, h - 1)} fill={l.color} rx={1.5} />;
              })}
              <title>{yr.year}</title>
            </g>
          );
        })}

        <path d={line} className="ns-cols-income" fill="none" />

        {years.map((yr, i) => {
          // The selected year always gets its label; the rhythm's labels
          // give way to it rather than overlap.
          const show = i === selectedIndex || (i % labelEvery === 0 && Math.abs(i - selectedIndex) * slot > 34);
          if (!show) return null;
          return (
            <text
              key={yr.year}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className={`ns-mini-axis${i === selectedIndex ? ' ns-cols-axis-selected' : ''}`}
            >
              {yr.year}
            </text>
          );
        })}
      </svg>
      <div className="ns-mini-legend">
        {layers.map((l) => (
          <span key={l.key} className="ns-mini-legend-item">
            <span className="ns-mini-legend-swatch" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="ns-mini-legend-item">
          <span className="ns-cols-legend-line" />
          After-tax income
        </span>
      </div>
    </div>
  );
}
