import { describe, expect, it } from 'vitest';
import type { BudgetLine, Plan } from '@northstar/engine';
import { runPlan } from '@northstar/engine';
import { FROM_SAVINGS_COLOR, SAVED_COLOR, UNFUNDED_COLOR, budgetEnvelopes, budgetView, envelopeShare, findRemainderLine, inUnit, monthsIn, ownerColor, setAdultEnvelope, setSharedEnvelope } from './budgetView';
import { yearFlow } from './cashFlowView';
import { planHealth } from './health';
import { presentResult } from './impact';
import { account, basePlan, event, kitchenSinkPlan, runsDryPlan } from './planFixtures';

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

/** Two adults, $360K gross at 25% tax: $22,500/mo after tax. No inflation unless asked, so figures are exact. */
function household(over: { budget?: BudgetLine[]; dollarMode?: 'todaysDollars' | 'futureDollars'; inflationRate?: number } = {}): Plan {
  const base = basePlan();
  return {
    ...base,
    settings: {
      ...base.settings,
      inflationRate: over.inflationRate ?? 0,
      dollarMode: over.dollarMode ?? 'todaysDollars',
      incomeTaxRate: 25,
    },
    participants: [
      { id: 'spencer', name: 'Spencer', birthYear: 1996, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
      { id: 'sarah', name: 'Sarah', birthYear: 1996, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
    ],
    events: [
      event({ id: 'sp-job', kind: 'job', startYear: 2026, config: { salary: 240_000, annualRaise: 0, participantId: 'spencer' } }),
      event({ id: 'sa-job', kind: 'job', startYear: 2026, config: { salary: 120_000, annualRaise: 0, participantId: 'sarah' } }),
    ],
    budget: over.budget ?? [
      line({ id: 'rent', name: 'Rent', category: 'housing', amount: 4_000 }),
      line({ id: 'other-shared', name: 'Other shared spending', essential: false, amount: 1_000 }),
      line({ id: 'sp-allow', name: 'Spencer allowance', owner: 'spencer', kind: 'allowance', essential: false, amount: 4_000 }),
      line({ id: 'sa-allow', name: 'Sarah allowance', owner: 'sarah', kind: 'allowance', essential: false, amount: 4_000 }),
    ],
  };
}

const snap = (p: Plan, year = 2028) => presentResult(p).years.find((y) => y.year === year)!;
const amounts = (p: Plan) => Object.fromEntries((p.budget ?? []).map((l) => [l.id, l.amount]));

describe('budgetEnvelopes', () => {
  it('reads the shared pool, each adult, the kids and what is saved', () => {
    const p = household();
    const e = budgetEnvelopes(p, snap(p));
    expect(e.shared).toBeCloseTo(5_000, 6);
    expect(e.perAdult.map((a) => [a.id, a.name, Math.round(a.monthly)])).toEqual([
      ['spencer', 'Spencer', 4_000],
      ['sarah', 'Sarah', 4_000],
    ]);
    expect(e.kids).toBe(0);
    expect(e.afterTax).toBeCloseTo(22_500, 6);
    expect(e.saved).toBeCloseTo(22_500 - 13_000, 6);
  });

  it('reports a person with no line as zero rather than leaving them out', () => {
    const p = household({ budget: [line({ id: 'rent', amount: 4_000 })] });
    const e = budgetEnvelopes(p, snap(p));
    expect(e.perAdult.map((a) => a.monthly)).toEqual([0, 0]);
  });
});

describe('setSharedEnvelope', () => {
  it('writes the difference into the remainder line and nothing else', () => {
    const p = household();
    const { plan: next, clamped } = setSharedEnvelope(p, 6_500, snap(p));
    expect(clamped).toBe(false);
    expect(amounts(next)).toEqual({ ...amounts(p), 'other-shared': 2_500 });
    // Every other line is the very same object, not a copy with a changed field.
    for (const l of p.budget!) if (l.id !== 'other-shared') expect(next.budget!.find((x) => x.id === l.id)).toBe(l);
    expect(budgetEnvelopes(next, snap(next)).shared).toBeCloseTo(6_500, 6);
  });

  it('can lower the envelope too', () => {
    const p = household();
    const { plan: next } = setSharedEnvelope(p, 4_200, snap(p));
    expect(amounts(next)['other-shared']).toBe(200);
  });

  it('stops at zero and says so when the other lines already cost more', () => {
    const p = household();
    const { plan: next, clamped } = setSharedEnvelope(p, 3_000, snap(p));
    expect(clamped).toBe(true);
    expect(amounts(next)['other-shared']).toBe(0);
    expect(amounts(next).rent).toBe(4_000);
  });

  it('creates the remainder line when there is none', () => {
    const p = household({ budget: [line({ id: 'rent', name: 'Rent', amount: 4_000 })] });
    expect(findRemainderLine(p)).toBeUndefined();
    const { plan: next, clamped } = setSharedEnvelope(p, 5_000, snap(p));
    expect(clamped).toBe(false);
    const made = findRemainderLine(next)!;
    expect(made).toMatchObject({ owner: 'shared', kind: 'expense', cadence: 'monthly', amount: 1_000 });
    expect(next.budget!.find((l) => l.id === 'rent')).toBe(p.budget![0]);
  });

  it('does not create a line just to hold zero', () => {
    const p = household({ budget: [line({ id: 'rent', amount: 4_000 })] });
    const { plan: next, clamped } = setSharedEnvelope(p, 1_000, snap(p));
    expect(clamped).toBe(true);
    expect(next).toBe(p);
  });

  it('works from the line amounts alone when no year is given', () => {
    const p = household();
    expect(amounts(setSharedEnvelope(p, 5_500).plan)['other-shared']).toBe(1_500);
  });

  it('types in future dollars and stores today-dollar amounts', () => {
    const p = household({ dollarMode: 'futureDollars', inflationRate: 3 });
    const s = snap(p, 2036);
    const before = budgetEnvelopes(p, s).shared;
    const { plan: next } = setSharedEnvelope(p, before + 1_000, s);
    // A $1,000 raise read in 2036 is $1,000 / 1.03^10 of today's money in the line.
    expect(amounts(next)['other-shared'] - 1_000).toBeCloseTo(1_000 / Math.pow(1.03, 10), 1);
    expect(budgetEnvelopes(next, snap(next, 2036)).shared).toBeCloseTo(before + 1_000, 1);
  });
});

describe('setAdultEnvelope', () => {
  it("changes only that person's allowance line", () => {
    const p = household();
    const { plan: next, clamped } = setAdultEnvelope(p, 'sarah', 5_000, snap(p));
    expect(clamped).toBe(false);
    expect(amounts(next)).toEqual({ ...amounts(p), 'sa-allow': 5_000 });
    for (const l of p.budget!) if (l.id !== 'sa-allow') expect(next.budget!.find((x) => x.id === l.id)).toBe(l);
    expect(budgetEnvelopes(next, snap(next)).perAdult.find((a) => a.id === 'sarah')!.monthly).toBeCloseTo(5_000, 6);
  });

  it('creates the allowance line when the adult has none', () => {
    const p = household({ budget: [line({ id: 'rent', amount: 4_000 })] });
    const { plan: next } = setAdultEnvelope(p, 'spencer', 3_500, snap(p));
    expect(next.budget!.find((l) => l.owner === 'spencer')).toMatchObject({ kind: 'allowance', cadence: 'monthly', amount: 3_500, isIncluded: true });
    expect(next.budget).toHaveLength(2);
  });

  it('clamps at zero', () => {
    const p = household();
    const { plan: next, clamped } = setAdultEnvelope(p, 'spencer', -200, snap(p));
    expect(clamped).toBe(true);
    expect(amounts(next)['sp-allow']).toBe(0);
  });

  it('lets the allowance take the rest when the adult owns other lines too', () => {
    const p = household({
      budget: [...household().budget!, line({ id: 'sp-gym', name: 'Gym', owner: 'spencer', amount: 500 })],
    });
    const { plan: next } = setAdultEnvelope(p, 'spencer', 5_000, snap(p));
    expect(amounts(next)['sp-allow']).toBe(4_500);
    expect(amounts(next)['sp-gym']).toBe(500);
  });

  it('ignores someone who is not in the plan', () => {
    const p = household();
    expect(setAdultEnvelope(p, 'nobody', 1_000, snap(p)).plan).toBe(p);
  });
});

describe('budgetView stays the source of truth', () => {
  it('the envelopes always add up to after tax', () => {
    const p = household();
    const view = budgetView(p, snap(p));
    const e = budgetEnvelopes(p, snap(p), view);
    expect(e.shared + e.perAdult.reduce((a, b) => a + b.monthly, 0) + e.kids + e.withdrawalTax + e.saved).toBeCloseTo(e.afterTax, 6);
  });
});

/** Retired, no pay, living off a taxable account: a drawdown that pays tax on withdrawals and, much later, runs out. */
function drawdownPlan(): Plan {
  return basePlan({
    settings: { ...basePlan().settings, baselineIncome: 0, baselineExpenses: 110_000, projectionYears: 40, dollarMode: 'futureDollars' },
    accounts: [
      account({ id: 'brokerage', accountClass: 'taxableInvestment', initialBalance: 1_400_000, withdrawalTaxRate: 15, taxableWithdrawalPercent: 60 }),
    ],
    events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2065, isRequired: true })],
    rules: [{ accountId: 'brokerage', ruleType: 'withdrawal', order: 1 }],
  });
}

// V5-REVIEW-1 F3: Budget and Cash Flow disagreed on a retired year. Budget put
// the tax on withdrawals inside after-tax income (so it read negative) and then
// called every negative remainder "Short". One definition now, read two ways.
describe('Budget reconciles with Cash Flow, year by year', () => {
  const plans: [string, Plan][] = [
    ['runs dry', runsDryPlan()],
    ['kitchen sink', kitchenSinkPlan()],
    ['retired drawdown', drawdownPlan()],
  ];

  it.each(plans)('%s: same after tax and same saved, one-time labelled', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const view = budgetView(plan, snapshot);
      const flow = yearFlow(plan, snapshot);
      const months = monthsIn(plan, snapshot.year) || 12;
      expect(view.afterTax * months).toBeCloseTo(flow.afterTax, 4);
      expect(view.withdrawalTax * months).toBeCloseTo(flow.withdrawalTax, 4);
      // Budget's saved is the recurring basis; the lump sums it sets apart are
      // what Cash Flow also takes off.
      const lumps = view.oneTime.reduce((sum, o) => sum + o.amount, 0);
      expect(view.saved * months - lumps).toBeCloseTo(flow.saved, 4);
      // The hero chart's lumps are exactly the lines Budget calls one-time.
      expect(flow.lumps).toBeCloseTo(lumps, 4);
      expect(flow.lumps).toBeLessThanOrEqual(flow.spent + 1e-6);
      expect(view.unfunded * months).toBeCloseTo(flow.unfunded, 4);
    }
  });

  it('retired drawdown: negative saved is "from savings", and only health.shortYears are short', () => {
    const plan = drawdownPlan();
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    let drawdownYears = 0;
    for (const snapshot of result.years) {
      const view = budgetView(plan, snapshot);
      const short = health.shortYears.includes(snapshot.year);
      // The page paints Short from the unfunded amount, which is positive only in a short year.
      expect(view.unfunded > 0.5).toBe(short);
      if (view.saved < -0.5 && !short) {
        drawdownYears++;
        // Not a negative paycheck: after tax is income tax only, and the tax on withdrawals stands apart.
        expect(view.afterTax).toBeGreaterThanOrEqual(-0.5);
      }
    }
    expect(drawdownYears).toBeGreaterThan(10);
    expect(result.years.some((y) => budgetView(plan, y).withdrawalTax > 100)).toBe(true);
    expect(health.shortYears.length).toBeGreaterThan(0);
  });

  // V5-REVIEW-2 N1: in a short year Budget called the unfunded money "From
  // savings", though savings paid nothing. Three states, never one:
  // Saved on purpose (set aside), From savings (a real drawdown), Unfunded (the shortfall).
  it.each(plans)('%s: after tax + from savings + unfunded = spending + into savings + withdrawal tax, in every gap year', (_name, plan) => {
    let gapYears = 0;
    let shortYears = 0;
    for (const snapshot of runPlan(plan).years) {
      const view = budgetView(plan, snapshot);
      if (view.oneTime.length > 0) continue; // a lump sum is not in the monthly picture
      const spending = view.sections.reduce((sum, s) => sum + s.monthly, 0);
      const outgoings = spending + view.intoSavings + view.withdrawalTax;
      expect(view.intoSavings).toBeCloseTo(view.contributions.reduce((sum, r) => sum + r.monthly, 0), 6);
      expect(view.unfundedMonthly).toBe(view.unfunded);
      expect(view.shortfall).toBe(view.unfundedMonthly >= 0.5);
      if (view.gap < 0.005) {
        // A surplus year: nothing is drawn or unfunded.
        expect(view.afterTax).toBeGreaterThanOrEqual(outgoings - 0.01);
        expect(view.fromSavings).toBe(0);
        continue;
      }
      gapYears++;
      if (view.shortfall) shortYears++;
      expect(view.afterTax + view.fromSavings + view.unfundedMonthly).toBeCloseTo(outgoings, 2);
      expect(view.fromSavings).toBeGreaterThanOrEqual(0);
    }
    if (_name !== 'kitchen sink') expect(gapYears).toBeGreaterThan(0);
    if (_name === 'runs dry') expect(shortYears).toBeGreaterThan(0);
  });

  // `snapshot.withdrawals` are GROSS draws: the tax on them is a separate tax
  // line, and Budget lists it as its own outgoing ("Tax on withdrawals"). So
  // "from savings" is bounded by the gross draw, not the draw less its tax
  // (V5-REVIEW-2 N1 asked for the net bound; the gross one is what balances the
  // identity above, and in a year where the last account empties the two
  // differ by exactly that tax).
  it.each(plans)('%s: Budget never says more came from savings than the engine withdrew', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const view = budgetView(plan, snapshot);
      if (!view.shortfall) continue;
      const months = monthsIn(plan, snapshot.year) || 12;
      const withdrawn = snapshot.withdrawals.reduce((sum, w) => sum + w.amount, 0);
      expect(view.fromSavings * months).toBeLessThanOrEqual(withdrawn + 1);
    }
  });

  it('a short year keeps the three states apart: set aside, drawn, unfunded', () => {
    const plan = runsDryPlan();
    const short = runPlan(plan).years.filter((y) => (y.unfundedShortfall ?? 0) > 0);
    expect(short.length).toBeGreaterThan(0);
    for (const snapshot of short) {
      const view = budgetView(plan, snapshot);
      const e = budgetEnvelopes(plan, snapshot, view);
      const keys = view.buckets.map((b) => b.key);
      // The old lie: one "From savings" bucket holding the whole negative remainder.
      expect(keys).not.toContain('saved');
      expect(keys).toContain('unfunded');
      expect(view.buckets.find((b) => b.key === 'unfunded')!.monthly).toBeCloseTo(view.unfundedMonthly, 6);
      if (view.fromSavings >= 0.5) expect(view.buckets.find((b) => b.key === 'from-savings')!.monthly).toBeCloseTo(view.fromSavings, 6);
      else expect(view.buckets.some((b) => b.key === 'from-savings')).toBe(false);
      // Unfunded is the shortfall; From savings is only what accounts paid.
      expect(e.unfunded).toBe(view.unfundedMonthly);
      expect(e.fromSavings).toBe(view.fromSavings);
      const share = envelopeShare(e);
      expect(share.unfunded).toBeGreaterThan(0);
      expect(share.fromSavings + share.unfunded).toBeLessThanOrEqual(100 + 1e-9);
    }
    // Three different identities: no colour is shared by two of the states.
    expect(new Set([SAVED_COLOR, FROM_SAVINGS_COLOR, UNFUNDED_COLOR]).size).toBe(3);
  });

  it('a drawdown year that is not short is From savings with no unfunded', () => {
    const plan = drawdownPlan();
    const health = planHealth(runPlan(plan), plan);
    const years = runPlan(plan).years.filter((y) => !health.shortYears.includes(y.year));
    const view = years.map((y) => budgetView(plan, y)).find((v) => v.gap > 100)!;
    expect(view).toBeDefined();
    expect(view.unfundedMonthly).toBe(0);
    expect(view.shortfall).toBe(false);
    expect(view.fromSavings).toBeCloseTo(view.gap, 6);
    expect(view.buckets.map((b) => b.key)).toEqual(expect.arrayContaining(['from-savings']));
    expect(view.buckets.map((b) => b.key)).not.toContain('unfunded');
  });

  it('the by-year shares fill 100% and put savings-funded spending below zero', () => {
    const plan = drawdownPlan();
    for (const snapshot of runPlan(plan).years) {
      const e = budgetEnvelopes(plan, snapshot);
      const share = envelopeShare(e);
      const stack =
        share.shared + share.perAdult.reduce((a, b) => a + b.share, 0) + share.kids + share.withdrawalTax + share.saved + share.intoSavings;
      if (e.afterTax + e.shared + e.kids > 1) expect(stack).toBeCloseTo(100, 6);
      if (e.saved < -0.5) {
        expect(share.saved).toBe(0);
        // The gap is split into what accounts paid and what nothing paid.
        expect(share.fromSavings + share.unfunded).toBeGreaterThan(0);
        expect(share.fromSavings + share.unfunded).toBeLessThanOrEqual(100 + 1e-9);
        if (e.unfunded < 0.5) expect(share.fromSavings).toBeGreaterThan(0);
      }
    }
  });
});

describe('inUnit', () => {
  it('divides a danger band’s amounts by the months each year covers, leaving the years alone', () => {
    const band = { from: 2030, years: [2030, 2031], shortFor: (y: number) => (y === 2030 ? 1_200 : 2_400) };
    const monthly = inUnit(band, (y) => (y === 2030 ? 6 : 12))!;
    expect(monthly.years).toEqual([2030, 2031]);
    expect(monthly.shortFor!(2030)).toBe(200);
    expect(monthly.shortFor!(2031)).toBe(200);
    expect(inUnit(undefined, () => 12)).toBeUndefined();
  });
});

describe('ownerColor', () => {
  it('never hands out the Shared hue, and gives four adults four colours', () => {
    const people = (role: 'adult' | 'child', n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${role}${i}`, name: `${role}${i}`, birthYear: 1990, lifeExpectancy: 95, isIncluded: true, role }));
    const plan = { participants: [...people('adult', 4), ...people('child', 4)] };
    const adults = plan.participants.filter((p) => p.role === 'adult').map((p) => ownerColor(plan, p.id));
    const kids = plan.participants.filter((p) => p.role === 'child').map((p) => ownerColor(plan, p.id));
    expect(new Set(adults).size).toBe(4);
    expect(new Set(kids).size).toBe(4);
    for (const c of [...adults, ...kids]) expect(c).not.toContain('--mix-1');
  });
});
