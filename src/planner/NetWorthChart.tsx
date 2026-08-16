import { useMemo, useState, type CSSProperties } from "react";
import type { PathMarkers, PlanEvent, PlanResult } from "@northstar/engine";
import { codeFor, summarize, toneFor } from "./presentation";
import { eventDetail } from "./detail";
import { HoverCard } from "./HoverCard";
import type { Detail } from "./detail";
import { axisMoney, money, signedMoney } from "./format";

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
  tone: "income" | "cost" | "end";
  code: string;
}

export interface CompareSeries {
  name: string;
  result: PlanResult;
}

/**
 * The same plan under a better and a worse market, drawn as a band fanning out
 * from today. Today's net worth is a fact; everything after it is an estimate,
 * and the fan is the chart admitting how much wider that estimate gets.
 */
export interface FanSeries {
  /** Percentage points either side of the plan's own return assumption. */
  shift: number;
  low: PlanResult;
  high: PlanResult;
}

interface Props {
  result: PlanResult;
  events: PlanEvent[];
  rateLabel: string;
  selected: ChartSelection | null;
  /** A second plan drawn alongside, clipped to this plan's horizon. */
  compare?: CompareSeries;
  fan?: FanSeries;
  /** The moments worth pointing at: failure, peak, worst fall. */
  markers: PathMarkers;
  /** False when nothing in the plan has a market return to flex. */
  canFan: boolean;
  onToggleFan(): void;
  onSelect(selection: ChartSelection | null): void;
}

export function NetWorthChart({
  result,
  events,
  rateLabel,
  selected,
  compare,
  fan,
  markers,
  canFan,
  onToggleFan,
  onSelect,
}: Props) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hotEdge, setHotEdge] = useState<"low" | "high" | null>(null);

  const geometry = useMemo(
    () => build(result, events, compare, fan),
    [result, events, compare, fan],
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
                background: "var(--in-tint)",
                border: "1px solid var(--in-line)",
              }}
            />
            Income event
          </span>
          <span className="ns-legend-item">
            <span
              className="ns-legend-swatch"
              style={{
                background: "var(--out-tint)",
                border: "1px solid var(--out-line)",
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
          {fan && (
            <span className="ns-legend-item">
              <span className="ns-legend-swatch ns-legend-swatch-fan" />±{fan.shift}% return
            </span>
          )}
          <span
            className="ns-legend-item"
            style={{ color: "var(--muted-light)" }}
          >
            Return {rateLabel}
          </span>

          {canFan && (
            <button
              type="button"
              className={`ns-fan-toggle${fan ? " is-on" : ""}`}
              aria-pressed={fan !== undefined}
              onClick={onToggleFan}
            >
              Range
            </button>
          )}
        </div>
      </div>

      {/* A plan that runs out of money is the single most important thing this
          screen can say, and it used to say it only as a table row you had to
          scroll to. It leads now. */}
      {markers.shortfallYears.length > 0 && (
        <div className="ns-alarm" role="status">
          <span className="ns-alarm-title">
            This plan runs out of money in {markers.shortfallYears[0]}
          </span>
          <span className="ns-alarm-note">
            {markers.shortfallYears.length === 1
              ? `${money(markers.shortfallTotal)} of spending goes unfunded.`
              : `${markers.shortfallYears.length} years fall short, ${money(
                  markers.shortfallTotal,
                )} unfunded in total.`}
          </span>
        </div>
      )}

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
                <stop offset="0%" stopColor="var(--data-nw)" stopOpacity="0.20" />
                <stop offset="100%" stopColor="var(--data-nw)" stopOpacity="0.02" />
              </linearGradient>

              {/* A dot lattice gives the plot a surface to sit on. Faint enough
                  to read as paper texture rather than as data. */}
              <pattern
                id="ns-dot-grid"
                x="0"
                y="0"
                width="18"
                height="18"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="9" cy="9" r="1" fill="var(--border-strong)" fillOpacity="0.5" />
              </pattern>

              {/* Lifts the line off the fan band. Soft and neutral — a coloured
                  glow would read as a value the chart does not have. */}
              <filter id="ns-line-lift" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="1.5"
                  stdDeviation="2.5"
                  floodColor="var(--chart-lift)"
                  floodOpacity="0.18"
                />
              </filter>
            </defs>

            <rect
              x={PLOT_LEFT}
              y={PLOT_TOP}
              width={PLOT_RIGHT - PLOT_LEFT}
              height={PLOT_BOTTOM - PLOT_TOP}
              fill="url(#ns-dot-grid)"
              pointerEvents="none"
            />

            {geometry.gridlines.map((g) => (
              <line
                key={g.value}
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={g.y}
                y2={g.y}
                stroke="var(--rule)"
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
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            ))}

            {/* With the fan on, the band is the fill that means something. The
                area gradient stacks with it and makes the lower edge read as a
                crossing, so it steps back to a faint grounding wash. */}
            <path
              className="ns-nw-area"
              d={geometry.area}
              fill="url(#ns-nw-fill)"
              opacity={fan ? 0.3 : 1}
            />

            {/* The fan sits UNDER the base line. It is context for the number,
                not a competing number — the eye should still land on the line
                first and read the spread second. */}
            {geometry.fanBand && (
              <path
                className="ns-fan-band"
                d={geometry.fanBand}
                fill="var(--fan-band)"
                stroke="none"
                style={{ opacity: hotEdge ? 0.35 : 1 }}
              />
            )}
            {geometry.highEdge && (
              <path
                className="ns-fan-edge"
                d={geometry.highEdge.d}
                fill="none"
                stroke="var(--green)"
                strokeWidth={hotEdge === "high" ? 2.4 : 1.6}
                strokeOpacity={hotEdge === "low" ? 0.28 : 0.85}
                strokeDasharray="3 5"
                strokeLinecap="round"
              />
            )}
            {geometry.lowEdge && (
              <path
                className="ns-fan-edge"
                d={geometry.lowEdge.d}
                fill="none"
                stroke="var(--out-strong)"
                strokeWidth={hotEdge === "low" ? 2.4 : 1.6}
                strokeOpacity={hotEdge === "high" ? 0.28 : 0.85}
                strokeDasharray="3 5"
                strokeLinecap="round"
              />
            )}

            {/* The compared plan sits under the active one: muted and dashed, so
              it reads as reference rather than competing for attention. */}
            {geometry.compareLine && (
              <path
                d={geometry.compareLine}
                fill="none"
                stroke="var(--cmp)"
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
              stroke="var(--data-nw)"
              strokeWidth={2.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#ns-line-lift)"
            />

            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  stroke="var(--accent)"
                  strokeWidth={1}
                />
                <circle
                  cx={hover.x}
                  cy={hover.y}
                  r={5.5}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                />
              </>
            )}

            {geometry.first && (
              <circle
                cx={geometry.first.x}
                cy={geometry.first.y}
                r={4.5}
                fill="var(--data-nw)"
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
                style={{ left: pct(t.x, VB_W), top: "93%" }}
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

            {/* Endpoint chips, rendered as HTML after the hit bands for the
                same reason the pins are: bands swallow SVG hover otherwise.
                Hovering one dims the opposite edge, so the band reads as a
                range with a side rather than as two unrelated lines. */}
            {fan && geometry.highEdge && geometry.lowEdge && (
              <>
                <FanChip
                  side="high"
                  x={geometry.highEdge.end.x}
                  y={geometry.highEdge.end.y}
                  value={geometry.highEdge.end.value}
                  base={geometry.last?.value ?? 0}
                  shift={fan.shift}
                  endYear={result.endYear}
                  onHover={setHotEdge}
                />
                <FanChip
                  side="low"
                  x={geometry.lowEdge.end.x}
                  y={geometry.lowEdge.end.y}
                  value={geometry.lowEdge.end.value}
                  base={geometry.last?.value ?? 0}
                  shift={fan.shift}
                  endYear={result.endYear}
                  onHover={setHotEdge}
                />
              </>
            )}

            {/* Notable points. Everything else on this line is gentle curve;
                these are the years someone actually needs to see. */}
            {markerPoints(markers, geometry.pointByYear).map((m) => (
              <div
                key={`${m.kind}-${m.year}`}
                className="ns-mark-slot"
                style={{ left: pct(m.x, VB_W), top: pct(m.y, VB_H) }}
              >
                <HoverCard detail={m.detail} side="top">
                  <span
                    className={`ns-mark ns-mark-${m.kind}`}
                    role="img"
                    aria-label={m.detail.title}
                  />
                </HoverCard>
              </div>
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

            {hover && hoverSnapshot && (
              <div
                className="ns-tooltip"
                style={{ left: clampPct(hover.x), top: "4%" }}
              >
                <div className="ns-tooltip-year">{hoverSnapshot.year}</div>
                <div className="ns-tooltip-value">
                  {money(hoverSnapshot.netWorth)}
                </div>
                <div className="ns-tooltip-flow">
                  Net flow {signedMoney(hoverSnapshot.netCashFlow)}
                </div>
                {compare && (
                  <div className="ns-tooltip-compare">
                    {compare.name}{" "}
                    {money(compareAt(compare, hoverSnapshot.year))}
                  </div>
                )}
              </div>
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

type MarkKind = "shortfall" | "peak" | "trough";

/**
 * Turns the engine's markers into positioned dots.
 *
 * A year can qualify for more than one — a plan often peaks, falls, and runs
 * dry in quick succession — so the more urgent kind wins and the year is only
 * marked once. Two dots stacked on one point would just look like a bug.
 */
function markerPoints(
  markers: PathMarkers,
  pointByYear: Map<number, { x: number; y: number; value: number }>,
) {
  const claimed = new Set<number>();
  const out: { kind: MarkKind; year: number; x: number; y: number; detail: Detail }[] = [];

  const add = (kind: MarkKind, year: number, detail: Detail) => {
    if (claimed.has(year)) return;
    const p = pointByYear.get(year);
    if (!p) return;
    claimed.add(year);
    out.push({ kind, year, x: p.x, y: p.y, detail });
  };

  // Only the FIRST failing year gets a dot. A badly broken plan fails every
  // year after it breaks, and sixty pulsing dots is decoration, not a finding
  // — the banner above already carries the count and the total.
  const firstShortfall = markers.shortfallYears[0];
  if (firstShortfall !== undefined) {
    add("shortfall", firstShortfall, {
      title: `${firstShortfall} — plan runs dry`,
      sections: [
        {
          rows: [
            { label: "Unfunded", value: money(markers.shortfallTotal) },
            { label: "Failing years", value: String(markers.shortfallYears.length) },
          ],
        },
        {
          heading: "What this means",
          rows: [
            { label: "Spending", value: "exceeds every account" },
            { label: "Fix", value: "cut costs or reorder withdrawals" },
          ],
        },
      ],
    });
  }

  if (markers.peakYear !== undefined && markers.peakValue !== undefined) {
    add("peak", markers.peakYear, {
      title: `Peak — ${markers.peakYear}`,
      sections: [
        {
          rows: [
            { label: "Net worth", value: money(markers.peakValue) },
            { label: "After this", value: "the plan declines" },
          ],
        },
      ],
    });
  }

  const d = markers.drawdown;
  if (d) {
    add("trough", d.toYear, {
      title: `Deepest fall — ${d.toYear}`,
      sections: [
        {
          rows: [
            { label: "From", value: `${money(d.peak)} in ${d.fromYear}` },
            { label: "To", value: money(d.trough) },
          ],
        },
        {
          heading: "Size",
          rows: [
            { label: "Fall", value: signedMoney(-d.amount) },
            { label: "Of the peak", value: `${d.percent.toFixed(0)}%` },
          ],
        },
      ],
    });
  }

  return out;
}

/**
 * One end of the fan: a small chip parked on the edge's last point, carrying
 * the outcome under that market. Hovering it gives the full comparison —
 * because the number a reader actually wants is not "$6.1M" but "$1.8M more
 * than the plan says, if returns run two points better".
 */
function FanChip({
  side,
  x,
  y,
  value,
  base,
  shift,
  endYear,
  onHover,
}: {
  side: "low" | "high";
  x: number;
  y: number;
  value: number;
  base: number;
  shift: number;
  endYear: number;
  onHover(side: "low" | "high" | null): void;
}) {
  const high = side === "high";
  const delta = value - base;
  const ratio = base > 0 ? (value / base - 1) * 100 : 0;

  const detail = {
    title: high ? "If returns run better" : "If returns run worse",
    sections: [
      {
        rows: [
          { label: "Return assumption", value: `${high ? "+" : "−"}${shift}% a year` },
          { label: `Net worth in ${endYear}`, value: money(value) },
        ],
      },
      {
        heading: "Against the plan",
        rows: [
          { label: "Difference", value: signedMoney(delta) },
          { label: "Relative", value: `${ratio >= 0 ? "+" : ""}${ratio.toFixed(0)}%` },
        ],
      },
    ],
  };

  return (
    <div
      className="ns-fan-slot"
      // Anchored from the RIGHT so the chip grows leftward from its endpoint
      // and stays inside the plot. Centring it would hang ~30px off the edge,
      // and a translate to correct that would become the containing block for
      // the hover card and throw it across the page.
      style={{ right: pct(VB_W - x, VB_W), top: pct(y, VB_H) }}
      onMouseEnter={() => onHover(side)}
      onMouseLeave={() => onHover(null)}
    >
      <HoverCard detail={detail} side={high ? "bottom" : "top"}>
        <span className={`ns-fan-chip ns-fan-chip-${side}`}>
          <span className="ns-fan-chip-mark">{high ? "▲" : "▼"}</span>
          {money(value)}
        </span>
      </HoverCard>
    </div>
  );
}

function build(
  result: PlanResult,
  events: PlanEvent[],
  compare?: CompareSeries,
  fan?: FanSeries,
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

  // The optimistic path runs ABOVE the base line, so it has to be in the
  // ceiling calculation or the fan clips off the top of the plot.
  const fanYears = (r: PlanResult | undefined) =>
    r?.years.filter((y) => y.year >= result.startYear && y.year <= result.endYear) ?? [];

  const maxNetWorth = Math.max(
    1,
    ...years.map((y) => y.netWorth),
    ...compareYears.map((y) => y.netWorth),
    ...fanYears(fan?.high).map((y) => y.netWorth),
  );
  const top = niceCeiling(maxNetWorth);
  const yFor = (value: number) =>
    PLOT_BOTTOM - (value / top) * (PLOT_BOTTOM - PLOT_TOP);

  const points = years.map((y) => ({
    year: y.year,
    x: xFor(y.year),
    y: yFor(y.netWorth),
    value: y.netWorth,
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

  // --- the sensitivity fan --------------------------------------------------
  // Both edges are clipped to this plan's window and drawn from the same
  // origin as the base line, so the three paths genuinely start together at
  // today's known net worth and only diverge as the estimate compounds.
  const edge = (r: PlanResult | undefined) => {
    const rows = fanYears(r);
    if (rows.length < 2) return undefined;
    const pts = rows.map((y) => ({ x: xFor(y.year), y: yFor(y.netWorth), value: y.netWorth }));
    return {
      d: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
      end: pts[pts.length - 1],
    };
  };

  const lowEdge = edge(fan?.low);
  const highEdge = edge(fan?.high);

  // One closed shape: out along the top, back along the bottom.
  const fanBand =
    lowEdge && highEdge
      ? `${highEdge.d} L${fanYears(fan?.low)
          .slice()
          .reverse()
          .map((y) => `${xFor(y.year).toFixed(2)},${yFor(y.netWorth).toFixed(2)}`)
          .join(" L")} Z`
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
    last: points[points.length - 1],
    fanBand,
    lowEdge,
    highEdge,
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
function clampPct(x: number): string {
  const raw = (x / VB_W) * 100;
  return `${Math.min(92, Math.max(8, raw))}%`;
}
