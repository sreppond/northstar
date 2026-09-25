import { useMemo } from 'react';
import type { Goal, Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { goalFundingProgress, mergeGoalRules, pathMarkers, runPlan } from '@northstar/engine';
import { detailMoney, joinNames, percent } from '../format';
import { MiniChart } from './MiniChart';
import { Badge, ProgressBar, SectionCard, Stat, StatStrip } from '../ui';

/**
 * The House lens (docs/REDESIGN-V3.md "House"): the actual decision, per
 * home, top to bottom —
 *
 *   1. A stat strip (home value at horizon, equity at purchase and at
 *      horizon, mortgage payoff year).
 *   2. Down-payment readiness as a goal row (a progress bar + an on-track
 *      badge, not a donut).
 *   3. The ownership arc — value / mortgage / equity — with direct end
 *      labels instead of a bottom legend.
 *   4. What it costs the rest of the plan, as a neutral one-line reading
 *      (this plan, with vs without the purchase, run through the same
 *      engine and diffed) rather than an alarm box.
 *
 * `HousePage` only renders this once at least one included `buyAHome` event
 * exists — an empty plan gets an `EmptyState` there instead — so this
 * component's own empty branch is a defensive fallback, not the primary path.
 */
export function HouseForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const homeEvents = plan.events.filter((e) => e.kind === 'buyAHome' && e.isIncluded);
  if (homeEvents.length === 0) return null;

  return (
    <>
      {homeEvents.map((event) => (
        <HouseCard key={event.id} event={event} plan={plan} result={result} isOnlyHome={homeEvents.length === 1} />
      ))}
    </>
  );
}

function HouseCard({
  event,
  plan,
  result,
  isOnlyHome,
}: {
  event: PlanEvent;
  plan: Plan;
  result: PlanResult;
  isOnlyHome: boolean;
}) {
  const homeId = `${event.id}:home`;
  const mortgageId = `${event.id}:mortgage`;

  const years = result.years.map((y) => y.year);
  const value = result.years.map((y) => y.accounts.find((a) => a.accountId === homeId)?.close ?? 0);
  const mortgage = result.years.map(
    (y) => y.accounts.find((a) => a.accountId === mortgageId)?.close ?? 0,
  );
  const equity = value.map((v, i) => v - mortgage[i]);

  const ownedIndex = value.findIndex((v) => v > 0);
  const hasStarted = ownedIndex !== -1;
  const payoffIndex = hasStarted ? mortgage.findIndex((m, i) => i >= ownedIndex && m <= 0) : -1;
  const currentValue = value[value.length - 1];
  const currentEquity = equity[equity.length - 1];

  const goal = resolveHouseGoal(plan, event.id, isOnlyHome);

  return (
    <div className="ns-house-card">
      {!isOnlyHome && <div className="ns-house-card-title">{event.name}</div>}

      {/* Frame order per docs/REDESIGN-V3.md's page frame (S1): StatStrip
          before the goal row, not after -- this used to render the readiness
          bar first, ahead of the numbers it's a readout of. */}
      {hasStarted && (
        <StatStrip>
          <Stat
            size="xl"
            label={isOnlyHome ? 'Home value at horizon' : `${event.name} value at horizon`}
            value={detailMoney(currentValue)}
          />
          <Stat label={`Equity at purchase (${years[ownedIndex]})`} value={detailMoney(equity[ownedIndex])} />
          <Stat label="Equity at horizon" value={detailMoney(currentEquity)} />
          <Stat
            label="Mortgage payoff"
            value={payoffIndex >= 0 ? String(years[payoffIndex]) : `Not by ${result.endYear}`}
          />
        </StatStrip>
      )}

      <DownPaymentReadiness plan={plan} eventName={event.name} goal={goal} result={result} />

      {hasStarted ? (
        <SectionCard title="The ownership arc" meta={`${years[0]}–${years[years.length - 1]}`} divider={false}>
          <MiniChart
            years={years}
            series={[
              { label: 'Home value', color: 'var(--data-nw)', values: value },
              { label: 'Mortgage balance', color: 'var(--out)', values: mortgage },
              { label: 'Equity', color: 'var(--in)', values: equity, fill: true },
            ]}
            height={240}
            endLabels
          />
        </SectionCard>
      ) : (
        <div className="ns-goal-empty">
          {event.name} is set to buy in {event.startYear}, after this plan's {result.endYear} horizon
          — there is nothing to chart yet.
        </div>
      )}

      <CostOfBuyingStage plan={plan} event={event} result={result} />
    </div>
  );
}

/**
 * Which house goal belongs to this home. With more than one home in the
 * plan, only an explicit `linkedEventId` counts — otherwise a goal add to one
 * home could silently attach itself to another's card. With exactly one home,
 * fall back to the plan's one house goal even if it isn't linked yet, so real
 * seed data (or a goal authored before its event) still shows.
 */
function resolveHouseGoal(plan: Plan, eventId: string, isOnlyHome: boolean): Goal | undefined {
  const houseGoals = (plan.goals ?? []).filter((g) => g.kind === 'house');
  const linked = houseGoals.find((g) => g.linkedEventId === eventId);
  if (linked || !isOnlyHome) return linked;
  return houseGoals[0];
}

/** Down-payment readiness as a goal row (docs/REDESIGN-V3.md "House") — a
    progress bar plus an on-track badge, replacing the funding-progress ring. */
function DownPaymentReadiness({
  plan,
  eventName,
  goal,
  result,
}: {
  plan: Plan;
  eventName: string;
  goal: Goal | undefined;
  result: PlanResult;
}) {
  const progress = useMemo(
    () => (goal ? goalFundingProgress(plan, result).find((p) => p.goalId === goal.id) : undefined),
    [plan, result, goal],
  );

  if (!goal) {
    return (
      <div className="ns-goal-empty">
        No down-payment goal is set for {eventName}. A goal would show readiness here — the target
        amount, the year you plan to buy, and how close your earmarked accounts are on the current
        trajectory.
      </div>
    );
  }

  if (goal.targetAmount === undefined || goal.byYear === undefined) {
    return (
      <div className="ns-goal-empty">
        {goal.name} has no target amount or target year set, so there is nothing to track toward yet.
      </div>
    );
  }

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
          {goal.name} — {detailMoney(goal.targetAmount)} by {goal.byYear}
        </span>
        <Badge tone={funded ? 'in' : 'out'}>{funded ? 'On track' : 'At risk'}</Badge>
      </div>
      {/* `accent` and `--data-nw` share the same value at both themes' :root
          -- M16's §5.1 rule ("net-worth blue when funded, out-orange when
          short") applied the same way here, in Retirement's goal row, and
          (per fix-2) Overview's. */}
      <ProgressBar value={balance} max={goal.targetAmount} tone={funded ? 'accent' : 'out'} label={`${goal.name} progress`} />
      <div className="ns-goal-readiness-note">
        {detailMoney(balance)} earmarked ({percent(goal.targetAmount > 0 ? (balance / goal.targetAmount) * 100 : 0, 0)}
        {accountNames ? ` from ${accountNames}` : ''})
      </div>
    </div>
  );
}

/** A cost delta smaller than this is float noise, not a story — mirrors diff.ts's `diffOutcomes`. */
const NET_WORTH_NOISE_FLOOR = 500;

/** What it costs the rest of the plan, as a neutral one-line reading rather
    than an alarm box (docs/REDESIGN-V3.md "House") — a badge carries the
    direction, the sentence stays plain ink either way. */
function CostOfBuyingStage({
  plan,
  event,
  result,
}: {
  plan: Plan;
  event: PlanEvent;
  result: PlanResult;
}) {
  const withoutHouseResult = useMemo(
    () => runPlan(planWithoutHome(plan, event.id)),
    [plan, event.id],
  );

  const reading = useMemo(
    () => describeCostOfBuying(plan, result, withoutHouseResult),
    [plan, result, withoutHouseResult],
  );

  return (
    <div className="ns-house-cost">
      <Badge tone={reading.tone === 'down' ? 'out' : reading.tone === 'up' ? 'in' : 'neutral'}>
        {reading.tone === 'down' ? 'Costs' : reading.tone === 'up' ? 'Saves' : 'Neutral'}
      </Badge>
      <p>{reading.text}</p>
    </div>
  );
}

/**
 * The active plan with one `buyAHome` event — and the goal explicitly linked
 * to it, if any — removed, rules re-derived from what remains. This is the
 * counterfactual stage 3 diffs against: "what does the rest of the plan look
 * like if this purchase never happened."
 */
function planWithoutHome(plan: Plan, eventId: string): Plan {
  const stripped: Plan = {
    ...plan,
    events: plan.events.filter((e) => e.id !== eventId),
    goals: (plan.goals ?? []).filter((g) => g.linkedEventId !== eventId),
  };
  return { ...stripped, rules: mergeGoalRules(stripped) };
}

interface CostReading {
  text: string;
  tone: 'up' | 'down' | 'neutral';
}

/**
 * Turns "two plans, run and compared" into the one sentence REDESIGN.md
 * §4.3 asks for. A change in when the plan first runs dry is the sharper
 * story — the difference between "smaller" and "doesn't work" — so it leads
 * when there is one; otherwise this falls back to the terminal net-worth
 * delta at the active plan's horizon, the same clip-at-active-endYear
 * convention `diff.ts`'s `diffOutcomes` uses for a saved-scenario compare.
 *
 * Written directly rather than through `diffOutcomes` itself: that function
 * returns a list of pre-formatted bullet fragments ("+$420K at 2046") meant
 * for `CompareDiff`'s two-column list, not a single narrative sentence, so
 * reusing it here would mean re-parsing its output strings. `pathMarkers`
 * and the same threshold it uses are the reusable parts.
 */
function describeCostOfBuying(plan: Plan, withHouse: PlanResult, withoutHouse: PlanResult): CostReading {
  const activeEnd = withHouse.years.at(-1)?.netWorth ?? 0;
  const compareAtActiveEnd =
    withoutHouse.years.find((y) => y.year === withHouse.endYear)?.netWorth ??
    withoutHouse.years.at(-1)?.netWorth ??
    0;
  // Positive: not buying ends up ahead, i.e. buying costs this much.
  const netWorthDelta = compareAtActiveEnd - activeEnd;

  const withHouseShortfall = pathMarkers(withHouse).shortfallYears[0];
  const withoutHouseShortfall = pathMarkers(withoutHouse).shortfallYears[0];
  const hasRetirement = plan.events.some((e) => e.kind === 'retirement' && e.isIncluded);

  if (withHouseShortfall !== withoutHouseShortfall) {
    const worsens =
      withoutHouseShortfall === undefined ||
      (withHouseShortfall !== undefined && withHouseShortfall < withoutHouseShortfall);

    if (worsens) {
      if (withoutHouseShortfall === undefined) {
        const text = hasRetirement
          ? `Buying delays your safe retirement — it's what causes the plan to run dry, in ${withHouseShortfall}.`
          : `Buying is what causes the plan to run dry, in ${withHouseShortfall}.`;
        return { text, tone: 'down' };
      }
      const text = hasRetirement
        ? `Buying delays your safe retirement — the plan now runs dry in ${withHouseShortfall} instead of ${withoutHouseShortfall}.`
        : `Buying moves the plan's first shortfall from ${withoutHouseShortfall} to ${withHouseShortfall}.`;
      return { text, tone: 'down' };
    }

    const text =
      withHouseShortfall === undefined
        ? `Buying clears the plan's shortfall — without it, the plan runs dry in ${withoutHouseShortfall}.`
        : `Buying pushes the plan's first shortfall from ${withoutHouseShortfall} to ${withHouseShortfall}.`;
    return { text, tone: 'up' };
  }

  if (Math.abs(netWorthDelta) > NET_WORTH_NOISE_FLOOR) {
    return netWorthDelta > 0
      ? { text: `Buying costs ${detailMoney(netWorthDelta)} at the ${withHouse.endYear} horizon, compared to not buying.`, tone: 'down' }
      : {
          text: `Buying leaves you ${detailMoney(-netWorthDelta)} ahead at the ${withHouse.endYear} horizon, compared to not buying.`,
          tone: 'up',
        };
  }

  return { text: 'Leaves the plan sound either way — no material difference at the horizon.', tone: 'neutral' };
}
