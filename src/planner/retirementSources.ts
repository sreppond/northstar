/**
 * "What pays for each year" (docs/REDESIGN-V5.md §5.5, the v4 SourceStack
 * idea): every dollar that covers a year, by where it came from, plus the
 * year's spending need. Pure, so the Retirement hero is tested without a
 * component tree.
 *
 * Sources, bottom to top: pay and other income, Social Security, the SEPP,
 * required minimum distributions, then the shortfall waterfall's draws, one
 * series per account. Income lines already include the SEPP and the RMDs (the
 * engine pays them as income, `run.ts` steps 7.5-7.6); `withdrawals` holds
 * only the ordinary draws, so nothing is counted twice.
 *
 * One-time costs (a home's down payment, a surrender charge) are left out of
 * both sides. A $600K down payment would otherwise tower over the year it
 * lands in and flatten the retirement story the chart is for; the draws that
 * paid for it are taken back out of the withdrawals, proportionally, so the
 * stack still meets the (recurring) need.
 */
import type { LineItem, Plan, PlanResult } from '@northstar/engine';
import { accountClassColor } from './ui';
import { planHealth } from './health';

export interface SourceSeries {
  key: string;
  label: string;
  color: string;
  /** Parallel to `result.years`. */
  values: number[];
}

export interface RetirementSources {
  series: SourceSeries[];
  /** Spending plus tax per year: the line the stack has to reach. */
  need: number[];
}

type Bucket = 'pay' | 'socialSecurity' | 'sepp' | 'rmd';

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: 'pay', label: 'Pay & other income', color: 'var(--in)' },
  { key: 'socialSecurity', label: 'Social Security', color: 'var(--data-nw)' },
  { key: 'sepp', label: 'SEPP', color: 'var(--cmp)' },
  // V5-REVIEW-3 m1: RMDs come out of tax-deferred money, so a tint of its gold
  // (--mix-3). `--mix-6` is Cash's account hue and shares this legend.
  { key: 'rmd', label: 'Required distributions', color: 'color-mix(in srgb, var(--mix-3) 55%, var(--surface))' },
];

export function retirementSources(plan: Pick<Plan, 'events' | 'accounts'>, result: PlanResult): RetirementSources {
  const kindOf = new Map(plan.events.map((e) => [e.id, e.kind]));
  const bucketOf = (line: LineItem): Bucket => {
    if (line.category === 'sepp') return 'sepp';
    if (line.label.startsWith('Required minimum distribution')) return 'rmd';
    if (line.sourceEventId && kindOf.get(line.sourceEventId) === 'socialSecurity') return 'socialSecurity';
    return 'pay';
  };

  const income = new Map<Bucket, number[]>(BUCKETS.map((b) => [b.key, result.years.map(() => 0)]));
  const draws = new Map<string, { label: string; accountClass: string; values: number[] }>();
  const accountById = new Map(plan.accounts.map((a) => [a.id, a]));

  const lumps = result.years.map((y) =>
    y.expenses.filter((e) => e.oneTime || e.category === 'annuityCharge').reduce((sum, e) => sum + e.amount, 0),
  );

  result.years.forEach((y, i) => {
    for (const line of y.income) income.get(bucketOf(line))![i] += line.amount;
    const drawn = y.withdrawals.reduce((sum, w) => sum + w.amount, 0);
    const keep = drawn > 0 ? Math.max(0, drawn - lumps[i]) / drawn : 0;
    for (const w of y.withdrawals) {
      const id = w.accountId ?? w.label;
      let d = draws.get(id);
      if (!d) {
        const account = accountById.get(id);
        d = { label: account?.name ?? w.label.replace(/^From /, ''), accountClass: account?.accountClass ?? 'taxableInvestment', values: result.years.map(() => 0) };
        draws.set(id, d);
      }
      d.values[i] += w.amount * keep;
    }
  });

  const series: SourceSeries[] = [];
  for (const b of BUCKETS) {
    const values = income.get(b.key)!;
    if (values.some((v) => v > 0.5)) series.push({ ...b, values });
  }
  // Two accounts of one class would share a hue; the later ones step lighter
  // so the stack's layers stay tellable apart.
  const used = new Map<string, number>();
  for (const [id, d] of draws) {
    if (!d.values.some((v) => v > 0.5)) continue;
    const base = accountClassColor(d.accountClass as Parameters<typeof accountClassColor>[0]);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const color = n === 0 ? base : `color-mix(in srgb, ${base} ${Math.max(35, 100 - n * 28)}%, var(--surface))`;
    series.push({ key: `from:${id}`, label: d.label, color, values: d.values });
  }

  return { series, need: result.years.map((y, i) => y.totalExpenses - lumps[i] + y.totalTaxes) };
}

/** Classes whose balance the plan could spend if its settings let it (health.ts's list). */
const INVESTABLE_CLASSES = new Set(['cash', 'taxableInvestment', 'taxDeferredInvestment', 'taxFreeInvestment', 'variableAnnuity']);

/**
 * Cash and investments split into "can spend now" and "locked" (V5-REVIEW-1 F8).
 * `spendable` is `PlanHealth.spendable`: the year-end balance that passes every
 * withdrawal rule (a priority rule names the account, its timing allows it, no
 * SEPP window, no early-withdrawal penalty). Locked is the rest of the
 * spendable-capable accounts: money that exists but that this plan will not
 * draw on, which is how a plan runs dry with a 401(k) full. Both parallel
 * `result.years`, and they sum to the total.
 */
export function investableSplit(
  result: PlanResult,
  spendable: number[],
  /** `spendableIgnoringPenalty`: lets the split name the money that is only gated by the 10% penalty. */
  spendableNoPenalty?: number[],
): { canSpend: number[]; penalty: number[]; locked: number[] } {
  const canSpend: number[] = [];
  const penalty: number[] = [];
  const locked: number[] = [];
  result.years.forEach((y, i) => {
    const total = y.accounts
      .filter((a) => !a.isLiability && INVESTABLE_CLASSES.has(a.accountClass))
      .reduce((sum, a) => sum + Math.max(0, a.close), 0);
    const free = Math.min(total, spendable[i] ?? 0);
    // V5-REVIEW-2 N5: money held back ONLY by the early-withdrawal penalty is
    // not locked. The engine will draw it (paying the 10%), so it gets a band of
    // its own instead of reading as "Locked" next to a plan that spends it.
    const freeIfPenaltyPaid = Math.min(total, spendableNoPenalty?.[i] ?? spendable[i] ?? 0);
    const withPenalty = Math.max(0, freeIfPenaltyPaid - free);
    canSpend.push(free);
    penalty.push(withPenalty);
    locked.push(total - free - withPenalty);
  });
  return { canSpend, penalty, locked };
}

/**
 * `PlanHealth.spendable` with the early-withdrawal penalty gate switched off:
 * the same rule set (`health.ts`), run on a copy of the plan whose accounts owe
 * no penalty, so this never drifts from what "spendable" means elsewhere. The
 * gap between the two is the "With 10% penalty" band.
 */
export function spendableIgnoringPenalty(plan: Plan, result: PlanResult): number[] {
  return planHealth(result, { ...plan, accounts: plan.accounts.map((a) => ({ ...a, penaltyRate: 0 })) }).spendable;
}
