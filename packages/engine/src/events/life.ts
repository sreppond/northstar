import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

// ---------------------------------------------------------------------------
// Have a kid
// ---------------------------------------------------------------------------

export const haveAKidConfig = z.object({
  /** Birth year carries a one-off higher cost. */
  firstYearCost: z.number().min(0).default(22_500),
  annualCost: z.number().min(0).default(18_000),
  supportUntilAge: z.number().int().min(0).default(18),
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
    firstYearCost: 22_500,
    annualCost: 18_000,
    supportUntilAge: 18,
    collegeStartAge: 18,
    collegeAnnualCost: 30_000,
    collegeYears: 4,
  }),

  compile(event: PlanEvent, config: HaveAKidConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const birthYear = event.startYear;
    const inflate = (year: number) => ctx.inflationAt(year) / ctx.inflationAt(birthYear);

    if (birthYear >= ctx.startYear && birthYear <= ctx.endYear) {
      out.cashFlows.push({
        year: birthYear,
        kind: 'expense',
        amount: config.firstYearCost,
        label: `${event.name} — first year`,
        sourceEventId: event.id,
        category: 'children',
      });
    }

    for (const year of yearRange(birthYear + 1, birthYear + config.supportUntilAge - 1, ctx)) {
      out.cashFlows.push({
        year,
        kind: 'expense',
        amount: config.annualCost * inflate(year),
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
          amount: config.collegeAnnualCost * inflate(year),
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
