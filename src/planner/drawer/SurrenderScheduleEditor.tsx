import type { SurrenderScheduleEntry } from '@northstar/engine';
import { NumberInput } from './fields';

/**
 * The surrender-charge schedule editor — a list of (contract year, percent
 * kept by the carrier) rows, in the same visual language as
 * `RateSchedule.tsx`'s (year, rate) anchors but deliberately simpler: no
 * chart preview (a declining staircase to zero needs no picture to read),
 * and the year is a small free-form CONTRACT year (1, 2, 3…, per
 * `packages/engine/src/annuity.ts`'s `contractYearFor`) rather than a
 * calendar year bounded by the plan's horizon — a 10-year surrender period
 * has nothing to do with when the plan ends.
 */
interface Props {
  label: string;
  value: SurrenderScheduleEntry[] | undefined;
  onChange(next: SurrenderScheduleEntry[]): void;
}

export function SurrenderScheduleEditor({ label, value, onChange }: Props) {
  const rows = value && value.length > 0 ? [...value].sort((a, b) => a.year - b.year) : [];

  const setRow = (index: number, patch: Partial<SurrenderScheduleEntry>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(sort(next));
  };

  return (
    <div className="ns-field">
      <div className="ns-sched-head">
        <span className="ns-field-label">Contract year</span>
        <span className="ns-field-label">{label}</span>
        <span />
      </div>

      {rows.length === 0 && <p className="ns-field-hint">No surrender period — nothing to add.</p>}

      {rows.map((row, i) => (
        <div key={i} className="ns-sched-row">
          <NumberInput
            value={row.year}
            unit="plain"
            step={1}
            min={1}
            onChange={(v) => setRow(i, { year: Math.max(1, Math.round(v ?? 1)) })}
          />
          <NumberInput
            value={row.percent}
            unit="percent"
            step={0.5}
            min={0}
            max={100}
            onChange={(v) => setRow(i, { percent: v ?? 0 })}
          />
          <button
            type="button"
            className="ns-sched-remove"
            aria-label={`Remove contract year ${row.year}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="ns-sched-add"
        onClick={() => {
          const lastYear = rows.length > 0 ? rows[rows.length - 1].year : 0;
          const lastPercent = rows.length > 0 ? rows[rows.length - 1].percent : 7;
          onChange(sort([...rows, { year: lastYear + 1, percent: Math.max(0, lastPercent - 1) }]));
        }}
      >
        <PlusIcon />
        Add year
      </button>
    </div>
  );
}

const sort = (rows: SurrenderScheduleEntry[]) => [...rows].sort((a, b) => a.year - b.year);

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
