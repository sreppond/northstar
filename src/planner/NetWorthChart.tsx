import { useMemo, useState } from "react";
import type { PathMarkers, Plan, PlanEvent, PlanResult } from "@northstar/engine";
import { deflate, runPlan } from "@northstar/engine";
import { codeFor, summarize, toneFor } from "./presentation";
import { eventDetail } from "./detail";
import { HoverCard } from "./HoverCard";
import type { Detail } from "./detail";
import { axisMoney, money, signedMoney } from "./format";

/**
 * Hand-rolled SVG rather than a chart library (docs/PLAN.md §3.2). The two
 * things a library fights us on are exactly the two things this chart needs:
 * event dots that dodge each other when their labels collide, and a hover
 * that targets a YEAR BAND rather than the nearest data point.
 */

const VB_W = 1176;
const VB_H = 372;
const PLOT_LEFT = 66;
const PLOT_RIGHT = 1168;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 336;

// Events on the curve (docs/REDESIGN.md §4.1). A small ring dot marks every
// one; only the top few by impact get a standing label, laid out in lanes
// near the top of the plot with a thin leader down to their actual dot — the
// same horizontal-collision packing the old pin row used, now sized to text
// instead of a fixed pin, and anchored above the curve instead of ON it so a
// label never has to dodge the line itself. The dot's own size lives in
// planner.css's `.ns-event-dot-mark` (real px, not a viewBox unit — see why
// in that rule's comment).
const TOP_LABEL_COUNT = 4;
const LABEL_TOP = PLOT_TOP + 8;
const LABEL_LANE_H = 20;
const LABEL_GAP = 14;

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
  /** The whole plan, not just its events — ranking a dot's label needs to
      re-run the projection with that one event excluded (see `rankImpact`). */
  plan: Plan;
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
  plan,
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

  // Kept separate from `build()` below so toggling the fan or a comparison
  // plan — both frequent — never re-triggers this: it is the one part of the
  // chart's geometry that cannot be found by just looking at `result`.
  const impactByEventId = useMemo(() => rankImpact(plan, result), [plan, result]);

  const geometry = useMemo(
    () => build(result, plan.events, impactByEventId, compare, fan),
    [result, plan.events, impactByEventId, compare, fan],
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
          the dots collide and the axis labels clip. Below ~700px it keeps its
          proportions and scrolls sideways instead, like the tables. */}
      <div className="ns-chart-scroll">
        <div className="ns-chart" onMouseLeave={() => setHoverYear(null)}>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Projected net worth over time"
          >
            <defs>
              <linearGradient id="ns-nw-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--data-nw)" stopOpacity="0.20" />
                <stop offset="100%" stopColor="var(--data-nw)" stopOpacity="0.02" />
              </linearGradient>

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

            {/* The leader is the only part of an event's mark still drawn in
                the svg — a 1px line barely shows the couple-percent
                non-uniform stretch `preserveAspectRatio="none"` (full-bleed
                sizing, see planner.css) introduces. The dot itself is HTML
                (below, in the overlay), because that stretch would turn an
                svg circle visibly oval on any viewport whose aspect ratio
                drifts from the chart's own 1176:372. */}
            {geometry.labels.map((l) => (
              <line
                key={`leader-${l.eventId}`}
                x1={l.dotX}
                y1={l.dotY}
                x2={l.leaderX}
                y2={l.leaderY}
                className="ns-event-leader"
              />
            ))}

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

            {/* Hit bands come FIRST so the dots and labels stack above them.
              Rendered after, they cover everything and swallow every click. */}
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

            {/* Every included event gets a dot on the curve at its own year —
                not a detached row above the plot. Hue is the only thing this
                chart uses to encode "what does this do to cash"; a 2px ring
                in the surface colour keeps it legible sitting on top of the
                busy line and area fill (docs/REDESIGN.md §4.1). HTML, not
                svg, and purely decorative (the hit target and, for a
                labelled event, the label button underneath and on top of it
                respectively are what actually respond to a pointer). */}
            {geometry.dots.map((d) => (
              <div
                key={`dot-${d.eventId}`}
                className={`ns-event-dot-mark ns-event-dot-${d.tone}`}
                style={{ left: pct(d.x, VB_W), top: pct(d.y, VB_H) }}
              />
            ))}

            {/* Endpoint chips, rendered as HTML after the hit bands for the
                same reason the dots are: bands swallow SVG hover otherwise.
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

            {/* Unlabelled events: a small hit target sitting exactly on the
                SVG dot, so hover/tap still reaches every event, not just the
                top four (docs/REDESIGN.md §4.1: "rest reveal on hover"). */}
            {geometry.dots
              .filter((d) => !geometry.labelledIds.has(d.eventId))
              .map((d) => (
                <div
                  key={`hit-${d.eventId}`}
                  className="ns-event-hit-slot"
                  style={{ left: pct(d.x, VB_W), top: pct(d.y, VB_H) }}
                >
                  <HoverCard detail={eventDetail(d.event)} side="top">
                    <button
                      type="button"
                      className="ns-event-hit"
                      aria-pressed={selected?.eventId === d.eventId}
                      aria-label={d.event.name}
                      onClick={() => onSelect(selectionFor(d, selected))}
                    />
                  </HoverCard>
                </div>
              ))}

            {/* The top four by |Δ net worth at horizon| get a standing name
                instead of waiting for a hover — ranked, not chronological, so
                a cluster of small early events doesn't crowd out the one
                thing that actually moves the ending number. */}
            {geometry.labels.map((l) => (
              <div
                key={`label-${l.eventId}`}
                className="ns-event-label-slot"
                style={{ left: pct(l.left, VB_W), top: pct(l.top, VB_H) }}
              >
                <HoverCard detail={eventDetail(l.event)} side="top">
                  <button
                    type="button"
                    className={`ns-event-label ns-event-label-${l.tone}`}
                    aria-pressed={selected?.eventId === l.eventId}
                    onClick={() => onSelect(selectionFor(l, selected))}
                  >
                    {l.text}
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

interface EventPoint {
  eventId: string;
  x: number;
  y: number;
  tone: "income" | "cost" | "end";
  event: PlanEvent;
}

// Positioned by its LEFT edge, not centred — this file never puts a
// `transform` on anything that wraps a `HoverCard` (see `.ns-mark-slot` /
// `.ns-fan-slot` in planner.css, both centred with a static margin instead),
// and a variable-width chip can't be centred with a static margin. Anchoring
// by the packed left edge from `build()`'s lane-packing sidesteps the need
// for either.
interface EventLabel {
  eventId: string;
  event: PlanEvent;
  tone: "income" | "cost" | "end";
  /** Chip's top-left corner, post lane-packing. */
  left: number;
  top: number;
  /** Where the leader line lands — the chip's horizontal centre — kept
      separate from `left` since the leader should point at the middle of
      the name, not its edge. */
  leaderX: number;
  leaderY: number;
  /** The dot on the curve this label belongs to; the leader's other end. */
  dotX: number;
  dotY: number;
  text: string;
}

// Structural, not `EventPoint` — `EventLabel` satisfies this too (both carry
// `event`, which is all a selection actually needs) without having to also
// carry a `year`/`code` a label doesn't otherwise use.
interface Selectable {
  eventId: string;
  event: PlanEvent;
  tone: "income" | "cost" | "end";
}

function selectionFor(p: Selectable, selected: ChartSelection | null): ChartSelection | null {
  if (selected?.eventId === p.eventId) return null;
  return {
    eventId: p.eventId,
    label: p.event.name,
    year: p.event.startYear,
    detail: summarize(p.event),
    tone: p.tone,
    code: codeFor(p.event.kind),
  };
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

/**
 * How much each included event moves the ending net worth — an actual
 * counterfactual, not a proxy: re-run the plan with that one event switched
 * off (`isIncluded: false`, the same flag `run.ts` already reads) and diff
 * the horizon figure against the real result. `runPlan` is cheap enough that
 * doing this once per event, on every plan change, is still sub-millisecond
 * work (the same bet `App.tsx` already makes twice over for the return fan).
 *
 * Deflates the variant the same way `App.tsx` deflates `result`, so a
 * today's-dollars plan compares like against like — otherwise every event
 * would look inflated by decades of compounding it never caused.
 *
 * `endOfPlan` is excluded: switching it off changes the horizon itself
 * (`run.ts` reads it to set `endYear`), which would compare two different
 * years rather than the same year with and without the event.
 */
function rankImpact(plan: Plan, result: PlanResult): Map<string, number> {
  const baseEnd =
    result.years.find((y) => y.year === result.endYear)?.netWorth ??
    result.years[result.years.length - 1]?.netWorth ??
    0;

  const toDisplay = (r: PlanResult): PlanResult =>
    plan.settings.dollarMode === "todaysDollars"
      ? deflate(r, plan.settings.inflationRate)
      : r;

  const impacts = new Map<string, number>();
  for (const event of plan.events) {
    if (!event.isIncluded || event.isHidden || event.kind === "endOfPlan") continue;
    const withoutRaw = runPlan({
      ...plan,
      events: plan.events.map((e) => (e.id === event.id ? { ...e, isIncluded: false } : e)),
    });
    const without = toDisplay(withoutRaw);
    const withoutEnd =
      without.years.find((y) => y.year === result.endYear)?.netWorth ??
      without.years[without.years.length - 1]?.netWorth ??
      0;
    impacts.set(event.id, Math.abs(baseEnd - withoutEnd));
  }
  return impacts;
}

/** A label's rough pixel footprint, close enough for lane-packing purposes —
    the same approximation the old pin row made with a fixed `PIN_SIZE`. */
function estimateLabelWidth(text: string): number {
  return Math.min(172, Math.max(38, text.length * 6.3 + 18));
}

function build(
  result: PlanResult,
  events: PlanEvent[],
  impactByEventId: Map<string, number>,
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
  const top = honestCeiling(maxNetWorth);
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

  // Every included event becomes a dot sitting AT the curve's own value in its
  // year — not a detached row above the plot (docs/REDESIGN.md §4.1). The
  // plan horizon marker is excluded: it is not a life event and its "impact"
  // isn't a meaningful counterfactual (removing it changes the horizon
  // itself, see `rankImpact`).
  const dotEvents = events
    .filter((e) => e.isIncluded && !e.isHidden && e.kind !== "endOfPlan")
    .filter((e) => e.startYear >= result.startYear && e.startYear <= result.endYear)
    .sort((a, b) => a.startYear - b.startYear);

  const dots: EventPoint[] = [];
  for (const event of dotEvents) {
    const p = pointByYear.get(event.startYear);
    if (!p) continue;
    dots.push({
      eventId: event.id,
      x: p.x,
      y: p.y,
      tone: toneFor(event.kind),
      event,
    });
  }

  // Rank by |Δ net worth at horizon| and label the top few — a cluster of
  // small early events no longer wins the label just by being first.
  const topIds = new Set(
    dots
      .slice()
      .sort((a, b) => (impactByEventId.get(b.eventId) ?? 0) - (impactByEventId.get(a.eventId) ?? 0))
      .slice(0, TOP_LABEL_COUNT)
      .map((d) => d.eventId),
  );

  // Labels pack into lanes near the top of the plot, left to right in time
  // order, same collision rule the old pin row used: a label drops to the
  // next lane down only when it would overlap the last one placed in its
  // current lane. With at most four of them the lanes rarely go past one or
  // two deep even when the events themselves are bunched in the same year.
  const laneRightEdges: number[] = [];
  const labels: EventLabel[] = [];
  for (const d of dots) {
    if (!topIds.has(d.eventId)) continue;
    const width = estimateLabelWidth(d.event.name);
    const left = d.x - width / 2;
    let lane = laneRightEdges.findIndex((edge) => left >= edge);
    if (lane === -1) lane = laneRightEdges.length;
    laneRightEdges[lane] = left + width + LABEL_GAP;
    const top = LABEL_TOP + lane * LABEL_LANE_H;

    labels.push({
      eventId: d.eventId,
      event: d.event,
      tone: d.tone,
      left,
      top,
      leaderX: d.x,
      leaderY: top + 10,
      dotX: d.x,
      dotY: d.y,
      text: d.event.name,
    });
  }

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
    dots,
    labels,
    labelledIds: topIds,
    bands,
    pointByYear,
    first: points[0],
    last: points[points.length - 1],
    fanBand,
    lowEdge,
    highEdge,
  };
}

/**
 * The plot's y-axis top.
 *
 * Previously rounded up to the next "nice" gridline tier (1 / 1.25 / 1.5 / 2
 * / 2.5 / 3 / 4 / 5 / 7.5 / 10 × a power of ten) — a `$4.3M` peak could push
 * the axis to `$5M`, wasting a sixth of the plot's height on headroom nobody
 * asked for. An instrument reads its actual ceiling: a small margin so the
 * peak clears the top edge and the fan (when it's the higher line) doesn't
 * touch it, nothing more (docs/REDESIGN.md §4.1, design-direction move 2).
 */
function honestCeiling(value: number): number {
  return value > 0 ? value * 1.06 : 1;
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

/** Keep the tooltip from hanging off either edge of the plot. */
function clampPct(x: number): string {
  const raw = (x / VB_W) * 100;
  return `${Math.min(92, Math.max(8, raw))}%`;
}
