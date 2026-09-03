import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { FreedomAgeCandidate, Goal, Participant, Plan, PlanEvent, PlanResult, RetirementConfig } from '@northstar/engine';
import { goalFundingProgress, lifeExpectancyYearFor, retirementAgeSweep } from '@northstar/engine';
import { detailMoney, joinNames, percent } from '../format';
import { AnimatedFigure } from '../AnimatedFigure';
import { ChartLegend, GoalRing, MiniChart } from './MiniChart';
import { SeppTool } from './SeppForecastView';

/**
 * The Retirement lens (docs/REDESIGN.md §4.2): "when can I stop, and will
 * the money last?" Never blank, in three parts —
 *
 *   1. No retirement event yet -> the invitation: pick a year, and the event
 *      is written to the plan immediately (`NeverBlankPrompt`).
 *   2. Set -> the freedom read: the earliest safe retirement age via a real
 *      engine sweep, durability as the emotional core, then the existing
 *      income-replacement and portfolio detail restyled underneath.
 *   3. SEPP folded in as an expandable tool, not a peer lens (§3.1) --
 *      `SeppTool` is the same component `SeppForecastView` wraps for its own
 *      standalone route.
 */
const PORTFOLIO_CLASSES = new Set([
  'cash',
  'taxableInvestment',
  'taxDeferredInvestment',
  'taxFreeInvestment',
]);

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

  return (
    <div className="ns-card ns-card-view">
      <div className="ns-view-head">
        <div className="ns-view-title">Retirement forecast</div>
        <p className="ns-view-sub">
          The earliest you can safely stop working, income and spending around that date, and how
          the investable portfolio carries the gap between them afterward.
        </p>
      </div>

      {!retirementEvent ? (
        <NeverBlankPrompt key={plan.id} plan={plan} retiree={retiree} onSetRetirementYear={onSetRetirementYear} />
      ) : (
        <RetirementReady plan={plan} result={result} retirementEvent={retirementEvent} retiree={retiree} />
      )}
    </div>
  );
}

/** Clamp `value` into `[a, b]`, normalising the bounds first so a degenerate `a > b` never inverts the result. */
function clampYear(value: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The invitation (docs/REDESIGN.md §4.2): "when do you want to stop
 * working?" with a draggable year control. A native range input IS a
 * draggable control -- keyboard-accessible for free, no bespoke pointer
 * machinery to build -- so this reaches for it rather than a plain number
 * field; the slider commits on release/keyup (not on every drag tick), so one
 * drag writes one event rather than spamming the undo stack.
 */
function NeverBlankPrompt({
  plan,
  retiree,
  onSetRetirementYear,
}: {
  plan: Plan;
  retiree: Participant | undefined;
  onSetRetirementYear(year: number): void;
}) {
  const minYear = plan.settings.startYear;
  const maxYear = retiree ? lifeExpectancyYearFor(retiree) : minYear + 50;
  const defaultYear = retiree
    ? clampYear(retiree.birthYear + 65, minYear + 1, maxYear - 1)
    : minYear + 20;

  const [pendingYear, setPendingYear] = useState(defaultYear);
  const age = retiree ? pendingYear - retiree.birthYear : undefined;

  const commit = (e: PointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => {
    const year = Number(e.currentTarget.value);
    setPendingYear(year);
    onSetRetirementYear(year);
  };

  return (
    <div className="ns-freedom-prompt">
      <div className="ns-freedom-prompt-title">When do you want to stop working?</div>
      <p className="ns-view-sub">
        Drag to a year. The instant you set one, this lens fills in — the earliest age you could
        retire safely, income replacement, and how long the money lasts.
      </p>
      <div className="ns-freedom-slider-row">
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
          {age !== undefined && <span className="ns-freedom-slider-year">{pendingYear}</span>}
        </div>
      </div>
    </div>
  );
}

interface RetirementSummary {
  year: number;
  age: number | undefined;
  before: number;
  after: number;
  balanceAtRetirement: number;
  shortfallYear: number | undefined;
}

function RetirementReady({
  plan,
  result,
  retirementEvent,
  retiree,
}: {
  plan: Plan;
  result: PlanResult;
  retirementEvent: PlanEvent;
  retiree: Participant | undefined;
}) {
  const [seppOpen, setSeppOpen] = useState(false);

  const years = result.years.map((y) => y.year);
  const income = result.years.map((y) => y.totalIncome);
  const expenses = result.years.map((y) => y.totalExpenses + y.totalTaxes);
  const portfolio = result.years.map((y) =>
    y.accounts.filter((a) => !a.isLiability && PORTFOLIO_CLASSES.has(a.accountClass)).reduce((s, a) => s + a.close, 0),
  );

  const retirementIndex = years.indexOf(retirementEvent.startYear);

  const summary: RetirementSummary | undefined = useMemo(() => {
    if (retirementIndex < 0) return undefined;
    const before = income[Math.max(0, retirementIndex - 1)];
    const after = income[retirementIndex];
    const balanceAtRetirement = portfolio[retirementIndex];
    const shortfallAfter = result.years.slice(retirementIndex).find((y) => y.unfundedShortfall !== undefined);
    return {
      year: retirementEvent.startYear,
      age: retiree ? retirementEvent.startYear - retiree.birthYear : undefined,
      before,
      after,
      balanceAtRetirement,
      shortfallYear: shortfallAfter?.year,
    };
  }, [retirementIndex, income, portfolio, result.years, retirementEvent.startYear, retiree]);

  const lifeExpectancyYear = retiree ? lifeExpectancyYearFor(retiree) : undefined;

  // The freedom read (docs/REDESIGN.md §4.2): a real engine sweep, mirroring
  // sepp.ts's `seppStartAgeSweep` -- every candidate holds this SAME
  // retirement config (spendingChangePercent and the rest) fixed, varying
  // only the year, so the sweep answers "when," not "under what different
  // assumptions."
  const freedom: FreedomAgeCandidate | undefined = useMemo(() => {
    if (!retiree || lifeExpectancyYear === undefined) return undefined;
    const candidateYears: number[] = [];
    for (let y = plan.settings.startYear; y <= lifeExpectancyYear; y++) candidateYears.push(y);
    const sweep = retirementAgeSweep({
      plan,
      participantId: retiree.id,
      birthYear: retiree.birthYear,
      lifeExpectancyYear,
      candidateStartYears: candidateYears,
      retirementConfig: retirementEvent.config as Partial<RetirementConfig>,
    });
    return sweep.find((c) => c.survivesToLifeExpectancy);
  }, [plan, retiree, lifeExpectancyYear, retirementEvent.config]);

  const goal = (plan.goals ?? []).find((g) => g.kind === 'retirement');

  return (
    <>
      <FreedomHeadline retiree={retiree} lifeExpectancyYear={lifeExpectancyYear} freedom={freedom} setYear={retirementEvent.startYear} />

      {summary ? (
        <>
          <Durability summary={summary} endYear={result.endYear} />

          <div className="ns-stat-row">
            <Stat
              label="Retirement year"
              value={String(summary.year)}
              note={summary.age !== undefined ? `Age ${summary.age}` : undefined}
            />
            <Stat
              label="Income, before → after"
              value={`${detailMoney(summary.before)} → ${detailMoney(summary.after)}`}
              note={
                summary.before > 0
                  ? `${percent((summary.after / summary.before) * 100, 0)} replacement`
                  : undefined
              }
            />
            <Stat label="Portfolio at retirement" value={detailMoney(summary.balanceAtRetirement)} />
          </div>
        </>
      ) : (
        // The retirement year set is later than this plan's own configured
        // horizon (`result.endYear`) -- the freedom sweep above still answers
        // honestly because it extends its own candidate horizons to life
        // expectancy, but the plan's actual projection has nothing to report
        // at a year it never simulates. Say so plainly rather than a stat row
        // of dashes and zeros.
        <div className="ns-goal-empty">
          {retirementEvent.name} is set for {retirementEvent.startYear}, after this plan's{' '}
          {result.endYear} horizon — extend it from Edit assumptions to see income, spending and
          durability detail around that date.
        </div>
      )}

      <p className="ns-view-sub" style={{ marginTop: 8 }}>Income vs. spending (taxes included)</p>
      <MiniChart
        years={years}
        series={[
          { label: 'Income', color: 'var(--in)', values: income },
          { label: 'Spending + tax', color: 'var(--out)', values: expenses },
        ]}
        height={200}
      />
      <ChartLegend
        series={[
          { label: 'Income', color: 'var(--in)' },
          { label: 'Spending + tax', color: 'var(--out)' },
        ]}
      />

      <p className="ns-view-sub" style={{ marginTop: 18 }}>Investable portfolio balance</p>
      <MiniChart
        years={years}
        series={[{ label: 'Portfolio', color: 'var(--data-nw)', values: portfolio, fill: true }]}
        height={200}
      />

      {goal && <RetirementGoalStage plan={plan} result={result} goal={goal} />}

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
            <SeppTool plan={plan} result={result} />
          </div>
        )}
      </div>
    </>
  );
}

/** The single figure that matters (docs/REDESIGN.md §4.2): a real engine sweep, not a guess. */
function FreedomHeadline({
  retiree,
  lifeExpectancyYear,
  freedom,
  setYear,
}: {
  retiree: Participant | undefined;
  lifeExpectancyYear: number | undefined;
  freedom: FreedomAgeCandidate | undefined;
  setYear: number;
}) {
  // Degenerate: a plan with no participant to retire has no age to sweep.
  // Vanishingly rare in practice (every real plan has one), so this just
  // omits the headline rather than fabricating a reading.
  if (!retiree || lifeExpectancyYear === undefined) return null;

  return (
    <div className={`ns-freedom${freedom ? '' : ' ns-freedom-alarm'}`}>
      <div className="ns-freedom-label">The earliest you can retire and not run out</div>
      {freedom ? (
        <>
          <AnimatedFigure className="ns-freedom-figure" value={`Age ${freedom.age}`} />
          <p className="ns-freedom-note">
            Retiring in {freedom.year} is the earliest year this plan lasts to age{' '}
            {retiree.lifeExpectancy} ({lifeExpectancyYear}) without running dry
            {freedom.year === setYear ? " — exactly the year you've set." : '.'}
          </p>
        </>
      ) : (
        <>
          <AnimatedFigure className="ns-freedom-figure" value="No safe age found" />
          <p className="ns-freedom-note">
            No retirement year between now and age {retiree.lifeExpectancy} avoids running dry in this
            plan. Spending less in retirement, saving more beforehand, or working longer than modelled
            would each move this.
          </p>
        </>
      )}
    </div>
  );
}

/** Durability as the emotional core (docs/REDESIGN.md §4.2) -- the plan AS SET, not the sweep's candidate. */
function Durability({ summary, endYear }: { summary: RetirementSummary | undefined; endYear: number }) {
  if (!summary) return null;
  const alarm = summary.shortfallYear !== undefined;

  return (
    <div className={`ns-durability ${alarm ? 'ns-durability-alarm' : 'ns-durability-calm'}`}>
      {alarm
        ? `At the retirement year you've set, the plan runs dry in ${summary.shortfallYear} — a withdrawal couldn't be fully funded.`
        : `At the retirement year you've set, the plan lasts through ${endYear} without running dry.`}
    </div>
  );
}

/** Retirement goal progress (docs/REDESIGN.md §2.2, §4.2) -- reuses `goalFundingProgress`, no new engine logic. */
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
    <>
      <p className="ns-view-sub" style={{ marginTop: 18 }}>Retirement goal progress</p>
      <div className="ns-goal-ring-row">
        <GoalRing fraction={fraction} funded={funded} />
        <div className="ns-goal-ring-text">
          <div className="ns-goal-ring-headline">
            {funded ? 'On track' : 'Behind'} for the {detailMoney(goal.targetAmount)} target by{' '}
            {goal.byYear}
          </div>
          <div className="ns-goal-ring-note">
            {detailMoney(balance)} earmarked ({percent(fraction * 100, 0)}
            {accountNames ? ` from ${accountNames}` : ''})
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ns-stat">
      <div className="ns-stat-label">{label}</div>
      <AnimatedFigure className="ns-stat-value" value={value} />
      {note && <div className="ns-stat-note">{note}</div>}
    </div>
  );
}
