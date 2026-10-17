import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan, PlanResult } from '@northstar/engine';
import { planHealth } from '../health';
import { runsDryPlan, healthyPlan, kitchenSinkPlan } from '../planFixtures';
import { SAMPLE_PLANS } from '../samplePlan';
import { toHouseholdModel } from '../household';
import {
  agesLabel,
  classBalanceAt,
  dangerBand,
  eventMarkers,
  flowSteps,
  groupMonthlySeries,
  presentClasses,
  spendingModel,
} from './netWorthData';

const plans: [string, Plan][] = [
  ['sample house', SAMPLE_PLANS[0]],
  ['sample retirement', SAMPLE_PLANS[1]],
  ['household model', toHouseholdModel(SAMPLE_PLANS[0]).plan],
  ['kitchen sink', kitchenSinkPlan()],
];

describe('flowSteps: the account sheet waterfall always adds up', () => {
  it.each(plans)('%s: every class, every year reconciles open to close', (_n, plan) => {
    const result = runPlan(plan);
    for (const snapshot of result.years) {
      const classes = new Set(snapshot.accounts.map((a) => `${a.accountClass}:${a.isLiability}`));
      for (const key of classes) {
        const [accountClass, liability] = key.split(':');
        const rows = snapshot.accounts.filter((a) => a.accountClass === accountClass && String(a.isLiability) === liability);
        const steps = flowSteps(rows, liability === 'true');
        expect(steps[0].kind).toBe('total');
        expect(steps[steps.length - 1].kind).toBe('total');
        // Running balance after the last movement lands on the closing balance.
        const moves = steps.slice(1, -1);
        const end = moves.length ? moves[moves.length - 1].to : steps[0].value;
        expect(end).toBeCloseTo(steps[steps.length - 1].value, 4);
        // Each step starts where the previous one ended.
        moves.reduce((from, s) => {
          expect(s.from).toBeCloseTo(from, 4);
          return s.to;
        }, steps[0].value);
      }
    }
  });

  it('names contributions, growth and withdrawals for an asset, and only principal for a liability', () => {
    const result = runPlan(SAMPLE_PLANS[0]);
    const snapshot = result.years[5];
    const asset = snapshot.accounts.filter((a) => a.accountClass === 'taxableInvestment');
    expect(flowSteps(asset, false).map((s) => s.key)).toEqual(
      expect.arrayContaining(['open', 'contributions', 'growth', 'close']),
    );
    const mortgage = snapshot.accounts.filter((a) => a.accountClass === 'mortgage');
    expect(flowSteps(mortgage, true).map((s) => s.key)).toEqual(expect.arrayContaining(['open', 'paid', 'close']));
  });
});

describe('spendingModel: the donut keeps one key set across every year', () => {
  it.each(plans)('%s', (_n, plan) => {
    const result = runPlan(plan);
    const model = spendingModel(plan, result);
    expect(model.groups).toHaveLength(result.years.length);
    expect(model.months).toHaveLength(result.years.length);
    // Saving is never a slice.
    expect(model.meta.map((m) => m.key)).not.toContain('saving');
    // Every year's groups are a subset of the stable key set, so the donut can zero the rest.
    const keys = new Set<string>(model.meta.map((m) => m.key));
    for (const perYear of model.groups) for (const g of perYear) expect(keys.has(g.key)).toBe(true);
    // A group's monthly line is zero where it has nothing and never negative.
    for (const m of model.meta) {
      const line = groupMonthlySeries(model, m.key);
      expect(line).toHaveLength(result.years.length);
      expect(line.every((v) => v >= 0)).toBe(true);
    }
  });
});

describe('presentClasses', () => {
  it('lists assets before liabilities and only classes with value or set up by hand', () => {
    const plan = SAMPLE_PLANS[0];
    const result = runPlan(plan);
    const rows = presentClasses(plan.accounts, result.years);
    const firstLiability = rows.findIndex((r) => r.liability);
    if (firstLiability >= 0) expect(rows.slice(firstLiability).every((r) => r.liability)).toBe(true);
    expect(rows.some((r) => r.accountClass === 'creditCard')).toBe(false);
  });

  it('classBalanceAt sums a class across its accounts', () => {
    const result = runPlan(SAMPLE_PLANS[0]);
    const snapshot = result.years[3];
    const sum = snapshot.accounts.filter((a) => a.accountClass === 'cash').reduce((s, a) => s + a.close, 0);
    expect(classBalanceAt(snapshot, 'cash', false)).toBeCloseTo(sum, 6);
    expect(classBalanceAt(undefined, 'cash', false)).toBe(0);
  });
});

describe('dangerBand, ages and markers', () => {
  it('gives a band only when the plan runs short, with the year-by-year shortfall', () => {
    const dry = runsDryPlan();
    const dryResult: PlanResult = runPlan(dry);
    const band = dangerBand(planHealth(dryResult, dry), dryResult);
    expect(band?.from).toBe(planHealth(dryResult, dry).firstShortYear);
    expect(band?.shortFor?.(band.from)).toBeGreaterThan(0);

    const fine = healthyPlan();
    const fineResult = runPlan(fine);
    expect(dangerBand(planHealth(fineResult, fine), fineResult)).toBeUndefined();
  });

  it('labels the included adults only', () => {
    const plan = kitchenSinkPlan();
    const snapshot = runPlan(plan).years[0];
    const label = agesLabel(plan, snapshot)!;
    const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
    expect(label.split(' · ')).toHaveLength(adults.length);
    expect(agesLabel(plan, undefined)).toBeUndefined();
  });

  it('marks included events inside the chart years, as ticks', () => {
    const plan = kitchenSinkPlan();
    const years = runPlan(plan).years.map((y) => y.year);
    const markers = eventMarkers(plan, years);
    expect(markers.every((m) => years.includes(m.year))).toBe(true);
    expect(markers.every((m) => ['income', 'cost', 'neutral'].includes(m.tone))).toBe(true);
  });
});
