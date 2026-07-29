import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PlanEvent, PlanResult } from "@northstar/engine";
import { codeFor, summarize, toneFor } from "./presentation";
import { eventDetail } from "./detail";
import { HoverCard } from "./HoverCard";
import { axisMoney, money, signedMoney } from "./format";

/**
 * Hand-rolled SVG rather than a chart library (docs/PLAN.md §3.2). The two
 * things a library fights us on are exactly the two things this chart needs:
 * event pins that dodge each other when they collide in a year, and a hover
 * that targets a YEAR BAND rather than the nearest data point.
 */

const VB_W = 1176;
/**
 * Wide enough that a pin sitting on the very first year clears the y-axis
 * labels. A pin is 32 wide and centred on its year, so at the old 66 the
 * opening pin reached back to 50 and sat on top of the topmost label.
 */
const PLOT_LEFT = 82;
const PLOT_RIGHT = 1168;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 336;
const PIN_SIZE = 32;
const PIN_GAP = 6;

/** Year labels, just under the plot. */
const AXIS_Y = 350;
/**
 * The readout lane. The hover figures used to sit at the top of the plot,
 * which is exactly where the event pins live — on any year carrying an event
 * the two stacked on top of each other and neither could be read. Giving the
 * readout its own reserved band below the axis means the two can never
 * collide, whatever the plan contains.
 */
const READOUT_Y = 378;
const VB_H = 410;

export interface ChartSelection {
  eventId: string;
  label: string;
  year: number;
  detail: string;
  tone: "income" | "cost" | "end";
  code: string;
}

export interface CompareSeries {
  name: string;
  result: PlanResult;
}

interface Props {
  result: PlanResult;
  events: PlanEvent[];
  rateLabel: string;
  selected: ChartSelection | null;
  /** A second plan drawn alongside, clipped to this plan's horizon. */
  compare?: CompareSeries;
  onSelect(selection: ChartSelection | null): void;
}

export function NetWorthChart({
  result,
  events,
  rateLabel,
  selected,
  compare,
  onSelect,
}: Props) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const geometry = useMemo(
    () => build(result, events, compare),
    [result, events, compare],
  );
  const hover =
    hoverYear === null ? null : (geometry.pointByYear.get(hoverYear) ?? null);
  const hoverSnapshot =
    hoverYear === null
      ? null
      : (result.years.find((y) => y.year === hoverYear) ?? null);

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
              style={{
                background: "var(--blue-tint)",
                border: "1px solid var(--blue-line)",
              }}
            />
            Income event
          </span>
          <span className="ns-legend-item">
            <span
              className="ns-legend-swatch"
              style={{
                background: "var(--amber-tint)",
                border: "1px solid var(--amber-line)",
              }}
            />
            Cost event
          </span>
          {compare && (
            <span className="ns-legend-item">
              <span className="ns-legend-line ns-legend-line-compare" />
              {compare.name}
            </span>
          )}
          <span
            className="ns-legend-item"
            style={{ color: "var(--muted-light)" }}
          >
            Return {rateLabel}
          </span>
        </div>
      </div>

      {/* The chart scales with its viewBox, so squeezing it onto a phone makes
          the pins collide and the axis labels clip. Below ~700px it keeps its
          proportions and scrolls sideways instead, like the tables. */}
      <div className="ns-chart-scroll">
        <div className="ns-chart" onMouseLeave={() => setHoverYear(null)}>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label="Projected net worth over time"
          >
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

            {/* The compared plan sits under the active one: muted and dashed, so
              it reads as reference rather than competing for attention. */}
            {geometry.compareLine && (
              <path
                d={geometry.compareLine}
                fill="none"
                stroke="#8A99A7"
                strokeWidth={2}
                strokeDasharray="6 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            <path
              className="ns-nw-line"
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
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r={5.5}
                  fill="#fff"
                  stroke="#2E8BD0"
                  strokeWidth={2.5}
                />
              </>
            )}

            {geometry.first && (
              <circle
                cx={geometry.first.x}
                cy={geometry.first.y}
                r={4.5}
                fill="#2E8BD0"
              />
            )}
          </svg>

          <div className="ns-chart-overlay">
            {geometry.gridlines.map((g) => (
              <div
                key={g.value}
                className="ns-y-tick"
                style={{ left: "4.6%", top: pct(g.y, VB_H) }}
              >
                {axisMoney(g.value)}
              </div>
            ))}

            {geometry.xTicks.map((t) => (
              <div
                key={t.year}
                className="ns-x-tick"
                style={{ left: pct(t.x, VB_W), top: pct(AXIS_Y, VB_H) }}
              >
                {t.year}
              </div>
            ))}

            {/* Hit bands come FIRST so the pins stack above them. Rendered after,
              they cover the pins and swallow every click. */}
            {geometry.bands.map((band) => (
              <div
                key={band.year}
                className="ns-hit"
                style={{
                  left: pct(band.left, VB_W),
                  width: `${(band.width / VB_W) * 100}%`,
                }}
                onMouseEnter={() => setHoverYear(band.year)}
              />
            ))}

            {geometry.pins.map((pin, i) => (
              <div
                key={pin.eventId}
                className="ns-pin-slot"
                // --i staggers the drop-in left to right, so the pins land in
                // chronological order rather than all at once. It sits on the
                // slot rather than the button because the slot is what gets
                // positioned; custom properties inherit down to .ns-pin.
                style={
                  { left: pct(pin.x, VB_W), top: pct(pin.top, VB_H), "--i": i } as CSSProperties
                }
              >
                <HoverCard detail={eventDetail(pin.event)} side="bottom">
                  <button
                    type="button"
                    className={`ns-pin ns-pin-${pin.tone}`}
                    aria-pressed={selected?.eventId === pin.eventId}
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
                </HoverCard>
              </div>
            ))}

            {/* Reads left to right in its own lane under the axis, so it never
              lands on the pins. Laid out as a row rather than a stack: at the
              bottom of the chart a tall card would push the whole surface
              down every time the pointer moved. */}
            {hover && hoverSnapshot && (
              <Readout
                x={hover.x}
                year={hoverSnapshot.year}
                value={money(hoverSnapshot.netWorth)}
                flow={`Net flow ${signedMoney(hoverSnapshot.netCashFlow)}`}
                compareLabel={
                  compare
                    ? `${compare.name} ${money(compareAt(compare, hoverSnapshot.year))}`
                    : undefined
                }
              />
            )}
          </div>
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
  tone: "income" | "cost" | "end";
  x: number;
  top: number;
  event: PlanEvent;
}

function compareAt(compare: CompareSeries, year: number): number {
  return compare.result.years.find((y) => y.year === year)?.netWorth ?? 0;
}

function build(
  result: PlanResult,
  events: PlanEvent[],
  compare?: CompareSeries,
) {
  const years = result.years;
  const span = Math.max(1, result.endYear - result.startYear);
  const xFor = (year: number) =>
    PLOT_LEFT + ((year - result.startYear) / span) * (PLOT_RIGHT - PLOT_LEFT);

  // Clipped to the active plan's horizon: the comparison is "how does the other
  // plan do over MY window", not a merged timeline.
  const compareYears =
    compare?.result.years.filter(
      (y) => y.year >= result.startYear && y.year <= result.endYear,
    ) ?? [];

  const maxNetWorth = Math.max(
    1,
    ...years.map((y) => y.netWorth),
    ...compareYears.map((y) => y.netWorth),
  );
  const top = niceCeiling(maxNetWorth);
  const yFor = (value: number) =>
    PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);

  const points = years.map((y) => ({
    year: y.year,
    x: xFor(y.year),
    y: yFor(y.netWorth),
  }));
  const pointByYear = new Map(points.map((p) => [p.year, p]));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const area =
    points.length > 0
      ? `${line} L${points[points.length - 1].x.toFixed(2)},${PLOT_BOTTOM} L${points[0].x.toFixed(2)},${PLOT_BOTTOM} Z`
      : "";

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

  // Pins stack downward when they would OVERLAP, not merely when they share a
  // year. On a 20-year plan same-year is the only collision; on a 60-year one
  // adjacent years are only a few pixels apart, and stacking by year alone
  // left them overlapping and unreadable.
  //
  // Each row remembers the right edge of its last pin; a pin drops to the
  // first row it clears.
  const rowRightEdges: number[] = [];
  const pins: Pin[] = events
    .filter((e) => e.isIncluded && !e.isHidden)
    .filter(
      (e) => e.startYear >= result.startYear && e.startYear <= result.endYear,
    )
    .sort((a, b) => a.startYear - b.startYear)
    .map((event) => {
      const x = xFor(event.startYear);
      const left = x - PIN_SIZE / 2;

      let depth = rowRightEdges.findIndex((edge) => left >= edge);
      if (depth === -1) depth = rowRightEdges.length;
      rowRightEdges[depth] = x + PIN_SIZE / 2 + PIN_GAP;

      return {
        eventId: event.id,
        year: event.startYear,
        code: codeFor(event.kind),
        label: event.name,
        detail: summarize(event),
        tone: toneFor(event.kind),
        x,
        top: PLOT_TOP - PIN_SIZE / 2 + depth * (PIN_SIZE + PIN_GAP),
        event,
      };
    });

  // Year bands for the hover hit test.
  const bandWidth = (PLOT_RIGHT - PLOT_LEFT) / Math.max(1, years.length - 1);
  const bands = years.map((y) => ({
    year: y.year,
    left: xFor(y.year) - bandWidth / 2,
    width: bandWidth,
  }));

  const compareLine =
    compareYears.length > 1
      ? compareYears
          .map(
            (y, i) =>
              `${i === 0 ? "M" : "L"}${xFor(y.year).toFixed(2)},${yFor(y.netWorth).toFixed(2)}`,
          )
          .join(" ")
      : undefined;

  return {
    line,
    area,
    compareLine,
    gridlines,
    xTicks,
    pins,
    bands,
    pointByYear,
    first: points[0],
  };
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
/**
 * The hover readout, centred on the year under the pointer and kept inside the
 * plot.
 *
 * The clamp MEASURES rather than guessing at a percentage. This used to be
 * fixed 8%/92% margins, which held while the readout was a narrow stacked
 * card; as a row it is far wider — wider again with a comparison in it — and
 * those margins let it hang off the end of the chart.
 */
function Readout({
  x,
  year,
  value,
  flow,
  compareLabel,
}: {
  x: number;
  year: number;
  value: string;
  flow: string;
  compareLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;

    const half = el.offsetWidth / 2;
    const width = parent.clientWidth;
    // `Math.max(half, …)` keeps the bounds sane if the pill is ever wider than
    // the plot, which is what a phone-width chart plus a long scenario name
    // would otherwise produce.
    setLeft(Math.min(Math.max((x / VB_W) * width, half), Math.max(half, width - half)));
  }, [x, year, value, flow, compareLabel]);

  return (
    <div
      ref={ref}
      className="ns-tooltip"
      style={{
        left: left ?? pct(x, VB_W),
        top: pct(READOUT_Y, VB_H),
        // Measured before paint, so this only hides the very first frame.
        visibility: left === null ? 'hidden' : undefined,
      }}
    >
      <span className="ns-tooltip-year">{year}</span>
      <span className="ns-tooltip-value">{value}</span>
      <span className="ns-tooltip-flow">{flow}</span>
      {compareLabel && <span className="ns-tooltip-compare">{compareLabel}</span>}
    </div>
  );
}
