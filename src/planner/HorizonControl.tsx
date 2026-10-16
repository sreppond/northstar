import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange } from 'lucide-react';
import type { HorizonSetting, Plan } from '@northstar/engine';
import { DEFAULT_HORIZON_AGE, horizonYear, planEndYear } from '@northstar/engine';
import { Segmented, Select } from './ui';

/**
 * How far the plan runs (docs/REDESIGN-V4.md §3) — the one setting that used
 * to hide inside an "End of plan" event nobody thought to look for.
 *
 * `HorizonFields` is the form itself, shared by the rail popover (applies on
 * commit) and the Assumptions drawer (edits its draft). `currentHorizon`
 * reads a legacy plan's `endOfPlan`/`projectionYears` horizon as a year, so
 * the form always opens on what the plan is actually doing.
 */
export function currentHorizon(plan: Plan): HorizonSetting {
  return plan.settings.horizon ?? { mode: 'year', year: planEndYear(plan) };
}

/** "2026–2091 · to age 95" / "2026–2060 · 35 yrs" — the rail's sub-label. */
export function horizonLabel(plan: Plan): string {
  const start = plan.settings.startYear;
  const end = planEndYear(plan);
  const h = plan.settings.horizon;
  const resolvesByAge = h?.mode === 'age' && horizonYear(h, plan.participants) !== undefined;
  const tail = resolvesByAge ? `to age ${h.age}` : `${end - start + 1} yrs`;
  return `${start}–${end} · ${tail}`;
}

const AGE_PRESETS = [90, 95, 100];

/** Onboarding names a solo household "You" — read it as a pronoun, not a name. */
const isYou = (name: string | undefined) => !name || name.trim().toLowerCase() === 'you';
const YOUNGEST = '__youngest';

export function HorizonFields({ plan, onChange }: { plan: Plan; onChange(horizon: HorizonSetting): void }) {
  const horizon = currentHorizon(plan);
  const adults = plan.participants.filter((p) => p.isIncluded);
  const end = planEndYear(plan);
  const retirement = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded);

  function setMode(mode: string) {
    if (mode === horizon.mode) return;
    if (mode === 'age') onChange({ mode: 'age', age: DEFAULT_HORIZON_AGE });
    else onChange({ mode: 'year', year: end });
  }

  return (
    <div className="ns-horizon-fields">
      <Segmented
        size="sm"
        ariaLabel="Plan horizon"
        value={horizon.mode}
        onChange={setMode}
        options={[
          { value: 'age', label: 'Until an age' },
          { value: 'year', label: 'Through a year' },
        ]}
      />

      {horizon.mode === 'age' ? (
        <>
          <div className="ns-horizon-row">
            <span>Until</span>
            {adults.length > 1 ? (
              <Select
                ariaLabel="Whose age"
                value={horizon.participantId ?? YOUNGEST}
                onChange={(v) =>
                  onChange({ mode: 'age', age: horizon.age, participantId: v === YOUNGEST ? undefined : v })
                }
                options={[
                  { value: YOUNGEST, label: 'the younger of you' },
                  ...adults.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            ) : (
              <span>{isYou(adults[0]?.name) ? 'you' : adults[0].name}</span>
            )}
            <span>{adults.length <= 1 && isYou(adults[0]?.name) ? 'turn' : 'turns'}</span>
            <CommitNumber
              ariaLabel="Age"
              value={horizon.age}
              min={50}
              max={120}
              onCommit={(age) => onChange({ ...horizon, age })}
            />
          </div>
          <div className="ns-horizon-presets">
            {AGE_PRESETS.map((age) => (
              <button
                key={age}
                type="button"
                className={`ns-horizon-preset${horizon.age === age ? ' active' : ''}`}
                onClick={() => onChange({ ...horizon, age })}
              >
                {age}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="ns-horizon-row">
            <span>Through</span>
            <CommitNumber
              ariaLabel="Last year"
              value={horizon.year}
              min={plan.settings.startYear}
              max={plan.settings.startYear + 100}
              onCommit={(year) => onChange({ mode: 'year', year })}
            />
          </div>
          {retirement && (
            <div className="ns-horizon-presets">
              <button
                type="button"
                className="ns-horizon-preset"
                onClick={() => onChange({ mode: 'year', year: retirement.startYear + 30 })}
              >
                Retirement + 30 ({retirement.startYear + 30})
              </button>
            </div>
          )}
        </>
      )}

      <p className="ns-horizon-result ns-num">
        {plan.settings.startYear} → {end} · {end - plan.settings.startYear + 1} years
      </p>
    </div>
  );
}

/**
 * A number field that only reports on Enter or blur. Typing "1", "10", "100"
 * on the way to 100 would otherwise commit three horizons — three re-runs,
 * three undo steps, three toasts.
 */
function CommitNumber({
  value,
  min,
  max,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onCommit(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit() {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || text.trim() === '') return setText(String(value));
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <input
      className="ns-input ns-horizon-input ns-num"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(String(value));
      }}
    />
  );
}

/** The rail's sub-label as a button, opening `HorizonFields` in a popover that applies each change straight to the plan. */
export function HorizonButton({ plan, onApply }: { plan: Plan; onApply(horizon: HorizonSetting): void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // Portalled to <body> and placed under the button: the rail clips its own
  // overflow, and a 288px popover is wider than the rail is.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.left - 3) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      // The Select inside renders its list inline, so a click on it is
      // still inside the popover.
      const target = e.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="ns-horizon" ref={root}>
      <button
        ref={button}
        type="button"
        className="ns-rail-horizon ns-num"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Change how far the plan runs"
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarRange size={12} strokeWidth={1.75} aria-hidden />
        <span>{horizonLabel(plan)}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popover}
            className="ns-horizon-popover"
            role="dialog"
            aria-label="Plan horizon"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="ns-horizon-title">Plan runs</div>
            <HorizonFields plan={plan} onChange={onApply} />
            <p className="ns-horizon-note">
              How far the forecast is simulated. Run it through your lifetimes so retirement always fits.
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
