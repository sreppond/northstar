import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan } from '@northstar/engine';
import { budgetView } from './budgetView';
import { toHouseholdModel } from './household';
import { kitchenSinkPlan } from './planFixtures';
import { SAMPLE_PLANS } from './samplePlan';
import { spendingGroups } from './spendingGroups';

const total = (xs: { total: number }[]) => xs.reduce((s, g) => s + g.total, 0);
const group = (plan: Plan, year: number, key: string) => {
  const snapshot = runPlan(plan).years.find((y) => y.year === year)!;
  return spendingGroups(plan, snapshot).find((g) => g.key === key);
};

describe('spendingGroups invariant: every dollar of expenses lands in exactly one group', () => {
  const household = (i: number) => toHouseholdModel(SAMPLE_PLANS[i]).plan;
  const plans: [string, Plan][] = [
    ['sample (house forecast)', SAMPLE_PLANS[0]],
    ['sample (retirement forecast)', SAMPLE_PLANS[1]],
    ['sample on the household model (house)', household(0)],
    ['sample on the household model (retirement)', household(1)],
    ['kitchen sink (household model)', kitchenSinkPlan()],
  ];

  it.each(plans)('%s', (_name, plan) => {
    const result = runPlan(plan);
    for (const snapshot of result.years) {
      const groups = spendingGroups(plan, snapshot);
      expect(total(groups)).toBeCloseTo(snapshot.totalExpenses, 4);
      // Parts add up to their group, so a donut and its drill-down agree.
      for (const g of groups) {
        expect(g.parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(g.total, 4);
        expect(g.total).toBeGreaterThan(0);
      }
      // No duplicate group keys.
      expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    }
  });
});

describe('spendingGroups classification', () => {
  const plan = kitchenSinkPlan();

  it('puts rent and the mortgage-era house costs under home, and the down payment too', () => {
    const rent = group(plan, 2027, 'home')!;
    expect(rent.parts.map((p) => p.label)).toContain('Rent');

    const buyYear = group(plan, 2028, 'home')!;
    expect(buyYear.parts.some((p) => /down payment/.test(p.label))).toBe(true);
    // ...and the lump sum is not double-counted as one-time.
    expect(group(plan, 2028, 'oneTime')?.parts.some((p) => /down payment/.test(p.label)) ?? false).toBe(false);

    expect(group(plan, 2035, 'home')!.parts.some((p) => /mortgage payment/.test(p.label))).toBe(true);
  });

  it('groups kids per child and personal lines per adult', () => {
    const kids = group(plan, 2027, 'kids')!;
    expect(kids.parts).toHaveLength(1);
    expect(kids.parts[0]).toMatchObject({ label: 'Robin', ownerId: 'c1' });

    const personal = group(plan, 2027, 'personal')!;
    expect(personal.parts.map((p) => [p.label, p.ownerId])).toEqual([
      ['Alex', 'p1'],
      ['Sam', 'p2'],
    ]);
  });

  it('keeps lump sums out of the monthly groups, and saving out of spending', () => {
    // 2030 is the big trip; Robin's lump sum comes at 13.
    const trip = group(plan, 2030, 'oneTime')!;
    expect(trip.parts.map((p) => p.label)).toContain('Big trip');
    expect(group(plan, 2037, 'oneTime')!.parts.map((p) => p.label)).toContain('Robin bar mitzvah');
    // The child's lump sum is not in kids; the 529 contribution is saving, not kids.
    expect(group(plan, 2037, 'kids')?.parts.some((p) => /bar mitzvah/.test(p.label)) ?? false).toBe(false);
    expect(group(plan, 2027, 'saving')!.parts.map((p) => p.label)).toContain('Robin 529');
  });

  it('agrees with the Budget page: same one-time lines, same saving lines', () => {
    const result = runPlan(plan);
    for (const snapshot of result.years) {
      const view = budgetView(plan, snapshot);
      const groups = spendingGroups(plan, snapshot);
      // budgetView sets the home down payment apart as a lump sum; the groups file it
      // under home on purpose (§7.1 rule 1), so compare everything else.
      const oneTime = groups.find((g) => g.key === 'oneTime')?.total ?? 0;
      const viewOneTime = view.oneTime.filter((o) => !/down payment|selling costs/.test(o.label)).reduce((s, o) => s + o.amount, 0);
      expect(oneTime).toBeCloseTo(viewOneTime, 4);

      const saving = groups.find((g) => g.key === 'saving')?.total ?? 0;
      const months = 12; // the plan starts on Jan 1, so every year is a full year
      expect(saving / months).toBeCloseTo(view.contributions.reduce((s, c) => s + c.monthly, 0), 4);
    }
  });

  it('keeps a legacy haveAKid event under kids, one part per event', () => {
    const legacy = SAMPLE_PLANS[0];
    const kids = group(legacy, 2031, 'kids')!;
    expect(kids.parts.map((p) => p.label).sort()).toEqual(['First child', 'Second child']);
    expect(kids.parts.every((p) => p.sourceEventId)).toBe(true);
  });

  it('treats an owner who is not an included person as shared', () => {
    const excluded: Plan = {
      ...plan,
      participants: plan.participants.map((p) => (p.id === 'p2' ? { ...p, isIncluded: false } : p)),
    };
    const snapshot = runPlan(excluded).years[0];
    const groups = spendingGroups(excluded, snapshot);
    expect(total(groups)).toBeCloseTo(snapshot.totalExpenses, 4);
    expect(groups.find((g) => g.key === 'personal')!.parts.map((p) => p.ownerId)).toEqual(['p1']);
  });
});
