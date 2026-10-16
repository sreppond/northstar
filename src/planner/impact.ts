/**
 * The Impact strip's numbers (docs/REDESIGN-V4.md §1.3): the same handful of
 * consequences read off any plan, so a change made anywhere — rent on Budget,
 * a leave on Family — is judged by the same yardstick, current vs draft,
 * without leaving the page.
 */
import type { Plan, PlanResult } from '@northstar/engine';
import { deflate, runPlan } from '@northstar/engine';
import { budgetView } from './budgetView';

export interface ImpactMetrics {
  /** The year `leftToSave`/`savingsRate` are read in. */
  year: number;
  /** After-tax income minus recurring spending, per month. */
  leftToSave: number;
  savingsRate?: number;
  /** Net worth the year the younger adult turns 60, if the plan reaches it. */
  netWorthAt60?: { year: number; value: number };
  /** First year the plan can't pay its bills; undefined if it never runs dry. */
  runsDryYear?: number;
}

/** The plan's result in the units the user reads (today's or future dollars). */
export function presentResult(plan: Plan, nominal: PlanResult = runPlan(plan)): PlanResult {
  return plan.settings.dollarMode === 'todaysDollars' ? deflate(nominal, plan.settings.inflationRate) : nominal;
}

export function impactMetrics(plan: Plan, result: PlanResult, year: number): ImpactMetrics {
  const snapshot = result.years.find((y) => y.year === year) ?? result.years[0];
  const view = budgetView(plan, snapshot);

  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const youngest = adults.length ? Math.max(...adults.map((p) => p.birthYear)) : undefined;
  const at60 = youngest !== undefined ? result.years.find((y) => y.year === youngest + 60) : undefined;

  return {
    year: snapshot.year,
    leftToSave: view.saved,
    savingsRate: view.savingsRate,
    ...(at60 ? { netWorthAt60: { year: at60.year, value: at60.netWorth } } : {}),
    runsDryYear: result.years.find((y) => (y.unfundedShortfall ?? 0) > 1)?.year,
  };
}
