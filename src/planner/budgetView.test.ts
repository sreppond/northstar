import { describe, expect, it } from 'vitest';
import type { BudgetLine, Plan } from '@northstar/engine';
import { budgetEnvelopes, budgetView, findRemainderLine, setAdultEnvelope, setSharedEnvelope } from './budgetView';
import { presentResult } from './impact';
import { basePlan, event } from './planFixtures';

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
    expect(e.shared + e.perAdult.reduce((a, b) => a + b.monthly, 0) + e.kids + e.saved).toBeCloseTo(e.afterTax, 6);
  });
});
