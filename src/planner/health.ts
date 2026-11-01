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
import type { DangerBand } from './charts/types';
import { money } from './format';

/**
 * Why money that exists is not being spent (V5-REVIEW-1 F6). Checked in this
 * order, first match wins:
 *  - `never`: the account's `withdrawalTiming` is `'never'`, or it is
 *    `'starting_year'` and that year has not arrived. The timing gate is shut.
 *  - `noRule`: no withdrawal priority rule names the account (or the plan
 *    doesn't list it), so the engine never draws on it whatever its timing.
 *  - `sepp`: inside a committed SEPP window; the SEPP pays out as income and
 *    ordinary withdrawals stay off the account.
 *  - `penalty`: the owner is under `penaltyFreeAge`, so a draw would owe the
 *    early-withdrawal penalty and `isSpendable` treats it as not spendable.
 *    Excluded from `stranded`: the engine DOES draw these accounts, at a 10%
 *    penalty (V5-REVIEW-2 N5), so "held back" would be false. The reason stays
 *    in the type because it gates the spendable figure (§4.2).
 */
export type StrandedReason = 'never' | 'noRule' | 'sepp' | 'penalty';

/** One account holding a balance the plan will not spend (see `PlanHealth.stranded`). */
export interface StrandedAccount {
  accountId: string;
  accountClass: AccountClass;
  /** Year-end balance at `firstShortYear`, in the result's own dollar mode. */
  balance: number;
  reason: StrandedReason;
}

export interface PlanHealth {
  status: 'ok' | 'short';
  firstShortYear?: number;
  /** Years the plan is short (a new shortfall, or an overdrawn balance still owed), ascending. */
  shortYears: number[];
  /** The last of `shortYears`: the last year still owing. Undefined when the plan is fine. */
  lastShortYear?: number;
  /** Total NEW unfunded across `shortYears` (sum of `unfundedShortfall`), in the result's own dollar mode. */
  unfundedTotal: number;
  /** The largest overdrawn balance carried at any year end, in the result's own dollar mode. 0 when never overdrawn. */
  overdrawnPeak: number;
  /** Per year (parallel to `result.years`): the year-end balance that could be spent. */
  spendable: number[];
  /**
   * PUBLIC CONTRACT (V5-REVIEW-1 F6, consumed by PlanHealthAlert and the pages):
   * the accounts that still hold money at `firstShortYear` but that the plan
   * cannot spend, with the reason, largest balance first. It is what separates
   * "the plan really runs out" from "the plan runs dry while $876K sits in a
   * 401(k) set to never withdraw", a settings artefact the user can fix.
   * Empty when the plan is fine, or when `planHealth` was called without the
   * plan (the withdrawal settings live there, not on the result).
   * Only spendable-capable classes appear (cash, brokerage, tax-deferred,
   * tax-free, variable annuity); home equity and the like are not "stranded".
   */
  stranded: StrandedAccount[];
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
  const lastShortYear = shortYears[shortYears.length - 1];

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
    ...(lastShortYear !== undefined ? { lastShortYear } : {}),
    shortYears,
    unfundedTotal,
    overdrawnPeak: markers.overdrawnPeak,
    spendable,
    stranded: plan && gate && firstShortYear !== undefined ? strandedAt(result, gate, firstShortYear) : [],
    signature:
      firstShortYear === undefined ? 'ok' : `${firstShortYear}:${Math.round(unfundedTotal / 1000) * 1000}`,
  };
}

/**
 * The one wording of an overdrawn plan, shared by the alert, the sidebar pill
 * and the Net Worth reading (docs/V6.1-PLAN.md B2): the years it owes money, and
 * the largest balance it carries. "Overdrawn from 2034 to 2036" with "up to
 * $207K", or "Overdrawn in 2034" with "$207K". Takes the bare numbers so
 * `PlanHealth` and the engine's `PathMarkers` both feed it.
 */
export function overdrawnWording(from: number, to: number, peak: number): { span: string; amount: string } {
  const amount = money(peak);
  return to === from
    ? { span: `Overdrawn in ${from}`, amount }
    : { span: `Overdrawn from ${from} to ${to}`, amount: `up to ${amount}` };
}

/** `overdrawnWording` for a plan's health; undefined when the plan is fine. */
export function overdrawnSummary(health: PlanHealth): { span: string; amount: string } | undefined {
  const from = health.firstShortYear;
  if (from === undefined) return undefined;
  return overdrawnWording(from, health.lastShortYear ?? from, health.overdrawnPeak);
}

/**
 * PUBLIC CONTRACT (V5-REVIEW-1 F2): the `danger` prop for every `TimeSeriesChart`
 * on the danger path. Built from `health.shortYears`, so the hatch covers each
 * contiguous run of short years (a plan that runs dry, recovers and runs dry
 * again gets two bands) and the readout's red "Short" pill shows only inside
 * them. Pages must use this rather than `{ from: health.firstShortYear }`,
 * which hatches everything after the first short year.
 *
 * `perUnit` divides the Short amount for pages that show per-month figures
 * (pass 12) so the pill uses the page's unit; pair it with
 * `ChartReadout`'s `shortUnit` suffix (F10). Undefined when the plan is fine.
 *
 * `shortFor` is the year's NEW shortfall only. A year that merely carries an
 * earlier overdrawn balance has no new amount, and its readout pill says
 * "Overdrawn" without one rather than printing a balance as a per-period figure.
 */
export function healthDangerBand(health: PlanHealth, result: PlanResult, perUnit = 1): DangerBand | undefined {
  if (health.status !== 'short' || health.firstShortYear === undefined) return undefined;
  const byYear = new Map(result.years.map((y) => [y.year, y.unfundedShortfall]));
  return {
    from: health.firstShortYear,
    to: health.shortYears[health.shortYears.length - 1],
    years: health.shortYears,
    shortFor: (year) => {
      const v = byYear.get(year);
      return v === undefined ? undefined : v / perUnit;
    },
  };
}

type Gate = (account: Account, year: number, ages: YearSnapshot['ages']) => boolean;
type BlockReason = (account: Account, year: number, ages: YearSnapshot['ages']) => StrandedReason | null;

function strandedAt(result: PlanResult, gate: ReturnType<typeof spendableGate>, year: number): StrandedAccount[] {
  const snapshot = result.years.find((y) => y.year === year);
  if (!snapshot) return [];
  const out: StrandedAccount[] = [];
  for (const row of snapshot.accounts) {
    if (row.isLiability || !SPENDABLE_CLASS[row.accountClass] || !(row.close > 0)) continue;
    const account = gate.accounts.get(row.accountId);
    // Accounts an event created (the home) aren't the user's to unlock.
    if (!account) continue;
    const reason = gate.blockReason(account, snapshot.year, snapshot.ages);
    // V5-REVIEW-2 N5: a penalty-age account is not stranded; the engine drains
    // it (paying the penalty in its tax) before it lets the plan run dry.
    if (reason && reason !== 'penalty') out.push({ accountId: row.accountId, accountClass: row.accountClass, balance: row.close, reason });
  }
  return out.sort((a, b) => b.balance - a.balance);
}

function isSpendable(row: AccountYear, snapshot: YearSnapshot, gate: ReturnType<typeof spendableGate> | undefined): boolean {
  if (row.isLiability || !SPENDABLE_CLASS[row.accountClass]) return false;
  if (!gate) return ALWAYS_SPENDABLE.has(row.accountClass);
  // An account the plan doesn't list is one an event created (the home and its
  // mortgage), which the engine marks never-withdrawable.
  const account = gate.accounts.get(row.accountId);
  return account !== undefined && gate.check(account, snapshot.year, snapshot.ages);
}

function spendableGate(plan: Plan): { accounts: Map<string, Account>; check: Gate; blockReason: BlockReason } {
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

  const blockReason: BlockReason = (account, year, ages) => {
    if (!isWithdrawable(account, year)) return 'never';
    if (!ruled.has(account.id)) return 'noRule';

    const ownerId = account.ownerParticipantId ?? oldestAdult?.id;
    const owner = ownerId ? plan.participants.find((p) => p.id === ownerId) : undefined;
    const age = ownerId ? ages[ownerId] : undefined;

    const sepp = account.seppElection;
    if (sepp && owner && year >= sepp.startYear && year <= mandatoryEndYear(sepp.startYear, owner.birthYear)) {
      return 'sepp';
    }

    // Mirrors tax.ts's `penaltyApplies` (private there): an unknown age or an
    // account with no penalty age never owes it.
    const penalised =
      account.penaltyRate > 0 &&
      account.penaltyFreeAge !== undefined &&
      age !== undefined &&
      age < account.penaltyFreeAge;
    return penalised ? 'penalty' : null;
  };

  // `isSpendable` and the stranded list share the one rule set above, so they
  // can't disagree about which accounts count.
  const check: Gate = (account, year, ages) => blockReason(account, year, ages) === null;

  return { accounts, check, blockReason };
}
