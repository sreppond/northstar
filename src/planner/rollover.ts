/**
 * Rolling a plan's clock forward once the real calendar has passed its own
 * `startYear` (`planFreshness(plan, today).needsRollover`,
 * `@northstar/engine`'s `freshness.ts`) — docs/ROADMAP-10.md Track C4's "It's
 * 2027 — roll the plan forward?" banner.
 *
 * A pure function, not wired to the clock itself, for the same reason
 * `planFreshness` isn't: `today` is an explicit argument so this stays as
 * testable as everything else this package derives.
 */
import { accountExistsIn, runPlan, type Plan } from '@northstar/engine';

/** `rollForward`'s result: the rolled plan, plus the metadata the UI needs to
    be honest about where the new balances came from (W3#4). */
export interface RollForwardResult {
  plan: Plan;
  /**
   * The OLD plan's `asOfDate` (or its `startYear`'s Jan 1st when unset) that
   * the new initial balances were PROJECTED forward from — undefined on a
   * no-op roll, when nothing moved. Lets the UI say "Balances projected from
   * Aug 14 — sync Monarch to replace with actuals" instead of silently
   * relabelling a stale, already-months-old balance as "as of Jan 1" (the
   * exact bug this fixes: staleness used to just disappear on rollover).
   */
  projectedFrom?: string;
}

/**
 * Rolls `plan` forward to `today`'s calendar year.
 *
 * Touches four things:
 * - `startYear` becomes `today`'s (UTC) calendar year.
 * - `asOfDate` becomes that year's January 1st — the same "no explicit
 *   as-of" convention `planFreshness`/`planMetaLine`/`progress.ts` already
 *   fall back to for a plan with no `asOfDate` set, so a rolled-forward plan
 *   reads exactly like one freshly created this January.
 * - `projectionYears` shrinks by the same number of years `startYear` moved,
 *   so the plan's own horizon (`run.ts`'s `endYear`) stays exactly where it
 *   was — rolling forward narrows the remaining window, it does not extend
 *   the plan by however many years passed.
 * - Every plain `plan.accounts[i].initialBalance` (one that already existed
 *   at the OLD `startYear` — see below) is replaced by that account's
 *   PROJECTED Dec-31-of-old-startYear CLOSE, from running the plan once
 *   before touching any settings. Honest, not a relabel: the old plan's own
 *   `asOfDate` was mid-year (or long past), so "today" genuinely has no
 *   actual balance yet — the projected close is the plan's own best read of
 *   what that balance has become, carrying forward the stub year's savings
 *   and growth instead of discarding them (W3#4: the old version left
 *   balances untouched and just relabelled them "as of Jan 1", so a plan
 *   rolled from August read as if nothing had happened since, and every
 *   later projection lost that months' worth of savings and growth).
 *
 * An account that had not yet STARTED as of the old `startYear`
 * (`Account.startYear` in the future, `accountExistsIn` false — e.g. a 529
 * an event opens years out) is left untouched: the old run's own close for
 * it is a meaningless 0, not a real projected balance, so overwriting its
 * configured seed would erase it. A synthetic, event-created account (never
 * present in `plan.accounts` to begin with) is skipped the same way, simply
 * by not being a plan account to iterate over.
 *
 * Known gap: a cost-basis-tracked account's `nonTaxableBase` is NOT rolled
 * forward alongside its balance — it stays at the old figure, understating
 * remaining basis (overstating future taxable gain) by however much of the
 * stub year's growth was itself basis-free. Same class of simplification as
 * `run.ts`'s stub-year account-existence granularity; flagged here rather
 * than silently compounded.
 *
 * Every OTHER year-indexed field on `Plan` is left untouched, because every
 * one of them is already an ABSOLUTE calendar year, not an offset from
 * `startYear`, so none of them need to move with it:
 * - `PlanEvent.startYear` — a retirement in 2031 is still 2031 whether the
 *   plan's own clock now starts at 2026 or 2027.
 * - `Goal.byYear`, `Account.withdrawalStartingYear`, `Account.penaltyFreeAge`
 *   (an age, not a year, but same reasoning: unrelated to `startYear`).
 * - `RateAnchor.year` (growth-rate schedules) — a scheduled step "6% from
 *   2031" names a calendar year outright.
 * - `Account.startYear` — "defaults to the plan start year when unset", but
 *   an account that sets it explicitly (a house bought years ago, say) is
 *   itself naming an absolute calendar year, not a plan-relative offset.
 * - `SurrenderScheduleEntry.year` is a CONTRACT year, not a calendar year at
 *   all, a further remove from anything `startYear` touches.
 */
export function rollForward(plan: Plan, today: Date): RollForwardResult {
  const newStartYear = today.getUTCFullYear();
  const oldStartYear = plan.settings.startYear;
  if (newStartYear <= oldStartYear) return { plan };

  const endOfPlanEvent = plan.events.find((e) => e.kind === 'endOfPlan' && e.isIncluded);
  // Mirrors `run.ts`'s own `endYear` derivation exactly, so this shrinks
  // `projectionYears` by precisely the amount that keeps that formula
  // landing on the SAME `endYear` afterward.
  const oldEndYear = endOfPlanEvent
    ? Math.max(oldStartYear, endOfPlanEvent.startYear)
    : oldStartYear + Math.max(1, plan.settings.projectionYears) - 1;

  const newProjectionYears = Math.max(1, oldEndYear - newStartYear + 1);

  // Run the OLD plan once, before touching any settings, to read each
  // account's projected close at the old startYear — the balance the new
  // plan should actually open with.
  const oldResult = runPlan(plan);
  const closeByAccountId = new Map(oldResult.years[0]?.accounts.map((a) => [a.accountId, a.close]) ?? []);
  const projectedFrom = plan.settings.asOfDate ?? `${oldStartYear}-01-01`;

  return {
    plan: {
      ...plan,
      settings: {
        ...plan.settings,
        startYear: newStartYear,
        asOfDate: `${newStartYear}-01-01`,
        projectionYears: newProjectionYears,
      },
      accounts: plan.accounts.map((a) => {
        if (!accountExistsIn(a, oldStartYear)) return a;
        const close = closeByAccountId.get(a.id);
        return close === undefined ? a : { ...a, initialBalance: close };
      }),
    },
    projectedFrom,
  };
}
