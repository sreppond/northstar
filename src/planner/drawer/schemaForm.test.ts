/**
 * `describeSchema` reads zod's internal `_def`. These tests pin that contract:
 * a zod upgrade that reshapes it should fail here loudly rather than silently
 * rendering an empty drawer form.
 */
import { describe, expect, it } from 'vitest';
import { EVENT_MODULES, buyAHomeConfig } from '@northstar/engine';
import { describeSchema, stepFor } from './schemaForm';

describe('describeSchema', () => {
  const fields = describeSchema(buyAHomeConfig);
  const by = (name: string) => fields.find((f) => f.name === name)!;

  it('finds every field on the schema', () => {
    expect(fields.length).toBe(12);
  });

  it('marks a bare field required and a defaulted field optional', () => {
    expect(by('price').required).toBe(true);
    expect(by('price').defaultValue).toBeUndefined();
    expect(by('downPaymentPercent').required).toBe(false);
    expect(by('downPaymentPercent').defaultValue).toBe(20);
  });

  it('reads min and max out of the zod checks', () => {
    expect(by('downPaymentPercent').min).toBe(0);
    expect(by('downPaymentPercent').max).toBe(100);
    expect(by('price').min).toBe(0);
    expect(by('price').max).toBeUndefined();
  });

  it('detects integer fields', () => {
    expect(by('termYears').integer).toBe(true);
    expect(by('mortgageRate').integer).toBe(false);
  });

  it('unwraps an optional with no default', () => {
    expect(by('sellYear').required).toBe(false);
    expect(by('sellYear').defaultValue).toBeUndefined();
    expect(by('sellYear').unit).toBe('year');
  });

  it('infers units from the field name', () => {
    expect(by('price').unit).toBe('currency');
    expect(by('mortgageRate').unit).toBe('percent');
    expect(by('downPaymentPercent').unit).toBe('percent');
    expect(by('termYears').unit).toBe('plain');
  });

  it('humanises camelCase labels', () => {
    // The % affix already says "percent"; the label should not repeat it.
    expect(by('downPaymentPercent').label).toBe('Down payment');
    expect(by('mortgageRate').label).toBe('Mortgage rate');
    expect(by('hoaMonthly').label).toBe('HOA (monthly)');
    expect(by('termYears').label).toBe('Term (years)');
  });

  it('describes every event kind without throwing or returning empty', () => {
    for (const [kind, mod] of Object.entries(EVENT_MODULES)) {
      const described = describeSchema(mod.schema);
      // endOfPlan is intentionally configless.
      if (kind === 'endOfPlan') {
        expect(described).toHaveLength(0);
        continue;
      }
      expect(described.length, `${kind} produced no fields`).toBeGreaterThan(0);
      for (const field of described) {
        expect(field.kind, `${kind}.${field.name}`).toMatch(/number|boolean|string/);
      }
    }
  });

  it('detects boolean fields', () => {
    const income = describeSchema(EVENT_MODULES.income.schema);
    expect(income.find((f) => f.name === 'isTaxable')?.kind).toBe('boolean');
  });
});

describe('stepFor', () => {
  it('steps by unit', () => {
    const fields = describeSchema(buyAHomeConfig);
    expect(stepFor(fields.find((f) => f.name === 'termYears')!)).toBe(1);
    expect(stepFor(fields.find((f) => f.name === 'mortgageRate')!)).toBe(0.1);
    expect(stepFor(fields.find((f) => f.name === 'price')!)).toBe(1000);
  });
});
