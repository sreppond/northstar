import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

// ---------------------------------------------------------------------------
// Have a kid
// ---------------------------------------------------------------------------

export const haveAKidConfig = z.object({
  /** One-off costs at birth — hospital, gear, the nursery. */
  upfrontCost: z.number().min(0).default(4_500),
  annualCost: z.number().min(0).default(18_000),
  /** How many years the annual cost runs, counting the birth year. */
  supportYears: z.number().int().min(0).default(18),
  /**
   * Percent per year the annual cost grows. Separate from the plan's inflation
   * because raising a child gets more expensive faster than the basket does.
   */
  costGrowthRate: z.number().default(3),
  collegeStartAge: z.number().int().min(0).optional(),
  collegeAnnualCost: z.number().min(0).default(0),
  collegeYears: z.number().int().min(0).default(4),
});
export type HaveAKidConfig = z.infer<typeof haveAKidConfig>;

export const haveAKid: EventModule<HaveAKidConfig> = {
  kind: 'haveAKid',
  label: 'Have a kid',
  code: 'KID',
  schema: haveAKidConfig,
  defaults: () => ({
    upfrontCost: 4_500,
    annualCost: 18_000,
    supportYears: 18,
    costGrowthRate: 3,
    collegeStartAge: 18,
    collegeAnnualCost: 30_000,
    collegeYears: 4,
  }),

  compile(event: PlanEvent, config: HaveAKidConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const birthYear = event.startYear;
    // The event's own growth rate, not the plan's inflation.
    const grow = (year: number) => Math.pow(1 + config.costGrowthRate / 100, year - birthYear);

    if (birthYear >= ctx.startYear && birthYear <= ctx.endYear && config.upfrontCost > 0) {
      out.cashFlows.push({
        year: birthYear,
        kind: 'expense',
        amount: config.upfrontCost,
        label: `${event.name} — upfront`,
        sourceEventId: event.id,
        category: 'children',
      });
    }

    // Annual support runs FROM the birth year: a newborn costs money in year
    // one, and the upfront figure covers the one-off extras on top.
    for (const year of yearRange(birthYear, birthYear + config.supportYears - 1, ctx)) {
      out.cashFlows.push({
        year,
        kind: 'expense',
        amount: config.annualCost * grow(year),
        label: event.name,
        sourceEventId: event.id,
        category: 'children',
      });
    }

    if (config.collegeStartAge !== undefined && config.collegeAnnualCost > 0) {
      const from = birthYear + config.collegeStartAge;
      for (const year of yearRange(from, from + config.collegeYears - 1, ctx)) {
        out.cashFlows.push({
          year,
          kind: 'expense',
          amount: config.collegeAnnualCost * grow(year),
          label: `${event.name} — college`,
          sourceEventId: event.id,
          category: 'education',
        });
      }
    }

    return out;
  },
};

// ---------------------------------------------------------------------------
// End of plan
// ---------------------------------------------------------------------------

export const endOfPlanConfig = z.object({});
export type EndOfPlanConfig = z.infer<typeof endOfPlanConfig>;

/**
 * Sets the projection horizon. Exactly one per plan, `isRequired`, and it
 * cannot be deleted -- matching the ghost pin at the end of Monarch's chart.
 */
export const endOfPlan: EventModule<EndOfPlanConfig> = {
  kind: 'endOfPlan',
  label: 'End of plan',
  code: 'END',
  schema: endOfPlanConfig,
  defaults: () => ({}),

  compile(event: PlanEvent) {
    const out = emptyCompiled(event.id);
    out.horizon = event.startYear;
    return out;
  },
};
