import { useMemo, useState } from 'react';
import type { PlanEvent, PlanResult } from '@northstar/engine';
import { codeFor, summarize, toneFor } from './presentation';
import { axisMoney, money, signedMoney } from './format';

/**
 * Hand-rolled SVG rather than a chart library (docs/PLAN.md §3.2). The two
 * things a library fights us on are exactly the two things this chart needs:
 * event pins that dodge each other when they collide in a year, and a hover
 * that targets a YEAR BAND rather than the nearest data point.
 */

const VB_W = 1176;
const VB_H = 372;
const PLOT_LEFT = 66;
const PLOT_RIGHT = 1168;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 336;
const PIN_SIZE = 32;
const PIN_GAP = 6;

export interface ChartSelection {
  eventId: string;
  label: string;
  year: number;
  detail: string;
  tone: 'income' | 'cost' | 'end';
  code: string;
}

interface Props {
  result: PlanResult;
  events: PlanEvent[];
  rateLabel: string;
  selected: ChartSelection | null;
  onSelect(selection: ChartSelection | null): void;
}

export function NetWorthChart({ result, events, rateLabel, selected, onSelect }: Props) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const geometry = useMemo(() => build(result, events), [result, events]);
  const hover = hoverYear === null ? null : geometry.pointByYear.get(hoverYear) ?? null;
  const hoverSnapshot =
    hoverYear === null ? null : result.years.find((y) => y.year === hoverYear) ?? null;

  return (
    <>
      <div className="ns-chart-head">
        <h2>Projected net worth</h2>
        <div className="ns-legend">
          <span className="ns-legend-item">
            <span className="ns-legend-line" />
            Net worth
          </span>
          <span className="ns-legend-item">
            <span
              className="ns-legend-swatch"
              style={{ background: 'var(--blue-tint)', border: '1px solid var(--blue-line)' }}
            />
            Income event
          </span>
          <span className="ns-legend-item">
            <span
              className="ns-legend-swatch"
              style={{ background: 'var(--amber-tint)', border: '1px solid var(--amber-line)' }}
            />
            Cost event
          </span>
          <span className="ns-legend-item" style={{ color: 'var(--muted-light)' }}>
            Return {rateLabel}
          </span>
        </div>
      </div>

      <div className="ns-chart" onMouseLeave={() => setHoverYear(null)}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Projected net worth over time">
          <defs>
            <linearGradient id="ns-nw-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2E8BD0" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#2E8BD0" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {geometry.gridlines.map((g) => (
            <line
              key={g.value}
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={g.y}
              y2={g.y}
              stroke="#E3E9EF"
              strokeWidth={1}
            />
          ))}

          {geometry.pins.map((pin) => (
            <line
              key={`rule-${pin.eventId}`}
              x1={pin.x}
              x2={pin.x}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              stroke="#DCE4EC"
              strokeWidth={1}
            />
          ))}

          <path d={geometry.area} fill="url(#ns-nw-fill)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="#12304C"
            strokeWidth={2.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PLOT_TOP}
                y2={PLOT_BOTTOM}
                stroke="#2E8BD0"
                strokeWidth={1}
              />
              <circle cx={hover.x} cy={hover.y} r={5.5} fill="#fff" stroke="#2E8BD0" strokeWidth={2.5} />
            </>
          )}

          {geometry.first && <circle cx={geometry.first.x} cy={geometry.first.y} r={4.5} fill="#2E8BD0" />}
        </svg>

        <div className="ns-chart-overlay">
          {geometry.gridlines.map((g) => (
            <div key={g.value} className="ns-y-tick" style={{ left: '4.6%', top: pct(g.y, VB_H) }}>
              {axisMoney(g.value)}
            </div>
          ))}

          {geometry.xTicks.map((t) => (
            <div key={t.year} className="ns-x-tick" style={{ left: pct(t.x, VB_W), top: '93%' }}>
              {t.year}
            </div>
          ))}

          {/* Hit bands come FIRST so the pins stack above them. Rendered after,
              they cover the pins and swallow every click. */}
          {geometry.bands.map((band) => (
            <div
              key={band.year}
              className="ns-hit"
              style={{ left: pct(band.left, VB_W), width: `${(band.width / VB_W) * 100}%` }}
              onMouseEnter={() => setHoverYear(band.year)}
            />
          ))}

          {geometry.pins.map((pin) => (
            <button
              key={pin.eventId}
              type="button"
              className={`ns-pin ns-pin-${pin.tone}`}
              aria-pressed={selected?.eventId === pin.eventId}
              title={`${pin.label} · ${pin.year}`}
              style={{ left: pct(pin.x, VB_W), top: pct(pin.top, VB_H) }}
              onClick={() =>
                onSelect(
                  selected?.eventId === pin.eventId
                    ? null
                    : {
                        eventId: pin.eventId,
                        label: pin.label,
                        year: pin.year,
                        detail: pin.detail,
                        tone: pin.tone,
                        code: pin.code,
                      },
                )
              }
            >
              {pin.code}
            </button>
          ))}

          {hover && hoverSnapshot && (
            <div
              className="ns-tooltip"
              style={{ left: clampPct(hover.x), top: '4%' }}
            >
              <div className="ns-tooltip-year">{hoverSnapshot.year}</div>
              <div className="ns-tooltip-value">{money(hoverSnapshot.netWorth)}</div>
              <div className="ns-tooltip-flow">Net flow {signedMoney(hoverSnapshot.netCashFlow)}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

interface Pin {
  eventId: string;
  year: number;
  code: string;
  label: string;
  detail: string;
  tone: 'income' | 'cost' | 'end';
  x: number;
  top: number;
}

function build(result: PlanResult, events: PlanEvent[]) {
  const years = result.years;
  const span = Math.max(1, result.endYear - result.startYear);
  const xFor = (year: number) =>
    PLOT_LEFT + ((year - result.startYear) / span) * (PLOT_RIGHT - PLOT_LEFT);

  const maxNetWorth = Math.max(1, ...years.map((y) => y.netWorth));
  const top = niceCeiling(maxNetWorth);
  const yFor = (value: number) =>
    PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);

  const points = years.map((y) => ({ year: y.year, x: xFor(y.year), y: yFor(y.netWorth) }));
  const pointByYear = new Map(points.map((p) => [p.year, p]));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area =
    points.length > 0
      ? `${line} L${points[points.length - 1].x.toFixed(2)},${PLOT_BOTTOM} L${points[0].x.toFixed(2)},${PLOT_BOTTOM} Z`
      : '';

  const gridStep = top / 4;
  const gridlines = Array.from({ length: 5 }, (_, i) => {
    const value = gridStep * i;
    return { value, y: yFor(value) };
  }).reverse();

  // Roughly every other year, always including both endpoints.
  const tickEvery = Math.max(1, Math.round(span / 10));
  const xTicks: { year: number; x: number }[] = [];
  for (let year = result.startYear; year <= result.endYear; year += tickEvery) {
    xTicks.push({ year, x: xFor(year) });
  }
  if (xTicks[xTicks.length - 1]?.year !== result.endYear) {
    xTicks.push({ year: result.endYear, x: xFor(result.endYear) });
  }

  // Pins stack downward when several land in the same year (KID under JOB).
  const perYear = new Map<number, number>();
  const pins: Pin[] = events
    .filter((e) => e.isIncluded && !e.isHidden)
    .filter((e) => e.startYear >= result.startYear && e.startYear <= result.endYear)
    .sort((a, b) => a.startYear - b.startYear)
    .map((event) => {
      const depth = perYear.get(event.startYear) ?? 0;
      perYear.set(event.startYear, depth + 1);
      return {
        eventId: event.id,
        year: event.startYear,
        code: codeFor(event.kind),
        label: event.name,
        detail: summarize(event),
        tone: toneFor(event.kind),
        x: xFor(event.startYear),
        top: PLOT_TOP - PIN_SIZE / 2 + depth * (PIN_SIZE + PIN_GAP),
      };
    });

  // Year bands for the hover hit test.
  const bandWidth = (PLOT_RIGHT - PLOT_LEFT) / Math.max(1, years.length - 1);
  const bands = years.map((y) => ({
    year: y.year,
    left: xFor(y.year) - bandWidth / 2,
    width: bandWidth,
  }));

  return { line, area, gridlines, xTicks, pins, bands, pointByYear, first: points[0] };
}

/** Round a maximum up to a clean axis top so gridline labels read well. */
function niceCeiling(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

/** Keep the tooltip from hanging off either edge of the plot. */
function clampPct(x: number): string {
  const raw = (x / VB_W) * 100;
  return `${Math.min(92, Math.max(8, raw))}%`;
}
