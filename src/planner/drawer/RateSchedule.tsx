import type { RateAnchor } from '@northstar/engine';
import { NumberInput } from './fields';

/**
 * The variable-rate editor: a list of (year, rate) anchors plus a preview.
 *
 * The engine STEPS between anchors rather than interpolating — "6% from 2031"
 * means exactly that (packages/engine/src/accounts.ts). So the preview draws a
 * step line, not a diagonal. A sloped line here would promise a gradual ramp
 * the projection never runs.
 *
 * The first anchor is pinned to the plan's start year: a schedule that begins
 * after the projection does has no rate for the opening years, and the rate an
 * account grows at *today* is the one thing every schedule must state.
 */

interface Props {
  label: string;
  value: RateAnchor[] | undefined;
  startYear: number;
  endYear: number;
  onChange(next: RateAnchor[]): void;
}

export function RateSchedule({ label, value, startYear, endYear, onChange }: Props) {
  const anchors = normalize(value, startYear);
  const used = new Set(anchors.map((a) => a.year));
  const nextFree = nextPointYear(anchors, used, endYear);

  const setAnchor = (index: number, patch: Partial<RateAnchor>) => {
    const next = anchors.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(sort(next));
  };

  return (
    <div className="ns-field">
      <div className="ns-sched-head">
        <span className="ns-field-label">Year</span>
        <span className="ns-field-label">{label}</span>
        <span />
      </div>

      {anchors.map((anchor, i) => (
        <div key={i} className="ns-sched-row">
          {i === 0 ? (
            // Pinned, but still rendered as a control so the column reads as
            // one list rather than a stray label above a form.
            <div className="ns-input ns-sched-year-fixed" aria-label={`Year ${anchor.year}`}>
              {anchor.year}
            </div>
          ) : (
            <select
              className="ns-input"
              aria-label="Year"
              value={anchor.year}
              onChange={(e) => setAnchor(i, { year: Number(e.target.value) })}
            >
              {yearOptions(startYear, endYear, used, anchor.year).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <NumberInput
            value={anchor.rate}
            unit="percent"
            step={0.1}
            onChange={(v) => setAnchor(i, { rate: v ?? 0 })}
          />

          {i === 0 ? (
            <span className="ns-sched-remove-slot" />
          ) : (
            <button
              type="button"
              className="ns-sched-remove"
              aria-label={`Remove ${anchor.year}`}
              onClick={() => onChange(anchors.filter((_, j) => j !== i))}
            >
              <MinusIcon />
            </button>
          )}
        </div>
      ))}

      {nextFree !== undefined && (
        <button
          type="button"
          className="ns-sched-add"
          onClick={() =>
            onChange(sort([...anchors, { year: nextFree, rate: anchors[anchors.length - 1].rate }]))
          }
        >
          <PlusIcon />
          Add point
        </button>
      )}

      <SchedulePreview anchors={anchors} startYear={startYear} endYear={endYear} />
    </div>
  );
}

// --- preview ----------------------------------------------------------------

const VB_W = 320;
const VB_H = 132;
const LEFT = 34;
const RIGHT = 314;
const TOP = 10;
const BOTTOM = 100;

function SchedulePreview({
  anchors,
  startYear,
  endYear,
}: {
  anchors: RateAnchor[];
  startYear: number;
  endYear: number;
}) {
  const scale = niceScale(anchors.map((a) => a.rate));
  const span = Math.max(endYear - startYear, 1);

  const x = (year: number) => LEFT + ((year - startYear) / span) * (RIGHT - LEFT);
  const y = (rate: number) =>
    BOTTOM - ((rate - scale.lo) / (scale.hi - scale.lo)) * (BOTTOM - TOP);

  // Step, never slope: hold the old rate up to the anchor year, then jump.
  let d = `M ${x(anchors[0].year)} ${y(anchors[0].rate)}`;
  for (let i = 1; i < anchors.length; i++) {
    d += ` L ${x(anchors[i].year)} ${y(anchors[i - 1].rate)}`;
    d += ` L ${x(anchors[i].year)} ${y(anchors[i].rate)}`;
  }
  d += ` L ${x(endYear)} ${y(anchors[anchors.length - 1].rate)}`;

  const yearTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round(startYear + (span * i) / 4),
  );

  return (
    <svg className="ns-sched-chart" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img"
      aria-label="Rate over time">
      {scale.ticks.map((t) => (
        <g key={t}>
          <line x1={LEFT} x2={RIGHT} y1={y(t)} y2={y(t)} stroke="#E3E9EF" strokeWidth="1" />
          <text className="ns-sched-axis" x={LEFT - 6} y={y(t) + 3.5} textAnchor="end">
            {trim(t)}%
          </text>
        </g>
      ))}

      <path d={d} fill="none" stroke="#2E8BD0" strokeWidth="2.5" strokeLinejoin="round" />

      {anchors.map((a, i) => (
        <circle key={i} cx={x(a.year)} cy={y(a.rate)} r="4" fill="#fff" stroke="#2E8BD0"
          strokeWidth="2.5" />
      ))}

      {yearTicks.map((t, i) => (
        <text
          key={t}
          className="ns-sched-axis"
          x={x(t)}
          y={BOTTOM + 20}
          textAnchor={i === 0 ? 'start' : i === yearTicks.length - 1 ? 'end' : 'middle'}
        >
          {t}
        </text>
      ))}
    </svg>
  );
}

// --- helpers ----------------------------------------------------------------

export const sort = (anchors: RateAnchor[]) => [...anchors].sort((a, b) => a.year - b.year);

/**
 * Always hand the editor at least one anchor, sorted, opening at the plan's
 * start year. An empty or stale schedule renders as a flat line at 0 rather
 * than an empty box.
 */
export function normalize(value: RateAnchor[] | undefined, startYear: number): RateAnchor[] {
  if (!value || value.length === 0) return [{ year: startYear, rate: 0 }];
  const sorted = sort(value);
  return [{ ...sorted[0], year: startYear }, ...sorted.slice(1).filter((a) => a.year > startYear)];
}

function yearOptions(
  startYear: number,
  endYear: number,
  used: Set<number>,
  own: number,
): number[] {
  const out: number[] = [];
  for (let y = startYear + 1; y <= endYear; y++) {
    if (y === own || !used.has(y)) out.push(y);
  }
  return out;
}

/**
 * Where the next point lands. Five years out from the last one, because rate
 * changes are things like "once the mortgage is gone" — the year after is
 * almost never what someone means, and it bunches every point against the
 * left edge of the preview. Falls back to the first free year when the jump
 * would overshoot the horizon or collide.
 */
const STEP_YEARS = 5;

export function nextPointYear(
  anchors: RateAnchor[],
  used: Set<number>,
  endYear: number,
): number | undefined {
  const last = anchors[anchors.length - 1].year;
  const spaced = last + STEP_YEARS;
  if (spaced <= endYear && !used.has(spaced)) return spaced;

  for (let y = last + 1; y <= endYear; y++) {
    if (!used.has(y)) return y;
  }
  return undefined;
}

/**
 * Gridlines at three even steps, with headroom so the line never rides the
 * ceiling. Negative rates (a depreciating asset) pull the floor below zero.
 */
export function niceScale(rates: number[]): { lo: number; hi: number; ticks: number[] } {
  const min = Math.min(0, ...rates);
  const max = Math.max(0, ...rates);
  const step = niceCeil((Math.max(max - min, 1) * 1.25) / 3);
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(lo + step * 3, Math.ceil(max / step) * step);

  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(4)));
  return { lo, hi, ticks };
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (([1, 2, 2.5, 3, 4, 5, 10].find((c) => n <= c + 1e-9) ?? 10) as number) * pow;
}

const trim = (v: number) => String(Number(v.toFixed(2)));

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}
