/**
 * The two bespoke controls a `job` event needs beyond the generated form
 * (docs/REDESIGN.md §2.1): a list of RSU vests and a list of comp steps
 * (promotions / new-role resets). Both are zod arrays of objects, which
 * `describeSchema` correctly marks `custom` — schemaForm.test.ts pins them —
 * so EventDrawer skips the generated field and renders these instead.
 *
 * Deliberately NOT built on `RateSchedule`: that component is a rate curve
 * with a pinned first anchor at the plan's start and a step-line preview,
 * none of which fits a one-off vest or a salary reset that starts partway
 * through the job. Both lists here are optional and may be empty — most jobs
 * have neither — so there is no pinned first row, just an add button.
 */
import { NumberInput } from './fields';

interface RsuVest {
  year: number;
  amount: number;
}

interface CompStep {
  year: number;
  newBaseSalary: number;
  label?: string;
}

export function RsuVestingEditor({
  value,
  startYear,
  endYear,
  onChange,
}: {
  value: RsuVest[] | undefined;
  startYear: number;
  endYear: number;
  onChange(next: RsuVest[]): void;
}) {
  const vests = sort(value ?? []);
  const used = new Set(vests.map((v) => v.year));

  return (
    <div className="ns-retain">
      <div className="ns-retain-title">RSU vesting</div>
      <p className="ns-drawer-hint">
        Each vest lands as taxable income in its own year — leave empty if this job has none.
      </p>

      {vests.length > 0 && (
        <div className="ns-sched-head">
          <span className="ns-field-label">Year</span>
          <span className="ns-field-label">Amount</span>
          <span />
        </div>
      )}

      {vests.map((vest, i) => (
        <div key={i} className="ns-sched-row">
          <select
            className="ns-input"
            aria-label="Vest year"
            value={vest.year}
            onChange={(e) => onChange(sort(replaceAt(vests, i, { ...vest, year: Number(e.target.value) })))}
          >
            {yearOptions(startYear, endYear, used, vest.year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <NumberInput
            value={vest.amount}
            unit="currency"
            step={1000}
            onChange={(v) => onChange(replaceAt(vests, i, { ...vest, amount: v ?? 0 }))}
          />
          <button
            type="button"
            className="ns-sched-remove"
            aria-label={`Remove the ${vest.year} vest`}
            onClick={() => onChange(vests.filter((_, j) => j !== i))}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      {(() => {
        const next = nextFreeYear(vests.map((v) => v.year), used, startYear, endYear);
        if (next === undefined) return null;
        return (
          <button
            type="button"
            className="ns-sched-add"
            onClick={() => onChange(sort([...vests, { year: next, amount: 25_000 }]))}
          >
            <PlusIcon />
            Add vest
          </button>
        );
      })()}
    </div>
  );
}

export function CompStepsEditor({
  value,
  startYear,
  endYear,
  onChange,
}: {
  value: CompStep[] | undefined;
  startYear: number;
  endYear: number;
  onChange(next: CompStep[]): void;
}) {
  const steps = sort(value ?? []);
  const used = new Set(steps.map((s) => s.year));

  return (
    <div className="ns-retain">
      <div className="ns-retain-title">Promotions &amp; role changes</div>
      <p className="ns-drawer-hint">
        Each step resets the base salary; the annual raise above compounds from there. Leave empty
        if pay only ever moves by the raise.
      </p>

      {steps.length > 0 && (
        <div className="ns-sched-head-3">
          <span className="ns-field-label">Year</span>
          <span className="ns-field-label">New base salary</span>
          <span className="ns-field-label">Label</span>
          <span />
        </div>
      )}

      {steps.map((step, i) => (
        <div key={i} className="ns-sched-row-3">
          <select
            className="ns-input"
            aria-label="Step year"
            value={step.year}
            onChange={(e) => onChange(sort(replaceAt(steps, i, { ...step, year: Number(e.target.value) })))}
          >
            {yearOptions(startYear, endYear, used, step.year).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <NumberInput
            value={step.newBaseSalary}
            unit="currency"
            step={1000}
            onChange={(v) => onChange(replaceAt(steps, i, { ...step, newBaseSalary: v ?? 0 }))}
          />
          <input
            className="ns-input"
            placeholder="Promotion"
            value={step.label ?? ''}
            aria-label="Step label"
            onChange={(e) => onChange(replaceAt(steps, i, { ...step, label: e.target.value || undefined }))}
          />
          <button
            type="button"
            className="ns-sched-remove"
            aria-label={`Remove the ${step.year} step`}
            onClick={() => onChange(steps.filter((_, j) => j !== i))}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      {(() => {
        const next = nextFreeYear(steps.map((s) => s.year), used, startYear, endYear);
        if (next === undefined) return null;
        return (
          <button
            type="button"
            className="ns-sched-add"
            onClick={() =>
              onChange(sort([...steps, { year: next, newBaseSalary: steps.at(-1)?.newBaseSalary ?? 0 }]))
            }
          >
            <PlusIcon />
            Add step
          </button>
        );
      })()}
    </div>
  );
}

// --- shared helpers ----------------------------------------------------------

function sort<T extends { year: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.year - b.year);
}

function replaceAt<T>(rows: T[], index: number, next: T): T[] {
  return rows.map((row, i) => (i === index ? next : row));
}

function yearOptions(startYear: number, endYear: number, used: Set<number>, own: number): number[] {
  const out: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    if (y === own || !used.has(y)) out.push(y);
  }
  return out;
}

/** The next unused year in range, starting from the year after the last row. */
function nextFreeYear(
  years: number[],
  used: Set<number>,
  startYear: number,
  endYear: number,
): number | undefined {
  const from = years.length > 0 ? Math.max(...years) + 1 : startYear;
  for (let y = from; y <= endYear; y++) {
    if (!used.has(y)) return y;
  }
  for (let y = startYear; y <= endYear; y++) {
    if (!used.has(y)) return y;
  }
  return undefined;
}

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}
