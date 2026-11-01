import { describe, expect, it } from 'vitest';
import { pathMarkers, runPlan } from '@northstar/engine';
import type { Plan } from '@northstar/engine';
import { healthDangerBand, planHealth } from './health';
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

describe('stranded accounts (V5-REVIEW-1 F6)', () => {
  /** runsDryPlan, with its 401(k) swapped for one set up to fail a specific gate. */
  function dryWith(over: Partial<Plan['accounts'][number]>, ruled: boolean): Plan {
    const plan = runsDryPlan();
    plan.settings = { ...plan.settings, baselineExpenses: 400_000 };
    plan.accounts = plan.accounts.map((a) => (a.id === 'k401' ? { ...a, ...over } : a));
    plan.rules = ruled
      ? [...plan.rules, { accountId: 'k401', ruleType: 'withdrawal', order: 2 }]
      : plan.rules.filter((r) => r.accountId !== 'k401');
    return plan;
  }
  const strandedOf = (plan: Plan) => {
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    expect(health.status).toBe('short');
    return { health, result };
  };

  it("reports 'never' for an account whose withdrawal timing is never", () => {
    const { health, result } = strandedOf(dryWith({ withdrawalTiming: 'never' }, true));
    const row = health.stranded.find((s) => s.accountId === 'k401');
    expect(row).toMatchObject({ accountClass: 'taxDeferredInvestment', reason: 'never' });
    // Measured at the first short year, from that year's own close.
    const snap = result.years.find((y) => y.year === health.firstShortYear)!;
    expect(row!.balance).toBeCloseTo(snap.accounts.find((a) => a.accountId === 'k401')!.close, 6);
    expect(row!.balance).toBeGreaterThan(0);
  });

  it("reports 'noRule' when no withdrawal rule names the account", () => {
    const { health } = strandedOf(dryWith({ withdrawalTiming: 'always', penaltyRate: 0 }, false));
    expect(health.stranded.find((s) => s.accountId === 'k401')?.reason).toBe('noRule');
  });

  it("reports 'sepp' inside a committed SEPP window", () => {
    const { health } = strandedOf(
      dryWith(
        { withdrawalTiming: 'always', seppElection: { startYear: 2026, method: 'amortization', ratePercent: 5 } },
        true,
      ),
    );
    expect(health.stranded.find((s) => s.accountId === 'k401')?.reason).toBe('sepp');
  });

  it("never lists a penalty-age account: the engine draws it at a penalty (V5-REVIEW-2 N5)", () => {
    // A ruled, 'always' 401(k) whose owner is under 59.5 in the short year.
    const plan = dryWith({ withdrawalTiming: 'always' }, true);
    const { health, result } = strandedOf(plan);
    const k401 = plan.accounts.find((a) => a.id === 'k401')!;
    const owner = plan.participants.find((p) => p.id === (k401.ownerParticipantId ?? plan.participants[0].id))!;
    const snap = result.years.find((y) => y.year === health.firstShortYear)!;
    expect(snap.year - owner.birthYear).toBeLessThan(k401.penaltyFreeAge!);
    expect(health.stranded.find((s) => s.accountId === 'k401')).toBeUndefined();
    // ...yet its balance is still not counted as spendable (§4.2): spendable
    // stays penalty-free, so only the cash/brokerage accounts count.
    // The engine draws the whole mid-year balance at the penalty (v6.1 E1), so
    // the 401(k) may close at 0 in the short year; it still opened with money.
    const k401Open = snap.accounts.find((a) => a.accountId === 'k401')!.open;
    expect(k401Open).toBeGreaterThan(0);
    const freeMoney = snap.accounts
      .filter((a) => a.accountClass === 'cash' || a.accountClass === 'taxableInvestment')
      .reduce((n, a) => n + a.close, 0);
    expect(health.spendable[result.years.indexOf(snap)]).toBeCloseTo(freeMoney, 0);
  });

  it('never lists spendable money, home equity or a plan that survives', () => {
    const { health } = strandedOf(dryWith({ withdrawalTiming: 'never' }, true));
    expect(health.stranded.map((s) => s.accountId)).toEqual(['k401']);

    const fine = healthyPlan();
    expect(planHealth(runPlan(fine), fine).stranded).toEqual([]);
    // Without the plan the withdrawal settings are unknown, so nothing is claimed.
    const dry = runsDryPlan();
    expect(planHealth(runPlan(dry)).stranded).toEqual([]);
  });

  it('sorts largest balance first', () => {
    const plan = dryWith({ withdrawalTiming: 'never' }, true);
    plan.accounts = [
      ...plan.accounts,
      account({ id: 'roth', accountClass: 'taxFreeInvestment', initialBalance: 900_000, withdrawalTiming: 'never' }),
    ];
    const { health } = strandedOf(plan);
    expect(health.stranded.map((s) => s.accountId)).toEqual(['roth', 'k401']);
  });
});

describe('healthDangerBand (V5-REVIEW-1 F2)', () => {
  it('carries exactly the short years, so a recovered stretch is not banded', () => {
    const plan = runsDryPlan();
    const result = runPlan(plan);
    const real = planHealth(result, plan);
    // A plan that runs dry, recovers, then runs dry again.
    const health = { ...real, shortYears: [2031, 2032, 2033, 2040, 2041], firstShortYear: 2031 };
    const band = healthDangerBand(health, result)!;
    expect(band.years).toEqual([2031, 2032, 2033, 2040, 2041]);
    expect(band.from).toBe(2031);
    expect(band.to).toBe(2041);
  });

  it('divides the Short amount by perUnit, and is undefined for a healthy plan', () => {
    const plan = runsDryPlan();
    const result = runPlan(plan);
    const health = planHealth(result, plan);
    const year = health.firstShortYear!;
    const whole = healthDangerBand(health, result)!.shortFor!(year)!;
    expect(whole).toBeGreaterThan(0);
    expect(healthDangerBand(health, result, 12)!.shortFor!(year)!).toBeCloseTo(whole / 12, 6);

    const fine = healthyPlan();
    expect(healthDangerBand(planHealth(runPlan(fine), fine), runPlan(fine))).toBeUndefined();
  });
});
