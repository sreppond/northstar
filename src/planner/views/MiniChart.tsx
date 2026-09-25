import { useEffect, useRef, useState } from 'react';
import { axisMoney } from '../format';

/**
 * A small, static multi-series line chart for the focused forecast views
 * (Retirement, House, SEPP, Reports, Progress). Deliberately simpler than
 * `NetWorthChart` — no hover, no fan, no event pins. Those views are read
 * once for their shape, not interrogated year by year the way the main
 * net-worth line is.
 */

const HEIGHT_DEFAULT = 280;
/** Left margin is a fixed pixel gutter for the y-axis money labels — this
    only works because the viewBox is now sized in real px (see `width`
    below), not a fixed 960-unit canvas stretched to fit. */
const LEFT = 56;
const RIGHT_MARGIN = 8;
/** Right plot edge when `endLabels` is on — leaves room for the label column
    (docs/REDESIGN-V3.md "direct end labels instead of a legend"). */
const RIGHT_LABELED_MARGIN = 130;
const TOP = 14;
const BOTTOM_MARGIN = 40;
/** Minimum vertical gap (px) between two end labels so a close finish (e.g.
    mortgage payoff near equity) never overlaps. */
const END_LABEL_GAP = 20;
/** A fallback width used only for the very first render, before the
    `ResizeObserver` reports the container's real size — avoids a 0-width
    flash. Whatever this is, the true measured width replaces it within a
    frame, so its exact value barely matters. */
const FALLBACK_WIDTH = 640;

export interface ChartSeries {
  label: string;
  color: string;
  /** `NaN` marks a gap — no data at that x position (Progress's "Actual"
      series, when the shared x-domain includes anchor points before or
      after the actual logged readings). The line breaks rather than
      interpolating across a gap, and no dot is drawn there. */
  values: number[];
  /** Fills the area under the line, for the one series that reads as a volume. */
  fill?: boolean;
  dashed?: boolean;
  /** A filled dot at every real (non-`NaN`) data point — Progress's "actual"
      series, where each point is a real logged reading rather than an
      annual sample of a smooth projection. */
  dots?: boolean;
}

/** Rounds `rawStep` up to the nearest "nice" 1/2/2.5/5 × 10ⁿ step — the same
    families a ruler or a spreadsheet's auto-axis would pick, so gridlines
    land on numbers a reader would round to anyway ($1M, not $917K). */
function niceStep(rawStep: number): number {
  if (!(rawStep > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const family = [1, 2, 2.5, 5, 10];
  const multiplier = family.find((f) => f >= normalized - 1e-9) ?? 10;
  return multiplier * magnitude;
}

interface Tick {
  value: number;
  /** The actual data ceiling, shown in addition to the nice ticks below it
      when it sits meaningfully above the last one (S2: "label the top with
      the actual ceiling only if it's more than 8% above the last nice
      line"). The plotted range itself always uses the real min/max —
      DESIGN-DIRECTION's "y-ceiling from the data, not niceCeiling()" — only
      the drawn gridlines/labels round to nice numbers. */
  isCeiling?: boolean;
}

/** 3–5 gridlines at nice round steps spanning `[min, max]`, per S2. */
function niceTicks(min: number, max: number): Tick[] {
  const span = max - min;
  if (!(span > 0)) return [{ value: max }];

  const step = niceStep(span / 4);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6 && ticks.length < 5; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  if (ticks.length === 0) ticks.push(max);

  const result: Tick[] = ticks.map((value) => ({ value }));
  const lastNice = ticks[ticks.length - 1];
  // Measured against the tick STEP, not the last tick's own value — a gap
  // judged against `lastNice` reads as "far enough" whenever `lastNice`
  // itself is small, even while the ceiling sits visually right on top of
  // it (a $45 ceiling 12.5% above a $40 tick still only clears it by an
  // eighth of the gap between gridlines). 0.45 step-units is close to half
  // a gridline's worth of room — enough that the extra label never crowds
  // the one above it.
  if ((max - lastNice) / step > 0.45) {
    result.push({ value: max, isCeiling: true });
  }
  return result;
}

/** Same idea as `axisMoney`, but rounded to one decimal on the M-scale
    rather than two — used only for the ceiling tick's own label
    (`isCeiling`), which already sits close enough to the nice tick above it
    that axisMoney's two decimal digits ("$47.17M") read as noise crowding a
    round "$40M" line. */
function tightCeilingMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  return axisMoney(value);
}

/** The last index holding a real (non-`NaN`) value, or -1 if none do —
    where a series' own line/end-label actually ends, which may be short of
    the shared x-domain's own right edge (Progress's "Actual" series, logged
    only partway across a domain that also reaches to "today"). */
function lastFiniteIndex(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number.isFinite(values[i])) return i;
  }
  return -1;
}

/** Measures a ref'd element's content width via `ResizeObserver` — the
    fix for M8: a MiniChart used to render at a fixed 960×280 viewBox with
    `preserveAspectRatio="none"`, which stretched its `<text>` non-uniformly
    (letter-spaced-looking axis labels at 1440px, ~4px illegible ones on a
    phone). Sizing the viewBox itself to the real pixel width means text
    renders 1:1 at every width. */
function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export function MiniChart({
  years,
  series,
  height = HEIGHT_DEFAULT,
  formatX = String,
  formatY = axisMoney,
  endLabels = false,
  bandFrom,
  bandLabel,
}: {
  /** The shared x-domain every series' `values` is sampled at, index for
      index — real numeric positions (a plain year, or Progress's fractional
      year), not just ordinal labels: two points 5 years apart and two a
      week apart are spaced proportionally, not identically. */
  years: number[];
  series: ChartSeries[];
  height?: number;
  /** Ticks default to the bare `years` value — Progress's fractional-year x-axis passes a date formatter instead. */
  formatX?: (year: number) => string;
  /** Y-axis tick labels default to money — every series this chart has drawn
      so far has been a dollar figure. Reports' contribution-rate chart is a
      percentage, not a balance, and needs its own formatter or its ticks
      read "$45 / $40 / $20" for a rate. */
  formatY?: (value: number) => string;
  /** Goodcast's end-label idiom (docs/REDESIGN-V3.md): a small dot + the
      series name at the line's own end, in place of a `ChartLegend` below
      the chart. Callers that turn this on should not also render
      `ChartLegend` for the same chart. */
  endLabels?: boolean;
  /** A lighter background band from this x-domain value to the chart's right
      edge, with an optional eyebrow at the band's start — Retirement's
      "beyond plan horizon" marker (B2), where this view runs the plan past
      its own configured end so the page always has something to show, and
      needs to say so rather than let the extension pass as more real data. */
  bandFrom?: number;
  bandLabel?: string;
}) {
  const [containerRef, width] = useMeasuredWidth();

  const RIGHT_EDGE = width - (endLabels ? RIGHT_LABELED_MARGIN : RIGHT_MARGIN);
  const BOTTOM = height - BOTTOM_MARGIN;

  const allValues = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const span = max - min || 1;

  const xMin = Math.min(...years);
  const xMax = Math.max(...years);
  const xSpan = xMax - xMin || 1;
  const xFor = (i: number) => LEFT + ((years[i] - xMin) / xSpan) * (RIGHT_EDGE - LEFT);
  const yFor = (v: number) => BOTTOM - ((v - min) / span) * (BOTTOM - TOP);

  const pathFor = (values: number[]) => {
    let d = '';
    let drawing = false;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        drawing = false;
        return;
      }
      d += `${drawing ? 'L' : 'M'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)} `;
      drawing = true;
    });
    return d.trim();
  };

  const areaFor = (values: number[]) => {
    if (!values.every(Number.isFinite)) return '';
    return `${pathFor(values)} L${xFor(values.length - 1).toFixed(1)},${yFor(0).toFixed(1)} L${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} Z`;
  };

  const zeroY = yFor(0);
  const ticks = niceTicks(min, max);
  // A fixed "every 6th point" used to be fine when every MiniChart's domain
  // was a plan's ~20-year span, but B2's extended Retirement view can put
  // 50+ points on a chart that's also been squeezed narrow (a phone width,
  // `endLabels`' own right margin) — plenty of points, not much room. Target
  // a label every ~70px of actual plot width instead, capped at 7 so a wide
  // chart doesn't get MORE labels than before, just never fewer than 2.
  const targetXLabels = Math.max(2, Math.min(7, Math.floor((RIGHT_EDGE - LEFT) / 70)));
  const xTickEvery = Math.max(1, Math.round(years.length / targetXLabels));
  const bandX = bandFrom !== undefined ? LEFT + ((bandFrom - xMin) / xSpan) * (RIGHT_EDGE - LEFT) : undefined;

  // Candidates at every `xTickEvery`th index, plus the true last point (the
  // domain's actual end is always worth labelling, even off-rhythm). Two of
  // these can still collide: the same calendar year twice (Progress's
  // `asOf`/`asOf+1` anchors sit close enough to a real logged date that
  // `formatX`'s year-only formatting collapses them), or simply too few
  // pixels apart (the regular rhythm's last stop landing right next to the
  // forced final one). Either way the fix is the same — drop the EARLIER of
  // the pair, since the later one is either the true end or reads the same
  // regardless.
  // Generous enough to cover a 4-digit year label's full rendered width even
  // in the worst case: a `middle`-anchored label (extends ~half its width
  // each side of its own x) sitting right before the domain's forced final,
  // `end`-anchored one (extends its full width backward from ITS x) — the
  // pair that first exposed this at B2's wider, denser Retirement domain.
  const MIN_X_TICK_GAP_PX = 42;
  const xTicks: { y: number; i: number; label: string }[] = [];
  years.forEach((y, i) => {
    if (i % xTickEvery !== 0 && i !== years.length - 1) return;
    const label = formatX(y);
    const x = xFor(i);
    const prev = xTicks[xTicks.length - 1];
    if (prev && (label === prev.label || x - xFor(prev.i) < MIN_X_TICK_GAP_PX)) {
      xTicks.pop();
    }
    xTicks.push({ y, i, label });
  });

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="ns-mini-chart"
        role="img"
        aria-label="Forecast chart"
        style={{ width: '100%', height }}
      >
        {bandX !== undefined && bandX < RIGHT_EDGE && (
          <rect x={bandX} y={TOP} width={RIGHT_EDGE - bandX} height={BOTTOM - TOP} className="ns-mini-band" />
        )}

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={LEFT}
              x2={RIGHT_EDGE}
              y1={yFor(t.value)}
              y2={yFor(t.value)}
              className={t.isCeiling ? 'ns-mini-grid ns-mini-grid-ceiling' : 'ns-mini-grid'}
            />
            <text x={LEFT - 8} y={yFor(t.value)} className="ns-mini-axis" textAnchor="end" dy="0.32em">
              {t.isCeiling && formatY === axisMoney ? tightCeilingMoney(t.value) : formatY(t.value)}
            </text>
          </g>
        ))}

        {min < 0 && max > 0 && (
          <line x1={LEFT} x2={RIGHT_EDGE} y1={zeroY} y2={zeroY} className="ns-mini-zero" />
        )}

        {xTicks.map(({ y, i, label }) => {
          // The end ticks anchor inward rather than centering, or their label
          // would overhang past the plot's edge (and the card holding it).
          const anchor = i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle';
          return (
            <text key={y} x={xFor(i)} y={BOTTOM + 20} className="ns-mini-axis" textAnchor={anchor}>
              {label}
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
        {series.map((s) =>
          s.dots
            ? s.values.map((v, i) =>
                Number.isFinite(v) ? (
                  <circle key={`${s.label}-${i}`} cx={xFor(i)} cy={yFor(v)} r={3.5} fill={s.color} />
                ) : null,
              )
            : null,
        )}

        {endLabels && series.length > 0 && (
          <EndLabels series={series} xFor={xFor} yFor={yFor} rightEdge={RIGHT_EDGE} />
        )}

        {/* The band's own eyebrow renders LAST (on top of every series line),
            with a solid backing chip — drawn earlier, it used to disappear
            under whichever series happened to pass through that corner.
            Skipped when there isn't real room for it: on a narrow chart (a
            phone width, or `endLabels`' own right margin) this text is long
            enough to run past the band into the end-label column just to its
            right. The tinted rect alone still marks the region; the stat
            strip's sub-line already says the same thing in words. */}
        {bandX !== undefined && bandLabel && RIGHT_EDGE - bandX > 100 && (
          <g>
            <rect
              x={bandX + 2}
              y={TOP + 2}
              width={bandLabel.length * 5.9 + 10}
              height={13}
              rx={2}
              className="ns-mini-band-label-chip"
            />
            <text x={bandX + 7} y={TOP + 10} className="ns-mini-band-label">
              {bandLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * The label column direct end labels live in — a small colour dot (identity)
 * next to plain-ink text (the name), never the series colour on the text
 * itself (dataviz's "text wears text tokens, never the series colour").
 * Labels are sorted by their raw y and pushed apart by `END_LABEL_GAP` so two
 * lines that finish close together (mortgage payoff landing near zero equity,
 * say) never collide — the dot stays at the line's true end; only the text
 * baseline moves. A series whose real data stops short of the shared
 * x-domain's right edge (Progress's "Actual", once the domain also reaches
 * "today") gets a leader line running from its dot back to the label column.
 */
function EndLabels({
  series,
  xFor,
  yFor,
  rightEdge,
}: {
  series: ChartSeries[];
  xFor: (i: number) => number;
  yFor: (v: number) => number;
  rightEdge: number;
}) {
  const placed = series
    .map((s) => {
      const idx = lastFiniteIndex(s.values);
      const rawX = idx >= 0 ? xFor(idx) : rightEdge;
      const rawY = idx >= 0 ? yFor(s.values[idx]) : 0;
      return { s, rawX, rawY, labelY: rawY };
    })
    .sort((a, b) => a.rawY - b.rawY);
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].labelY - placed[i - 1].labelY < END_LABEL_GAP) {
      placed[i].labelY = placed[i - 1].labelY + END_LABEL_GAP;
    }
  }

  return (
    <>
      {placed.map(({ s, rawX, rawY, labelY }) => (
        <g key={s.label}>
          {(Math.abs(labelY - rawY) > 1 || Math.abs(rawX - rightEdge) > 1) && (
            <line x1={rawX + 4} x2={rightEdge + 12} y1={rawY} y2={labelY} className="ns-mini-endlabel-lead" />
          )}
          <circle cx={rawX + 4} cy={rawY} r={2.5} fill={s.color} />
          <text x={rightEdge + 16} y={labelY} className="ns-mini-endlabel" dy="0.32em">
            {s.label}
          </text>
        </g>
      ))}
    </>
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
