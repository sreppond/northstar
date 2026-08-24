/**
 * Goals — the friendly surface over the allocation waterfall (docs/REDESIGN.md
 * §2.2).
 *
 * Everything here is PURE and derived, the same category as `markers.ts` and
 * `deflate`: none of it runs inside the year loop. A goal never adds a new
 * mechanic to `run.ts` — it only ever
 *
 *   1. derives the annual contribution a target-and-date implies, and
 *   2. turns that into an ordinary allocation `PriorityRule` (`maxAnnual`), so
 *      the waterfall the engine already runs does the filling, and
 *   3. reads its own progress back out of a finished `PlanResult` by summing
 *      the balances of the accounts earmarked to it against the target.
 *
 * Earmarking is a label and an ordering, never a hard partition — the dollars
 * stay fungible; the intent is what the goal records.
 */
import type { Account, Goal, GoalKind, Plan, PlanResult, PriorityRule } from './types.js';

/**
 * Where surplus that no goal or rule claimed lands (`run.ts`). Named, and shown
 * growing, rather than left as the jargon "unallocated" it used to surface as.
 */
export const SWEEP_BUCKET_LABEL = 'Savings';

/** The cash-flow line label for the unallocated sweep. */
export function sweepAllocationLabel(): string {
  return `To ${SWEEP_BUCKET_LABEL}`;
}

/**
 * The level annual contribution a goal needs to reach its target by its date,
 * given what is already earmarked toward it. Straight-line and growth-free on
 * purpose: it is the honest floor a person can act on ("put this much aside a
 * year"), not a return forecast dressed up as a plan.
 *
 * A goal with no target or no date has no required contribution — it is an
 * intent to watch, not a number to hit — so this returns 0.
 */
export function requiredAnnualContribution(
  goal: Goal,
  opts: { currentYear: number; earmarkedBalance?: number },
): number {
  if (goal.targetAmount === undefined || goal.byYear === undefined) return 0;
  const remaining = Math.max(0, goal.targetAmount - (opts.earmarkedBalance ?? 0));
  if (remaining <= 0) return 0;
  // At or past the date, the whole remaining gap is "this year".
  const yearsLeft = Math.max(1, goal.byYear - opts.currentYear);
  return remaining / yearsLeft;
}

function includedBalance(accounts: Account[], id: string): number {
  const account = accounts.find((a) => a.id === id && a.isIncluded);
  return account?.initialBalance ?? 0;
}

/**
 * Map a plan's goals onto allocation `PriorityRule`s. Each goal with a target,
 * a date and a funded account becomes ONE allocation rule against its primary
 * (first) earmarked account, capped at the contribution the goal needs, and
 * ordered by the goal's position — "fund the house first, then retirement."
 *
 * This is deliberately a standalone helper rather than something `run.ts`
 * calls: the store merges these into `plan.rules` (via `mergeGoalRules`,
 * below) whenever a goal is saved, so the projection itself never grows any
 * goal-specific logic — it only ever sees ordinary `PriorityRule`s. Goals with
 * nothing to require (no target / date / account, or already funded) generate
 * no rule and let surplus flow on.
 */
export function goalsToAllocationRules(plan: Plan, startOrder = 1): PriorityRule[] {
  const goals = plan.goals ?? [];
  const rules: PriorityRule[] = [];
  let order = startOrder;

  for (const goal of goals) {
    const primary = goal.fundedFromAccountIds[0];
    if (!primary) continue;

    const earmarkedBalance = goal.fundedFromAccountIds.reduce(
      (sum, id) => sum + includedBalance(plan.accounts, id),
      0,
    );
    const required = requiredAnnualContribution(goal, {
      currentYear: plan.settings.startYear,
      earmarkedBalance,
    });
    if (required <= 0) continue;

    rules.push({
      accountId: primary,
      ruleType: 'allocation',
      order: order++,
      config: { maxAnnual: required },
      sourceGoalId: goal.id,
    });
  }

  return rules;
}

/**
 * Re-derive a plan's goal rules and merge them into its hand-authored ones.
 * Every existing rule tagged with a `sourceGoalId` is dropped first — that is
 * the LAST run's derived output, now stale — and a fresh set is appended
 * after whatever the user authored directly, so a person's own rule ordering
 * is never disturbed by editing a goal. Call this whenever a plan's goals or
 * their earmarked accounts change; `run.ts` itself never calls it.
 */
export function mergeGoalRules(plan: Plan): PriorityRule[] {
  const authored = plan.rules.filter((r) => r.sourceGoalId === undefined);
  const nextOrder = 1 + authored.reduce((max, r) => Math.max(max, r.order), 0);
  return [...authored, ...goalsToAllocationRules(plan, nextOrder)];
}

export interface GoalYearProgress {
  year: number;
  /** Combined close balance of the goal's earmarked accounts that year. */
  balance: number;
  /** The target, if the goal has one. */
  target?: number;
  /** balance / target, clamped to [0, 1]. Undefined when there is no target. */
  fraction?: number;
}

export interface GoalProgress {
  goalId: string;
  name: string;
  kind: GoalKind;
  target?: number;
  byYear?: number;
  /** The earmarked balance in `byYear` (or the last projected year before it). */
  byYearBalance?: number;
  /** byYearBalance / target, clamped to [0, 1]. */
  byYearFraction?: number;
  /** True once the target is met by the date. */
  funded: boolean;
  /** Per-year earmarked balance across the whole projection. */
  years: GoalYearProgress[];
}

/**
 * Read each goal's funding progress out of a finished projection: the combined
 * balance of its earmarked accounts, per year, against its target. This is how
 * the House and Retirement lenses can show a funding ring without any lens
 * owning its own math — they are readings of the one shared result.
 */
export function goalFundingProgress(plan: Plan, result: PlanResult): GoalProgress[] {
  const goals = plan.goals ?? [];

  return goals.map((goal) => {
    const earmarked = new Set(goal.fundedFromAccountIds);
    const target = goal.targetAmount;

    const years: GoalYearProgress[] = result.years.map((snapshot) => {
      const balance = snapshot.accounts
        .filter((a) => earmarked.has(a.accountId) && !a.isLiability)
        .reduce((sum, a) => sum + a.close, 0);
      return {
        year: snapshot.year,
        balance,
        target,
        fraction: target && target > 0 ? clamp01(balance / target) : undefined,
      };
    });

    // The reading at the date: the year the goal is due, or the last projected
    // year if the horizon stops short of it.
    let atDate: GoalYearProgress | undefined;
    if (goal.byYear !== undefined) {
      atDate =
        years.find((y) => y.year === goal.byYear) ??
        years.filter((y) => y.year <= goal.byYear!).at(-1) ??
        years.at(-1);
    }

    const byYearBalance = atDate?.balance;
    const byYearFraction =
      target && target > 0 && byYearBalance !== undefined
        ? clamp01(byYearBalance / target)
        : undefined;

    return {
      goalId: goal.id,
      name: goal.name,
      kind: goal.kind,
      target,
      byYear: goal.byYear,
      byYearBalance,
      byYearFraction,
      funded:
        target !== undefined && byYearBalance !== undefined ? byYearBalance >= target : false,
      years,
    };
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
