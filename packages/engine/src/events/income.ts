import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

export const incomeConfig = z.object({
  amount: z.number().min(0),
  endYear: z.number().int().optional(),
  /** Percent per year on top of the base amount. */
  growthRate: z.number().default(0),
  isTaxable: z.boolean().default(true),
  /** Wages, which retirement and career breaks suppress. */
  isEarned: z.boolean().default(false),
});
export type IncomeConfig = z.infer<typeof incomeConfig>;

export const income: EventModule<IncomeConfig> = {
  kind: 'income',
  label: 'Income',
  code: 'INC',
  schema: incomeConfig,
  defaults: () => ({ amount: 25_000, growthRate: 0, isTaxable: true, isEarned: false }),

  compile(event: PlanEvent, config: IncomeConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const end = config.endYear ?? ctx.endYear;

    for (const year of yearRange(event.startYear, end, ctx)) {
      const elapsed = year - event.startYear;
      out.cashFlows.push({
        year,
        kind: 'income',
        amount: config.amount * Math.pow(1 + config.growthRate / 100, elapsed),
        label: event.name,
        sourceEventId: event.id,
        taxable: config.isTaxable,
        isEarned: config.isEarned,
      });
    }
    return out;
  },
};
