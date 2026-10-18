import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { FreedomAgeCandidate, Plan, PlanEvent, PlanResult, RetirementConfig } from '@northstar/engine';
import { lifeExpectancyYearFor, retirementAgeSweep, runPlan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { RangePicker, TimeSeriesChart } from '../charts';
import { clampYear, extendPlanHorizon, planForRetirementPreview } from '../retirement';
import { planHealth } from '../health';
import { agesLineFor, dangerBandFor, useHeroHeight } from '../decisionKit';
import { investableSplit, retirementSources, spendableIgnoringPenalty } from '../retirementSources';
import '../pages/decisions.css';

/**
 * The Retirement lens (docs/REDESIGN-V3.md "Retirement", rebuilt on the v5
 * kit, docs/REDESIGN-V5.md §5.5): "when can I stop, and will the money last?"
 * Never blank — even before a `retirement` event exists, a sensible default
 * year (the earliest safe age this plan supports, else the included
 * participant's age 65) drives a full preview read, with a slider to adjust
 * it. Dragging past release/keyup commits the year as a real event via
 * `onSetRetirementYear`.
 *
 * The page leads with "What pays for each year": a stacked area by income
 * source with the spending need as a dashed line, scrubbable, its readout
 * listing each source. The stat strip, the goal progress bar and the
 * durability paragraph are gone; the danger band and the readout's Short pill
 * say where the money stops.
 *
 * B2 ("make Retirement always answer"): a retirement year past the plan's own
 * configured horizon used to leave the charts with nothing to show. This view
 * runs `runPlan` a second time, ON A COPY of the plan with its horizon
 * extended just far enough to cover the set retirement year plus 25 years —
 * never touching the engine, and never the plan/result anything else on the
 * page uses — and marks the extended region rather than let it pass as
 * ordinary projected data.
 */
/** How far past a retirement year this view is willing to extend the plan's
    horizon to answer durability questions — long enough to show the money
    running out, or comfortably not, without simulating indefinitely. */
const EXTENSION_YEARS_PAST_RETIREMENT = 25;

export function RetirementForecastView({
  plan,
  result,
  onSetRetirementYear,
}: {
  plan: Plan;
  result: PlanResult;
  /** Writes (or revives) the plan's `retirement` event at `year` for the included participant. */
  onSetRetirementYear(year: number): void;
}) {
  const retirementEvent = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded);
  const owner = retirementEvent?.config
    ? plan.participants.find((p) => p.id === (retirementEvent.config as { participantId?: string }).participantId)
    : undefined;
  const retiree = owner ?? plan.participants.find((p) => p.isIncluded);

  const minYear = plan.settings.startYear;
  const maxYear = retiree ? lifeExpectancyYearFor(retiree) : minYear + 50;
  const lifeExpectancyYear = retiree ? lifeExpectancyYearFor(retiree) : undefined;

  // The config candidates are swept under (independent of which year is
  // currently selected) — same value whether previewing or persisted, so
  // this can be computed before `pendingYear` exists yet, to pick the
  // slider's own default (B2: "default the slider to the earliest safe age
  // when the plan has no retirement event").
  const previewConfig: Partial<RetirementConfig> =
    (retirementEvent?.config as Partial<RetirementConfig> | undefined) ?? {
      spendingChangePercent: -20,
      participantId: retiree?.id,
    };
  const freedom: FreedomAgeCandidate | undefined = useMemo(() => {
    if (!retiree || lifeExpectancyYear === undefined) return undefined;
    const candidateYears: number[] = [];
    for (let y = minYear; y <= lifeExpectancyYear; y++) candidateYears.push(y);
    const sweep = retirementAgeSweep({
      plan,
      participantId: retiree.id,
      birthYear: retiree.birthYear,
      lifeExpectancyYear,
      candidateStartYears: candidateYears,
      retirementConfig: previewConfig,
    });
    return sweep.find((c) => c.survivesToLifeExpectancy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, retiree, lifeExpectancyYear, minYear]);

  const defaultYear = retiree
    ? (freedom ? freedom.year : clampYear(retiree.birthYear + 65, minYear + 1, maxYear - 1))
    : minYear + 20;
  const persistedYear = retirementEvent?.startYear;

  const [pendingYear, setPendingYear] = useState(persistedYear ?? defaultYear);

  // Resync when the persisted year changes from elsewhere (undo, another
  // page, switching plans) — keyed on the plan and the persisted value
  // specifically, never on `pendingYear` itself, so an in-progress drag is
  // never fought mid-gesture.
  useEffect(() => {
    setPendingYear(persistedYear ?? defaultYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, persistedYear]);

  const age = retiree ? pendingYear - retiree.birthYear : undefined;

  const commit = (e: PointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => {
    const year = Number(e.currentTarget.value);
    setPendingYear(year);
    onSetRetirementYear(year);
  };

  // Before a real event exists, this is a from-scratch preview built the
  // same way `onSetRetirementYear` would persist one — same default
  // spending change, same owner — so the read below is exactly what
  // committing right now would produce, not an approximation of it.
  const activeEvent: PlanEvent = retirementEvent ?? {
    id: 'retirement-preview',
    kind: 'retirement',
    name: 'Retire',
    startYear: pendingYear,
    isIncluded: true,
    config: previewConfig,
  };
  // While only previewing, the event's year tracks the slider live (so
  // dragging updates the read before release); once persisted, the year is
  // whatever's actually stored, and the slider is just editing it in place.
  const liveEvent: PlanEvent = retirementEvent ? retirementEvent : { ...activeEvent, startYear: pendingYear };

  // While previewing (no persisted event yet), `result` was run on `plan` as
  // given — which has no retirement event at all — so reading it here would
  // show the plan working straight through retirement, never actually
  // retiring. `simPlan` carries the live preview event so the read below
  // simulates exactly what committing right now would produce.
  const simPlan = planForRetirementPreview(plan, retirementEvent, liveEvent);

  // B2: extend the plan's simulated horizon far enough past the set
  // retirement year to answer durability honestly, without ever mutating
  // `plan`/`result` themselves (SEPP below, and every other page, keeps
  // reading the real, unextended plan).
  const targetEndYear = liveEvent.startYear + EXTENSION_YEARS_PAST_RETIREMENT;
  const isExtended = targetEndYear > result.endYear;
  const viewResult = useMemo(
    () =>
      isExtended || !retirementEvent
        ? runPlan(extendPlanHorizon(simPlan, Math.max(targetEndYear, result.endYear)))
        : result,
    [simPlan, result, isExtended, targetEndYear, retirementEvent],
  );

  return (
    <RetirementReady
      plan={plan}
      result={viewResult}
      originalEndYear={result.endYear}
      isExtended={isExtended}
      retirementEvent={liveEvent}
      control={
        <section className="ns-dec-section ns-ret-control">
          <div className="ns-dec-head">
            <h2 className="ns-dec-title">When do you stop working?</h2>
            {freedom && (
              <button
                type="button"
                className="ns-ret-safe"
                onClick={() => {
                  setPendingYear(freedom.year);
                  onSetRetirementYear(freedom.year);
                }}
              >
                Earliest safe <strong>age {freedom.age}</strong> · {freedom.year}
              </button>
            )}
          </div>
          <div className="ns-freedom-slider-row ns-freedom-slider-row-inline">
            <input
              type="range"
              className="ns-freedom-slider"
              aria-label="Retirement year"
              min={minYear}
              max={Math.max(minYear + 1, maxYear)}
              step={1}
              value={pendingYear}
              onChange={(e) => setPendingYear(Number(e.target.value))}
              onPointerUp={commit}
              onKeyUp={commit}
            />
            <div className="ns-freedom-slider-value">
              {age !== undefined ? `Age ${age}` : String(pendingYear)}
              <span className="ns-freedom-slider-year">{pendingYear}</span>
            </div>
          </div>
        </section>
      }
    />
  );
}

function RetirementReady({
  plan,
  result,
  originalEndYear,
  isExtended,
  retirementEvent,
  control,
}: {
  plan: Plan;
  /** The (possibly B2-extended) result this view reads for its charts. */
  result: PlanResult;
  /** The plan's own, unextended horizon — where the "beyond plan horizon" band starts. */
  originalEndYear: number;
  isExtended: boolean;
  retirementEvent: PlanEvent;
  /** The retire-year slider, rendered above the hero. */
  control: React.ReactNode;
}) {
  const { focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const heroHeight = useHeroHeight();

  const years = result.years.map((y) => y.year);

  const sources = useMemo(() => retirementSources(plan, result), [plan, result]);
  // This view's own health, not the context's: the retirement year being
  // previewed (or the extended horizon) can change where the money runs out.
  const health = useMemo(() => planHealth(result, plan), [result, plan]);
  const danger = useMemo(() => dangerBandFor(health, result), [health, result]);
  const split = useMemo(
    () => investableSplit(result, health.spendable, spendableIgnoringPenalty(plan, result)),
    [plan, result, health.spendable],
  );
  const agesFor = useMemo(() => agesLineFor(plan, result), [plan, result]);
  const beyond = isExtended ? { bandFrom: originalEndYear, bandLabel: 'Beyond horizon' } : {};

  return (
    <>
      {control}

      <section className="ns-dec-section">
        <TimeSeriesChart
          years={years}
          series={sources.series.map((s) => ({ id: s.key, label: s.label, color: s.color, values: s.values, kind: 'area' as const }))}
          stacked
          ghost={{ label: 'Spending need', color: 'var(--ink)', values: sources.need }}
          range={chartRange}
          todayYear={plan.settings.startYear}
          height={heroHeight}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          markers={[{ year: retirementEvent.startYear, label: 'Retire', tone: 'neutral' }]}
          {...beyond}
          readout={{
            label: 'What pays for each year · per year',
            agesFor,
            actions: <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={plan.settings.startYear} />,
          }}
          ariaLabel="What pays for each year, by source, against what the year costs"
        />
      </section>

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">Cash and investments</h2>
        </div>
        {/* Not net worth's line again (V5-REVIEW-1 F8): the same money split by
            whether the plan can actually draw on it. "Locked" is a withdrawal
            rule that says never, no priority rule, or a committed SEPP; money
            held back only by the early-withdrawal age is "With 10% penalty",
            which the engine does draw (V5-REVIEW-2 N5). */}
        <TimeSeriesChart
          years={years}
          series={[
            { id: 'canSpend', label: 'Can spend now', color: 'var(--data-nw)', values: split.canSpend, kind: 'area' },
            { id: 'penalty', label: 'With 10% penalty', color: 'var(--data-nw)', values: split.penalty, kind: 'area', fillOpacity: 0.45 },
            { id: 'locked', label: 'Locked', color: 'var(--muted-light)', values: split.locked, kind: 'area' },
          ]}
          stacked
          range={chartRange}
          todayYear={plan.settings.startYear}
          height={heroHeight - 120}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          markers={[{ year: retirementEvent.startYear, label: 'Retire', tone: 'neutral' }]}
          {...beyond}
          readout={{ label: 'Total', size: 'compact', agesFor }}
          ariaLabel="Cash and investments over time, split into what the plan can spend now and what is locked"
        />
      </section>
    </>
  );
}
