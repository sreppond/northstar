import { describe, expect, it } from 'vitest';
import type { Plan } from '@northstar/engine';
import { KID_DEFAULTS, addChild, type KidOptions } from './kids';
import { applyKidOptions, kidOptionsChanged, readKidChoices } from './kidStages';

function base(): Plan {
  return {
    id: 't',
    name: 'T',
    settings: {
      startYear: 2026,
      projectionYears: 30,
      inflationRate: 2.5,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 25,
    },
    participants: [{ id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 95, isIncluded: true }],
    accounts: [],
    events: [],
    budget: [],
  } as unknown as Plan;
}

function withKid(options: KidOptions = KID_DEFAULTS) {
  const plan = addChild(base(), { name: 'Mia', birthYear: 2027, options });
  const id = plan.participants.find((p) => p.role === 'child')!.id;
  return { plan, id };
}

const idsOf = (plan: Plan, owner: string) => (plan.budget ?? []).filter((l) => l.owner === owner).map((l) => l.id);

describe('readKidChoices (V5-REVIEW-1 F9)', () => {
  it('reads back the options the child was added with', () => {
    const opts: KidOptions = { childcare: 'nanny', school: 'private', college: 'outOfState', collegeSavingsMonthly: 300 };
    const { plan, id } = withKid(opts);
    expect(readKidChoices(plan, id)).toEqual(opts);
  });

  it('reads "a parent at home" and "no college" from the absence of a line', () => {
    const { plan, id } = withKid({ ...KID_DEFAULTS, childcare: 'parent', college: 'none' });
    expect(readKidChoices(plan, id)).toMatchObject({ childcare: 'parent', college: 'none' });
  });
});

describe('applyKidOptions: one line per stage (V5-REVIEW-1 F9)', () => {
  it('is a no-op for the options the child already has', () => {
    const { plan, id } = withKid();
    expect(kidOptionsChanged(plan, id, KID_DEFAULTS)).toBe(false);
    expect(applyKidOptions(plan, id, KID_DEFAULTS)).toBe(plan);
  });

  it('swaps the childcare stage without touching the others or duplicating lines', () => {
    const { plan, id } = withKid();
    const next = applyKidOptions(plan, id, { ...KID_DEFAULTS, childcare: 'nanny' });
    const ids = idsOf(next, id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => i === `${id}-childcare`)).toHaveLength(1);
    expect(next.budget!.find((l) => l.id === `${id}-childcare`)!.amount).toBe(3_200);
    expect([...ids].sort()).toEqual([...idsOf(plan, id)].sort());
  });

  it('removes a stage line when the stage is switched off, and re-adds exactly one when switched back on', () => {
    const { plan, id } = withKid();
    const none = applyKidOptions(plan, id, { ...KID_DEFAULTS, college: 'none' });
    expect(idsOf(none, id)).not.toContain(`${id}-college`);
    const back = applyKidOptions(none, id, { ...KID_DEFAULTS, college: 'private' });
    expect(idsOf(back, id).filter((i) => i === `${id}-college`)).toHaveLength(1);
    expect(back.budget!.find((l) => l.id === `${id}-college`)!.amount).toBe(5_000);
  });

  it('adds and drops the school line for private school', () => {
    const { plan, id } = withKid();
    const priv = applyKidOptions(plan, id, { ...KID_DEFAULTS, school: 'private' });
    expect(idsOf(priv, id).filter((i) => i === `${id}-school`)).toHaveLength(1);
    const pub = applyKidOptions(priv, id, KID_DEFAULTS);
    expect(idsOf(pub, id)).not.toContain(`${id}-school`);
  });

  it('opens a 529 account with its line, resizes it in place, and closes both', () => {
    const { plan, id } = withKid();
    const on = applyKidOptions(plan, id, { ...KID_DEFAULTS, collegeSavingsMonthly: 250 });
    expect(on.accounts.filter((a) => a.id === `${id}-529`)).toHaveLength(1);
    expect(idsOf(on, id).filter((i) => i === `${id}-529`)).toHaveLength(1);

    const more = applyKidOptions(on, id, { ...KID_DEFAULTS, collegeSavingsMonthly: 400 });
    expect(more.accounts.filter((a) => a.id === `${id}-529`)).toHaveLength(1);
    expect(more.budget!.filter((l) => l.id === `${id}-529`)).toHaveLength(1);
    expect(more.budget!.find((l) => l.id === `${id}-529`)!.amount).toBe(400);

    const off = applyKidOptions(more, id, KID_DEFAULTS);
    expect(off.accounts.some((a) => a.id === `${id}-529`)).toBe(false);
    expect(idsOf(off, id)).not.toContain(`${id}-529`);
  });

  it('leaves a hand-edited line in a stage that was not touched', () => {
    const { plan, id } = withKid();
    const tuned: Plan = {
      ...plan,
      budget: plan.budget!.map((l) => (l.id === `${id}-food` ? { ...l, amount: 900 } : l.id === `${id}-college` ? { ...l, amount: 2_900 } : l)),
    };
    // The editor starts from what the plan says, so an untouched hand-tuned stage reads null.
    const next = applyKidOptions(tuned, id, { ...readKidChoices(tuned, id), childcare: 'nanny' });
    expect(next.budget!.find((l) => l.id === `${id}-food`)!.amount).toBe(900);
    expect(next.budget!.find((l) => l.id === `${id}-college`)!.amount).toBe(2_900);
  });

  it('does not touch another child', () => {
    const one = withKid();
    const plan = addChild(one.plan, { name: 'Leo', birthYear: 2029, options: KID_DEFAULTS });
    const other = plan.participants.filter((p) => p.role === 'child').find((p) => p.id !== one.id)!.id;
    const next = applyKidOptions(plan, one.id, { ...KID_DEFAULTS, childcare: 'nanny' });
    expect(next.budget!.filter((l) => l.owner === other)).toEqual(plan.budget!.filter((l) => l.owner === other));
  });
});
