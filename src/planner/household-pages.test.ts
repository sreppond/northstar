import { describe, expect, it } from 'vitest';
import type { BudgetLine, Plan, PlanEvent } from '@northstar/engine';
import { runPlan } from '@northstar/engine';
import { budgetView, lifeStage } from './budgetView';
import { KID_DEFAULTS, addChild, kidCostByAge, removeChild } from './kids';
import { applyCareGap, careerSegments } from './caregiving';
import { impactMetrics, presentResult } from './impact';

function ev(over: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind' | 'startYear'>): PlanEvent {
  return { name: over.kind, isIncluded: true, config: {}, ...over };
}

function line(over: Partial<BudgetLine> & Pick<BudgetLine, 'id'>): BudgetLine {
  return {
    name: over.id,
    owner: 'shared',
    category: 'other',
    essential: true,
    kind: 'expense',
    cadence: 'monthly',
    amount: 1_000,
    isIncluded: true,
    ...over,
  };
}

/** No inflation, no partial first year: monthly figures are exact. */
function household(over: Partial<Plan> = {}): Plan {
  return {
    id: 'h',
    name: 'H',
    settings: {
      startYear: 2026,
      asOfDate: '2026-01-01',
      horizon: { mode: 'age', age: 95 },
      projectionYears: 30,
      inflationRate: 0,
      dollarMode: 'todaysDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 25,
    },
    participants: [
      { id: 'spencer', name: 'Spencer', birthYear: 1996, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
      { id: 'sarah', name: 'Sarah', birthYear: 1996, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
    ],
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        accountClass: 'cash',
        isLiability: false,
        initialBalance: 50_000,
        isIncluded: true,
        growthRateMethod: 'fixed',
        growthRate: 0,
        withdrawalTiming: 'always',
        withdrawalTaxRate: 0,
        taxableWithdrawalPercent: 0,
        penaltyRate: 0,
      },
    ],
    events: [
      ev({ id: 'sp-job', kind: 'job', startYear: 2026, config: { salary: 240_000, annualRaise: 0, participantId: 'spencer' } }),
      ev({ id: 'sa-job', kind: 'job', startYear: 2026, config: { salary: 120_000, annualRaise: 0, participantId: 'sarah' } }),
    ],
    rules: [],
    budget: [
      line({ id: 'rent', name: 'Rent', category: 'housing', amount: 4_000 }),
      line({ id: 'fun', name: 'Eating out', essential: false, amount: 1_000 }),
      line({ id: 'sp-allow', name: 'Spencer allowance', owner: 'spencer', kind: 'allowance', essential: false, amount: 4_000 }),
      line({ id: 'sa-allow', name: 'Sarah allowance', owner: 'sarah', kind: 'allowance', essential: false, amount: 4_000 }),
    ],
    ...over,
  };
}

const yearOf = (p: Plan, year: number) => presentResult(p).years.find((y) => y.year === year)!;

describe('budgetView', () => {
  it('reads a year as after-tax income, sections by owner, and what is left', () => {
    const p = household();
    const view = budgetView(p, yearOf(p, 2027));
    // $360K gross at 25% = $22,500/mo after tax.
    expect(view.afterTax).toBeCloseTo(22_500, 6);
    expect(view.sections.map((s) => s.title)).toEqual(['Shared', 'Spencer', 'Sarah']);
    expect(view.sections[0].monthly).toBeCloseTo(5_000, 6);
    expect(view.saved).toBeCloseTo(22_500 - 13_000, 6);
    expect(view.savingsRate).toBeCloseTo((9_500 / 22_500) * 100, 6);

    const bucket = (k: string) => view.buckets.find((b) => b.key === k)?.monthly;
    expect(bucket('shared-fixed')).toBeCloseTo(4_000, 6);
    expect(bucket('shared-flex')).toBeCloseTo(1_000, 6);
    expect(bucket('person:sarah')).toBeCloseTo(4_000, 6);
    expect(bucket('saved')).toBeCloseTo(9_500, 6);
  });

  it('shows a lump sum as one-time, not as a monthly cost', () => {
    const p = household({
      budget: [...household().budget!, line({ id: 'wedding', name: 'Wedding', cadence: 'once', amount: 30_000, from: { kind: 'year', year: 2027 } })],
    });
    const view = budgetView(p, yearOf(p, 2027));
    expect(view.oneTime.map((o) => o.label)).toEqual(['Wedding']);
    expect(view.sections[0].rows.some((r) => r.label === 'Wedding')).toBe(false);
    expect(view.saved).toBeCloseTo(9_500, 6);
  });

  it('divides the partial first year by the months it actually has', () => {
    const p = household();
    p.settings.asOfDate = '2026-07-02';
    const view = budgetView(p, presentResult(p).years[0]);
    expect(view.sections[0].rows.find((r) => r.label === 'Rent')!.monthly).toBeCloseTo(4_000, 0);
  });
});

describe('kids', () => {
  it('adds a child whose costs follow their age and land in their own section', () => {
    const p = addChild(household(), { name: 'Kid 1', birthYear: 2028, options: KID_DEFAULTS });
    const kid = p.participants.find((x) => x.role === 'child')!;
    const at = (year: number) => budgetView(p, yearOf(p, year)).sections.find((s) => s.owner === kid.id)?.monthly ?? 0;
    const byAge = kidCostByAge(KID_DEFAULTS);
    expect(at(2027)).toBe(0);
    expect(at(2029)).toBeCloseTo(byAge[1] + 1_400 * (1.035 ** 3 - 1), 0); // daycare grows 3.5% from 2026
    expect(at(2036)).toBeCloseTo(byAge[8], 0);
    expect(lifeStage(p, 2030)).toBe('Renting · Kid 1 (2)');

    const removed = removeChild(p, kid.id);
    expect(removed.budget?.some((l) => l.owner === kid.id)).toBe(false);
  });

  it('opens a 529 when asked and saves into it', () => {
    const p = addChild(household(), { name: 'Kid 1', birthYear: 2026, options: { ...KID_DEFAULTS, collegeSavingsMonthly: 250 } });
    const acct = p.accounts.find((a) => a.name === 'Kid 1 529')!;
    const y = runPlan(p).years.find((x) => x.year === 2027)!;
    expect(y.accounts.find((a) => a.accountId === acct.id)!.contributions).toBeCloseTo(3_000, 6);
  });
});

describe('applyCareGap', () => {
  it('pays less for the stretch, pauses childcare, then returns part-time', () => {
    const base = addChild(household(), { name: 'Kid 1', birthYear: 2028, options: KID_DEFAULTS });
    const p = applyCareGap(base, {
      participantId: 'sarah',
      fromYear: 2028,
      years: 3,
      payPercent: 0,
      thenPercent: 60,
      pausesChildcare: true,
    });
    const sarahPay = (year: number) =>
      runPlan(p).years.find((y) => y.year === year)!.income.find((l) => l.sourceEventId === 'sa-job')?.amount ?? 0;
    expect(sarahPay(2027)).toBeCloseTo(120_000, 6);
    expect(sarahPay(2029)).toBe(0);
    expect(sarahPay(2031)).toBeCloseTo(72_000, 6);

    const daycare = (plan: Plan, year: number) =>
      runPlan(plan).years.find((y) => y.year === year)!.expenses.some((e) => e.budgetLineId?.endsWith('-childcare'));
    expect(daycare(base, 2029)).toBe(true);
    expect(daycare(p, 2029)).toBe(false);
    expect(daycare(p, 2032)).toBe(true);
  });
});

describe('impactMetrics', () => {
  it('reads left to save, net worth at 60 and when money runs out', () => {
    const p = household();
    const m = impactMetrics(p, presentResult(p), 2027);
    expect(m.leftToSave).toBeCloseTo(9_500, 6);
    expect(m.netWorthAt60?.year).toBe(2056);
    expect(m.runsDryYear).toBeUndefined();

    const broke = household({ events: [] });
    expect(impactMetrics(broke, presentResult(broke), 2027).runsDryYear).toBe(2026);
  });
});

describe('careerSegments', () => {
  it('draws a job, a leave, then part-time, cut at retirement', () => {
    const p = applyCareGap(household(), { participantId: 'sarah', fromYear: 2028, years: 2, payPercent: 0, thenPercent: 60, pausesChildcare: false });
    p.events.push(ev({ id: 'ret', kind: 'retirement', startYear: 2050, config: { participantId: 'sarah' } }));
    expect(careerSegments(p, 'sarah', 2026, 2091).map((s) => [s.from, s.to, s.label, s.share])).toEqual([
      [2026, 2028, 'job', 1],
      [2028, 2030, 'Home with the kids', 0],
      [2030, 2050, 'Part-time 60%', 0.6],
    ]);
  });

  it('ends a job where the same person\'s next job begins', () => {
    const p = household();
    p.events.push(ev({ id: 'sp-2', kind: 'job', name: 'RI', startYear: 2028, config: { salary: 300_000, participantId: 'spencer' } }));
    expect(careerSegments(p, 'spencer', 2026, 2040).map((s) => [s.from, s.to, s.label])).toEqual([
      [2026, 2028, 'job'],
      [2028, 2041, 'RI'],
    ]);
  });
});
