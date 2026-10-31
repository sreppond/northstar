import type { Account } from '@northstar/engine';

/**
 * The gains-tax control's writes and reads, kept out of the component so the
 * saved shape is testable. Long-term is the default, so choosing it leaves no
 * trace: the account comes back exactly as it was saved before v6.
 */
export type GainsTaxTreatment = 'longTerm' | 'activeTrading';

export function setTreatment(account: Account, treatment: GainsTaxTreatment): Account {
  if (treatment === 'activeTrading') {
    return { ...account, gainsTaxTreatment: 'activeTrading' };
  }
  const { gainsTaxTreatment: _treatment, shortTermGainsRate: _rate, ...rest } = account;
  return rest;
}

/** An empty input clears the rate, so the plan's income tax rate applies again. */
export function setShortTermRate(account: Account, value: number | ''): Account {
  if (value === '') {
    const { shortTermGainsRate: _rate, ...rest } = account;
    return rest;
  }
  return { ...account, shortTermGainsRate: value };
}

export function effectiveShortTermRate(account: Account, settings: { incomeTaxRate: number }): number {
  return account.shortTermGainsRate ?? settings.incomeTaxRate;
}
