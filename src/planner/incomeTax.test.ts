import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan, YearSnapshot } from '@northstar/engine';
import { budgetView } from './budgetView';
import { toHouseholdModel } from './household';
import { incomeWithTax } from './incomeTax';
import { kitchenSinkPlan } from './planFixtures';
import { SAMPLE_PLANS } from './samplePlan';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('incomeWithTax invariant: every dollar of tax lands somewhere', () => {
  const plans: [string, Plan][] = [
    ['sample (house forecast)', SAMPLE_PLANS[0]],
    ['sample (retirement forecast)', SAMPLE_PLANS[1]],
    ['sample on the household model', toHouseholdModel(SAMPLE_PLANS[1]).plan],
    ['kitchen sink', kitchenSinkPlan()],
  ];

  it.each(plans)('%s', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const view = incomeWithTax(snapshot);
      expect(sum(view.sources.map((s) => s.tax)) + view.withdrawalTax).toBeCloseTo(snapshot.totalTaxes, 4);
      expect(view.total.tax).toBeCloseTo(snapshot.totalTaxes, 4);
      expect(view.total.gross).toBeCloseTo(snapshot.totalIncome, 4);
      expect(view.total.net).toBeCloseTo(snapshot.totalIncome - snapshot.totalTaxes, 4);
      for (const s of view.sources) {
        expect(s.net).toBeCloseTo(s.gross - s.tax, 6);
        expect(s.tax).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('after-tax income matches the Budget page', () => {
    const plan = kitchenSinkPlan();
    for (const snapshot of runPlan(plan).years) {
      expect(incomeWithTax(snapshot).total.net / 12).toBeCloseTo(budgetView(plan, snapshot).afterTax, 4);
    }
  });
});

describe('incomeWithTax attribution', () => {
  const plan = kitchenSinkPlan();
  const result = runPlan(plan);
  const at = (year: number): YearSnapshot => result.years.find((y) => y.year === year)!;
  const source = (year: number, key: string) => incomeWithTax(at(year)).sources.find((s) => s.key === key);

  it('groups an event’s lines (salary, bonus, RSU) into one source named for the event', () => {
    const view = incomeWithTax(at(2027));
    const job = view.sources.filter((s) => s.sourceEventId === 'job');
    expect(job).toHaveLength(1);
    expect(job[0].label).toBe('Acme');
    const lines = at(2027).income.filter((l) => l.sourceEventId === 'job');
    expect(lines.length).toBeGreaterThan(1);
    expect(job[0].gross).toBeCloseTo(sum(lines.map((l) => l.amount)), 4);
  });

  it('puts a windfall’s own tax on the windfall and leaves it out of the income-tax split', () => {
    const snapshot = at(2029);
    const wind = source(2029, 'event:wind')!;
    const ownTax = snapshot.taxes.find((t) => t.sourceEventId === 'wind')!;
    expect(wind.tax).toBeCloseTo(ownTax.amount, 4);
    expect(wind.tax).toBeCloseTo(80_000 * 0.2, 4);
  });

  it('splits the household income tax across ordinary sources by their share, in proportion', () => {
    // 2027: salary + bonus + RSU are all Acme; add nothing else ordinary, so Acme carries it all.
    const snapshot = at(2027);
    const household = snapshot.taxes.find((t) => !t.sourceEventId && !t.accountId)!;
    expect(source(2027, 'event:job')!.tax).toBeCloseTo(household.amount, 4);
  });

  it('shares the income tax pro rata between two ordinary sources', () => {
    const two: Plan = {
      ...plan,
      events: [
        ...plan.events,
        { id: 'side', kind: 'income', name: 'Side gig', startYear: 2026, isIncluded: true, config: { amount: 60_000, isTaxable: true, isEarned: true } },
      ],
    };
    const snapshot = runPlan(two).years[1];
    const view = incomeWithTax(snapshot);
    const job = view.sources.find((s) => s.key === 'event:job')!;
    const side = view.sources.find((s) => s.key === 'event:side')!;
    expect(side.tax / job.tax).toBeCloseTo(side.gross / job.gross, 6);
    const household = snapshot.taxes.find((t) => !t.sourceEventId && !t.accountId)!;
    expect(job.tax + side.tax).toBeCloseTo(household.amount, 4);
  });

  it('gives a non-taxable income no share of the household income tax', () => {
    const withGift: Plan = {
      ...plan,
      events: [
        ...plan.events,
        { id: 'gift', kind: 'income', name: 'Family gift', startYear: 2026, isIncluded: true, config: { amount: 60_000, isTaxable: false, isEarned: false } },
      ],
    };
    const snapshot = runPlan(withGift).years[1];
    const line = snapshot.income.find((l) => l.sourceEventId === 'gift')!;
    expect(line.taxable).toBe(false); // the engine stamps the event's own taxability
    const view = incomeWithTax(snapshot);
    const gift = view.sources.find((s) => s.key === 'event:gift')!;
    const job = view.sources.find((s) => s.key === 'event:job')!;
    expect(gift.tax).toBe(0);
    expect(gift.net).toBeCloseTo(gift.gross, 6);
    const household = snapshot.taxes.find((t) => !t.sourceEventId && !t.accountId)!;
    expect(job.tax).toBeCloseTo(household.amount, 4); // the whole tax stays on the taxable job
    expect(view.total.tax).toBeCloseTo(snapshot.totalTaxes, 4);
  });

  it('keeps Social Security’s untaxed half in its gross but out of the tax split', () => {
    const ssa = source(2036, 'event:ssa')!;
    expect(ssa.gross).toBeCloseTo(40_000 * 1.025 ** (2036 - 2033), 0); // default 2.5% COLA from its start
    expect(ssa.tax).toBeGreaterThan(0);
    expect(ssa.tax).toBeLessThan(ssa.gross * 0.25); // only the taxable 85% is taxed, at 25%
  });

  it('attaches RMD and SEPP tax to their own income line', () => {
    const rmdYear = result.years.find((y) => y.income.some((l) => l.label.startsWith('Required minimum distribution')))!;
    const rmd = incomeWithTax(rmdYear).sources.find((s) => s.label.startsWith('Required minimum distribution'))!;
    const rmdTax = rmdYear.taxes.find((t) => t.label.startsWith('RMD tax'))!;
    expect(rmd.tax).toBeCloseTo(rmdTax.amount, 4);

    const seppYear = result.years.find((y) => y.income.some((l) => l.category === 'sepp'))!;
    const sepp = incomeWithTax(seppYear).sources.find((s) => s.label.startsWith('SEPP'))!;
    const seppTax = seppYear.taxes.find((t) => t.label.startsWith('SEPP tax'))!;
    expect(sepp.tax).toBeCloseTo(seppTax.amount, 4);
  });

  it('reports withdrawal tax on its own, never on a source', () => {
    const year = result.years.find((y) => y.taxes.some((t) => t.label.startsWith('Withdrawal tax')))!;
    const view = incomeWithTax(year);
    const expected = sum(year.taxes.filter((t) => t.label.startsWith('Withdrawal tax')).map((t) => t.amount));
    expect(view.withdrawalTax).toBeCloseTo(expected, 4);
    expect(view.withdrawalTax).toBeGreaterThan(0);
  });

  it('never drops tax when no income looks ordinary', () => {
    const synthetic: YearSnapshot = {
      ...at(2027),
      income: [{ label: 'Mystery', amount: 100, accountId: 'x' }],
      taxes: [{ label: 'Income tax', amount: 30 }],
      totalIncome: 100,
      totalTaxes: 30,
    };
    const view = incomeWithTax(synthetic);
    expect(view.total.tax).toBeCloseTo(30, 6);
    expect(view.sources.find((s) => s.key === 'household:income-tax')?.tax).toBeCloseTo(30, 6);
  });
});
