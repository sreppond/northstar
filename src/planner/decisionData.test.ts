import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import { SAMPLE_PLANS } from './samplePlan';
import { retirementSources } from './retirementSources';
import { agesLineFor, dangerBandFor } from './decisionKit';
import { planHealth } from './health';
import { priceGrid, pricePoints } from './priceCurve';
import { currentTerms } from './homeView';
import { runsDryPlan, healthyPlan } from './planFixtures';

describe('retirementSources', () => {
  it('covers every dollar of income and recurring withdrawal exactly once, and leaves one-time costs out', () => {
    const plan = SAMPLE_PLANS[0];
    const result = runPlan(plan);
    const { series, need } = retirementSources(plan, result);

    expect(need).toHaveLength(result.years.length);
    result.years.forEach((y, i) => {
      const stacked = series.reduce((s, x) => s + x.values[i], 0);
      const lump = y.expenses.filter((e) => e.oneTime || e.category === 'annuityCharge').reduce((s, e) => s + e.amount, 0);
      const drawn = y.withdrawals.reduce((s, w) => s + w.amount, 0);
      expect(stacked).toBeCloseTo(y.totalIncome + Math.max(0, drawn - lump), 4);
      expect(need[i]).toBeCloseTo(y.totalExpenses - lump + y.totalTaxes, 4);
    });
    // The house plan buys a home in 2031: that year's down payment is not "need".
    const buy = result.years.findIndex((y) => y.expenses.some((e) => e.oneTime));
    expect(buy).toBeGreaterThanOrEqual(0);
    expect(need[buy]).toBeLessThan(result.years[buy].totalExpenses + result.years[buy].totalTaxes);
    expect(new Set(series.map((s) => s.key)).size).toBe(series.length);
  });

  it('draws the shortfall waterfall per account once the paycheck stops', () => {
    const plan = runsDryPlan();
    const result = runPlan(plan);
    const { series } = retirementSources(plan, result);
    expect(series.some((s) => s.key.startsWith('from:'))).toBe(true);
  });
});

describe('dangerBandFor / agesLineFor', () => {
  it('is only a band when the plan runs short, and reports that year\'s shortfall', () => {
    const dry = runsDryPlan();
    const dryResult = runPlan(dry);
    const band = dangerBandFor(planHealth(dryResult, dry), dryResult);
    expect(band?.from).toBe(planHealth(dryResult, dry).firstShortYear);
    expect(band?.shortFor?.(band.from)).toBeGreaterThan(0);

    const ok = healthyPlan();
    const okResult = runPlan(ok);
    expect(dangerBandFor(planHealth(okResult, ok), okResult)).toBeUndefined();
  });

  it('names each included adult with their age that year', () => {
    const plan = SAMPLE_PLANS[0];
    const result = runPlan(plan);
    const line = agesLineFor(plan, result)(result.years[0].year);
    expect(line).toMatch(/\d/);
    expect(agesLineFor(plan, result)(1900)).toBeUndefined();
  });
});

describe('priceCurve', () => {
  it('builds an even ladder on a round step, bounded in size', () => {
    const grid = priceGrid(100_000, 2_400_000);
    expect(grid.length).toBeLessThanOrEqual(40);
    expect(grid[0]).toBeGreaterThanOrEqual(100_000);
    expect(grid[grid.length - 1]).toBeGreaterThanOrEqual(2_400_000);
    const steps = new Set(grid.slice(1).map((p, i) => p - grid[i]));
    expect(steps.size).toBe(1);
  });

  it('housing share only rises with the price, so the zones read left to right', () => {
    const plan = SAMPLE_PLANS[0];
    const terms = currentTerms(plan);
    const points = pricePoints(plan, terms, [200_000, 600_000, 1_200_000]);
    expect(points).toHaveLength(3);
    const shares = points.map((p) => p.reading.housingShare);
    expect(shares[0]).toBeLessThan(shares[1]);
    expect(shares[1]).toBeLessThan(shares[2]);
  });
});
