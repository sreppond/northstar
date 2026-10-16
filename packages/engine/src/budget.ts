/**
 * The household budget, compiled into the same schedules events produce
 * (docs/REDESIGN-V4.md §4.2, §5). Runs in `runPlan`'s compile phase alongside
 * the events, so a budget line is just another expense — it flows through the
 * same shortfall waterfall, the same tax, the same partial first year — while
 * carrying who it belongs to and whether it is essential, which the Budget
 * and Family pages read back off the result.
 */
import { resolveAnchor, type AnchorScope } from './anchors.js';
import type { CashFlowItem, CompileContext, ContributionItem } from './events/kit.js';
import { yearRange } from './events/kit.js';
import type { BudgetLine, Plan } from './types.js';

export interface CompiledBudget {
  cashFlows: CashFlowItem[];
  contributions: ContributionItem[];
  warnings: string[];
}

/** The years a line applies: `[from, until)`, clamped to the projection. Empty when it never starts. */
export function budgetLineYears(line: BudgetLine, scope: AnchorScope, ctx: Pick<CompileContext, 'startYear' | 'endYear'>): number[] {
  const from = line.from ? resolveAnchor(line.from, scope) : ctx.startYear;
  if (from === undefined) return [];
  const until = line.until ? resolveAnchor(line.until, scope) : undefined;

  const paused = (line.pauses ?? []).map((p) => [resolveAnchor(p.from, scope), resolveAnchor(p.until, scope)] as const);
  const running = (year: number) => !paused.some(([a, b]) => a !== undefined && b !== undefined && year >= a && year < b);

  if (line.cadence === 'once') {
    return from >= ctx.startYear && from <= ctx.endYear && (until === undefined || from < until) && running(from) ? [from] : [];
  }
  return yearRange(from, until === undefined ? ctx.endYear : until - 1, ctx as CompileContext).filter(running);
}

/** Today's-dollar `amount` grown to `year`, per the line's growth rule. */
export function budgetGrowthFactor(line: BudgetLine, year: number, ctx: Pick<CompileContext, 'startYear' | 'inflationAt'>): number {
  const growth = line.growth ?? { kind: 'inflation' };
  switch (growth.kind) {
    case 'none':
      return 1;
    case 'fixed':
      return Math.pow(1 + growth.rate / 100, year - ctx.startYear);
    case 'inflation':
      return ctx.inflationAt(year);
  }
}

export function compileBudget(plan: Pick<Plan, 'budget' | 'events' | 'participants' | 'accounts'>, ctx: CompileContext): CompiledBudget {
  const out: CompiledBudget = { cashFlows: [], contributions: [], warnings: [] };
  const scope: AnchorScope = { events: plan.events, participants: plan.participants };
  const children = new Set(plan.participants.filter((p) => p.role === 'child').map((p) => p.id));
  const accountIds = new Set(plan.accounts.filter((a) => a.isIncluded).map((a) => a.id));

  for (const line of plan.budget ?? []) {
    if (!line.isIncluded || line.amount <= 0) continue;

    const ownerId = line.owner === 'shared' ? undefined : line.owner;
    const annual = line.cadence === 'monthly' ? line.amount * 12 : line.amount;
    const recurring = line.cadence === 'monthly';

    if (line.kind === 'saving' && !(line.accountId && accountIds.has(line.accountId))) {
      out.warnings.push(`${line.name}: no account to save into, so it is left out.`);
      continue;
    }

    for (const year of budgetLineYears(line, scope, ctx)) {
      const amount = annual * budgetGrowthFactor(line, year, ctx);

      if (line.kind === 'saving') {
        out.contributions.push({
          year,
          accountId: line.accountId!,
          amount,
          label: line.name,
          sourceEventId: '',
          fromPaycheck: true,
          pretax: false,
          recurring,
          ownerId,
          budgetLineId: line.id,
        });
        continue;
      }

      out.cashFlows.push({
        year,
        kind: 'expense',
        amount,
        label: line.name,
        category: line.category,
        ownerId,
        budgetLineId: line.id,
        essential: line.essential,
        // A child's costs follow the child, not the parents' retirement.
        scalesWithSpending: !(ownerId && children.has(ownerId)),
        recurring,
      });
    }
  }

  return out;
}
