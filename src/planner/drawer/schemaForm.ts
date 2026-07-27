/**
 * Turns an event module's zod schema into field descriptors, so all eleven
 * drawer forms are generated rather than hand-written.
 *
 * This is the payoff for putting zod in the engine (docs/PLAN.md §3.1): one
 * schema validates engine input AND describes the form. If a config field is
 * added to an event module, its input appears here for free.
 *
 * Reaches into zod's `_def`, which is internal. Verified against zod 3.25;
 * the shape is asserted by schemaForm.test.ts so a zod upgrade that changes
 * it fails loudly instead of silently rendering an empty form.
 */
import type { z } from 'zod';

export type FieldUnit = 'currency' | 'percent' | 'year' | 'plain';

export interface FieldDescriptor {
  name: string;
  label: string;
  /**
   * `custom` means the generic form cannot render it — a record or a nested
   * object. The drawer supplies a bespoke control and skips the generated one,
   * rather than falling through to a number input that writes junk.
   */
  kind: 'number' | 'boolean' | 'string' | 'custom';
  unit: FieldUnit;
  required: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  integer: boolean;
}

export function describeSchema(schema: z.ZodTypeAny): FieldDescriptor[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return [];

  return Object.entries(shape).map(([name, raw]) => {
    let node = raw as AnyDef;
    let required = true;
    let defaultValue: unknown;

    // Unwrap ZodDefault / ZodOptional to reach the primitive.
    while (node?._def?.typeName === 'ZodDefault' || node?._def?.typeName === 'ZodOptional') {
      if (node._def.typeName === 'ZodDefault') defaultValue = node._def.defaultValue?.();
      required = false;
      node = node._def.innerType as AnyDef;
    }

    const typeName = node?._def?.typeName;
    const checks = (node?._def?.checks ?? []) as { kind: string; value?: number }[];

    return {
      name,
      label: humanize(name),
      kind: kindFor(typeName),
      unit: unitFor(name),
      required,
      defaultValue,
      min: checks.find((c) => c.kind === 'min')?.value,
      max: checks.find((c) => c.kind === 'max')?.value,
      integer: checks.some((c) => c.kind === 'int'),
    };
  });
}

function kindFor(typeName: string | undefined): FieldDescriptor['kind'] {
  switch (typeName) {
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodString':
      return 'string';
    case 'ZodRecord':
    case 'ZodArray':
    case 'ZodObject':
      return 'custom';
    default:
      return 'number';
  }
}

interface AnyDef {
  _def?: {
    typeName?: string;
    innerType?: unknown;
    defaultValue?: () => unknown;
    checks?: unknown[];
  };
}

/**
 * Unit inferred from the field name. Naming in the event modules is
 * consistent enough that this beats maintaining a parallel metadata table
 * that would drift out of step with the schemas.
 */
function unitFor(name: string): FieldUnit {
  if (/Percent$|Rate$/.test(name)) return 'percent';
  if (/Year$/.test(name)) return 'year';
  if (/Years$|Age$|colaRate/.test(name)) return 'plain';
  if (/amount|cost|price|salary|benefit|payment|annual|monthly|balance/i.test(name)) {
    return 'currency';
  }
  return 'plain';
}

const OVERRIDES: Record<string, string> = {
  hoaMonthly: 'HOA (monthly)',
  colaRate: 'COLA rate',
  isTaxable: 'Taxable',
  isEarned: 'Counts as earned income',
  contributionIsPretax: 'Contribution is pre-tax',
  termYears: 'Term (years)',
  durationYears: 'Duration (years)',
  collegeYears: 'College (years)',
  insuranceAnnual: 'Insurance (annual)',
  annualBenefit: 'Annual benefit',
  supportYears: 'Years of child expenses',
  upfrontCost: 'Upfront costs',
  annualCost: 'Yearly child expenses',
  costGrowthRate: 'Change over time',
  collegeStartAge: 'College starts at age',
  spendingChangePercent: 'Spending change',
  incomeReplacementPercent: 'Income replacement',
  retirementContributionPercent: 'Retirement contribution',
  employerMatchPercent: 'Employer match',
  taxablePercent: 'Taxable share',
  contributionAccountId: 'Contribution account',
  participantId: 'Person',
  signingBonus: 'Signing bonus',
  replacesEarnedIncome: 'Zero out earnings this replaces',
  affectsUnearnedIncome: 'Also stop unearned income',
  defaultIncomeRetentionPercent: 'Default income kept',
  oneTimeCost: 'One-off cost',
  growthRate: 'Growth rate',
};

function humanize(name: string): string {
  if (OVERRIDES[name]) return OVERRIDES[name];
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^is /, '')
    .toLowerCase()
    // The field renders a % affix, so "Down payment percent" says it twice.
    // "…rate" is left alone — "Mortgage rate" reads better than "Mortgage".
    .replace(/ percent$/, '');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Sensible step for a numeric input given its unit and bounds. */
export function stepFor(field: FieldDescriptor): number {
  if (field.integer) return 1;
  if (field.unit === 'percent') return 0.1;
  if (field.unit === 'currency') return 1000;
  return 1;
}
