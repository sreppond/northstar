/**
 * Plan health: "does this plan run out of money, and when?"
 * (docs/REDESIGN-V5.md §4.2).
 *
 * Why this exists. Net worth can stay positive for decades after the plan can
 * no longer pay its bills: home equity and locked retirement accounts hold the
 * line up while cash and the brokerage are already empty. So the net-worth
 * line never visibly fails. `spendable` is the money the plan could actually
 * spend, and it hits zero where the plan does.
 *
 * Shortfall years and the unfunded total come from `pathMarkers`
 * (`@northstar/engine`) and are not recomputed here.
 */
import { isWithdrawable, mandatoryEndYear, pathMarkers } from '@northstar/engine';
import type { Account, AccountClass, AccountYear, Plan, PlanResult, YearSnapshot } from '@northstar/engine';

export interface PlanHealth {
  status: 'ok' | 'short';
  firstShortYear?: number;
  /** Years the withdrawal waterfall ran dry, ascending. */
  shortYears: number[];
  /** Total unfunded across `shortYears`, in the result's own dollar mode. */
  unfundedTotal: number;
  /** Per year (parallel to `result.years`): the year-end balance that could be spent. */
  spendable: number[];
  /**
   * Identifies this particular failure so a dismissed alert stays dismissed
   * until it changes (docs/REDESIGN-V5.md §4.3): `${firstShortYear}:${unfundedTotal
   * rounded to the nearest $1,000}`, or `'ok'` when the plan is fine.
   */
  signature: string;
}

/**
 * Which account classes can ever count as spendable.
 *
 * Typed as a full `Record<AccountClass, boolean>` so adding a class to the
 * engine fails the typecheck here until someone decides which side it is on.
 *
 *  - cash, taxable brokerage: always the first money a plan spends.
 *  - tax-deferred (401k/IRA), tax-free (Roth) and variable annuity: spendable
 *    only once the per-account gates below say so. The engine happily draws
 *    them early at the cost of a 10% penalty, but a plan that survives only by
 *    paying that penalty is not "spendable" money, so the penalty is a gate
 *    here (spec: "can be drawn without penalty").
 *  - realEstate: illiquid, and the engine leaves it alone ("the waterfall
 *    leaves it alone by default"). This is exactly the money that hides a
 *    failing plan.
 *  - otherAsset: vehicles, collectibles and so on. Not cash in any horizon the
 *    plan reasons about.
 *  - liabilities: not assets. They are not netted off either (see below).
 */
const SPENDABLE_CLASS: Record<AccountClass, boolean> = {
  cash: true,
  taxableInvestment: true,
  taxDeferredInvestment: true,
  taxFreeInvestment: true,
  variableAnnuity: true,
  realEstate: false,
  otherAsset: false,
  creditCard: false,
  loan: false,
  mortgage: false,
};

/** Classes that are spendable with no further conditions (no plan to consult). */
const ALWAYS_SPENDABLE = new Set<AccountClass>(['cash', 'taxableInvestment']);

/**
 * @param plan The plan `result` was run from. Optional: without it only cash
 *   and taxable investments count (the safe side, since `AccountYear` carries
 *   a class but not the withdrawal settings). With it, each account is checked
 *   against the same gates the engine's withdrawal waterfall applies:
 *     1. a withdrawal priority rule names it (otherwise the engine never
 *        draws on it, whatever its timing says);
 *     2. `isWithdrawable` for that year (`withdrawalTiming` is not 'never',
 *        and 'starting_year' has arrived);
 *     3. it is not inside a committed SEPP window (the engine keeps ordinary
 *        withdrawals off a locked account; the SEPP pays out as income);
 *     4. the early-withdrawal penalty no longer applies (owner at or past
 *        `penaltyFreeAge`, or the account has no penalty).
 *
 * Because liabilities are not subtracted, `spendable <= netWorth` holds
 * whenever the plan's illiquid assets cover its debts (home equity >= 0).
 */
export function planHealth(result: PlanResult, plan?: Plan): PlanHealth {
  const markers = pathMarkers(result);
  const shortYears = markers.shortfallYears;
  const unfundedTotal = markers.shortfallTotal;
  const firstShortYear = shortYears[0];

  const gate = plan ? spendableGate(plan) : undefined;
  const spendable = result.years.map((snapshot) =>
    snapshot.accounts.reduce(
      (sum, row) => (isSpendable(row, snapshot, gate) ? sum + Math.max(0, row.close) : sum),
      0,
    ),
  );

  return {
    status: shortYears.length > 0 ? 'short' : 'ok',
    ...(firstShortYear !== undefined ? { firstShortYear } : {}),
    shortYears,
    unfundedTotal,
    spendable,
    signature:
      firstShortYear === undefined ? 'ok' : `${firstShortYear}:${Math.round(unfundedTotal / 1000) * 1000}`,
  };
}

type Gate = (account: Account, year: number, ages: YearSnapshot['ages']) => boolean;

function isSpendable(row: AccountYear, snapshot: YearSnapshot, gate: ReturnType<typeof spendableGate> | undefined): boolean {
  if (row.isLiability || !SPENDABLE_CLASS[row.accountClass]) return false;
  if (!gate) return ALWAYS_SPENDABLE.has(row.accountClass);
  // An account the plan doesn't list is one an event created (the home and its
  // mortgage), which the engine marks never-withdrawable.
  const account = gate.accounts.get(row.accountId);
  return account !== undefined && gate.check(account, snapshot.year, snapshot.ages);
}

function spendableGate(plan: Plan): { accounts: Map<string, Account>; check: Gate } {
  const accounts = new Map(plan.accounts.map((a) => [a.id, a]));
  const ruled = new Set(plan.rules.filter((r) => r.ruleType === 'withdrawal').map((r) => r.accountId));
  // Same fallback owner the engine uses for an account with none: the oldest
  // included adult (children never own accounts).
  const oldestAdult = plan.participants
    .filter((p) => p.isIncluded && p.role !== 'child')
    .reduce<Plan['participants'][number] | undefined>(
      (acc, p) => (acc === undefined || p.birthYear < acc.birthYear ? p : acc),
      undefined,
    );

  const check: Gate = (account, year, ages) => {
    if (!ruled.has(account.id) || !isWithdrawable(account, year)) return false;

    const ownerId = account.ownerParticipantId ?? oldestAdult?.id;
    const owner = ownerId ? plan.participants.find((p) => p.id === ownerId) : undefined;
    const age = ownerId ? ages[ownerId] : undefined;

    const sepp = account.seppElection;
    if (sepp && owner && year >= sepp.startYear && year <= mandatoryEndYear(sepp.startYear, owner.birthYear)) {
      return false;
    }

    // Mirrors tax.ts's `penaltyApplies` (private there): an unknown age or an
    // account with no penalty age never owes it.
    const penalised =
      account.penaltyRate > 0 &&
      account.penaltyFreeAge !== undefined &&
      age !== undefined &&
      age < account.penaltyFreeAge;
    return !penalised;
  };

  return { accounts, check };
}
