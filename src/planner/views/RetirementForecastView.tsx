import { useEffect, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { FreedomAgeCandidate, Goal, Participant, Plan, PlanEvent, PlanResult, RetirementConfig } from '@northstar/engine';
import { goalFundingProgress, lifeExpectancyYearFor, retirementAgeSweep, runPlan } from '@northstar/engine';
import { money, joinNames, percent } from '../format';
import { MiniChart } from './MiniChart';
import { SeppTool } from './SeppForecastView';
import { Badge, ProgressBar, SectionCard, Stat, StatStrip } from '../ui';
import { clampYear, extendPlanHorizon, planForRetirementPreview } from '../retirement';
import { stubYearLabel } from '../ledger';

/**
 * The Retirement lens (docs/REDESIGN-V3.md "Retirement"): "when can I stop,
 * and will the money last?" Never blank — even before a `retirement` event
 * exists, a sensible default year (the earliest safe age this plan supports,
 * else the included participant's age 65) drives a full preview read, with
 * a compact slider to adjust it. Dragging past release/keyup commits the
 * year as a real event via `onSetRetirementYear`, same as before; what
 * changed is that there is no longer a gate the user must drag through
 * before anything renders.
 *
 * B2 ("make Retirement always answer"): a retirement year past the plan's
 * own configured horizon used to leave the stat strip and both charts with
 * nothing to show — the freedom sweep below already looks all the way to
 * life expectancy, but `result` itself never simulated that far. This view
 * now runs `runPlan` a second time, ON A COPY of the plan with its horizon
 * extended just far enough to cover the set retirement year plus 25 years —
 * never touching the engine, and never the plan/result anything else on the
 * page uses — and marks the extended region rather than let it pass as
 * ordinary projected data.
 */
const PORTFOLIO_CLASSES = new Set([
  'cash',
  'taxableInvestment',
  'taxDeferredInvestment',
  'taxFreeInvestment',
]);

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

  const sliderControl = (
    <SectionCard title="When do you stop working?" meta={retirementEvent ? undefined : 'Previewing — drag to set'}>
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
    </SectionCard>
  );

  return (
    <RetirementReady
      plan={plan}
      result={viewResult}
      originalEndYear={result.endYear}
      isExtended={isExtended}
      retirementEvent={liveEvent}
      retiree={retiree}
      freedom={freedom}
      sliderControl={sliderControl}
      seppResult={result}
    />
  );
}

interface RetirementSummary {
  year: number;
  age: number | undefined;
  before: number;
  after: number;
  balanceAtRetirement: number;
  withdrawalsAtRetirement: number;
  shortfallYear: number | undefined;
}

function RetirementReady({
  plan,
  result,
  originalEndYear,
  isExtended,
  retirementEvent,
  retiree,
  freedom,
  sliderControl,
  seppResult,
}: {
  plan: Plan;
  /** The (possibly B2-extended) result this view reads for its stats/charts. */
  result: PlanResult;
  /** The plan's own, unextended horizon — where the "beyond plan horizon" band starts. */
  originalEndYear: number;
  isExtended: boolean;
  retirementEvent: PlanEvent;
  retiree: Participant | undefined;
  freedom: FreedomAgeCandidate | undefined;
  sliderControl: ReactNode;
  /** The real, unextended result — SEPP reads this, not the extended view. */
  seppResult: PlanResult;
}) {
  const [seppOpen, setSeppOpen] = useState(false);

  const years = result.years.map((y) => y.year);
  const income = result.years.map((y) => y.totalIncome);
  const expenses = result.years.map((y) => y.totalExpenses + y.totalTaxes);
  const portfolio = result.years.map((y) =>
    y.accounts.filter((a) => !a.isLiability && PORTFOLIO_CLASSES.has(a.accountClass)).reduce((s, a) => s + a.close, 0),
  );
  const stub = stubYearLabel(plan.settings.startYear, plan.settings.startYear, plan.settings.asOfDate);
  const stubYear = stub ? { year: plan.settings.startYear, label: stub.short } : undefined;

  const retirementIndex = years.indexOf(retirementEvent.startYear);

  const summary: RetirementSummary | undefined = useMemo(() => {
    if (retirementIndex < 0) return undefined;
    const before = income[Math.max(0, retirementIndex - 1)];
    const after = income[retirementIndex];
    const balanceAtRetirement = portfolio[retirementIndex];
    const withdrawalsAtRetirement = result.years[retirementIndex].accounts.reduce(
      (sum, a) => sum + a.withdrawals,
      0,
    );
    const shortfallAfter = result.years.slice(retirementIndex).find((y) => y.unfundedShortfall !== undefined);
    return {
      year: retirementEvent.startYear,
      age: retiree ? retirementEvent.startYear - retiree.birthYear : undefined,
      before,
      after,
      balanceAtRetirement,
      withdrawalsAtRetirement,
      shortfallYear: shortfallAfter?.year,
    };
  }, [retirementIndex, income, portfolio, result.years, retirementEvent.startYear, retiree]);

  const goal = (plan.goals ?? []).find((g) => g.kind === 'retirement');
  const alarm = summary?.shortfallYear !== undefined;

  return (
    <>
      <StatStrip>
        <Stat
          size="xl"
          label="Earliest safe retirement age"
          value={freedom ? `Age ${freedom.age}` : 'No safe age'}
          sub={
            freedom
              ? `Retiring in ${freedom.year} is the earliest year this plan lasts to age ${retiree?.lifeExpectancy}.`
              : retiree
                ? `No year before age ${retiree.lifeExpectancy} avoids running dry in this plan.`
                : undefined
          }
          explain="The earliest retirement year, swept year by year, whose projection still lasts to the retiree's life expectancy without running dry — not a rule of thumb, an actual re-run of the plan at each candidate year."
        />
        <Stat
          label="Income replacement"
          value={summary && summary.before > 0 ? percent((summary.after / summary.before) * 100, 0) : '—'}
          sub={summary ? `${money(summary.before)} → ${money(summary.after)}` : 'Out of horizon'}
          explain="Spendable income the retirement year after retiring, divided by spendable income the year before — how much of your working income the portfolio (plus Social Security) actually replaces."
        />
        <Stat
          label="Money lasts until"
          value={alarm ? String(summary!.shortfallYear) : `${result.endYear}+`}
          sub={
            alarm
              ? 'Runs dry at the set retirement year'
              : isExtended
                ? `No shortfall through ${result.endYear} (extended for this view)`
                : 'No shortfall through the plan horizon'
          }
          explain="The first year, at the retirement year you've set, that a withdrawal can't be fully funded — projected out to 25 years past retirement if the plan's own horizon ends sooner."
        />
        <Stat
          label="Withdrawals, first year"
          value={summary ? money(summary.withdrawalsAtRetirement) : '—'}
          sub={summary ? undefined : 'Out of horizon'}
          explain={
            retirementEvent
              ? `Total portfolio withdrawals projected for ${retirementEvent.startYear}, the retirement year you've set.`
              : undefined
          }
        />
      </StatStrip>

      {sliderControl}

      {summary ? (
        <div className={`ns-durability ${alarm ? 'ns-durability-alarm' : 'ns-durability-calm'}`}>
          {alarm
            ? `At the retirement year you've set, the plan runs dry in ${summary.shortfallYear} — a withdrawal couldn't be fully funded.`
            : `At the retirement year you've set, the plan lasts through ${result.endYear} without running dry.`}
        </div>
      ) : (
        // Only reachable now when there's no included participant at all to
        // retire (B2 extends the horizon far enough past any settable
        // retirement year that the ordinary "past the horizon" case above no
        // longer happens).
        <div className="ns-goal-empty">
          {retirementEvent.name} is set for {retirementEvent.startYear} — add an included participant to see
          income, spending and durability detail around that date.
        </div>
      )}

      <SectionCard title="Income vs. spending" meta="Taxes included" divider={false}>
        <MiniChart
          years={years}
          series={[
            { label: 'Income', color: 'var(--in)', values: income },
            { label: 'Spending + tax', color: 'var(--out)', values: expenses },
          ]}
          height={220}
          endLabels
          bandFrom={isExtended ? originalEndYear : undefined}
          bandLabel={isExtended ? 'Beyond horizon' : undefined}
          stubYear={stubYear}
        />
      </SectionCard>

      <SectionCard title="Investable portfolio balance" divider={false}>
        <MiniChart
          years={years}
          series={[{ label: 'Portfolio', color: 'var(--data-nw)', values: portfolio, fill: true }]}
          height={200}
          bandFrom={isExtended ? originalEndYear : undefined}
          bandLabel={isExtended ? 'Beyond horizon' : undefined}
          stubYear={stubYear}
        />
      </SectionCard>

      {goal && (
        <SectionCard title="Retirement goal progress">
          <RetirementGoalStage plan={plan} result={result} goal={goal} />
        </SectionCard>
      )}

      <div className="ns-disclosure">
        <button
          type="button"
          className="ns-disclosure-trigger"
          aria-expanded={seppOpen}
          onClick={() => setSeppOpen((v) => !v)}
        >
          <span>Access retirement funds early (SEPP / 72(t))</span>
          <span className="ns-disclosure-chevron" aria-hidden="true">{seppOpen ? '−' : '+'}</span>
        </button>
        {seppOpen && (
          <div className="ns-disclosure-body">
            <SeppTool plan={plan} result={seppResult} />
          </div>
        )}
      </div>
    </>
  );
}

/** Retirement goal progress (docs/REDESIGN.md §2.2, §4.2) -- reuses
    `goalFundingProgress`, no new engine logic. Same goal-row idiom as the
    House lens's down-payment stage (a `ProgressBar` plus an on-track badge,
    not a donut) -- M16: three different goal-progress encodings (a ring
    here, a bar there, two different colour rules) collapsed into one. */
function RetirementGoalStage({ plan, result, goal }: { plan: Plan; result: PlanResult; goal: Goal }) {
  const progress = useMemo(
    () => goalFundingProgress(plan, result).find((p) => p.goalId === goal.id),
    [plan, result, goal],
  );

  // No mandate (unlike the House lens's down-payment stage) to call out a
  // goal with nothing to track toward yet -- the never-blank flow above
  // already asks a lot of a first-time visitor, so an incomplete retirement
  // goal simply stays quiet here rather than adding a second empty state.
  if (goal.targetAmount === undefined || goal.byYear === undefined) return null;

  const fraction = progress?.byYearFraction ?? 0;
  const balance = progress?.byYearBalance ?? 0;
  const funded = progress?.funded ?? false;
  const accountNames = joinNames(
    goal.fundedFromAccountIds
      .map((id) => plan.accounts.find((a) => a.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
  );

  return (
    <div className="ns-goal-readiness">
      <div className="ns-goal-readiness-head">
        <span className="ns-goal-readiness-title">
          {goal.name} — {money(goal.targetAmount)} by {goal.byYear}
        </span>
        <Badge tone={funded ? 'in' : 'out'}>{funded ? 'On track' : 'Behind'}</Badge>
      </div>
      {/* `accent` and `--data-nw` share the same value at both themes' :root
          (§5.1's "net-worth blue when funded, out-orange when short") -- see
          the House lens's identical `DownPaymentReadiness` for the same
          convention. */}
      <ProgressBar value={balance} max={goal.targetAmount} tone={funded ? 'accent' : 'out'} label={`${goal.name} progress`} />
      <div className="ns-goal-readiness-note">
        {money(balance)} earmarked ({percent(fraction * 100, 0)}
        {accountNames ? ` from ${accountNames}` : ''})
      </div>
    </div>
  );
}
