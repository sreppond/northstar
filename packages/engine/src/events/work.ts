import { z } from 'zod';
import type { PlanEvent } from '../types.js';
import { type CompileContext, type EventModule, emptyCompiled, yearRange } from './kit.js';

// ---------------------------------------------------------------------------
// New job
// ---------------------------------------------------------------------------

export const newJobConfig = z.object({
  salary: z.number().min(0),
  bonusPercent: z.number().min(0).default(0),
  /** Percent per year. */
  annualRaise: z.number().default(3),
  endYear: z.number().int().optional(),
  /** Percent of salary contributed to `contributionAccountId`. */
  retirementContributionPercent: z.number().min(0).max(100).default(0),
  /** Percent of salary the employer adds. Never touches cash flow. */
  employerMatchPercent: z.number().min(0).max(100).default(0),
  contributionAccountId: z.string().optional(),
  /** Traditional (pretax) vs Roth treatment for the employee contribution. */
  contributionIsPretax: z.boolean().default(true),
});
export type NewJobConfig = z.infer<typeof newJobConfig>;

export const newJob: EventModule<NewJobConfig> = {
  kind: 'newJob',
  label: 'New job',
  code: 'JOB',
  schema: newJobConfig,
  defaults: () => ({
    salary: 150_000,
    bonusPercent: 10,
    annualRaise: 3,
    retirementContributionPercent: 6,
    employerMatchPercent: 3,
    contributionIsPretax: true,
  }),

  compile(event: PlanEvent, config: NewJobConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const end = config.endYear ?? ctx.endYear;

    for (const year of yearRange(event.startYear, end, ctx)) {
      const base = config.salary * Math.pow(1 + config.annualRaise / 100, year - event.startYear);
      const total = base * (1 + config.bonusPercent / 100);

      out.cashFlows.push({
        year,
        kind: 'income',
        amount: total,
        label: event.name,
        sourceEventId: event.id,
        taxable: true,
        isEarned: true,
      });

      if (!config.contributionAccountId) continue;

      if (config.retirementContributionPercent > 0) {
        out.contributions.push({
          year,
          accountId: config.contributionAccountId,
          amount: base * (config.retirementContributionPercent / 100),
          label: `${event.name} — contribution`,
          sourceEventId: event.id,
          fromPaycheck: true,
          pretax: config.contributionIsPretax,
        });
      }

      if (config.employerMatchPercent > 0) {
        out.contributions.push({
          year,
          accountId: config.contributionAccountId,
          amount: base * (config.employerMatchPercent / 100),
          label: `${event.name} — employer match`,
          sourceEventId: event.id,
          fromPaycheck: false,
          pretax: true,
        });
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Career break
// ---------------------------------------------------------------------------

export const careerBreakConfig = z.object({
  durationYears: z.number().int().min(1).default(1),
  /** 0 = income fully stops. Expenses continue regardless. */
  incomeReplacementPercent: z.number().min(0).max(100).default(0),
});
export type CareerBreakConfig = z.infer<typeof careerBreakConfig>;

export const careerBreak: EventModule<CareerBreakConfig> = {
  kind: 'careerBreak',
  label: 'Career break',
  code: 'BRK',
  schema: careerBreakConfig,
  defaults: () => ({ durationYears: 1, incomeReplacementPercent: 0 }),

  compile(event: PlanEvent, config: CareerBreakConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    out.incomeSuppressions.push({
      fromYear: event.startYear,
      toYear: event.startYear + config.durationYears - 1,
      replacementPercent: config.incomeReplacementPercent,
      sourceEventId: event.id,
    });
    return out;
  },
};

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

export const retirementConfig = z.object({
  participantId: z.string().optional(),
  /** Percent change in baseline living expenses. -20 means spending falls 20%. */
  spendingChangePercent: z.number().default(-20),
});
export type RetirementConfig = z.infer<typeof retirementConfig>;

/**
 * Retirement stops earned income and standing contributions and shifts the
 * spending baseline. It deliberately does NOT rewrite withdrawal timing on
 * accounts -- that stays explicit in account settings and the withdrawal rule
 * order, so the plan does not silently start draining a 401(k).
 */
export const retirement: EventModule<RetirementConfig> = {
  kind: 'retirement',
  label: 'Retire',
  code: 'RET',
  schema: retirementConfig,
  defaults: () => ({ spendingChangePercent: -20 }),

  compile(event: PlanEvent, config: RetirementConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);

    out.incomeSuppressions.push({
      fromYear: event.startYear,
      toYear: ctx.endYear,
      replacementPercent: 0,
      sourceEventId: event.id,
    });

    out.expenseMultipliers.push({
      fromYear: event.startYear,
      toYear: ctx.endYear,
      multiplier: 1 + config.spendingChangePercent / 100,
      sourceEventId: event.id,
    });

    out.stopContributionsFrom = event.startYear;
    return out;
  },
};

// ---------------------------------------------------------------------------
// Social Security
// ---------------------------------------------------------------------------

export const socialSecurityConfig = z.object({
  participantId: z.string().optional(),
  annualBenefit: z.number().min(0),
  /** Cost-of-living adjustment, percent per year. */
  colaRate: z.number().default(2.5),
  /** Share of the benefit subject to income tax. */
  taxablePercent: z.number().min(0).max(100).default(85),
});
export type SocialSecurityConfig = z.infer<typeof socialSecurityConfig>;

export const socialSecurity: EventModule<SocialSecurityConfig> = {
  kind: 'socialSecurity',
  label: 'Social Security',
  code: 'SSA',
  schema: socialSecurityConfig,
  defaults: () => ({ annualBenefit: 30_000, colaRate: 2.5, taxablePercent: 85 }),

  compile(event: PlanEvent, config: SocialSecurityConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);

    for (const year of yearRange(event.startYear, ctx.endYear, ctx)) {
      const benefit =
        config.annualBenefit * Math.pow(1 + config.colaRate / 100, year - event.startYear);
      const taxable = benefit * (config.taxablePercent / 100);

      // Split so only the taxable share hits ordinary income.
      out.cashFlows.push({
        year,
        kind: 'income',
        amount: taxable,
        label: event.name,
        sourceEventId: event.id,
        taxable: true,
        isEarned: false,
      });

      if (benefit - taxable > 0) {
        out.cashFlows.push({
          year,
          kind: 'income',
          amount: benefit - taxable,
          label: `${event.name} — untaxed portion`,
          sourceEventId: event.id,
          taxable: false,
          isEarned: false,
        });
      }
    }
    return out;
  },
};
