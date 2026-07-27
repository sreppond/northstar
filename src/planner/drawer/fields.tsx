import type { ReactNode } from 'react';
import type { AccountFieldSpec } from '@northstar/engine';
import { stepFor, type FieldDescriptor } from './schemaForm';

/**
 * Form primitives shared by every drawer.
 *
 * Two field renderers because the two sources describe themselves differently:
 * events carry zod `FieldDescriptor`s derived from their schema, account types
 * carry hand-declared `AccountFieldSpec`s. Both funnel into the same inputs, so
 * they look and behave identically.
 */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="ns-field">
      <span className="ns-field-label">{label}</span>
      {children}
      {hint && <span className="ns-field-hint">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  unit,
  step,
  min,
  max,
  placeholder,
}: {
  value: unknown;
  onChange(value: number | undefined): void;
  unit: 'currency' | 'percent' | 'year' | 'age' | 'plain';
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div className="ns-input-wrap">
      {unit === 'currency' && <span className="ns-affix">$</span>}
      <input
        className={`ns-input ns-num${unit === 'currency' ? ' ns-input-prefixed' : ''}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value === undefined || value === null ? '' : String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      {unit === 'percent' && <span className="ns-affix ns-affix-right">%</span>}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="ns-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Choice<T extends string>({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  hint?: string;
  onChange(value: T): void;
}) {
  return (
    <div className="ns-field">
      <span className="ns-field-label">{label}</span>
      <div className="ns-choice">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="ns-choice-opt"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {hint && <span className="ns-field-hint">{hint}</span>}
    </div>
  );
}

/** An event config field, described by its zod schema. */
export function ConfigField({
  field,
  value,
  onChange,
  options,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange(value: unknown): void;
  /**
   * Turns an id-shaped string field into a picker. `participantId` and
   * `contributionAccountId` are references to things elsewhere in the plan —
   * as free text they ask the user to know an internal id, which nobody does.
   */
  options?: { value: string; label: string }[];
}) {
  if (field.kind === 'boolean') {
    return (
      <Toggle
        label={field.label}
        checked={value === undefined ? Boolean(field.defaultValue) : Boolean(value)}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'string') {
    if (options) {
      return (
        <Field label={field.label}>
          <select
            className="ns-input"
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">{field.required ? 'Choose…' : 'None'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      );
    }

    return (
      <Field label={field.label}>
        <input
          className="ns-input"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} hint={boundsHint(field.min, field.max)}>
      <NumberInput
        value={value}
        unit={field.unit}
        step={stepFor(field)}
        min={field.min}
        max={field.max}
        placeholder={
          field.defaultValue !== undefined
            ? String(field.defaultValue)
            : field.required
              ? 'Required'
              : 'Optional'
        }
        onChange={onChange}
      />
    </Field>
  );
}

const GROWTH_OPTIONS = [
  { value: 'fixed', label: 'Fixed rate' },
  { value: 'noChange', label: 'No change' },
] as const;

const TIMING_OPTIONS = [
  { value: 'always', label: 'Any time' },
  { value: 'starting_year', label: 'From a year' },
  { value: 'never', label: 'Never' },
] as const;

/** An account setting, described by its type's field spec. */
export function AccountField({
  field,
  value,
  onChange,
}: {
  field: AccountFieldSpec;
  value: unknown;
  onChange(value: unknown): void;
}) {
  if (field.kind === 'growthMethod' || field.kind === 'withdrawalTiming') {
    const options = field.kind === 'growthMethod' ? GROWTH_OPTIONS : TIMING_OPTIONS;
    return (
      <Choice
        label={field.label}
        hint={field.help}
        value={String(value) as never}
        options={options as never}
        onChange={onChange as never}
      />
    );
  }

  if (field.kind === 'boolean') {
    return <Toggle label={field.label} checked={Boolean(value)} onChange={onChange} />;
  }

  return (
    <Field label={field.label} hint={field.help ?? boundsHint(field.min, field.max)}>
      <NumberInput
        value={value}
        unit={field.unit}
        step={field.step ?? defaultStep(field)}
        min={field.min}
        max={field.max}
        placeholder={field.min !== undefined ? String(field.min) : ''}
        onChange={onChange}
      />
    </Field>
  );
}

function defaultStep(field: AccountFieldSpec): number {
  return stepFor({
    name: String(field.key),
    label: field.label,
    kind: 'number',
    unit: field.unit === 'age' ? 'plain' : field.unit,
    required: false,
    integer: field.unit === 'year',
  });
}

function boundsHint(min?: number, max?: number): string | undefined {
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (max !== undefined) return `Max ${max}`;
  return undefined;
}
