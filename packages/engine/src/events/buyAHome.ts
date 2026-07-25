import { z } from 'zod';
import type { Account, PlanEvent } from '../types.js';
import { monthlyPayment } from '../accounts.js';
import {
  type CompileContext,
  type EventModule,
  emptyCompiled,
  syntheticAccountDefaults,
  yearRange,
} from './kit.js';

export const buyAHomeConfig = z.object({
  price: z.number().min(0),
  downPaymentPercent: z.number().min(0).max(100).default(20),
  mortgageRate: z.number().min(0).default(6.5),
  termYears: z.number().int().min(1).default(30),
  closingCostPercent: z.number().min(0).default(3),
  /** Annual, on the appreciating value. */
  propertyTaxRate: z.number().min(0).default(1.1),
  insuranceAnnual: z.number().min(0).default(1_800),
  /** Annual, as a percent of value. */
  maintenancePercent: z.number().min(0).default(1),
  hoaMonthly: z.number().min(0).default(0),
  appreciationRate: z.number().default(3.5),
  sellYear: z.number().int().optional(),
  sellingCostPercent: z.number().min(0).max(100).default(6),
});
export type BuyAHomeConfig = z.infer<typeof buyAHomeConfig>;

/**
 * The reference implementation for a compound event (docs/PLAN.md §5.1).
 *
 * Creates TWO synthetic accounts -- an appreciating asset and an amortizing
 * liability -- both tagged with `sourceEventId` so deleting the event removes
 * both. The down payment is emitted as an ordinary expense so it flows through
 * the normal shortfall waterfall and drains whichever account the withdrawal
 * rules name. That is what makes brokerage balances drop in the purchase year
 * without any special-casing.
 *
 * The mortgage PAYMENT is deliberately NOT emitted here. Debt service is
 * produced by the year loop from the synthetic liability; emitting it here as
 * well would double-count it. This is the single easiest bug to ship in this
 * whole engine.
 */
export const buyAHome: EventModule<BuyAHomeConfig> = {
  kind: 'buyAHome',
  label: 'Buy a home',
  code: 'HSE',
  schema: buyAHomeConfig,
  defaults: () => ({
    price: 750_000,
    downPaymentPercent: 20,
    mortgageRate: 6.5,
    termYears: 30,
    closingCostPercent: 3,
    propertyTaxRate: 1.1,
    insuranceAnnual: 1_800,
    maintenancePercent: 1,
    hoaMonthly: 0,
    appreciationRate: 3.5,
    sellingCostPercent: 6,
  }),

  compile(event: PlanEvent, config: BuyAHomeConfig, ctx: CompileContext) {
    const out = emptyCompiled(event.id);
    const buyYear = event.startYear;
    if (buyYear > ctx.endYear) return out;

    const loanAmount = config.price * (1 - config.downPaymentPercent / 100);
    const downPayment = config.price * (config.downPaymentPercent / 100);
    const closingCosts = config.price * (config.closingCostPercent / 100);
    const lastYear = config.sellYear ? Math.min(config.sellYear, ctx.endYear) : ctx.endYear;

    const homeId = `${event.id}:home`;
    const mortgageId = `${event.id}:mortgage`;

    // --- synthetic accounts ------------------------------------------------
    const home: Account = {
      ...syntheticAccountDefaults(event.id),
      id: homeId,
      name: `${event.name} — property`,
      accountClass: 'realEstate',
      isLiability: false,
      initialBalance: config.price,
      startYear: buyYear,
      growthRateMethod: 'fixed',
      growthRate: config.appreciationRate,
    };

    const mortgage: Account = {
      ...syntheticAccountDefaults(event.id),
      id: mortgageId,
      name: `${event.name} — mortgage`,
      accountClass: 'mortgage',
      isLiability: true,
      initialBalance: loanAmount,
      startYear: buyYear,
      growthRateMethod: 'noChange',
      growthRate: 0,
      interestRate: config.mortgageRate,
      termYears: config.termYears,
      plannedPayment: monthlyPayment(loanAmount, config.mortgageRate, config.termYears) * 12,
    };

    out.accountsCreated.push(home, mortgage);

    // --- purchase-year outflow --------------------------------------------
    // Routed through the ordinary waterfall, which is what couples the home
    // purchase to the brokerage balance.
    if (buyYear >= ctx.startYear) {
      out.cashFlows.push({
        year: buyYear,
        kind: 'expense',
        amount: downPayment + closingCosts,
        label: `${event.name} — down payment & closing`,
        sourceEventId: event.id,
        category: 'housing',
      });
    }

    // --- carrying costs ----------------------------------------------------
    for (const year of yearRange(buyYear, lastYear, ctx)) {
      const value = config.price * Math.pow(1 + config.appreciationRate / 100, year - buyYear);
      const inflation = ctx.inflationAt(year) / ctx.inflationAt(buyYear);

      const propertyTax = value * (config.propertyTaxRate / 100);
      const maintenance = value * (config.maintenancePercent / 100);
      const insurance = config.insuranceAnnual * inflation;
      const hoa = config.hoaMonthly * 12 * inflation;

      const carrying = propertyTax + maintenance + insurance + hoa;
      if (carrying <= 0) continue;

      out.cashFlows.push({
        year,
        kind: 'expense',
        amount: carrying,
        label: `${event.name} — property tax, insurance & upkeep`,
        sourceEventId: event.id,
        category: 'housing',
      });
    }

    // --- optional sale -----------------------------------------------------
    // Terminating both synthetic accounts turns the property's balance into
    // sale proceeds and pays off the remaining mortgage, both through the
    // ordinary waterfalls. Selling costs are booked separately.
    if (config.sellYear && config.sellYear >= ctx.startYear && config.sellYear <= ctx.endYear) {
      const value =
        config.price * Math.pow(1 + config.appreciationRate / 100, config.sellYear - buyYear);

      out.accountTerminations.push(
        {
          year: config.sellYear,
          accountId: homeId,
          label: `${event.name} — sale proceeds`,
          sourceEventId: event.id,
        },
        {
          year: config.sellYear,
          accountId: mortgageId,
          label: `${event.name} — mortgage payoff`,
          sourceEventId: event.id,
        },
      );

      out.cashFlows.push({
        year: config.sellYear,
        kind: 'expense',
        amount: value * (config.sellingCostPercent / 100),
        label: `${event.name} — selling costs`,
        sourceEventId: event.id,
        category: 'housing',
      });
    }

    return out;
  },
};
