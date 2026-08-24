import { useMemo } from 'react';
import type { Goal, Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { goalFundingProgress, mergeGoalRules, pathMarkers, runPlan } from '@northstar/engine';
import { detailMoney, joinNames, percent } from '../format';
import { AnimatedFigure } from '../AnimatedFigure';
import { ChartLegend, GoalRing, MiniChart } from './MiniChart';

/**
 * The House lens (docs/REDESIGN.md §4.3): the actual decision, in three
 * honest stages per home, top to bottom —
 *
 *   1. Can I afford the down payment?  (the house goal's funding progress)
 *   2. The ownership arc.              (value / mortgage / equity over time)
 *   3. What it costs the rest of the plan. (this plan, with vs without the
 *      purchase, run through the same engine and diffed)
 *
 * None of the three stages is allowed to go blank for an included `buyAHome`
 * event: a missing goal says so plainly instead of omitting the stage, and
 * stage 3 always runs a real comparison rather than a canned line.
 */
export function HouseForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const homeEvents = plan.events.filter((e) => e.kind === 'buyAHome' && e.isIncluded);

  return (
    <div className="ns-card">
      <div className="ns-view-head">
        <div className="ns-view-title">House forecast</div>
        <p className="ns-view-sub">
          Whether you can afford the down payment, how equity builds after you buy, and what buying
          costs the rest of the plan.
        </p>
      </div>

      {homeEvents.length === 0 ? (
        <div className="ns-view-empty">Add a Buy a home event to the plan to see this forecast.</div>
      ) : (
        homeEvents.map((event) => (
          <HouseCard
            key={event.id}
            event={event}
            plan={plan}
            result={result}
            isOnlyHome={homeEvents.length === 1}
          />
        ))
      )}
    </div>
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
      <div className="ns-house-card-title">{event.name}</div>

      <p className="ns-view-sub" style={{ marginTop: 8 }}>
        Can I afford the down payment?
      </p>
      <DownPaymentStage plan={plan} eventName={event.name} goal={goal} result={result} />

      <p className="ns-view-sub" style={{ marginTop: 18 }}>
        The ownership arc
      </p>
      {hasStarted ? (
        <>
          <div className="ns-stat-row">
            <Stat
              label={event.name}
              value={detailMoney(currentValue)}
              note={`Value at ${years[years.length - 1]}`}
            />
            <Stat
              label="Mortgage payoff"
              value={payoffIndex >= 0 ? String(years[payoffIndex]) : `Not paid off by ${result.endYear}`}
            />
            <Stat
              label={`Equity at purchase (${years[ownedIndex]})`}
              value={detailMoney(equity[ownedIndex])}
            />
            <Stat label="Equity at horizon" value={detailMoney(currentEquity)} />
          </div>

          <MiniChart
            years={years}
            series={[
              { label: 'Home value', color: 'var(--data-nw)', values: value },
              { label: 'Mortgage balance', color: 'var(--out)', values: mortgage },
              { label: 'Equity', color: 'var(--in)', values: equity, fill: true },
            ]}
            height={220}
          />
          <ChartLegend
            series={[
              { label: 'Home value', color: 'var(--data-nw)' },
              { label: 'Mortgage balance', color: 'var(--out)' },
              { label: 'Equity', color: 'var(--in)' },
            ]}
          />
        </>
      ) : (
        <div className="ns-goal-empty">
          {event.name} is set to buy in {event.startYear}, after this plan's {result.endYear} horizon
          — there is nothing to chart yet.
        </div>
      )}

      <p className="ns-view-sub" style={{ marginTop: 18 }}>
        What it costs the rest of the plan
      </p>
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

/** Stage 1 — the house goal's funding-progress ring (docs/REDESIGN.md §2.2, §4.3). */
function DownPaymentStage({
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
        No down-payment goal is set for {eventName}. A goal would show a funding-progress ring here —
        the target amount, the year you plan to buy, and how close your earmarked accounts are on the
        current trajectory.
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

  const fraction = progress?.byYearFraction ?? 0;
  const balance = progress?.byYearBalance ?? 0;
  const funded = progress?.funded ?? false;
  const accountNames = joinNames(
    goal.fundedFromAccountIds
      .map((id) => plan.accounts.find((a) => a.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
  );

  return (
    <div className="ns-goal-ring-row">
      <GoalRing fraction={fraction} funded={funded} />
      <div className="ns-goal-ring-text">
        <div className="ns-goal-ring-headline">
          {funded ? 'On track' : 'At risk'} for the {detailMoney(goal.targetAmount)} down payment by{' '}
          {goal.byYear}
        </div>
        <div className="ns-goal-ring-note">
          {detailMoney(balance)} earmarked ({percent(fraction * 100, 0)}
          {accountNames ? ` from ${accountNames}` : ''})
        </div>
      </div>
    </div>
  );
}

/** A cost delta smaller than this is float noise, not a story — mirrors diff.ts's `diffOutcomes`. */
const NET_WORTH_NOISE_FLOOR = 500;

/** Stage 3 — the plan run with and without this home, diffed (docs/REDESIGN.md §4.3). */
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

  return <div className={`ns-house-cost ns-house-cost-${reading.tone}`}>{reading.text}</div>;
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
      ? { text: `Buying costs ${detailMoney(netWorthDelta)} at the ${withHouse.endYear} horizon.`, tone: 'down' }
      : {
          text: `Buying leaves you ${detailMoney(-netWorthDelta)} ahead at the ${withHouse.endYear} horizon.`,
          tone: 'up',
        };
  }

  return { text: 'Leaves the plan sound either way — no material difference at the horizon.', tone: 'neutral' };
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
