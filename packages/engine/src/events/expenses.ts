import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

export const annualExpenseConfig = z.object({
  amount: z.number().min(0),
  endYear: z.number().int().optional(),
  /** Grow with the plan's inflation rate. */
  inflates: z.boolean().default(true),
  /**
   * Overrides the plan's inflation rate when set. Some costs have their own
   * curve — health insurance and tuition do not track the general basket, and
   * forcing them to is how a thirty-year projection drifts.
   */
  growthRate: z.number().optional(),
});
export type AnnualExpenseConfig = z.infer<typeof annualExpenseConfig>;

export const annualExpense: EventModule<AnnualExpenseConfig> = {
  kind: 'annualExpense',
  label: 'Recurring expense',
  code: 'EXP',
  schema: annualExpenseConfig,
  defaults: () => ({ amount: 12_000, inflates: true }),

  compile(event: PlanEvent, config: AnnualExpenseConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const end = config.endYear ?? ctx.endYear;

    for (const year of yearRange(event.startYear, end, ctx)) {
      const factor = !config.inflates
        ? 1
        : config.growthRate !== undefined
          ? Math.pow(1 + config.growthRate / 100, year - event.startYear)
          : ctx.inflationAt(year) / ctx.inflationAt(event.startYear);
      out.cashFlows.push({
        year,
        kind: 'expense',
        amount: config.amount * factor,
        label: event.name,
        sourceEventId: event.id,
      });
    }
    return out;
  },
};

export const otherExpenseConfig = z.object({
  amount: z.number().min(0),
});
export type OtherExpenseConfig = z.infer<typeof otherExpenseConfig>;

export const otherExpense: EventModule<OtherExpenseConfig> = {
  kind: 'otherExpense',
  label: 'One-time expense',
  code: 'EXP',
  schema: otherExpenseConfig,
  defaults: () => ({ amount: 10_000 }),

  compile(event: PlanEvent, config: OtherExpenseConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    if (event.startYear < ctx.startYear || event.startYear > ctx.endYear) return out;

    out.cashFlows.push({
      year: event.startYear,
      kind: 'expense',
      amount: config.amount,
      label: event.name,
      sourceEventId: event.id,
    });
    return out;
  },
};

export const windfallConfig = z.object({
  amount: z.number().min(0),
  /** Percent withheld. Emitted as its own tax line so it shows in the tax section. */
  taxRate: z.number().min(0).max(100).default(0),
});
export type WindfallConfig = z.infer<typeof windfallConfig>;

export const windfall: EventModule<WindfallConfig> = {
  kind: 'windfall',
  label: 'Windfall',
  code: 'WND',
  schema: windfallConfig,
  defaults: () => ({ amount: 50_000, taxRate: 20 }),

  compile(event: PlanEvent, config: WindfallConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    if (event.startYear < ctx.startYear || event.startYear > ctx.endYear) return out;

    out.cashFlows.push({
      year: event.startYear,
      kind: 'income',
      amount: config.amount,
      label: event.name,
      sourceEventId: event.id,
      // Taxed by its own line below, not by the plan's ordinary income rate.
      taxable: false,
      isEarned: false,
    });

    if (config.taxRate > 0) {
      out.cashFlows.push({
        year: event.startYear,
        kind: 'expense',
        amount: config.amount * (config.taxRate / 100),
        label: `${event.name} — tax`,
        sourceEventId: event.id,
        category: 'tax',
      });
    }
    return out;
  },
};
