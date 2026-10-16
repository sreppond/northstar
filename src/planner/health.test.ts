import { describe, expect, it } from 'vitest';
import { pathMarkers, runPlan } from '@northstar/engine';
import type { Plan } from '@northstar/engine';
import { planHealth } from './health';
import { account, basePlan, event, healthyPlan, kitchenSinkPlan, runsDryPlan } from './planFixtures';
import { SAMPLE_PLANS } from './samplePlan';

describe('planHealth', () => {
  it('reports a plan that runs dry, from the engine markers rather than a recount', () => {
    const plan = runsDryPlan();
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    const markers = pathMarkers(result);

    expect(health.status).toBe('short');
    expect(health.shortYears).toEqual(markers.shortfallYears);
    expect(health.unfundedTotal).toBe(markers.shortfallTotal);
    expect(health.firstShortYear).toBe(markers.shortfallYears[0]);
    expect(health.firstShortYear).toBeGreaterThan(plan.settings.startYear);
    expect(health.signature).toBe(`${health.firstShortYear}:${Math.round(health.unfundedTotal / 1000) * 1000}`);
  });

  it('is ok, with a stable signature, for a plan that never goes short', () => {
    const plan = healthyPlan();
    const health = planHealth(runPlan(plan), plan);

    expect(health.status).toBe('ok');
    expect(health.firstShortYear).toBeUndefined();
    expect(health.shortYears).toEqual([]);
    expect(health.unfundedTotal).toBe(0);
    expect(health.signature).toBe('ok');
  });

  it('changes the signature when the failure moves, so a dismissal does not outlive the problem', () => {
    const early = runsDryPlan();
    const later = runsDryPlan();
    later.accounts[0] = { ...later.accounts[0], initialBalance: 600_000 };
    const a = planHealth(runPlan(early), early).signature;
    const b = planHealth(runPlan(later), later).signature;
    expect(a).not.toBe(b);
  });

  it('keeps spendable under net worth every year, and at zero where the plan runs dry', () => {
    const plans: Plan[] = [runsDryPlan(), healthyPlan(), kitchenSinkPlan(), ...SAMPLE_PLANS];
    for (const plan of plans) {
      const result = runPlan(plan);
      for (const health of [planHealth(result, plan), planHealth(result)]) {
        expect(health.spendable).toHaveLength(result.years.length);
        health.spendable.forEach((v, i) => {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(result.years[i].netWorth + 1e-6);
        });
      }
    }

    // The point of the series: net worth still looks fine after the money is gone.
    const plan = runsDryPlan();
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    const last = result.years.length - 1;
    expect(health.spendable[last]).toBeLessThan(1);
    expect(result.years[last].netWorth).toBeGreaterThan(500_000);
  });

  it('leaves out real estate, liabilities and locked accounts', () => {
    const plan = basePlan({
      accounts: [
        account({ id: 'cash', accountClass: 'cash', initialBalance: 10_000, growthRate: 0 }),
        account({ id: 'home', accountClass: 'realEstate', initialBalance: 300_000, growthRate: 0, withdrawalTiming: 'never' }),
        account({ id: 'loan', accountClass: 'loan', isLiability: true, initialBalance: 50_000, growthRateMethod: 'noChange', interestRate: 0, plannedPayment: 0 }),
        account({ id: 'locked', accountClass: 'taxFreeInvestment', initialBalance: 80_000, growthRate: 0, withdrawalTiming: 'never' }),
      ],
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2028, isRequired: true })],
      rules: [
        { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
        { accountId: 'locked', ruleType: 'withdrawal', order: 2 },
      ],
    });
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    expect(health.spendable[0]).toBeCloseTo(10_000, 0);
    expect(result.years[0].netWorth).toBeCloseTo(10_000 + 300_000 + 80_000 - 50_000, 0);
  });

  it('counts a retirement account only once it can be drawn without penalty', () => {
    // Born 1980: 59.5 is passed in 2040 (age 60 at year end).
    const plan = basePlan({
      settings: { ...basePlan().settings, projectionYears: 25 },
      accounts: [
        account({ id: 'cash', accountClass: 'cash', initialBalance: 5_000, growthRate: 0 }),
        account({
          id: 'ira',
          accountClass: 'taxDeferredInvestment',
          initialBalance: 100_000,
          growthRate: 0,
          withdrawalTaxRate: 24,
          taxableWithdrawalPercent: 100,
          penaltyRate: 10,
          penaltyFreeAge: 59.5,
        }),
      ],
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2050, isRequired: true })],
      rules: [
        { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
        { accountId: 'ira', ruleType: 'withdrawal', order: 2 },
      ],
    });
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    const at = (year: number) => health.spendable[year - plan.settings.startYear];

    expect(at(2030)).toBeCloseTo(5_000, 0); // age 50: the penalty still applies
    expect(at(2040)).toBeCloseTo(105_000, 0); // age 60: free to draw

    // And a rule is required: the engine never draws an account no rule names.
    const unruled = { ...plan, rules: plan.rules.filter((r) => r.accountId !== 'ira') };
    expect(planHealth(runPlan(unruled), unruled).spendable[2040 - 2026]).toBeCloseTo(5_000, 0);
  });

  it('without the plan, counts only cash and taxable investments', () => {
    const plan = healthyPlan();
    const result = runPlan(plan);
    const cashAndBrokerage = result.years.map((y) =>
      y.accounts
        .filter((a) => a.accountClass === 'cash' || a.accountClass === 'taxableInvestment')
        .reduce((s, a) => s + a.close, 0),
    );
    expect(planHealth(result).spendable).toEqual(cashAndBrokerage);
  });

  it('holds a SEPP-locked annuity out of spendable', () => {
    // Make the annuity otherwise drawable (a rule, no penalty) so the SEPP lock is the only gate.
    const drawable = kitchenSinkPlan();
    drawable.accounts = drawable.accounts.map((a) => (a.id === 'annuity' ? { ...a, penaltyRate: 0 } : a));
    drawable.rules = [...drawable.rules, { accountId: 'annuity', ruleType: 'withdrawal', order: 4 }];
    const unlocked = { ...drawable, accounts: drawable.accounts.map((a) => (a.id === 'annuity' ? { ...a, seppElection: undefined } : a)) };

    const locked = planHealth(runPlan(drawable), drawable).spendable;
    const free = planHealth(runPlan(unlocked), unlocked).spendable;
    // 2028 is the SEPP's first year: the annuity is held out in one and counted in the other.
    expect(free[2028 - 2026]).toBeGreaterThan(locked[2028 - 2026] + 100_000);
  });
});
