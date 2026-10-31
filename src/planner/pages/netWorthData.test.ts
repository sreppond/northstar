import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan, PlanResult } from '@northstar/engine';
import { planHealth } from '../health';
import { runsDryPlan, healthyPlan, kitchenSinkPlan } from '../planFixtures';
import { SAMPLE_PLANS } from '../samplePlan';
import { toHouseholdModel } from '../household';
import {
  accountFlowRows,
  agesLabel,
  classBalanceAt,
  classFlowSteps,
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

describe('flowSteps: required distributions and the residual (V5-REVIEW-2 N5, N16)', () => {
  it('shows an RMD as its own row, not as "Withdrawals", and keeps the bars adding up', () => {
    const result = runPlan(kitchenSinkPlan());
    let seen = 0;
    for (const snapshot of result.years) {
      const rmd = snapshot.income.filter((l) => l.label.startsWith('Required minimum distribution'));
      for (const line of rmd) {
        const row = snapshot.accounts.filter((a) => a.accountId === line.accountId);
        const steps = flowSteps(row, false, snapshot.income);
        const required = steps.find((s) => s.key === 'rmd');
        expect(required?.label).toBe('Required distributions');
        expect(required?.value).toBeCloseTo(-line.amount, 4);
        // Nothing else was drawn from that account, so there is no plain "Withdrawals" row...
        const drawnElsewhere = row.reduce((a, r) => a + r.withdrawals, 0) - line.amount;
        if (Math.abs(drawnElsewhere) < 1) expect(steps.map((s) => s.key)).not.toContain('withdrawals');
        // ...and no unexplained "Other" either: it folds into Growth or reads "Inflation adjustment".
        expect(steps.map((s) => s.label)).not.toContain('Other');
        const moves = steps.slice(1, -1);
        expect(moves[moves.length - 1].to).toBeCloseTo(steps[steps.length - 1].value, 4);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('splits SEPP payments out of withdrawals', () => {
    const rows = [
      { accountId: 'a', name: 'IRA', accountClass: 'taxDeferredInvestment', isLiability: false, open: 1000, growth: 50, contributions: 0, withdrawals: 300, interest: 0, principal: 0, close: 750 },
    ] as Parameters<typeof flowSteps>[0];
    const steps = flowSteps(rows, false, [
      { label: 'SEPP — IRA', amount: 200, accountId: 'a', category: 'sepp' },
    ] as Parameters<typeof flowSteps>[2]);
    expect(steps.find((s) => s.key === 'sepp')?.value).toBe(-200);
    expect(steps.find((s) => s.key === 'withdrawals')?.value).toBe(-100);
  });

  it('folds a small residual into Growth and labels a large one "Inflation adjustment"', () => {
    const row = (close: number) =>
      [
        { accountId: 'a', name: 'X', accountClass: 'cash', isLiability: false, open: 100_000, growth: 0, contributions: 0, withdrawals: 0, interest: 0, principal: 0, close },
      ] as Parameters<typeof flowSteps>[0];
    const small = flowSteps(row(100_163), false);
    expect(small.map((s) => s.key)).not.toContain('other');
    expect(small.find((s) => s.key === 'growth')?.value).toBeCloseTo(163, 6);
    expect(small.find((s) => s.key === 'growth')?.label).toBe('Growth (net of fees)');
    const large = flowSteps(row(103_000), false);
    expect(large.find((s) => s.key === 'other')?.label).toBe('Inflation adjustment');
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

describe('flowSteps: liabilities borrow, repay, and pay interest from cash (R1)', () => {
  const loan = (open: number, close: number, principal: number, interest: number) =>
    [
      { accountId: 'm', name: 'Mortgage', accountClass: 'mortgage', isLiability: true, open, growth: 0, contributions: 0, withdrawals: 0, interest, principal, close },
    ] as Parameters<typeof flowSteps>[0];

  it('shows a loan opened this year as Borrowed, and interest as info that moves nothing', () => {
    const steps = flowSteps(loan(0, 300_000, 0, 0), true);
    expect(steps.find((s) => s.key === 'borrowed')).toMatchObject({ kind: 'in', value: 300_000 });
    expect(steps.at(-1)?.value).toBe(300_000);
  });

  it('keeps interest out of the running balance', () => {
    const steps = flowSteps(loan(200_000, 195_000, 5_000, 12_000), true);
    expect(steps.map((s) => s.key)).toEqual(['open', 'paid', 'interest', 'close']);
    const interest = steps.find((s) => s.key === 'interest')!;
    expect(interest).toMatchObject({ kind: 'info', value: 12_000 });
    expect(interest.from).toBe(interest.to);
    expect(steps.find((s) => s.key === 'paid')?.to).toBe(195_000);
  });
});

describe("accountFlowRows: the balances table's expanded rows (R1)", () => {
  /** A year's opening for flows: last year's close, so a class starting this year opens at 0. */
  const flowOpen = (years: ReturnType<typeof runPlan>['years'], i: number, accountClass: string, liability: boolean) => {
    const sumOf = (snap: (typeof years)[number] | undefined, pick: 'open' | 'close') =>
      (snap?.accounts ?? [])
        .filter((a) => a.accountClass === accountClass && a.isLiability === liability)
        .reduce((s, a) => s + a[pick], 0);
    return i === 0 ? sumOf(years[0], 'open') : sumOf(years[i - 1], 'close');
  };

  it.each(plans)('%s: every asset class reconciles open + flows = close within $1, every year', (_n, plan) => {
    const result = runPlan(plan);
    const classes = new Set(result.years.flatMap((y) => y.accounts.filter((a) => !a.isLiability).map((a) => a.accountClass)));
    for (const accountClass of classes) {
      const rows = accountFlowRows(result.years, accountClass, false);
      expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(['additions', 'withdrawals', 'growth']));
      result.years.forEach((snapshot, i) => {
        const classRows = snapshot.accounts.filter((a) => a.accountClass === accountClass && !a.isLiability);
        const close = classRows.reduce((a, r) => a + r.close, 0);
        const flows = rows.reduce((a, r) => a + r.values[i], 0);
        expect(Math.abs(flowOpen(result.years, i, accountClass, false) + flows - close)).toBeLessThan(1);
        // Withdrawals is required distributions, SEPP and plain withdrawals together, printed negative.
        const withdrawn = classRows.reduce((a, r) => a + r.withdrawals, 0);
        const withdrawals = rows.find((r) => r.key === 'withdrawals')!.values[i];
        expect(withdrawals).toBeLessThanOrEqual(0);
        expect(Math.abs(withdrawals + withdrawn)).toBeLessThan(1);
      });
    }
  });

  it.each(plans)('%s: Inflation adjustment appears exactly when some year needs one', (_n, plan) => {
    const result = runPlan(plan);
    const classes = new Set(result.years.flatMap((y) => y.accounts.filter((a) => !a.isLiability).map((a) => a.accountClass)));
    for (const accountClass of classes) {
      const rows = accountFlowRows(result.years, accountClass, false);
      const needed = rows.some((r) => r.key === 'inflation');
      const anyOther = result.years.some((snapshot) =>
        flowSteps(snapshot.accounts.filter((a) => a.accountClass === accountClass && !a.isLiability), false, snapshot.income).some(
          (s) => s.key === 'other',
        ),
      );
      expect(needed).toBe(anyOther);
    }
  });

  it('a mortgage that starts mid-plan: Borrowed is the loan, and open + borrowed − principal = close', () => {
    const result = runPlan(SAMPLE_PLANS[0]);
    const mortgageAt = (i: number) => flowOpen(result.years, i, 'mortgage', true);
    const i = result.years.findIndex((_y, k) => k > 0 && mortgageAt(k) < 1 && result.years[k].accounts.some((a) => a.accountClass === 'mortgage' && a.close > 1));
    expect(i).toBeGreaterThan(0);

    const rows = accountFlowRows(result.years, 'mortgage', true);
    const get = (key: string) => rows.find((r) => r.key === key)!.values[i];
    const snapshot = result.years[i].accounts.filter((a) => a.accountClass === 'mortgage' && a.isLiability);
    const close = snapshot.reduce((s, a) => s + a.close, 0);
    const principal = snapshot.reduce((s, a) => s + a.principal, 0);
    const interest = snapshot.reduce((s, a) => s + a.interest, 0);

    const borrowed = get('borrowed');
    const paid = get('paid');
    // The loan is the full amount borrowed this year: it is what the balance rose to, plus the principal repaid.
    expect(borrowed).toBeGreaterThan(0);
    expect(borrowed).toBeCloseTo(close + principal, 0);
    expect(paid).toBeCloseTo(-principal, 0);
    expect(Math.abs(mortgageAt(i) + borrowed + paid - close)).toBeLessThan(1);
    // The account sheet's waterfall for that year agrees with the table's sub-rows.
    expect(classFlowSteps(result.years, i, 'mortgage', true).find((s) => s.key === 'borrowed')?.value).toBeCloseTo(borrowed, 6);
    // Interest is paid from cash: reported beside the flows, never part of the reconciliation above.
    expect(get('interest')).toBeCloseTo(interest, 0);
    expect(interest).toBeGreaterThan(0);
  });

  it('a mortgage that starts in the first projected year reads as Borrowed when "today" is the prior close', () => {
    const base = SAMPLE_PLANS[0];
    const home = base.events.find((e) => e.kind === 'buyAHome')!;
    const plan: Plan = {
      ...base,
      events: base.events.map((e) => (e.id === home.id ? { ...e, startYear: base.settings.startYear } : e)),
    };
    const result = runPlan(plan);
    const principal = result.years[0].accounts
      .filter((a) => a.accountClass === 'mortgage' && a.isLiability)
      .reduce((sum, a) => sum + a.principal, 0);
    const close = result.years[0].accounts
      .filter((a) => a.accountClass === 'mortgage' && a.isLiability)
      .reduce((sum, a) => sum + a.close, 0);
    expect(close).toBeGreaterThan(1);

    // Today there is no mortgage, so the whole loan was borrowed this year: borrowed = close + principal.
    const withOpening = accountFlowRows(result.years, 'mortgage', true, result.opening);
    expect(withOpening.find((r) => r.key === 'borrowed')!.values[0]).toBeCloseTo(close + principal, 0);
    expect(withOpening.find((r) => r.key === 'paid')!.values[0]).toBeCloseTo(-principal, 0);
    // The home's value is money in, not an opening balance.
    const homeRows = accountFlowRows(result.years, 'realEstate', false, result.opening);
    expect(homeRows.find((r) => r.key === 'additions')!.values[0]).toBeGreaterThan(1);
  });
});
