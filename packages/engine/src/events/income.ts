import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

export const incomeRaise = z.object({
  fromYear: z.number().int(),
  kind: z.enum(['percent', 'dollars']),
  value: z.number(),
});
export type IncomeRaise = z.infer<typeof incomeRaise>;

export const incomeOverride = z.object({
  year: z.number().int(),
  amount: z.number().min(0),
});
export type IncomeOverride = z.infer<typeof incomeOverride>;

export const incomeConfig = z.object({
  /** Whose income. Unset: the household's. */
  participantId: z.string().optional(),
  amount: z.number().min(0),
  endYear: z.number().int().optional(),
  /** Percent per year on top of the base amount. */
  growthRate: z.number().default(0),
  isTaxable: z.boolean().default(true),
  /** Wages, which retirement and career breaks suppress. */
  isEarned: z.boolean().default(false),
  /** Steps in the growth rate: each applies from `fromYear` until the next step. */
  raises: z.array(incomeRaise).optional(),
  /** An exact amount for one year; later years grow from it. */
  overrides: z.array(incomeOverride).optional(),
});
export type IncomeConfig = z.infer<typeof incomeConfig>;

/**
 * The yearly amount of an income line, nominal, keyed by year from `startYear`
 * through `endYear`. The compiler and the editor preview both read this, so
 * they cannot disagree.
 */
export function incomeAmounts(
  config: Pick<IncomeConfig, 'amount' | 'growthRate' | 'raises' | 'overrides'>,
  startYear: number,
  endYear: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const raises = config.raises ?? [];
  const overrides = new Map((config.overrides ?? []).map((o) => [o.year, o.amount]));

  // No steps: the closed form, kept verbatim so a plan saved before raises
  // existed projects bit-for-bit the same.
  if (raises.length === 0 && overrides.size === 0) {
    for (let year = startYear; year <= endYear; year++) {
      out.set(year, config.amount * Math.pow(1 + config.growthRate / 100, year - startYear));
    }
    return out;
  }

  let a = Math.max(0, overrides.get(startYear) ?? config.amount);
  for (let year = startYear; year <= endYear; year++) {
    if (year > startYear) {
      const override = overrides.get(year);
      if (override !== undefined) {
        a = override;
      } else {
        // The latest raise in effect; on a tie the later entry wins.
        let active: IncomeRaise | undefined;
        for (const r of raises) {
          if (r.fromYear <= year && (!active || r.fromYear >= active.fromYear)) active = r;
        }
        if (!active) a *= 1 + config.growthRate / 100;
        else if (active.kind === 'percent') a *= 1 + active.value / 100;
        else a += active.value;
        a = Math.max(0, a);
      }
    }
    out.set(year, a);
  }
  return out;
}

export const income: EventModule<IncomeConfig> = {
  kind: 'income',
  label: 'Income',
  code: 'INC',
  schema: incomeConfig,
  defaults: () => ({ amount: 25_000, growthRate: 0, isTaxable: true, isEarned: false }),

  compile(event: PlanEvent, config: IncomeConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const end = config.endYear ?? ctx.endYear;
    const amounts = incomeAmounts(config, event.startYear, end);

    for (const year of yearRange(event.startYear, end, ctx)) {
      out.cashFlows.push({
        year,
        kind: 'income',
        amount: amounts.get(year) ?? 0,
        label: event.name,
        sourceEventId: event.id,
        ownerId: config.participantId,
        taxable: config.isTaxable,
        isEarned: config.isEarned,
        recurring: true,
      });
    }
    return out;
  },
};
