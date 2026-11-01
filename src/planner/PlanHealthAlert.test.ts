import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import { planHealth, type PlanHealth } from './health';
import { overdrawnSummary } from './health';
import { strandedClauses } from './PlanHealthAlert';
import { runsDryPlan } from './planFixtures';

describe('strandedClauses (V5-REVIEW-1 F6)', () => {
  it('names the stranded account classes and what is wrong with them', () => {
    const plan = runsDryPlan();
    const health = planHealth(runPlan(plan), plan);
    const clauses = strandedClauses(health.stranded);
    expect(clauses).toHaveLength(1);
    expect(clauses[0].reason).toBe('never');
    expect(clauses[0].text).toMatch(/Tax-deferred.* is never drawn to cover a shortfall$/);
    expect(clauses[0].total).toBeGreaterThan(400_000);
  });

  it('groups by reason, biggest pile first, and joins several classes', () => {
    const clauses = strandedClauses([
      { accountId: 'a', accountClass: 'taxDeferredInvestment', balance: 500_000, reason: 'never' },
      { accountId: 'b', accountClass: 'variableAnnuity', balance: 300_000, reason: 'never' },
      { accountId: 'c', accountClass: 'taxFreeInvestment', balance: 900_000, reason: 'penalty' },
    ]);
    expect(clauses.map((c) => c.reason)).toEqual(['penalty', 'never']);
    expect(clauses[1].text).toContain('Tax-deferred investments and Variable annuity are never drawn to cover a shortfall');
  });

  it('says nothing when nothing is stranded', () => {
    expect(strandedClauses([])).toEqual([]);
  });
});

describe('overdrawnSummary (docs/V6.1-PLAN.md B2)', () => {
  /** A short plan with the given span and peak; the other fields are not read by the headline. */
  const short = (over: Partial<PlanHealth>): PlanHealth => ({
    status: 'short',
    shortYears: [],
    unfundedTotal: 0,
    overdrawnPeak: 0,
    spendable: [],
    stranded: [],
    signature: 'x',
    ...over,
  });
  const headline = (health: PlanHealth) => {
    const s = overdrawnSummary(health)!;
    return `${s.span} — ${s.amount}.`;
  };

  it('names the span and the peak across several years', () => {
    expect(
      headline(short({ firstShortYear: 2034, lastShortYear: 2036, overdrawnPeak: 207_000 })),
    ).toBe('Overdrawn from 2034 to 2036 — up to $207K.');
  });

  it('reads a single year as one year, with no "up to"', () => {
    expect(
      headline(short({ firstShortYear: 2034, lastShortYear: 2034, overdrawnPeak: 207_000 })),
    ).toBe('Overdrawn in 2034 — $207K.');
  });

  it('is undefined for a plan that is not short', () => {
    expect(overdrawnSummary(short({ status: 'ok' }))).toBeUndefined();
  });
});
