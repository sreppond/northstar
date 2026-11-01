import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Baby, Home, Plus, UserPlus } from 'lucide-react';
import type { PlanEvent } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { healthDangerBand } from '../health';
import { dangerRuns } from '../charts/seriesMath';
import { Page, PageHeader } from '../ui';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { HouseholdSetup } from '../HouseholdSetup';
import { PersonSheet, type PersonTarget } from '../PersonSheet';
import { SHARED_FIXED_COLOR, ownerColor } from '../budgetView';
import { isHouseholdModel } from '../household';
import {
  DRAG_THRESHOLD_PX,
  YEAR_PX,
  buildLanes,
  chipLeft,
  chipWidth,
  columnLeft,
  packChips,
  verticalYears,
  yearFromDragDelta,
  type Lane,
  type VerticalItem,
} from '../timeline';
import type { CareerSegment } from '../caregiving';
import './timeline.css';

/**
 * Timeline (docs/REDESIGN-V5.md §5.4): Events and Family as one calm,
 * horizontal life. A lane per person, careers and a child's stages as
 * continuous bars, events as plain-text chips you can drag to a new year, and
 * a scrub cursor that shares the app-wide pinned year. Inspired by a
 * "Lifeline" component's idea (a typographic life, an embedded scroller, a
 * vertical layout on phones), not copied from it.
 */

const LABEL_W = 176;
/** Empty room after the last year, so the last chip's label isn't cut off. */
const TRAIL_PX = 200;
const TOP_PAD = 14;
const TRACK_H = 32;
const TRACK_GAP = 12;
const ROW_H = 28;
const BOTTOM_PAD = 14;
const LANDED_MS = 360;
/** How close to the scroller's edge a drag starts pulling it, and how fast. */
const EDGE_PX = 56;
const EDGE_SPEED = 14;

const PHONE_QUERY = '(max-width: 767.98px)';
function usePhone(): boolean {
  return useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(PHONE_QUERY);
      mq.addEventListener('change', l);
      return () => mq.removeEventListener('change', l);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

const laneColor = (plan: Parameters<typeof ownerColor>[0], lane: Lane) =>
  lane.person ? ownerColor(plan, lane.person.id) : SHARED_FIXED_COLOR;

export function TimelinePage() {
  const { stored, plan, result, editor, upsertEvent, focusYear, setFocusYear, health } = usePlanner();
  const phone = usePhone();
  const [person, setPerson] = useState<PersonTarget | null>(null);
  const household = isHouseholdModel(stored);

  const startYear = result.startYear;
  const endYear = result.endYear;
  const lanes = useMemo(() => buildLanes(plan, startYear, endYear), [plan, startYear, endYear]);
  const adults = useMemo(() => plan.participants.filter((p) => p.isIncluded && p.role !== 'child'), [plan.participants]);

  const agesFor = useCallback(
    (year: number) => adults.map((p) => `${p.name} ${year - p.birthYear}`).join(' · '),
    [adults],
  );

  // The years the plan can't pay its way (§4.2.4): a hatched band through the
  // columns for each run of short years, and an "Overdrawn" tag on the first year
  // of each run. V5-REVIEW-1 F2: from `healthDangerBand`, so a plan that runs
  // dry, recovers and runs dry again hatches only its short years.
  const dry = useMemo(() => {
    const band = healthDangerBand(health, result);
    return band ? dangerRuns(band, endYear) : [];
  }, [health, result, endYear]);
  const dryYears = useMemo(() => dry.map((r) => r.from), [dry]);
  // V5-REVIEW-2 N14: where a short run ends and the plan recovers, the first
  // funded year after it. A run that reaches the last year has no recovery.
  const recoverYears = useMemo(() => dry.map((r) => r.to + 1).filter((y) => y <= endYear), [dry, endYear]);

  const open = (event: PlanEvent) => editor.edit(stored.events.find((e) => e.id === event.id) ?? event);
  const move = (id: string, year: number) => {
    const event = stored.events.find((e) => e.id === id);
    if (event && event.startYear !== year) upsertEvent(stored.id, { ...event, startYear: year });
  };
  const pin = (year: number) => setFocusYear(focusYear === year ? null : year);

  const actions = (
    <>
      <button type="button" className="ns-btn" aria-label="Add person" title="Add person" onClick={() => setPerson({ kind: 'new-adult' })}>
        <UserPlus size={14} strokeWidth={2} aria-hidden /> <span className="tl-btn-text">Add person</span>
      </button>
      {household && (
        <button type="button" className="ns-btn" aria-label="Add child" title="Add child" onClick={() => setPerson({ kind: 'new-child' })}>
          <Baby size={14} strokeWidth={2} aria-hidden /> <span className="tl-btn-text">Add child</span>
        </button>
      )}
      <button type="button" className="ns-btn ns-btn-primary" onClick={() => editor.startNew()}>
        <Plus size={14} strokeWidth={2.25} aria-hidden /> Add event
      </button>
    </>
  );

  return (
    <Page>
      <PageHeader title="Timeline" actions={actions} />
      <PlanCheckBanner only={['horizon', 'unearned-wages', 'unowned-income', 'rent-after-purchase']} />

      {phone ? (
        <VerticalTimeline
          lanes={lanes}
          todayYear={startYear}
          dryYears={dryYears}
          recoverYears={recoverYears}
          focusYear={focusYear}
          onPin={pin}
          agesFor={agesFor}
          onOpenEvent={open}
          onOpenPerson={(id) => setPerson({ kind: 'person', id })}
        />
      ) : (
        <LifeLanes
          lanes={lanes}
          startYear={startYear}
          endYear={endYear}
          dry={dry}
          recoverYears={recoverYears}
          focusYear={focusYear}
          onPin={pin}
          agesFor={agesFor}
          onOpenEvent={open}
          onMoveEvent={move}
          onOpenPerson={(id) => setPerson({ kind: 'person', id })}
        />
      )}

      {/* Kids and time off are budget lines on the household model; a plan
          that predates it needs the one-time setup first (REDESIGN-V4 §5). */}
      {!household && <HouseholdSetup page="family" />}

      <PersonSheet target={person} onClose={() => setPerson(null)} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Desktop: lanes on a sideways-scrolling canvas
// ---------------------------------------------------------------------------

interface Chip {
  key: string;
  year: number;
  name: string;
  detail: string;
  tone: 'income' | 'cost' | 'end' | 'birth';
  shape: 'dot' | 'diamond';
  excluded: boolean;
  draggable: boolean;
  needsOwner: boolean;
  event?: PlanEvent;
  width: number;
  row: number;
}

/** A lane's events (and a child's birth) as chips with their packed rows. */
function chipsFor(lane: Lane, firstYear: number): Chip[] {
  const raw: Omit<Chip, 'width' | 'row'>[] = [];
  if (lane.birthYear !== undefined) {
    raw.push({ key: `birth-${lane.id}`, year: lane.birthYear, name: 'Born', detail: '', tone: 'birth', shape: 'dot', excluded: false, draggable: false, needsOwner: false });
  }
  for (const le of lane.events) {
    raw.push({
      key: le.event.id,
      year: le.event.startYear,
      name: le.event.name,
      detail: le.detail,
      tone: le.tone,
      shape: le.shape,
      excluded: le.excluded,
      draggable: le.draggable,
      needsOwner: le.needsOwner,
      event: le.event,
    });
  }
  raw.sort((a, b) => a.year - b.year);
  const sized = raw.map((c) => ({ ...c, width: chipWidth(c.name, c.detail, c.needsOwner ? 'Who?' : '') }));
  const rows = packChips(sized.map((c) => ({ id: c.key, year: c.year, width: c.width })), firstYear);
  return sized.map((c) => ({ ...c, row: rows.get(c.key) ?? 0 }));
}

interface DragState {
  key: string;
  pointerId: number;
  startClientX: number;
  startScroll: number;
  lastClientX: number;
  originYear: number;
  candidateYear: number;
  moved: boolean;
}

function LifeLanes({
  lanes,
  startYear,
  endYear,
  dry,
  recoverYears,
  focusYear,
  onPin,
  agesFor,
  onOpenEvent,
  onMoveEvent,
  onOpenPerson,
}: {
  lanes: Lane[];
  startYear: number;
  endYear: number;
  dry: { from: number; to: number }[];
  /** First funded year after each short run ("Back on track"). */
  recoverYears: number[];
  focusYear: number | null;
  onPin(year: number): void;
  agesFor(year: number): string;
  onOpenEvent(event: PlanEvent): void;
  onMoveEvent(id: string, year: number): void;
  onOpenPerson(id: string): void;
}) {
  const { plan } = usePlanner();
  const years = useMemo(() => Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i), [startYear, endYear]);
  const width = years.length * YEAR_PX + TRAIL_PX;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const [hover, setHover] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const [landed, setLanded] = useState<string | null>(null);
  // A real drag's pointerup is followed by a click: swallow that one so
  // releasing a drag never also opens the editor.
  const suppressClick = useRef(false);

  // On load, show today; if a year is already pinned (from another page),
  // show that instead so the pin is in view.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = focusYear !== null ? Math.max(0, columnLeft(focusYear, startYear) - 96) : 0;
    setScrolled(el.scrollLeft > 2);
    // Once per mount: scrolling must not chase later pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearAt = (clientX: number): number | null => {
    const rect = columnsRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const i = Math.floor((clientX - rect.left) / YEAR_PX);
    return i >= 0 && i < years.length ? startYear + i : null;
  };

  // --- drag ------------------------------------------------------------------
  const candidateFor = (d: DragState, clientX: number) => {
    const scroll = (scrollerRef.current?.scrollLeft ?? 0) - d.startScroll;
    return yearFromDragDelta(clientX - d.startClientX + scroll, YEAR_PX, d.originYear, startYear, endYear);
  };

  // While a drag is held near either edge, the canvas scrolls under it, so a
  // long move across decades is one gesture.
  useEffect(() => {
    if (!drag?.moved) return;
    let raf = 0;
    const tick = () => {
      const d = dragRef.current;
      const el = scrollerRef.current;
      if (d && el) {
        const rect = el.getBoundingClientRect();
        const left = d.lastClientX - (rect.left + LABEL_W);
        const right = rect.right - d.lastClientX;
        const dx = left < EDGE_PX ? -EDGE_SPEED * (1 - Math.max(0, left) / EDGE_PX) : right < EDGE_PX ? EDGE_SPEED * (1 - Math.max(0, right) / EDGE_PX) : 0;
        if (dx !== 0) {
          el.scrollLeft += dx;
          const candidateYear = candidateFor(d, d.lastClientX);
          if (candidateYear !== d.candidateYear) setDrag({ ...d, candidateYear });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.moved]);

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, chip: Chip) => {
    if (!chip.event || !chip.draggable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      key: chip.key,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startScroll: scrollerRef.current?.scrollLeft ?? 0,
      lastClientX: e.clientX,
      originYear: chip.year,
      candidateYear: chip.year,
      moved: false,
    });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startClientX;
    if (!d.moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return; // still ambiguous with a click
    const candidateYear = candidateFor(d, e.clientX);
    setDrag({ ...d, moved: true, candidateYear, lastClientX: e.clientX });
    setHover(candidateYear);
  };
  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    if (d.moved) {
      if (!cancelled && d.candidateYear !== d.originYear) {
        // One call per gesture: one `upsertEvent`, one undo step.
        onMoveEvent(d.key, d.candidateYear);
        setLanded(d.key);
        window.setTimeout(() => setLanded(null), LANDED_MS);
      }
      // `click` fires right after `pointerup`, before this timeout runs.
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
    }
    setDrag(null);
  };

  // --- scrub + pin -----------------------------------------------------------
  const onBodyMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current || e.pointerType === 'touch') return;
    const y = yearAt(e.clientX);
    setHover((h) => (h === y ? h : y));
  };
  const onBodyClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button, a, input, select')) return;
    const y = yearAt(e.clientX);
    if (y !== null) onPin(y);
  };
  // Keyboard scrub: ←/→ walk the pinned year, Esc unpins. Only when the
  // canvas itself has focus, so a chip's own arrow-key nudge is untouched.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Escape') return void (focusYear !== null && onPin(focusYear));
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const from = focusYear ?? hover ?? startYear;
    const next = Math.min(endYear, Math.max(startYear, from + (e.key === 'ArrowLeft' ? -1 : 1)));
    // `onPin` toggles, so only call it for a different year.
    if (next !== focusYear) onPin(next);
    const el = scrollerRef.current;
    if (el) {
      const x = columnLeft(next, startYear);
      if (x < el.scrollLeft + 24) el.scrollTo({ left: Math.max(0, x - 96), behavior: 'smooth' });
      else if (x + YEAR_PX > el.scrollLeft + el.clientWidth - LABEL_W - 24) el.scrollTo({ left: x - el.clientWidth + LABEL_W + 160, behavior: 'smooth' });
    }
  };

  const scrubYear = drag?.moved ? drag.candidateYear : hover;
  const centre = (y: number) => columnLeft(y, startYear) + YEAR_PX / 2;

  return (
    <div className="tl" data-scrolled={scrolled || undefined}>
      <div
        className="tl-scroller"
        ref={scrollerRef}
        tabIndex={0}
        role="group"
        aria-label="Life timeline. Left and right arrows move the pinned year."
        onScroll={(e) => {
          const s = e.currentTarget.scrollLeft > 2;
          setScrolled((prev) => (prev === s ? prev : s));
        }}
        onKeyDown={onKeyDown}
      >
        <div className="tl-canvas" style={{ width: LABEL_W + width }}>
          {/* The year axis: sticky to the top, with the scrub chip riding it. */}
          <div className="tl-axis">
            <div className="tl-corner" />
            <div className="tl-years" style={{ width }}>
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  tabIndex={-1}
                  className="tl-year"
                  data-major={y % 5 === 0 || undefined}
                  data-today={y === startYear || undefined}
                  data-pinned={y === focusYear || undefined}
                  style={{ left: columnLeft(y, startYear) }}
                  onClick={() => onPin(y)}
                  aria-label={y === focusYear ? `Unpin ${y}` : `Pin ${y}`}
                  aria-pressed={y === focusYear}
                >
                  {y === startYear && <span className="tl-today-tag">Today</span>}
                  {dry.some((r) => r.from === y) && <span className="tl-dry-tag">Overdrawn</span>}
                  {recoverYears.includes(y) && <span className="tl-recover-tag">Back on track</span>}
                  <span className="tl-year-num">{y}</span>
                </button>
              ))}
              {scrubYear !== null && (
                <span className="tl-chip" style={{ left: centre(scrubYear) }} aria-hidden>
                  <b>{scrubYear}</b>
                  {agesFor(scrubYear) && <span>{agesFor(scrubYear)}</span>}
                </span>
              )}
            </div>
          </div>

          <div className="tl-body" onPointerMove={onBodyMove} onPointerLeave={() => !dragRef.current && setHover(null)} onClick={onBodyClick}>
            {/* Behind everything: the TODAY wash, five-year gridlines, and the
                scrub / pin hairlines. */}
            <div className="tl-columns" ref={columnsRef} style={{ width }} aria-hidden>
              <div
                className="tl-grid"
                style={{ backgroundPositionX: ((5 - (startYear % 5)) % 5) * YEAR_PX, width: years.length * YEAR_PX }}
              />
              {dry.map((r) => (
                <div key={r.from} className="tl-dry" style={{ left: columnLeft(r.from, startYear), width: (r.to - r.from + 1) * YEAR_PX }} />
              ))}
              <div className="tl-today-wash" style={{ left: 0, width: YEAR_PX }} />
              {scrubYear !== null && scrubYear !== focusYear && <div className="tl-line" style={{ left: centre(scrubYear) }} />}
              {focusYear !== null && <div className="tl-line" data-pinned style={{ left: centre(focusYear) }} />}
            </div>

            {lanes.map((lane) => (
              <LaneRow
                key={lane.id}
                lane={lane}
                startYear={startYear}
                width={width}
                color={laneColor(plan, lane)}
                today={startYear}
                drag={drag}
                landed={landed}
                onOpenPerson={onOpenPerson}
                onOpenEvent={(ev) => !suppressClick.current && onOpenEvent(ev)}
                onStartDrag={startDrag}
                onMoveDrag={moveDrag}
                onEndDrag={endDrag}
                onNudge={(ev, delta) => onMoveEvent(ev.id, Math.min(endYear, Math.max(startYear, ev.startYear + delta)))}
                suppressClick={suppressClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface LaneRowProps {
  lane: Lane;
  startYear: number;
  width: number;
  color: string;
  today: number;
  drag: DragState | null;
  landed: string | null;
  onOpenPerson(id: string): void;
  onOpenEvent(event: PlanEvent): void;
  onStartDrag(e: ReactPointerEvent<HTMLButtonElement>, chip: Chip): void;
  onMoveDrag(e: ReactPointerEvent<HTMLButtonElement>): void;
  onEndDrag(e: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean): void;
  onNudge(event: PlanEvent, delta: number): void;
  suppressClick: { current: boolean };
}

function LaneRow({ lane, startYear, width, color, drag, landed, onOpenPerson, onOpenEvent, onStartDrag, onMoveDrag, onEndDrag, onNudge, suppressClick }: LaneRowProps) {
  const { plan } = usePlanner();
  const chips = useMemo(() => chipsFor(lane, startYear), [lane, startYear]);
  const hasTrack = lane.kind !== 'household';
  const rows = chips.reduce((m, c) => Math.max(m, c.row + 1), 0);
  const eventsTop = TOP_PAD + (hasTrack ? TRACK_H + TRACK_GAP : 0);
  const height = Math.max(hasTrack ? 76 : 64, eventsTop + rows * ROW_H + BOTTOM_PAD);
  const today = plan.settings.startYear;

  return (
    <div className="tl-lane" data-kind={lane.kind} style={{ '--c': color, height } as CSSProperties}>
      <div className="tl-label">
        {lane.person ? (
          <button type="button" className="tl-person" onClick={() => onOpenPerson(lane.person!.id)} aria-label={`${lane.person.name}, open details`}>
            <span className="tl-avatar" style={{ background: color }} aria-hidden>
              {lane.person.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="tl-person-text">
              <span className="tl-person-name">{lane.person.name}</span>
              <span className="tl-person-sub">
                {lane.person.birthYear > today ? `due ${lane.person.birthYear}` : `age ${today - lane.person.birthYear}`}
              </span>
            </span>
          </button>
        ) : (
          <div className="tl-person" data-static>
            <span className="tl-avatar" data-neutral aria-hidden>
              <Home size={15} strokeWidth={2} />
            </span>
            <span className="tl-person-text">
              <span className="tl-person-name">Household</span>
              <span className="tl-person-sub">Shared</span>
            </span>
          </div>
        )}
      </div>

      <div className="tl-track" style={{ width }}>
        {hasTrack && lane.kind === 'adult' && (
          <CareerBars
            segments={lane.career}
            startYear={startYear}
            onOpen={(id) => {
              const ev = plan.events.find((e) => e.id === id);
              if (ev) onOpenEvent(ev);
            }}
          />
        )}
        {hasTrack && lane.kind === 'child' && <StageBars lane={lane} startYear={startYear} onOpen={() => lane.person && onOpenPerson(lane.person.id)} />}

        {chips.map((chip) => {
          const dragging = drag?.key === chip.key && drag.moved;
          const year = dragging ? drag!.candidateYear : chip.year;
          const style = {
            left: chipLeft(chip.year, startYear),
            top: eventsTop + chip.row * ROW_H,
            ...(dragging ? { transform: `translateX(${(year - chip.year) * YEAR_PX}px) scale(1.04)` } : {}),
            ...(chip.tone === 'birth' ? { '--tone': color } : {}),
          } as CSSProperties;
          const label = (
            <>
              <span className="tl-mark" />
              <span className="tl-name">{chip.name}</span>
              {chip.detail && <span className="tl-detail">{chip.detail}</span>}
              {chip.needsOwner && <span className="tl-who-pill">Who?</span>}
            </>
          );
          return (
            <Fragment key={chip.key}>
              {dragging && (
                <span className="tl-event tl-event-ghost" data-tone={chip.tone} data-shape={chip.shape} style={{ left: style.left, top: style.top }} aria-hidden>
                  {label}
                </span>
              )}
              <button
                type="button"
                className="tl-event"
                data-tone={chip.tone}
                data-shape={chip.shape}
                data-excluded={chip.excluded || undefined}
                data-draggable={chip.draggable || undefined}
                data-dragging={dragging || undefined}
                data-landed={landed === chip.key || undefined}
                style={style}
                title={`${chip.name} · ${chip.year}${chip.excluded ? ' · switched off' : ''}`}
                onPointerDown={(e) => onStartDrag(e, chip)}
                onPointerMove={onMoveDrag}
                onPointerUp={(e) => onEndDrag(e, false)}
                onPointerCancel={(e) => onEndDrag(e, true)}
                onClick={() => {
                  if (suppressClick.current) return;
                  if (chip.event) onOpenEvent(chip.event);
                  else if (lane.person) onOpenPerson(lane.person.id);
                }}
                onKeyDown={(e) => {
                  // ←/→ nudge a year at a time: the same single commit a drag's release makes.
                  if (chip.event && chip.draggable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    onNudge(chip.event, e.key === 'ArrowLeft' ? -1 : 1);
                  }
                }}
              >
                {label}
                {dragging && <span className="tl-drag-year">{year}</span>}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Contiguous segments become one rounded bar; time off leaves a gap. */
function runsOf<T extends { from: number; to: number }>(items: T[], breaksAt: (item: T) => boolean = () => false): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].to === item.from && !breaksAt(item)) run.push(item);
    else runs.push([item]);
  }
  return runs;
}

function CareerBars({ segments, startYear, onOpen }: { segments: CareerSegment[]; startYear: number; onOpen(eventId: string): void }) {
  const working = segments.filter((s) => s.mode !== 'off');
  const off = segments.filter((s) => s.mode === 'off');
  return (
    <div className="tl-bars" style={{ top: TOP_PAD }}>
      {off.map((s) => (
        <span
          key={`off-${s.eventId}-${s.from}`}
          className="tl-off"
          style={{ left: columnLeft(s.from, startYear) + 4, width: (s.to - s.from) * YEAR_PX - 8 }}
          title={`${s.label} · ${s.from}–${s.to - 1}`}
        />
      ))}
      {runsOf(working).map((run) => {
        const left = columnLeft(run[0].from, startYear);
        const w = columnLeft(run[run.length - 1].to, startYear) - left;
        return (
          <div key={`${run[0].eventId}-${run[0].from}`} className="tl-run" style={{ left: left + 2, width: w - 4 }}>
            {run.map((s, i) => (
              <button
                key={`${s.eventId}-${s.from}`}
                type="button"
                className="tl-seg"
                data-mode={s.mode}
                data-first={i === 0 || undefined}
                style={{ left: columnLeft(s.from, startYear) - left, width: (s.to - s.from) * YEAR_PX }}
                title={`${s.label} · ${s.from}–${s.to - 1}`}
                onClick={() => onOpen(s.eventId)}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function StageBars({ lane, startYear, onOpen }: { lane: Lane; startYear: number; onOpen(): void }) {
  const runs = runsOf(lane.stages);
  return (
    <div className="tl-bars" style={{ top: TOP_PAD }}>
      {runs.map((run) => {
        const left = columnLeft(run[0].from, startYear);
        const w = columnLeft(run[run.length - 1].to, startYear) - left;
        return (
          <div key={run[0].kind} className="tl-run" style={{ left: left + 2, width: w - 4 }}>
            {run.map((s, i) => (
              <button
                key={s.kind}
                type="button"
                className="tl-seg"
                data-stage={s.kind}
                data-first={i === 0 || undefined}
                style={{ left: columnLeft(s.from, startYear) - left, width: (s.to - s.from) * YEAR_PX }}
                title={`${s.label} · ${s.from}–${s.to - 1}`}
                onClick={onOpen}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone: one vertical list, a row per year that has something in it
// ---------------------------------------------------------------------------

function VerticalTimeline({
  lanes,
  todayYear,
  dryYears,
  recoverYears,
  focusYear,
  onPin,
  agesFor,
  onOpenEvent,
  onOpenPerson,
}: {
  lanes: Lane[];
  todayYear: number;
  dryYears: number[];
  recoverYears: number[];
  focusYear: number | null;
  onPin(year: number): void;
  agesFor(year: number): string;
  onOpenEvent(event: PlanEvent): void;
  onOpenPerson(id: string): void;
}) {
  const { plan } = usePlanner();
  const rows = useMemo(
    () => verticalYears(lanes, todayYear, [...dryYears, ...recoverYears]),
    [lanes, todayYear, dryYears, recoverYears],
  );
  const people = lanes.filter((l) => l.person);

  const openItem = (lane: Lane, item: VerticalItem) => {
    if (item.type === 'event') onOpenEvent(item.event.event);
    else if (item.type === 'career') {
      const ev = plan.events.find((e) => e.id === item.segment.eventId);
      if (ev) onOpenEvent(ev);
    } else if (lane.person) onOpenPerson(lane.person.id);
  };

  return (
    <div className="tlv">
      <div className="tlv-people">
        {people.map((l) => (
          <button key={l.id} type="button" className="tlv-person" onClick={() => onOpenPerson(l.id)}>
            <span className="tl-avatar" style={{ background: laneColor(plan, l) }} aria-hidden>
              {l.person!.name.slice(0, 1).toUpperCase()}
            </span>
            {l.person!.name}
          </button>
        ))}
      </div>

      <ol className="tlv-list">
        {rows.map((row) => (
          <li key={row.year} className="tlv-row" data-today={row.year === todayYear || undefined} data-pinned={row.year === focusYear || undefined}>
            <button type="button" className="tlv-year" onClick={() => onPin(row.year)} aria-pressed={row.year === focusYear}>
              <span className="tlv-y">{row.year}</span>
              {row.year === todayYear && <span className="tlv-today">Today</span>}
              {dryYears.includes(row.year) && <span className="tlv-dry">Overdrawn</span>}
              {recoverYears.includes(row.year) && <span className="tlv-recover">Back on track</span>}
              <span className="tlv-ages">{agesFor(row.year)}</span>
            </button>
            {row.groups.length > 0 && (
              <div className="tlv-groups">
                {row.groups.map((g) => (
                  <div key={g.lane.id} className="tlv-group" style={{ '--c': laneColor(plan, g.lane) } as CSSProperties}>
                    <div className="tlv-who">{g.lane.person?.name ?? 'Household'}</div>
                    {g.items.map((item) => (
                      <button key={item.key} type="button" className="tlv-item" data-type={item.type} data-tone={item.type === 'event' ? item.event.tone : undefined} data-shape={item.type === 'event' ? item.event.shape : undefined} data-excluded={item.type === 'event' && item.event.excluded ? true : undefined} onClick={() => openItem(g.lane, item)}>
                        <span className="tl-mark" />
                        <span className="tlv-label">{item.label}</span>
                        {item.detail && <span className="tl-detail">{item.detail}</span>}
                        {item.type === 'event' && item.event.needsOwner && <span className="tl-who-pill">Who?</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
