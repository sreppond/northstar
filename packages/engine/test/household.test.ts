import { describe, expect, it } from 'vitest';
import { resolveAnchor } from '../src/anchors.js';
import { runPlan } from '../src/run.js';
import type { BudgetLine, Plan } from '../src/types.js';
import { asset, event, plan } from './fixtures.js';

const adults = [
  { id: 'spencer', name: 'Spencer', birthYear: 1996, lifeExpectancy: 95, isIncluded: true },
  { id: 'sarah', name: 'Sarah', birthYear: 1996, lifeExpectancy: 95, isIncluded: true },
];
const kid = { id: 'kid1', name: 'Kid 1', birthYear: 2028, lifeExpectancy: 95, isIncluded: true, role: 'child' as const };

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

/** A household with plenty of cash, so no line is ever cut short by a shortfall. */
function household(over: Partial<Plan> = {}): Plan {
  return plan({
    participants: [...adults, kid],
    accounts: [asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 5_000_000 })],
    ...over,
    settings: { projectionYears: 10, ...over.settings } as Plan['settings'],
  });
}

const expensesIn = (p: Plan, year: number) => runPlan(p).years.find((y) => y.year === year)!.expenses;

describe('resolveAnchor', () => {
  const scope = {
    events: [
      { id: 'home', startYear: 2031, isIncluded: true },
      { id: 'off', startYear: 2030, isIncluded: false },
    ],
    participants: [kid],
  };

  it('resolves years, events with an offset, and ages', () => {
    expect(resolveAnchor({ kind: 'year', year: 2027 }, scope)).toBe(2027);
    expect(resolveAnchor({ kind: 'event', eventId: 'home', offset: -1 }, scope)).toBe(2030);
    expect(resolveAnchor({ kind: 'age', participantId: 'kid1', age: 5 }, scope)).toBe(2033);
  });

  it('resolves nothing for an excluded or missing event or person', () => {
    expect(resolveAnchor({ kind: 'event', eventId: 'off' }, scope)).toBeUndefined();
    expect(resolveAnchor({ kind: 'event', eventId: 'gone' }, scope)).toBeUndefined();
    expect(resolveAnchor({ kind: 'age', participantId: 'nobody', age: 5 }, scope)).toBeUndefined();
  });
});

describe('budget lines', () => {
  it('turns a monthly amount in today\'s dollars into an inflating annual expense', () => {
    const p = household({
      settings: { inflationRate: 2 } as Plan['settings'],
      budget: [line({ id: 'groceries', amount: 1_000 })],
    });
    const y2026 = expensesIn(p, 2026).find((e) => e.budgetLineId === 'groceries')!;
    const y2028 = expensesIn(p, 2028).find((e) => e.budgetLineId === 'groceries')!;
    expect(y2026.amount).toBeCloseTo(12_000, 6);
    expect(y2028.amount).toBeCloseTo(12_000 * 1.02 ** 2, 6);
    expect(y2026).toMatchObject({ category: 'other', essential: true });
  });

  it('ends rent the year the home is bought, and keeps it if the purchase is switched off', () => {
    const home = event({ id: 'home', kind: 'buyAHome', startYear: 2030, config: { price: 100_000 } });
    const rent = line({ id: 'rent', category: 'housing', until: { kind: 'event', eventId: 'home' } });

    const bought = household({ events: [home], budget: [rent] });
    expect(expensesIn(bought, 2029).some((e) => e.budgetLineId === 'rent')).toBe(true);
    expect(expensesIn(bought, 2030).some((e) => e.budgetLineId === 'rent')).toBe(false);

    const notBought = household({ events: [{ ...home, isIncluded: false }], budget: [rent] });
    expect(expensesIn(notBought, 2035).some((e) => e.budgetLineId === 'rent')).toBe(true);
  });

  it('follows a child\'s age and carries the child as owner', () => {
    const daycare = line({
      id: 'daycare',
      owner: 'kid1',
      category: 'childcare',
      from: { kind: 'age', participantId: 'kid1', age: 0 },
      until: { kind: 'age', participantId: 'kid1', age: 5 },
    });
    const p = household({ budget: [daycare] });
    expect(expensesIn(p, 2027).some((e) => e.budgetLineId === 'daycare')).toBe(false);
    expect(expensesIn(p, 2028).find((e) => e.budgetLineId === 'daycare')?.ownerId).toBe('kid1');
    expect(expensesIn(p, 2032).some((e) => e.budgetLineId === 'daycare')).toBe(true);
    expect(expensesIn(p, 2033).some((e) => e.budgetLineId === 'daycare')).toBe(false);
  });

  it('pays a one-time line once, in its first year', () => {
    const p = household({
      budget: [line({ id: 'wedding', cadence: 'once', amount: 40_000, from: { kind: 'year', year: 2027 } })],
    });
    const all = runPlan(p).years.flatMap((y) => y.expenses.filter((e) => e.budgetLineId === 'wedding'));
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBeCloseTo(40_000, 6);
  });

  it('routes a saving line into its account as a contribution, not spending', () => {
    const p = household({
      accounts: [
        asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 5_000_000 }),
        asset({ id: '529', name: 'Kid 1 529', accountClass: 'taxFreeInvestment' }),
      ],
      budget: [line({ id: 'college', kind: 'saving', accountId: '529', amount: 500 })],
    });
    const y = runPlan(p).years.find((x) => x.year === 2026)!;
    expect(y.expenses.find((e) => e.budgetLineId === 'college')?.category).toBe('contribution');
    expect(y.accounts.find((a) => a.accountId === '529')!.contributions).toBeCloseTo(6_000, 6);
  });

  it('scales adults\' and shared lines with retirement spending, but not a child\'s', () => {
    const p = household({
      events: [event({ id: 'r', kind: 'retirement', startYear: 2030, config: { spendingChangePercent: -50 } })],
      budget: [line({ id: 'shared' }), line({ id: 'kid', owner: 'kid1' })],
    });
    const y = expensesIn(p, 2030);
    expect(y.find((e) => e.budgetLineId === 'shared')!.amount).toBeCloseTo(6_000, 6);
    expect(y.find((e) => e.budgetLineId === 'kid')!.amount).toBeCloseTo(12_000, 6);
  });
});

describe('careers', () => {
  const income = (p: Plan, year: number, eventId: string) =>
    runPlan(p).years.find((y) => y.year === year)!.income.find((l) => l.sourceEventId === eventId)?.amount ?? 0;

  const job = (id: string, participantId: string, startYear: number, config: Record<string, unknown> = {}) =>
    event({
      id,
      kind: 'job',
      startYear,
      config: { salary: 100_000, annualRaise: 0, participantId, ...config },
    });

  it('a new job replaces its own holder\'s earlier pay, not their partner\'s', () => {
    const p = household({
      events: [job('spencer-1', 'spencer', 2026), job('sarah-1', 'sarah', 2027)],
    });
    expect(income(p, 2028, 'spencer-1')).toBeCloseTo(100_000, 6);
    expect(income(p, 2028, 'sarah-1')).toBeCloseTo(100_000, 6);

    const switched = household({
      events: [job('spencer-1', 'spencer', 2026), job('spencer-2', 'spencer', 2028)],
    });
    expect(income(switched, 2028, 'spencer-1')).toBe(0);
  });

  it('one partner retiring leaves the other\'s salary alone', () => {
    const p = household({
      events: [
        job('spencer-1', 'spencer', 2026),
        job('sarah-1', 'sarah', 2026),
        event({ id: 'r', kind: 'retirement', startYear: 2030, config: { participantId: 'spencer' } }),
      ],
    });
    expect(income(p, 2030, 'spencer-1')).toBe(0);
    expect(income(p, 2030, 'sarah-1')).toBeCloseTo(100_000, 6);
  });

  it('phases scale pay: full, then a leave anchored to the birth, then part-time', () => {
    const birth = event({ id: 'birth', kind: 'otherExpense', startYear: 2028, config: { amount: 0 } });
    const p = household({
      events: [
        birth,
        job('sarah-1', 'sarah', 2026, {
          phases: [
            { from: { kind: 'event', eventId: 'birth' }, mode: 'leave', percent: 0 },
            { from: { kind: 'year', year: 2030 }, mode: 'part', percent: 60 },
          ],
        }),
      ],
    });
    expect(income(p, 2027, 'sarah-1')).toBeCloseTo(100_000, 6);
    expect(income(p, 2028, 'sarah-1')).toBe(0);
    expect(income(p, 2029, 'sarah-1')).toBe(0);
    expect(income(p, 2030, 'sarah-1')).toBeCloseTo(60_000, 6);
  });
});

describe('children', () => {
  it('never set an age-based horizon', () => {
    const p = household({ settings: { horizon: { mode: 'age', age: 95 } } as Plan['settings'] });
    expect(runPlan(p).endYear).toBe(1996 + 95);
  });
});
