import { describe, expect, it } from 'vitest';
import { account } from '../planFixtures';
import { effectiveShortTermRate, setShortTermRate, setTreatment } from './gainsTaxField';

/** A taxable account as it was saved before v6: no gains-tax fields at all. */
const saved = account({
  id: 'brokerage',
  accountClass: 'taxableInvestment',
  initialBalance: 100_000,
  growthRate: 6.5,
  withdrawalTaxRate: 15,
  taxableWithdrawalPercent: 60,
});

describe('setTreatment', () => {
  it('turns active trading on without touching the other fields', () => {
    const next = setTreatment(saved, 'activeTrading');
    expect(next.gainsTaxTreatment).toBe('activeTrading');
    expect(next.withdrawalTaxRate).toBe(15);
    expect(next.taxableWithdrawalPercent).toBe(60);
  });

  it('does not mutate the draft it was given', () => {
    setTreatment(saved, 'activeTrading');
    expect('gainsTaxTreatment' in saved).toBe(false);
  });

  it('switching back to long-term restores the pre-v6 account exactly', () => {
    const active = setShortTermRate(setTreatment(saved, 'activeTrading'), 32);
    const back = setTreatment(active, 'longTerm');
    expect(back).toStrictEqual(saved);
    expect(Object.keys(back)).not.toContain('gainsTaxTreatment');
    expect(Object.keys(back)).not.toContain('shortTermGainsRate');
  });

  it('long-term on an account that never had the field leaves it unchanged', () => {
    expect(setTreatment(saved, 'longTerm')).toStrictEqual(saved);
  });

  it('keeps a short-term rate while active trading stays on', () => {
    const active = setShortTermRate(setTreatment(saved, 'activeTrading'), 32);
    expect(setTreatment(active, 'activeTrading').shortTermGainsRate).toBe(32);
  });
});

describe('setShortTermRate', () => {
  it('stores a rate', () => {
    expect(setShortTermRate(saved, 32).shortTermGainsRate).toBe(32);
  });

  it('an empty input deletes the field rather than storing 0', () => {
    const withRate = setShortTermRate(saved, 32);
    const cleared = setShortTermRate(withRate, '');
    expect('shortTermGainsRate' in cleared).toBe(false);
    expect(cleared).toStrictEqual(saved);
  });

  it('an explicit 0 is a real rate and is kept', () => {
    expect(setShortTermRate(saved, 0).shortTermGainsRate).toBe(0);
  });
});

describe('effectiveShortTermRate', () => {
  const settings = { incomeTaxRate: 28 };

  it('falls back to the plan income tax rate when unset', () => {
    expect(effectiveShortTermRate(saved, settings)).toBe(28);
  });

  it('uses the account rate when set, including 0', () => {
    expect(effectiveShortTermRate(setShortTermRate(saved, 35), settings)).toBe(35);
    expect(effectiveShortTermRate(setShortTermRate(saved, 0), settings)).toBe(0);
  });
});
