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
import type { Anchor, Participant, PlanEvent, WorkPhase } from '@northstar/engine';
import { resolveAnchor } from '@northstar/engine';
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

const MODE_OPTIONS: { value: WorkPhase['mode']; label: string }[] = [
  { value: 'full', label: 'Full-time' },
  { value: 'part', label: 'Part-time' },
  { value: 'leave', label: 'Leave' },
  { value: 'off', label: 'Not working' },
];

/**
 * How much of this job is worked over time (docs/REDESIGN-V4.md §4.3) — the
 * job runs full-time until the first phase, then each phase until the next.
 * A phase can start in a year or WHEN something happens ("when First child
 * arrives"), so moving the baby moves the leave with it.
 */
export function WorkPhasesEditor({
  value,
  startYear,
  endYear,
  events,
  participants,
  ownEventId,
  onChange,
}: {
  value: WorkPhase[] | undefined;
  startYear: number;
  endYear: number;
  /** Other events a phase can start with. */
  events: PlanEvent[];
  participants: Participant[];
  ownEventId: string;
  onChange(next: WorkPhase[]): void;
}) {
  const scope = { events, participants };
  const yearOf = (a: Anchor) => resolveAnchor(a, scope) ?? Infinity;
  const phases = [...(value ?? [])].sort((a, b) => yearOf(a.from as Anchor) - yearOf(b.from as Anchor));
  const anchorEvents = events.filter(
    (e) => e.isIncluded && !e.isHidden && e.kind !== 'endOfPlan' && e.id !== ownEventId,
  );

  const encode = (a: Anchor) => (a.kind === 'event' ? `e:${a.eventId}` : a.kind === 'year' ? `y:${a.year}` : `y:${yearOf(a)}`);
  const decode = (v: string): Anchor =>
    v.startsWith('e:') ? { kind: 'event', eventId: v.slice(2) } : { kind: 'year', year: Number(v.slice(2)) };

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  return (
    <div className="ns-retain">
      <div className="ns-retain-title">Work over time</div>
      <p className="ns-drawer-hint">
        Full-time until the first change. A leave or part-time stretch scales salary, bonus and the 401(k)
        together; RSU vests are left alone.
      </p>

      {phases.length > 0 && (
        <div className="ns-sched-head-3">
          <span className="ns-field-label">Starts</span>
          <span className="ns-field-label">Becomes</span>
          <span className="ns-field-label">Of full pay</span>
          <span />
        </div>
      )}

      {phases.map((phase, i) => {
        const from = phase.from as Anchor;
        const showsPercent = phase.mode === 'part' || phase.mode === 'leave';
        return (
          <div key={i} className="ns-sched-row-3">
            <select
              className="ns-input"
              aria-label="Phase starts"
              value={encode(from)}
              onChange={(e) => onChange(replaceAt(phases, i, { ...phase, from: decode(e.target.value) }))}
            >
              {anchorEvents.length > 0 && (
                <optgroup label="When…">
                  {anchorEvents.map((e) => (
                    <option key={e.id} value={`e:${e.id}`}>
                      {e.name} ({e.startYear})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="In a year">
                {years.map((y) => (
                  <option key={y} value={`y:${y}`}>
                    {y}
                  </option>
                ))}
              </optgroup>
            </select>
            <select
              className="ns-input"
              aria-label="Becomes"
              value={phase.mode}
              onChange={(e) => {
                const mode = e.target.value as WorkPhase['mode'];
                onChange(
                  replaceAt(phases, i, {
                    from,
                    mode,
                    ...(mode === 'part' ? { percent: 60 } : mode === 'leave' ? { percent: 0 } : {}),
                  }),
                );
              }}
            >
              {MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {showsPercent ? (
              <NumberInput
                value={phase.percent ?? (phase.mode === 'part' ? 60 : 0)}
                unit="percent"
                step={5}
                min={0}
                max={100}
                onChange={(v) => onChange(replaceAt(phases, i, { ...phase, percent: v ?? 0 }))}
              />
            ) : (
              <span className="ns-sched-na">{phase.mode === 'full' ? '100%' : '0%'}</span>
            )}
            <button
              type="button"
              className="ns-sched-remove"
              aria-label="Remove this change"
              onClick={() => onChange(phases.filter((_, j) => j !== i))}
            >
              <MinusIcon />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="ns-sched-add"
        onClick={() => {
          const last = phases.at(-1);
          const lastYear = last ? yearOf(last.from as Anchor) : startYear;
          const year = Math.min(endYear, Number.isFinite(lastYear) ? lastYear + 1 : startYear + 1);
          onChange([...phases, { from: { kind: 'year', year }, mode: last?.mode === 'leave' ? 'part' : 'leave', percent: last?.mode === 'leave' ? 60 : 0 }]);
        }}
      >
        <PlusIcon />
        Add a change
      </button>
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
