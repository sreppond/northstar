/**
 * "Raises & changes" for an income line (docs/V6-PLAN.md R3): the rules that
 * move the yearly amount, and a year-by-year table of what they produce.
 *
 * Two bespoke controls because the generic form cannot render `raises` or
 * `overrides` (both are arrays of objects, so `describeSchema` marks them
 * `custom`). Every edit is a pure helper from `incomeSchedule.ts` that returns
 * the whole config; EventDrawer writes it through the event draft, so Save and
 * Cancel behave as they do for every other field.
 *
 * Numbers commit on blur or Enter, not on each keystroke: typing "65000" into
 * a year-by-year cell must not write an override for "6", then "65", and so on.
 */
import { useEffect, useId, useState } from 'react';
import { HoverCard } from '../HoverCard';
import { MinusIcon, PlusIcon } from './JobSchedules';
import { formatWithCommas, sanitizeDigits } from './fields';
import { signedTableMoney, ZERO_DASH } from '../format';
import {
  addRaise,
  canAddRaise,
  freeRaiseYear,
  clearOverride,
  previewRows,
  removeRaise,
  setOverride,
  updateRaise,
  type ScheduleConfig,
  type Span,
} from './incomeSchedule';

interface Props {
  /** The draft's whole config. Helpers return a full config, so the caller can replace it. */
  config: ScheduleConfig;
  startYear: number;
  endYear: number;
  onChange(next: ScheduleConfig): void;
}

export function IncomeScheduleEditor({ config, startYear, endYear, onChange }: Props) {
  const span: Span = { startYear, endYear };
  const raises = config.raises ?? [];
  const rows = previewRows(config, startYear, endYear);
  const explainId = useId();

  return (
    <div className="ns-retain ns-income-schedule">
      <div className="ns-retain-title ns-income-title">
        Raises &amp; changes
        <HoverCard
          id={explainId}
          side="bottom"
          content={
            <p className="ns-income-explain">
              Set how this income changes over time: a steady % raise, a fixed $ raise each year, or an
              exact amount for any year.
            </p>
          }
        >
          <span className="ns-income-explain-trigger" tabIndex={0} aria-describedby={explainId} aria-label="About raises and changes">
            ?
          </span>
        </HoverCard>
      </div>
      <p className="ns-drawer-hint">Each change applies from its year until the next one.</p>

      <div className="ns-sched-head-3">
        <span className="ns-field-label">From</span>
        <span className="ns-field-label">Change</span>
        <span className="ns-field-label">Size</span>
        <span />
      </div>

      {/* The base rule: the plan's growth rate, from the event's start year. */}
      <div className="ns-sched-row-3">
        <span className="ns-sched-na">{startYear}</span>
        <span className="ns-sched-na">+% a year</span>
        <PercentInput
          label="Base raise, percent a year"
          value={config.growthRate ?? 0}
          onCommit={(v) => onChange({ ...config, growthRate: v })}
        />
        <span />
      </div>

      {raises.map((raise, i) => (
        <div key={i} className="ns-sched-row-3">
          <DraftNumber
            unit="year"
            ariaLabel={`Change ${i + 1}: from year`}
            value={raise.fromYear}
            clamp={(y) => freeRaiseYear(y, span, raises.filter((_, j) => j !== i).map((r) => r.fromYear)) ?? raise.fromYear}
            onCommit={(y) => onChange(updateRaise(config, i, { fromYear: y }))}
          />
          <select
            className="ns-input"
            aria-label={`Change ${i + 1}: kind`}
            value={raise.kind}
            onChange={(e) => onChange(updateRaise(config, i, { kind: e.target.value as 'percent' | 'dollars' }))}
          >
            <option value="percent">+% a year</option>
            <option value="dollars">+$ a year</option>
          </select>
          {raise.kind === 'percent' ? (
            <PercentInput
              label={`Change ${i + 1}: percent a year`}
              value={raise.value}
              onCommit={(v) => onChange(updateRaise(config, i, { value: v }))}
            />
          ) : (
            <DollarInput
              label={`Change ${i + 1}: dollars a year`}
              value={raise.value}
              onCommit={(v) => onChange(updateRaise(config, i, { value: v }))}
            />
          )}
          <button
            type="button"
            className="ns-sched-remove"
            aria-label={`Remove the change from ${raise.fromYear}`}
            onClick={() => onChange(removeRaise(config, i))}
          >
            <MinusIcon />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="ns-sched-add"
        disabled={!canAddRaise(config, span)}
        onClick={() => onChange(addRaise(config, span))}
      >
        <PlusIcon />
        Add a change
      </button>

      <div className="ns-field-label ns-income-subhead">Year by year</div>
      <p className="ns-drawer-hint">
        Type an amount to set that year. Later years grow from it. Reset returns a year to the schedule.
      </p>

      <div className="ns-income-table-wrap">
        <table className="ns-income-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" className="ns-num">
                Amount (/yr)
              </th>
              <th scope="col" className="ns-num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <th scope="row" className="ns-num">
                  {row.year}
                </th>
                <td>
                  <div className="ns-income-amount">
                    <div className="ns-input-wrap">
                      <span className="ns-affix">$</span>
                      <DraftNumber
                        unit="currency"
                        ariaLabel={`${row.year} amount per year`}
                        value={row.amount}
                        onCommit={(v) => onChange(setOverride(config, row.year, v))}
                        clamp={(v) => Math.max(0, v)}
                      />
                    </div>
                    {row.overridden && (
                      <>
                        <span className="ns-income-set">set</span>
                        <button
                          type="button"
                          className="ns-income-reset"
                          aria-label={`Reset ${row.year} to the schedule`}
                          onClick={() => onChange(clearOverride(config, row.year))}
                        >
                          reset
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td className="ns-num">{row.change === null ? ZERO_DASH : signedTableMoney(row.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * A number that commits on blur or Enter. `clamp` runs first, so a value out
 * of range lands on its limit and the field shows that limit.
 */
function DraftNumber({
  value,
  unit,
  onCommit,
  clamp,
  ariaLabel,
  prefixed = false,
}: {
  value: number | undefined;
  unit: 'currency' | 'percent' | 'year';
  onCommit(value: number): void;
  clamp?(value: number): number;
  ariaLabel: string;
  prefixed?: boolean;
}) {
  const shown = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) return '';
    return unit === 'currency' ? formatWithCommas(String(Math.round(v))) : String(v);
  };

  const [text, setText] = useState(() => shown(value));

  // Resync when the stored value changes from outside (another row was edited,
  // or the base rate moved), but not while the user is typing in this field.
  useEffect(() => {
    setText(shown(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    if (text === shown(value)) return;
    const parsed = parse(text, unit);
    if (parsed === undefined) {
      setText(shown(value));
      return;
    }
    const next = clamp ? clamp(parsed) : parsed;
    setText(shown(next));
    if (next !== value) onCommit(next);
  };

  const input = (
    <input
      className={`ns-input ns-num${prefixed ? ' ns-input-prefixed' : ''}`}
      type={unit === 'currency' ? 'text' : 'number'}
      inputMode={unit === 'currency' ? 'decimal' : undefined}
      step={unit === 'year' ? 1 : unit === 'percent' ? 0.5 : undefined}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(unit === 'currency' ? formatWithCommas(sanitizeDigits(e.target.value)) : e.target.value)}
      onBlur={commit}
      // Select on focus: a click lands mid-number, and typing a new figure
      // must replace it rather than splice into it.
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
  return input;
}

function PercentInput({ label, value, onCommit }: { label: string; value: number; onCommit(value: number): void }) {
  return (
    <div className="ns-input-wrap">
      <DraftNumber unit="percent" ariaLabel={label} value={value} onCommit={onCommit} />
      <span className="ns-affix ns-affix-right">%</span>
    </div>
  );
}

function DollarInput({ label, value, onCommit }: { label: string; value: number; onCommit(value: number): void }) {
  return (
    <div className="ns-input-wrap">
      <span className="ns-affix">$</span>
      <DraftNumber unit="currency" ariaLabel={label} value={value} onCommit={onCommit} prefixed />
    </div>
  );
}

/** Reads what the user typed. Currency keeps digits and one decimal point. */
function parse(raw: string, unit: 'currency' | 'percent' | 'year'): number | undefined {
  const cleaned = unit === 'currency' ? sanitizeDigits(raw) : raw.trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
