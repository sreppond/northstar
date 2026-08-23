import { axisMoney } from '../format';

/**
 * A small, static multi-series line chart for the focused forecast views
 * (Retirement, House, SEPP). Deliberately simpler than `NetWorthChart` —
 * no hover, no fan, no event pins. Those views are read once for their
 * shape, not interrogated year by year the way the main net-worth line is.
 */

const VB_W = 960;
const VB_H = 280;
const LEFT = 56;
const RIGHT = 952;
const TOP = 14;
const BOTTOM = 240;

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
  /** Fills the area under the line, for the one series that reads as a volume. */
  fill?: boolean;
  dashed?: boolean;
}

export function MiniChart({
  years,
  series,
  height = VB_H,
}: {
  years: number[];
  series: ChartSeries[];
  height?: number;
}) {
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const span = max - min || 1;

  const xFor = (i: number) =>
    years.length <= 1 ? LEFT : LEFT + (i / (years.length - 1)) * (RIGHT - LEFT);
  const yFor = (v: number) => BOTTOM - ((v - min) / span) * (BOTTOM - TOP);

  const pathFor = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');

  const areaFor = (values: number[]) =>
    `${pathFor(values)} L${xFor(values.length - 1).toFixed(1)},${yFor(0).toFixed(1)} L${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} Z`;

  const zeroY = yFor(0);
  const yTicks = [max, (max + min) / 2, min];
  const xTickEvery = Math.max(1, Math.round(years.length / 6));

  return (
    // The viewBox stays fixed at the layout constants above (LEFT/RIGHT/
    // TOP/BOTTOM assume a 960×280 canvas); `height` only scales the
    // rendered pixel size via `preserveAspectRatio="none"`, which stretches
    // that fixed coordinate system rather than reinterpreting it — so a
    // caller-supplied `height` can never clip the axis labels or legend.
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="ns-mini-chart"
      role="img"
      aria-label="Forecast chart"
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
    >
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={LEFT} x2={RIGHT} y1={yFor(v)} y2={yFor(v)} className="ns-mini-grid" />
          <text x={LEFT - 8} y={yFor(v)} className="ns-mini-axis" textAnchor="end" dy="0.32em">
            {axisMoney(v)}
          </text>
        </g>
      ))}

      {min < 0 && max > 0 && (
        <line x1={LEFT} x2={RIGHT} y1={zeroY} y2={zeroY} className="ns-mini-zero" />
      )}

      {years.map((y, i) => {
        if (i % xTickEvery !== 0 && i !== years.length - 1) return null;
        // The end ticks anchor inward rather than centering, or their label
        // would overhang past the plot's edge (and the card holding it).
        const anchor = i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle';
        return (
          <text key={y} x={xFor(i)} y={BOTTOM + 20} className="ns-mini-axis" textAnchor={anchor}>
            {y}
          </text>
        );
      })}

      {series.map((s) =>
        s.fill ? (
          <path key={s.label} d={areaFor(s.values)} fill={s.color} opacity={0.14} stroke="none" />
        ) : null,
      )}
      {series.map((s) => (
        <path
          key={s.label}
          d={pathFor(s.values)}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeDasharray={s.dashed ? '5 4' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="ns-mini-legend">
      {series.map((s) => (
        <span key={s.label} className="ns-mini-legend-item">
          <span className="ns-mini-legend-swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
