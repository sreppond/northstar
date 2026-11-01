import { useMemo } from 'react';
import type { Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { mergeGoalRules, pathMarkers, runPlan } from '@northstar/engine';
import { money } from '../format';
import { Badge } from '../ui';
import { RangePicker, TimeSeriesChart } from '../charts';
import { usePlanner } from '../PlannerContext';
import { agesLineFor } from '../decisionKit';
import { monthlyDangerBand } from '../pages/netWorthData';
import '../pages/decisions.css';

/**
 * The ownership arc (docs/REDESIGN-V5.md §5.5): once a home is in the plan,
 * what it is worth, what is owed on it and the equity between, on the kit's
 * scrubbable chart, plus a one-line reading of what buying costs the rest of
 * the plan (this plan with vs without the purchase, run through the same
 * engine and diffed). The stat strip, the down-payment progress bar and the
 * explanations are gone: the readout above the chart carries the numbers.
 *
 * `HousePage` only renders this once at least one included `buyAHome` event
 * exists.
 */
export function HouseForecastView({
  plan,
  result,
  defaultYear,
}: {
  plan: Plan;
  result: PlanResult;
  /** The year the page is trying; where the chart rests with nothing pinned (V5-REVIEW-1 F17). */
  defaultYear?: number;
}) {
  const homeEvents = plan.events.filter((e) => e.kind === 'buyAHome' && e.isIncluded);
  if (homeEvents.length === 0) return null;

  return (
    <>
      {homeEvents.map((event) => (
        <HouseCard key={event.id} event={event} plan={plan} result={result} isOnlyHome={homeEvents.length === 1} defaultYear={defaultYear} />
      ))}
    </>
  );
}

function HouseCard({
  event,
  plan,
  result,
  isOnlyHome,
  defaultYear,
}: {
  event: PlanEvent;
  plan: Plan;
  result: PlanResult;
  isOnlyHome: boolean;
  defaultYear?: number;
}) {
  const { health, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
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
  const agesFor = useMemo(() => agesLineFor(plan, result), [plan, result]);
  // V5-REVIEW-3 m4: Home's figures are per month, so the "Short" pill is too (same band NetWorthPage uses).
  const danger = useMemo(() => monthlyDangerBand(health, plan, result), [health, plan, result]);

  return (
    <div className="ns-dec-section">
      <div className="ns-dec-head">
        <h2 className="ns-dec-title">{isOnlyHome ? 'Owning it' : event.name}</h2>
        {hasStarted && <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={plan.settings.startYear} />}
      </div>

      {hasStarted ? (
        <TimeSeriesChart
          years={years}
          series={[
            { id: 'equity', label: 'Equity', color: 'var(--in)', values: equity, kind: 'area', stepAt: ownedIndex },
            { id: 'value', label: 'Home value', color: 'var(--data-nw)', values: value, stepAt: ownedIndex },
            { id: 'mortgage', label: 'Mortgage balance', color: 'var(--out)', values: mortgage, stepAt: ownedIndex },
          ]}
          range={chartRange}
          todayYear={plan.settings.startYear}
          height={320}
          focusYear={focusYear ?? (defaultYear !== undefined && years.includes(defaultYear) ? defaultYear : null)}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          readout={{ label: 'Equity', primaryId: 'equity', size: 'compact', agesFor, shortUnit: '/mo' }}
          ariaLabel={`${event.name}: value, mortgage and equity over time`}
        />
      ) : (
        <p className="ns-dec-empty">
          {event.name} is set to buy in {event.startYear}, after this plan's {result.endYear} horizon.
        </p>
      )}

      <CostOfBuyingStage plan={plan} event={event} result={result} />
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
 * returns a list of pre-formatted bullet fragments ("+$420K at 2046"), not a
 * single narrative sentence, so reusing it here would mean re-parsing its
 * output strings. `pathMarkers`
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
          ? `Buying delays your safe retirement — it's what first overdraws the plan, in ${withHouseShortfall}.`
          : `Buying is what first overdraws the plan, in ${withHouseShortfall}.`;
        return { text, tone: 'down' };
      }
      const text = hasRetirement
        ? `Buying delays your safe retirement — the plan is now overdrawn from ${withHouseShortfall} instead of ${withoutHouseShortfall}.`
        : `Buying moves the plan's first shortfall from ${withoutHouseShortfall} to ${withHouseShortfall}.`;
      return { text, tone: 'down' };
    }

    const text =
      withHouseShortfall === undefined
        ? `Buying clears the plan's shortfall — without it, the plan is overdrawn from ${withoutHouseShortfall}.`
        : `Buying pushes the plan's first shortfall from ${withoutHouseShortfall} to ${withHouseShortfall}.`;
    return { text, tone: 'up' };
  }

  if (Math.abs(netWorthDelta) > NET_WORTH_NOISE_FLOOR) {
    return netWorthDelta > 0
      ? { text: `Buying costs ${money(netWorthDelta)} at the ${withHouse.endYear} horizon, compared to not buying.`, tone: 'down' }
      : {
          text: `Buying leaves you ${money(-netWorthDelta)} ahead at the ${withHouse.endYear} horizon, compared to not buying.`,
          tone: 'up',
        };
  }

  return { text: 'Leaves the plan sound either way — no material difference at the horizon.', tone: 'neutral' };
}
