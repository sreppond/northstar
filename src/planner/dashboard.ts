/**
 * Pure derivations for the Overview dashboard (docs/REDESIGN-V3.md "Overview
 * (the dashboard)"). Everything here is presentation math over an already-run
 * `PlanResult` — no `runPlan` calls, nothing async — so it can be unit tested
 * without spinning up the engine or a component tree (`dashboard.test.ts`).
 *
 * Kept out of `OverviewPage.tsx` for the same reason `chartMath.ts` is kept
 * out of `NetWorthChart.tsx`: this repo's test runner only collects
 * `src/**\/*.test.ts` (vitest.config.ts), so a `.tsx` component can't easily
 * be unit tested here, a plain module can.
 */
import type { AccountClass, Plan, PlanEvent, PlanFreshness, PlanResult } from '@northstar/engine';
import { ACCOUNT_TYPES } from '@northstar/engine';
import type { MonarchStatus } from '../api/client';
import { summarize } from './presentation';
import { accountClassColor } from './ui';
import type { FanSeries } from './NetWorthChart';
import { asOfDateLabel } from './format';
import { planAsOfFraction, projectedNetWorthAt, summarizeProgress, yearFraction, type ProgressPoint } from './progress';
import { savingsRatePercent } from './ledger';

// --- Monarch status chip ----------------------------------------------------

export interface MonarchHeaderStatus {
  /** The text shown in the header's status chip — "Manual balances",
      "Monarch · synced 2h ago", etc. */
  text: string;
  /** The one action worth surfacing next to it, if any — folded in from what
      used to be a standalone `DataBanner` (docs/REDESIGN-V3.md #1: "the
      DataBanner connect/refresh affordance should fold into the status chip
      or header"). Absent when there is nothing to do (connected and fresh). */
  action?: { label: string; kind: 'connect' | 'refresh' };
}

/**
 * Plain language rather than a date. "12 days" is a judgement you can act on;
 * "captured 2026-08-11" makes you do the arithmetic yourself. Moved here from
 * `DataBanner.tsx` (still that file's only caller) so it sits with the rest
 * of the header-status derivation and is covered by the same tests.
 */
export function describeAge(days: number | null): string {
  if (days === null) return 'unknown age';
  if (days === 0) return 'synced today';
  if (days === 1) return 'synced a day ago';
  if (days < 14) return `synced ${days} days ago`;
  if (days < 60) return `synced ${Math.round(days / 7)} weeks ago`;
  return `synced ${Math.round(days / 30)} months ago`;
}

/** No backend (a static build) and no manual connection both read the same:
    there is simply nothing Monarch to report, so the plan is running on
    whatever balances were typed in. */
export function monarchHeaderStatus(status: MonarchStatus | null): MonarchHeaderStatus {
  if (!status || !status.connected) {
    return { text: 'Manual balances', action: status ? { label: 'Connect', kind: 'connect' } : undefined };
  }
  if (status.needsReconnect) {
    return { text: 'Monarch · reconnect needed', action: { label: 'Reconnect', kind: 'connect' } };
  }
  if (!status.lastCapturedAt) {
    return { text: 'Monarch · not synced yet', action: { label: 'Pull balances', kind: 'refresh' } };
  }
  if (status.stale) {
    return {
      text: `Monarch · ${describeAge(status.ageDays)}`,
      action: { label: 'Refresh', kind: 'refresh' },
    };
  }
  // Current. Offer the refresh without nagging about it.
  return { text: `Monarch · ${describeAge(status.ageDays)}`, action: { label: 'Refresh', kind: 'refresh' } };
}

export interface FreshnessHeaderStatus {
  /** "Monarch · synced Sep 1 · 24 days ago" or "Manual balances · as of Sep
      2" (docs/ROADMAP-10.md C4). */
  text: string;
  /** `freshness.isStale` passed straight through — the caller uses this to
      pick the neutral-chip-with-a-warn-dot treatment and to add the
      `npm run monarch:sync` hint to the chip's explainer. */
  isStale: boolean;
}

/**
 * The header status chip's text, driven by `planFreshness` (the PLAN's own
 * clock — `asOfDate` against the real calendar) rather than the server
 * Monarch CONNECTION's own `MonarchStatus` (`monarchHeaderStatus` above,
 * which still drives the separate Connect/Refresh action next to it): a
 * plan can be stale whether or not this browser happens to be connected to
 * Monarch right now, and a plan that has never touched Monarch at all still
 * has an as-of date worth naming.
 *
 * `isMonarchLinked` — whether this plan has ever absorbed a Monarch import
 * (`plan.settings.monarchOverrides` is only ever written by `applyImport`,
 * never hand-authored) — decides which of the two sentences prints; both
 * read the same `freshness`/`asOfDate` underneath.
 */
export function freshnessHeaderStatus(
  freshness: PlanFreshness,
  asOfDate: string,
  isMonarchLinked: boolean,
): FreshnessHeaderStatus {
  const dateLabel = asOfDateLabel(asOfDate);
  if (!isMonarchLinked) {
    return { text: `Manual balances · as of ${dateLabel}`, isStale: freshness.isStale };
  }
  const days = freshness.daysSinceAsOf;
  const ago = days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return { text: `Monarch · synced ${dateLabel} · ${ago}`, isStale: freshness.isStale };
}

// --- horizon cards -----------------------------------------------------------

export interface HorizonPoint {
  year: number;
  /** "2031 · +5 YRS" / "2046 · HORIZON". */
  label: string;
  /** The plan's own return-assumption value at this year — the horizon
      card's headline figure. Not a true statistical median, but it plays
      the same role P50 does in the Goodcast reference: the plan's single
      best-guess line, flanked by the low/high fan. */
  p50: number;
  low?: number;
  high?: number;
  /** (high - low) / p50 * 100 — undefined when there's no fan to read it from. */
  spreadPercent?: number;
  isHorizon: boolean;
}

/** A year snapshot's net worth, falling back to the last projected year the
    same way `PlannerContext.tsx`'s `spreadAtEnd` already does — a fan series
    can end a year short of the base plan under `todaysDollars` rounding. */
function netWorthAtYear(result: PlanResult, year: number): number {
  return (
    result.years.find((y) => y.year === year)?.netWorth ??
    result.years[result.years.length - 1]?.netWorth ??
    0
  );
}

/** (high - low) as a percentage of `mid` — "the range is what width, relative
    to the number everyone will actually remember." Undefined when `mid` is
    non-positive, where a percentage of it is not a meaningful figure. */
export function spreadPercent(low: number, high: number, mid: number): number | undefined {
  if (mid <= 0) return undefined;
  return ((high - low) / mid) * 100;
}

/**
 * The horizon row: +5 / +10 years out, then the plan's own horizon. `spread`
 * is the ALWAYS-computed fan (`PlannerContext.tsx`'s `spread`, not the
 * toggle-gated `fan`) — a horizon card's spread badge is a property of the
 * plan, not of whether the chart's band happens to be switched on right now.
 *
 * A +5/+10 candidate that would land ON or PAST the horizon is dropped
 * rather than clamped — a short plan (say a 6-year house scenario) should
 * show one card, not three identical ones.
 */
export function horizonPoints(
  result: PlanResult,
  spread: FanSeries | undefined,
  todayYear: number,
): HorizonPoint[] {
  const horizonYear = result.endYear;

  const build = (year: number, label: string, isHorizon: boolean): HorizonPoint => {
    const p50 = netWorthAtYear(result, year);
    const low = spread ? netWorthAtYear(spread.low, year) : undefined;
    const high = spread ? netWorthAtYear(spread.high, year) : undefined;
    return {
      year,
      label,
      p50,
      low,
      high,
      spreadPercent: low !== undefined && high !== undefined ? spreadPercent(low, high, p50) : undefined,
      isHorizon,
    };
  };

  const points: HorizonPoint[] = [];
  for (const [offset, tag] of [[5, '+5 YRS'], [10, '+10 YRS']] as const) {
    const year = todayYear + offset;
    if (year >= horizonYear) continue; // the horizon card already covers this ground
    points.push(build(year, `${year} · ${tag}`, false));
  }
  points.push(build(horizonYear, `${horizonYear} · HORIZON`, true));
  return points;
}

// --- account mix (the "Where it sits today" classification bar) ------------

export interface AccountMixSegment {
  key: string;
  label: string;
  value: number;
  /** `accountClassColor`'s hue for this class — precomputed here so
      `OverviewPage.tsx` can hand this list straight to `StackedBar` without
      re-deriving it. */
  color: string;
}

export interface AccountMix {
  segments: AccountMixSegment[];
  /** Liabilities have no honest width in a composition-of-assets bar
      (a negative "share of the whole" isn't a real proportion) — carried as
      a single note instead, the same call `StackedBar`'s own doc comment
      makes for a negative segment value. */
  liabilitiesTotal: number;
}

/** Every asset class in the order the account-mix ramp assigns its hues
    (`StackedBar.tsx`'s `ACCOUNT_CLASS_MIX`) — fixing the order keeps the
    legend's reading order stable across plans rather than shuffling with
    whichever class happened to appear first in `plan.accounts`. */
const ASSET_CLASS_ORDER: AccountClass[] = [
  'cash',
  'taxableInvestment',
  'taxDeferredInvestment',
  'taxFreeInvestment',
  'realEstate',
  'variableAnnuity',
  'otherAsset',
];

/**
 * Today's balances grouped by account class. Reads `result.opening` —
 * balances as of `settings.asOfDate`, not `result.years[0]`, which is the
 * projected CLOSE of the first plan year (Dec 31) and can already differ
 * from "today" by however much that stub year is projected to grow and earn
 * (docs/MATH.md "Today vs. years[0]"). Falls back to `years[0]` only when
 * `opening` is missing — defensively, for a `PlanResult` a test builds by
 * hand without one; `runPlan` itself always sets it.
 *
 * Reads `result` rather than `plan.accounts` directly so a Monarch import's
 * synthetic accounts (see `PlannerContext.tsx`'s `allAccounts`) are counted
 * too — the bar should show what the plan actually holds, not just what a
 * person hand-entered.
 */
export function accountMixToday(result: PlanResult): AccountMix {
  const byClass = new Map<AccountClass, number>();
  let liabilitiesTotal = 0;

  if (result.opening) {
    for (const row of result.opening.accounts) {
      if (row.isLiability) {
        liabilitiesTotal += row.balance;
        continue;
      }
      byClass.set(row.accountClass, (byClass.get(row.accountClass) ?? 0) + row.balance);
    }
  } else {
    const today = result.years[0];
    if (!today) return { segments: [], liabilitiesTotal: 0 };
    for (const row of today.accounts) {
      if (row.isLiability) {
        liabilitiesTotal += row.close;
        continue;
      }
      byClass.set(row.accountClass, (byClass.get(row.accountClass) ?? 0) + row.close);
    }
  }

  const segments: AccountMixSegment[] = ASSET_CLASS_ORDER.filter((cls) => (byClass.get(cls) ?? 0) > 0).map(
    (cls) => ({
      key: cls,
      label: ACCOUNT_TYPES[cls]?.label ?? cls,
      value: byClass.get(cls) ?? 0,
      color: accountClassColor(cls),
    }),
  );

  return { segments, liabilitiesTotal };
}

// --- coming up (next included events) ---------------------------------------

export interface UpcomingEvent {
  event: PlanEvent;
  year: number;
  /** 0 for this year, otherwise a positive count — never negative, since
      this list only ever holds events at or after `todayYear`. */
  yearsOut: number;
  /** A short one-line detail — the same summary the chart's selection
      footer already reads off `presentation.ts`, cheaper than re-running
      the plan to find each event's actual net-worth impact. */
  detail: string;
}

/**
 * The next `limit` included, non-hidden events at or after `todayYear` — the
 * plan horizon marker excluded, the same way `NetWorthChart.tsx`'s dot pass
 * excludes it: it is bookkeeping, not a life event someone is watching for.
 */
export function upcomingEvents(plan: Plan, todayYear: number, limit = 5): UpcomingEvent[] {
  return plan.events
    .filter((e) => e.isIncluded && !e.isHidden && e.kind !== 'endOfPlan' && e.startYear >= todayYear)
    .sort((a, b) => a.startYear - b.startYear)
    .slice(0, limit)
    .map((event) => ({
      event,
      year: event.startYear,
      yearsOut: event.startYear - todayYear,
      detail: summarize(event),
    }));
}

// --- savings rate & freedom age (the stat strip's fourth slot) -------------

/**
 * Savings (income minus spending, contributions counted as saved — see
 * `ledger.ts`'s `savingsRatePercent`, the one shared definition docs/MATH.md
 * "Savings rate and spending" pins) as a percentage of income, for the year
 * `todayYear` — "of what came in, how much stuck." Undefined when there's no
 * income to take a percentage of, rather than a misleading
 * divide-by-zero-flavoured number.
 */
export function savingsRateThisYear(result: PlanResult, todayYear: number): number | undefined {
  const year = result.years.find((y) => y.year === todayYear) ?? result.years[0];
  if (!year) return undefined;
  return savingsRatePercent(year);
}

export interface RetirementReadout {
  age: number;
  year: number;
}

/**
 * The age at the plan's own retirement event, read straight off the plan
 * rather than swept for an optimum — that sweep (`retirement.ts`'s
 * `retirementAgeSweep`) is the Retirement page's job; this stat is "what
 * does THIS plan say", not "what's the earliest safe age."
 */
export function retirementReadout(plan: Plan): RetirementReadout | undefined {
  const event = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded);
  if (!event) return undefined;
  const participant = plan.participants.find((p) => p.isIncluded);
  if (!participant) return undefined;
  return { age: event.startYear - participant.birthYear, year: event.startYear };
}

// --- plan vs. reality (docs/ROADMAP-10.md C4) --------------------------------

export interface PlanVsReality {
  /** actual − projected, signed. */
  delta: number;
  tone: 'in' | 'out';
  /** The plan's own as-of date, formatted — "Ahead of plan by $12K since Sep
      1": the divergence is measured from where the plan's own clock is
      anchored, not from the logged point's own date. */
  sinceLabel: string;
}

/**
 * How the latest logged actual (`progress.ts`'s `ProgressPoint`) compares to
 * what the plan itself projected for that same date — `projectedNetWorthAt`,
 * imported read-only from `progress.ts` rather than re-derived here. Absent
 * with no progress points logged yet, or once the gap rounds to nothing
 * (`money()`'s own "under $50 reads as $0" floor — a "$0 ahead of plan"
 * stat would just be noise).
 */
export function planVsReality(
  progressPoints: ProgressPoint[],
  result: PlanResult,
  plan: Pick<Plan, 'settings'>,
): PlanVsReality | undefined {
  const { latest } = summarizeProgress(progressPoints);
  if (!latest) return undefined;

  const asOf = planAsOfFraction(plan.settings);
  const projected = projectedNetWorthAt(result, yearFraction(latest.date), asOf);
  const delta = latest.netWorth - projected;
  if (Math.abs(delta) < 50) return undefined;

  return {
    delta,
    tone: delta >= 0 ? 'in' : 'out',
    sinceLabel: asOfDateLabel(plan.settings.asOfDate ?? `${plan.settings.startYear}-01-01`),
  };
}
