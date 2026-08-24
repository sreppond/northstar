import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PathMarkers, Plan, PlanEvent, PlanResult } from "@northstar/engine";
import { deflate, runPlan } from "@northstar/engine";
import { codeFor, summarize, toneFor } from "./presentation";
import { eventDetail } from "./detail";
import { HoverCard } from "./HoverCard";
import type { Detail } from "./detail";
import { axisMoney, money, signedMoney } from "./format";
import {
  clampYear,
  quantiseYear,
  rubberBandYear,
  xForYear,
  yearForClientX,
} from "./chartMath";

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

// Shared with chartMath.ts's screen<->year helpers, so the static line and
// the live scrub/drag math can never disagree about where a year sits.
const CHART_BOUNDS = { plotLeft: PLOT_LEFT, plotRight: PLOT_RIGHT, viewBoxWidth: VB_W };

// Drag through time (docs/REDESIGN.md §4.1, design-direction move 5).
/** Pointer movement, in screen px, before a press on a dot/label counts as a
    drag rather than a click. Below this it's still ambiguous. */
const DRAG_THRESHOLD_PX = 4;
/** How long the post-release "landed" squish (see `.ns-event-just-landed` in
    planner.css) stays applied — a touch longer than `--t-settle` (280ms) so
    the CSS animation always finishes before the class comes off. */
const LANDED_MS = 320;

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
 * State for the one event currently being dragged through time. Local to
 * this component — the PLAN-level live preview it drives (the ghost/live
 * marks below are purely visual) flows up to App.tsx as a draft event via
 * `onDragPreview`, the same `withDraft` mechanism a drawer edit already
 * uses (see useEventEditor.ts). `originYear`/`ghostDot`/`ghostLabel` are all
 * captured ONCE, from the geometry as it existed the instant the drag
 * started, and never recomputed — that is what makes the ghost read as a
 * fixed "here's where it was" rather than drifting as the reprojection
 * moves the curve under it.
 */
interface DragState {
  eventId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originYear: number;
  ghostDot: { x: number; y: number; tone: "income" | "cost" | "end" };
  ghostLabel: { left: number; top: number; tone: "income" | "cost" | "end"; text: string } | null;
  /** Continuous, rubber-banded past the plan's bounds — only ever used to
      draw the live mark's x. Never written to the plan. */
  liveYear: number;
  /** Quantised + hard-clamped to the plan's bounds — what actually gets fed
      into the live reprojection and, on release, committed. */
  candidateYear: number;
  /** False until the pointer has moved past `DRAG_THRESHOLD_PX` — before
      that this is still ambiguous with a plain click. */
  moved: boolean;
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
  /** The year under the pointer while scrubbing, continuously, or `null`
      when not pointing at the chart. `hoverYear` (below) stays chart-local
      state for the in-chart tooltip/guide-line; this is that same value
      reported upward so the hero figure and the ledger tables can follow
      the scrub too (docs/REDESIGN.md §4.1). */
  onScrubYear(year: number | null): void;
  /** Fired on every pointer-move once a drag has actually started (past the
      click-vs-drag threshold), with the dragged event's DRAFT — same id,
      `startYear` moved to the candidate year — and with `null` when a drag
      ends, committed or not. App.tsx feeds this through the same
      `withDraft` a drawer edit already uses, for the live reprojection;
      this component never touches the plan or the store directly. */
  onDragPreview(draft: PlanEvent | null): void;
  /** Fired exactly once, on release, only if the drag actually moved the
      event — never on every pointer-move. The caller commits this with ONE
      `upsertEvent` call, which is what makes one drag equal one undo entry. */
  onDragCommit(eventId: string, year: number): void;
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
  onScrubYear,
  onDragPreview,
  onDragCommit,
}: Props) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hotEdge, setHotEdge] = useState<"low" | "high" | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Which event just landed from a drag, briefly — drives the one-shot
  // release "squish" (see `.ns-event-just-landed` in planner.css) and
  // nothing else; not read for any layout or interaction decision.
  const [justLandedId, setJustLandedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // A click follows a real drag's pointerup practically for free (see the
  // comment on `handleDragEnd`); this swallows that one click so releasing a
  // drag never also toggles the chart's selection footer.
  const suppressClickRef = useRef(false);

  // Kept separate from `build()` below so toggling the fan or a comparison
  // plan — both frequent — never re-triggers this: it is the one part of the
  // chart's geometry that cannot be found by just looking at `result`.
  const impactByEventId = useMemo(() => rankImpact(plan, result), [plan, result]);

  // Deliberately NOT excluding the dragged event from the normal dot/label
  // pass (an earlier version of this did, via a `build()` parameter — see
  // the git history/report if curious why that got reverted): the REAL
  // hit target / label button is what's holding pointer capture for the
  // whole gesture, and removing it from the DOM mid-drag — which excluding
  // it from `dots`/`labels` would do, since these come straight from a
  // `.map()` over that array — silently releases capture the instant React
  // unmounts it (per the Pointer Events spec, capture is released when its
  // element leaves the document), orphaning the gesture with no pointerup
  // ever reaching a handler that can commit or cancel it. Instead, the real
  // element stays mounted and interactive throughout, just hidden with
  // CSS (`.ns-event-hide-source`, opacity only, `pointer-events` untouched)
  // once the drag has moved — see that class and the ghost/live marks below.
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

  // --- scrub (docs/REDESIGN.md §4.1, design-direction move 4) --------------
  // Screen -> year goes through the chart's OWN rendered box, not any fixed
  // ratio, because `preserveAspectRatio="none"` (see `.ns-chart svg` in
  // planner.css) stretches the svg non-uniformly to fill it.
  const yearFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return result.startYear;
    return yearForClientX(clientX, rect, CHART_BOUNDS, result.startYear, result.endYear);
  };

  const scrubTo = (clientX: number) => {
    const year = clampYear(quantiseYear(yearFromClientX(clientX)), result.startYear, result.endYear);
    setHoverYear(year);
    onScrubYear(year);
  };

  const clearScrub = () => {
    setHoverYear(null);
    onScrubYear(null);
  };

  // Pointer capture on down is what makes this work on touch, which has no
  // hover state at all — a press-and-slide is touch's whole answer to
  // "point at a year." For a mouse, plain hover already delivers pointermove
  // with no button held, so capture changes nothing there. Once an event
  // drag has captured its OWN pointer (see `startDrag`), this element stops
  // receiving events for that pointerId entirely — the `drag` guards below
  // are therefore mostly defensive/self-documenting, not load-bearing.
  const handleScrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
  };
  const handleScrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) return;
    scrubTo(e.clientX);
  };
  const handleScrubUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    // A mouse keeps hovering after the button comes up; touch has no such
    // thing, so lifting the finger is the only "done pointing at this"
    // signal it gets — the readout should go with it.
    if (e.pointerType !== "mouse") clearScrub();
  };
  const handleScrubLeave = () => {
    if (drag) return;
    clearScrub();
  };

  // --- drag events through time (docs/REDESIGN.md §4.1, design-direction
  // move 5) ------------------------------------------------------------
  const startDrag = (e: ReactPointerEvent<HTMLElement>, eventId: string) => {
    const dot = geometry.dots.find((p) => p.eventId === eventId);
    if (!dot) return;
    const label = geometry.labels.find((l) => l.eventId === eventId) ?? null;

    e.currentTarget.setPointerCapture(e.pointerId);
    // A stale scrub readout hanging around while the user's attention is on
    // a dragged dot elsewhere reads as a bug, not a feature.
    clearScrub();

    setDrag({
      eventId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originYear: dot.event.startYear,
      ghostDot: { x: dot.x, y: dot.y, tone: dot.tone },
      ghostLabel: label && { left: label.left, top: label.top, tone: label.tone, text: label.text },
      liveYear: dot.event.startYear,
      candidateYear: dot.event.startYear,
      moved: false,
    });
  };

  const handleDragMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return; // still ambiguous with a click

    const rawYear = yearFromClientX(e.clientX);
    const candidateYear = clampYear(quantiseYear(rawYear), result.startYear, result.endYear);
    const liveYear = rubberBandYear(rawYear, result.startYear, result.endYear);
    const yearChanged = !drag.moved || candidateYear !== drag.candidateYear;

    setDrag({ ...drag, moved: true, liveYear, candidateYear });

    // The rubber-banded `liveYear` still updates every frame either way (for
    // 1:1 visual tracking); the comparatively expensive full-plan
    // reprojection only needs to re-run when the whole-year candidate
    // actually changes.
    if (yearChanged) {
      const original = plan.events.find((ev) => ev.id === drag.eventId);
      if (original) onDragPreview({ ...original, startYear: candidateYear });
    }
  };

  const releaseCapture = (e: ReactPointerEvent<HTMLElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  };

  const handleDragEnd = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    releaseCapture(e);

    if (drag.moved) {
      onDragCommit(drag.eventId, drag.candidateYear);
      onDragPreview(null);

      setJustLandedId(drag.eventId);
      const landedId = drag.eventId;
      window.setTimeout(() => setJustLandedId((id) => (id === landedId ? null : id)), LANDED_MS);

      // The click a pointerup produces after a real drag needs to be
      // swallowed — see the onClick handlers below. Cleared on the next
      // tick: `click` fires synchronously right after `pointerup`, before
      // this timeout ever runs, so the flag is still `true` when it matters.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    setDrag(null);
  };

  const handleDragCancel = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    releaseCapture(e);
    if (drag.moved) onDragPreview(null);
    setDrag(null);
  };

  // Escape reverts without committing — the only other way out besides a
  // normal release.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drag.moved) onDragPreview(null);
      setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, onDragPreview]);

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
        <div className="ns-chart">
          <svg
            ref={svgRef}
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

            {/* One pointer-capture surface spans the whole plot, replacing
                the old per-year hover bands with continuous 1:1 scrubbing
                (docs/REDESIGN.md §4.1, design-direction move 4) — see the
                handlers above. Rendered FIRST, same reason the old bands
                were: so the dots and labels stack above it and can still
                claim their own pointerdown to start a drag rather than a
                scrub. */}
            <div
              className="ns-scrub-surface"
              onPointerDown={handleScrubDown}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubUp}
              onPointerCancel={handleScrubUp}
              onPointerLeave={handleScrubLeave}
            />

            {/* Every included event gets a dot on the curve at its own year —
                not a detached row above the plot. Hue is the only thing this
                chart uses to encode "what does this do to cash"; a 2px ring
                in the surface colour keeps it legible sitting on top of the
                busy line and area fill (docs/REDESIGN.md §4.1). HTML, not
                svg, and purely decorative (the hit target and, for a
                labelled event, the label button underneath and on top of it
                respectively are what actually respond to a pointer).
                The event currently being dragged stays in this list — its
                node is what's holding pointer capture for the whole gesture,
                and removing it from the DOM mid-drag would silently drop
                that capture (see the long comment on `geometry` above). It's
                just visually hidden (opacity, not `display`/unmount) while
                its ghost + live mark below stand in for it. */}
            {geometry.dots.map((d) => (
              <div
                key={`dot-${d.eventId}`}
                className={`ns-event-dot-mark ns-event-dot-${d.tone}${
                  justLandedId === d.eventId ? " ns-event-just-landed" : ""
                }${drag?.moved && drag.eventId === d.eventId ? " ns-event-hide-source" : ""}`}
                style={{ left: pct(d.x, VB_W), top: pct(d.y, VB_H) }}
              />
            ))}

            {/* The drag ghost + live mark (docs/REDESIGN.md §4.1,
                design-direction move 5). The ghost is frozen at the pixel
                position `startDrag` captured the instant the drag began, so
                it reads as a fixed "here's where it was" rather than
                drifting as the live reprojection moves the curve under it.
                The live mark's x tracks the pointer continuously (including
                the rubber-banded creep past either bound); its y snaps onto
                the (live-reprojecting) curve's own value at the candidate
                year — every dot in this chart sits ON the curve, and a mark
                free-floating at the raw pointer y would read as a bug, not
                direct manipulation. Both are decorative HTML overlays, same
                as the normal dots — the drag itself is still owned by the
                pointer-captured hit target/label button below. */}
            {drag?.moved && (
              <>
                <div
                  className={`ns-event-dot-mark ns-event-dot-${drag.ghostDot.tone} ns-event-dot-ghost`}
                  style={{ left: pct(drag.ghostDot.x, VB_W), top: pct(drag.ghostDot.y, VB_H) }}
                />
                {drag.ghostLabel && (
                  <div
                    className="ns-event-label-slot ns-event-label-slot-ghost"
                    style={{ left: pct(drag.ghostLabel.left, VB_W), top: pct(drag.ghostLabel.top, VB_H) }}
                  >
                    <span className={`ns-event-label ns-event-label-${drag.ghostLabel.tone} ns-event-label-ghost`}>
                      {drag.ghostLabel.text}
                    </span>
                  </div>
                )}

                <div
                  className={`ns-event-dot-mark ns-event-dot-${drag.ghostDot.tone} ns-event-dot-live`}
                  style={{
                    left: pct(geometry.xFor(drag.liveYear), VB_W),
                    top: pct(geometry.pointByYear.get(drag.candidateYear)?.y ?? drag.ghostDot.y, VB_H),
                  }}
                />
                {drag.ghostLabel && (
                  // Doesn't run the static lane-packing collision pass
                  // `build()` uses for standing labels — a one-off transient
                  // overlay the user is actively holding doesn't need to
                  // dodge the others the way a permanent layout does, so it
                  // just floats centred above the live dot.
                  <div
                    className="ns-event-label-slot ns-event-label-slot-live"
                    style={{
                      left: pct(geometry.xFor(drag.liveYear), VB_W),
                      top: pct(
                        (geometry.pointByYear.get(drag.candidateYear)?.y ?? drag.ghostDot.y) - 26,
                        VB_H,
                      ),
                    }}
                  >
                    <span
                      className={`ns-event-label ns-event-label-${drag.ghostLabel.tone} ns-event-label-live`}
                    >
                      {drag.ghostLabel.text}
                    </span>
                  </div>
                )}
              </>
            )}

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
                top four (docs/REDESIGN.md §4.1: "rest reveal on hover").
                Also the drag surface for those events — pointerdown here
                starts a drag candidate (see `startDrag`); a plain click,
                one that never crosses the move threshold, still selects,
                same as before. `disabled` on the HoverCard keeps the detail
                popover from fighting a moving dot for attention mid-drag. */}
            {geometry.dots
              .filter((d) => !geometry.labelledIds.has(d.eventId))
              .map((d) => (
                <div
                  key={`hit-${d.eventId}`}
                  className="ns-event-hit-slot"
                  style={{ left: pct(d.x, VB_W), top: pct(d.y, VB_H) }}
                >
                  <HoverCard detail={eventDetail(d.event)} side="top" disabled={drag !== null}>
                    <button
                      type="button"
                      className={`ns-event-hit${drag?.eventId === d.eventId ? " ns-event-dragging" : ""}`}
                      aria-pressed={selected?.eventId === d.eventId}
                      aria-label={d.event.name}
                      onPointerDown={(e) => startDrag(e, d.eventId)}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      onPointerCancel={handleDragCancel}
                      onClick={() => {
                        if (suppressClickRef.current) return;
                        onSelect(selectionFor(d, selected));
                      }}
                    />
                  </HoverCard>
                </div>
              ))}

            {/* The top four by |Δ net worth at horizon| get a standing name
                instead of waiting for a hover — ranked, not chronological, so
                a cluster of small early events doesn't crowd out the one
                thing that actually moves the ending number. Same
                drag/click split as the unlabelled hit targets above. */}
            {geometry.labels.map((l) => (
              <div
                key={`label-${l.eventId}`}
                className="ns-event-label-slot"
                style={{ left: pct(l.left, VB_W), top: pct(l.top, VB_H) }}
              >
                <HoverCard detail={eventDetail(l.event)} side="top" disabled={drag !== null}>
                  <button
                    type="button"
                    className={`ns-event-label ns-event-label-${l.tone}${
                      drag?.eventId === l.eventId ? " ns-event-dragging" : ""
                    }${justLandedId === l.eventId ? " ns-event-just-landed" : ""}${
                      drag?.moved && drag.eventId === l.eventId ? " ns-event-hide-source" : ""
                    }`}
                    aria-pressed={selected?.eventId === l.eventId}
                    onPointerDown={(e) => startDrag(e, l.eventId)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragCancel}
                    onClick={() => {
                      if (suppressClickRef.current) return;
                      onSelect(selectionFor(l, selected));
                    }}
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
  // Delegates to the SAME formula chartMath.ts's live scrub/drag math uses
  // (`xForYear`), so the static line and a dragged dot's live position can
  // never quietly disagree about where a year sits.
  const xFor = (year: number) => xForYear(year, result.startYear, result.endYear, CHART_BOUNDS);

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
    pointByYear,
    first: points[0],
    last: points[points.length - 1],
    fanBand,
    lowEdge,
    highEdge,
    // Exposed so the live drag mark can place itself at a continuous
    // (rubber-banded, not-yet-quantised) year using the exact same mapping
    // the rest of this geometry was built from.
    xFor,
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
