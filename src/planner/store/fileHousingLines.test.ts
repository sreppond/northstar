import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { BudgetCategory, BudgetLine, Plan } from '@northstar/engine';
import { spendingGroups } from '../spendingGroups';
import { kitchenSinkPlan } from '../planFixtures';
import { fileHousingLines } from './planStore';

const line = (name: string, category: BudgetCategory, id = name.toLowerCase().replace(/\W+/g, '-')): BudgetLine => ({
  id,
  name,
  owner: 'shared',
  category,
  essential: true,
  kind: 'expense',
  cadence: 'monthly',
  amount: 1_000,
  isIncluded: true,
});

const withBudget = (budget: BudgetLine[] | undefined): Plan => {
  const plan = kitchenSinkPlan();
  return budget === undefined ? { ...plan, budget: undefined } : { ...plan, budget };
};

const categoryOf = (plan: Plan, name: string) => plan.budget?.find((l) => l.name === name)?.category;

describe('fileHousingLines', () => {
  it('moves rent filed under other to housing', () => {
    const plan = withBudget([line('Rent', 'other')]);
    expect(categoryOf(fileHousingLines(plan), 'Rent')).toBe('housing');
  });

  it.each(['Mortgage', 'HOA', 'HOA fee', "Renter's insurance", "Renters' insurance", 'Renters insurance', 'Renter’s insurance'])(
    'moves %s',
    (name) => {
      expect(categoryOf(fileHousingLines(withBudget([line(name, 'other')])), name)).toBe('housing');
    },
  );

  it('does not move Rental car, because rent has to be a whole word', () => {
    const plan = withBudget([line('Rental car', 'other')]);
    expect(fileHousingLines(plan)).toBe(plan);
  });

  it('leaves a line already filed under another category where it is', () => {
    const plan = withBudget([line('Rent', 'food')]);
    expect(fileHousingLines(plan)).toBe(plan);
    expect(categoryOf(fileHousingLines(plan), 'Rent')).toBe('food');
  });

  it('moves only the matching other lines and leaves the rest of the budget as it was', () => {
    const budget = [line('Rent', 'other'), line('Groceries', 'food'), line('Gifts', 'other'), line('Mortgage', 'other')];
    const after = fileHousingLines(withBudget(budget));
    expect(after.budget!.map((l) => [l.name, l.category])).toEqual([
      ['Rent', 'housing'],
      ['Groceries', 'food'],
      ['Gifts', 'other'],
      ['Mortgage', 'housing'],
    ]);
    // Only the category changed; the rest of each line is the same object content.
    expect(after.budget![1]).toBe(budget[1]);
  });

  it('is idempotent: a second run returns the same plan object', () => {
    const once = fileHousingLines(withBudget([line('Rent', 'other'), line('Mortgage', 'other')]));
    expect(fileHousingLines(once)).toBe(once);
  });

  it('returns the same plan object for a plan with no budget', () => {
    const plan = withBudget(undefined);
    expect(plan.budget).toBeUndefined();
    expect(fileHousingLines(plan)).toBe(plan);
  });
});

describe('fileHousingLines on the Cash Flow page', () => {
  it('puts the Rent amount in the home group, not shared, once it is migrated', () => {
    const base = kitchenSinkPlan();
    const year = 2027;
    const rentIn = (plan: Plan, key: string) => {
      const snapshot = runPlan(plan).years.find((y) => y.year === year)!;
      return spendingGroups(plan, snapshot).find((g) => g.key === key)?.parts.find((p) => p.label === 'Rent');
    };

    // The fixture files Rent under housing; file it under other, as an older save would.
    const misfiled: Plan = {
      ...base,
      budget: base.budget!.map((l) => (l.name === 'Rent' ? { ...l, category: 'other' as const } : l)),
    };
    expect(rentIn(misfiled, 'home')).toBeUndefined();
    expect(rentIn(misfiled, 'shared')).toBeDefined();

    const migrated = fileHousingLines(misfiled);
    expect(rentIn(migrated, 'shared')).toBeUndefined();
    expect(rentIn(migrated, 'home')!.amount).toBeCloseTo(rentIn(base, 'home')!.amount, 4);
  });
});
