import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Plan, WorkPhase } from '@northstar/engine';
import { planEndYear } from '@northstar/engine';
import { usePlanner } from './PlannerContext';
import { money, signedMoney } from './format';
import { Sheet } from './ui/Sheet';
import { budgetView, ownerColor } from './budgetView';
import { ImpactStrip, PreviewActions, impactMetrics, usePreview } from './ImpactStrip';
import { applyCareGap, jobsHeldIn, type CareGap } from './caregiving';
import {
  CHILDCARE_LABEL,
  KID_DEFAULTS,
  addChild,
  kidCostByAge,
  removeChild,
  type ChildcareChoice,
  type CollegeChoice,
  type KidOptions,
  type SchoolChoice,
} from './kids';
import { addAdult, kidStages } from './timeline';
import { WorkPhasesEditor } from './drawer/JobSchedules';
import { Choice, Field, NumberInput } from './drawer/fields';
import './drawer/sheetForm.css';
import './pages/household.css';

/**
 * The person sheet (docs/REDESIGN-V5.md §5.4), opened from a lane header on
 * the Timeline. It is where the old Family page's pieces live now: an adult's
 * name, birth year, "Work over time" phases and the "Step back from work"
 * decision; a child's stages and what they cost; and the two ways in, adding
 * a person or a child.
 */
export type PersonTarget = { kind: 'person'; id: string } | { kind: 'new-adult' } | { kind: 'new-child' };

export function PersonSheet({ target, onClose }: { target: PersonTarget | null; onClose(): void }) {
  // Hold the last target through the exit spring so the content doesn't empty
  // out while the panel is still on screen.
  const last = useRef<PersonTarget | null>(target);
  if (target) last.current = target;
  const shown = target ?? last.current;
  const open = target !== null;
  const { stored } = usePlanner();

  if (!shown) return null;
  if (shown.kind === 'new-adult') return <NewAdultSheet open={open} onClose={onClose} />;
  if (shown.kind === 'new-child') return <NewChildSheet open={open} onClose={onClose} />;
  const person = stored.participants.find((p) => p.id === shown.id);
  if (!person) return null;
  return person.role === 'child' ? (
    <ChildSheet key={person.id} id={person.id} open={open} onClose={onClose} />
  ) : (
    <AdultSheet key={person.id} id={person.id} open={open} onClose={onClose} />
  );
}

function Who({ plan, id, sub }: { plan: Plan; id: string; sub?: string }) {
  const p = plan.participants.find((x) => x.id === id);
  if (!p) return null;
  return (
    <div className="tl-who">
      <span className="tl-avatar" style={{ background: ownerColor(plan, p.id) }} aria-hidden>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="tl-who-text">
        <h2 id={`who-${id}`} className="tl-who-name">
          {p.name}
        </h2>
        {sub && <span className="tl-who-sub">{sub}</span>}
      </span>
    </div>
  );
}

// --- an adult ----------------------------------------------------------------

function AdultSheet({ id, open, onClose }: { id: string; open: boolean; onClose(): void }) {
  const { stored, replacePlan, editor } = usePlanner();
  const [draft, setDraft] = useState<Plan>(stored);
  const [dirty, setDirty] = useState(false);
  // The plan changed underneath (a kept step-back, an undo): start over from it.
  useEffect(() => {
    setDraft(stored);
    setDirty(false);
  }, [stored]);

  const person = draft.participants.find((p) => p.id === id);
  if (!person) return null;
  const today = stored.settings.startYear;
  const end = planEndYear(draft);
  const jobs = draft.events.filter(
    (e) => e.isIncluded && (e.kind === 'job' || e.kind === 'newJob') && (e.config as { participantId?: string }).participantId === id,
  );

  const edit = (next: Plan) => {
    setDraft(next);
    setDirty(true);
  };
  const setPerson = (patch: Partial<typeof person>) =>
    edit({ ...draft, participants: draft.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setPhases = (jobId: string, phases: WorkPhase[]) =>
    edit({
      ...draft,
      // `newJob` has no phases; `job` is its superset, so it simply becomes one
      // (the same conversion `applyCareGap` makes).
      events: draft.events.map((e) =>
        e.id === jobId ? { ...e, kind: 'job' as const, config: { rsuVesting: [], compSteps: [], ...(e.config as object), phases } } : e,
      ),
    });

  const save = () => {
    replacePlan(draft, `Updated ${person.name || 'person'}`);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={person.name}
      header={<Who plan={stored} id={id} sub={`age ${today - person.birthYear}`} />}
      labelledBy={`who-${id}`}
      footer={
        <div className="ns-sheet-actions">
          <div className="ns-sheet-actions-right">
            <button type="button" className="ns-btn" onClick={onClose}>
              {dirty ? 'Cancel' : 'Close'}
            </button>
            <button type="button" className="ns-btn ns-btn-primary" disabled={!dirty} onClick={save}>
              Save
            </button>
          </div>
        </div>
      }
    >
      <div className="ns-sheet-form">
        <div className="ns-field-pair">
          <Field label="Name">
            <input className="ns-input" value={person.name} onChange={(e) => setPerson({ name: e.target.value })} />
          </Field>
          <Field label="Born">
            <NumberInput value={person.birthYear} unit="year" step={1} onChange={(v) => v && setPerson({ birthYear: v })} />
          </Field>
        </div>

        {jobs.length === 0 ? (
          <div className="tl-sheet-empty">
            <span>No job assigned to {person.name || 'them'}.</span>
            <button type="button" className="ns-btn" onClick={() => editor.startNew()}>
              Add a job
            </button>
          </div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="tl-sheet-job">
              {jobs.length > 1 && <div className="tl-sheet-job-name">{job.name}</div>}
              <WorkPhasesEditor
                value={(job.config as { phases?: WorkPhase[] }).phases}
                startYear={Math.max(today, job.startYear)}
                endYear={end}
                events={draft.events}
                participants={draft.participants}
                ownEventId={job.id}
                onChange={(next) => setPhases(job.id, next)}
              />
            </div>
          ))
        )}

        <StepBack plan={stored} personId={id} />
      </div>
    </Sheet>
  );
}

/**
 * "Can one of us take time off with the kids, and what does it do to our
 * budget?" — lost pay, minus childcare no longer needed, then the Impact
 * strip (docs/REDESIGN-V4.md §4.3). Moved here from the Family page; the draft
 * is a preview against the real plan until Keep.
 */
function StepBack({ plan, personId }: { plan: Plan; personId: string }) {
  const { result, replacePlan, savePlanAs } = usePlanner();
  const start = plan.settings.startYear;
  const end = planEndYear(plan);
  const firstBirth = plan.participants
    .filter((p) => p.role === 'child' && p.birthYear >= start)
    .map((p) => p.birthYear)
    .sort()[0];

  const [gap, setGap] = useState<CareGap>(() => ({
    participantId: personId,
    fromYear: firstBirth ?? start + 1,
    years: 3,
    payPercent: 0,
    thenPercent: 100,
    pausesChildcare: true,
  }));
  const set = (patch: Partial<CareGap>) => setGap((g) => ({ ...g, ...patch }));

  const preview = usePreview(plan);
  const jobs = jobsHeldIn(plan, personId, gap.fromYear);
  const person = plan.participants.find((p) => p.id === personId);

  // The draft follows the inputs; with no job to scale there's nothing to preview.
  useEffect(() => {
    preview.setDraft(jobs.length > 0 ? applyCareGap(plan, gap) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gap, plan, jobs.length]);

  const year = Math.min(end, gap.fromYear);
  const currentMetrics = useMemo(() => impactMetrics(plan, result, year), [plan, result, year]);
  const draftResult = preview.draftResult;
  const draftMetrics = useMemo(
    () => (preview.draft && draftResult ? impactMetrics(preview.draft, draftResult, year) : null),
    [preview.draft, draftResult, year],
  );

  const summary = useMemo(() => {
    if (!preview.draft || !draftResult) return null;
    const before = budgetView(plan, result.years.find((y) => y.year === year)!);
    const after = budgetView(preview.draft, draftResult.years.find((y) => y.year === year)!);
    const childcare = (v: typeof before) =>
      v.sections
        .filter((s) => s.role === 'child')
        .reduce((sum, s) => sum + s.rows.filter((r) => r.line?.category === 'childcare').reduce((a, r) => a + r.monthly, 0), 0);
    return { pay: after.afterTax - before.afterTax, childcare: childcare(before) - childcare(after), net: after.saved - before.saved };
  }, [plan, result, preview.draft, draftResult, year]);

  const years: number[] = [];
  for (let y = start; y <= end; y++) years.push(y);

  return (
    <section className="ns-retain">
      <div className="ns-retain-title">Step back from work</div>
      <div className="ns-decision-grid">
        <Field label="Starting">
          <select className="ns-input" value={gap.fromYear} onChange={(e) => set({ fromYear: Number(e.target.value) })}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="For (years)">
          <NumberInput value={gap.years} unit="plain" step={1} min={1} max={20} onChange={(v) => set({ years: Math.max(1, v ?? 1) })} />
        </Field>
        <Field label="Pay while home">
          <NumberInput value={gap.payPercent} unit="percent" step={10} min={0} max={100} onChange={(v) => set({ payPercent: v ?? 0 })} />
        </Field>
        <Field label="Then back at">
          <select className="ns-input" value={gap.thenPercent} onChange={(e) => set({ thenPercent: Number(e.target.value) })}>
            <option value={100}>Full-time</option>
            <option value={80}>80% (4 days)</option>
            <option value={60}>60% (3 days)</option>
            <option value={50}>Half-time</option>
            <option value={0}>Not going back</option>
          </select>
        </Field>
        <Choice
          label="Childcare while home"
          value={gap.pausesChildcare ? 'pause' : 'keep'}
          options={[
            { value: 'pause', label: 'Not needed' },
            { value: 'keep', label: 'Still paid' },
          ]}
          onChange={(v) => set({ pausesChildcare: v === 'pause' })}
        />
      </div>

      {jobs.length === 0 ? (
        <p className="ns-drawer-hint">{person?.name ?? 'They'} {person ? 'has' : 'have'} no job in {gap.fromYear} to step back from.</p>
      ) : (
        <>
          {summary && (
            <p className="ns-decision-sum">
              <span>
                Pay after tax <strong>{signedMoney(summary.pay)}/mo</strong>
              </span>
              <span>
                Childcare saved <strong>{money(summary.childcare)}/mo</strong>
              </span>
              <span>
                Net in {year} <strong>{signedMoney(summary.net)}/mo</strong>
              </span>
            </p>
          )}
          <ImpactStrip
            current={currentMetrics}
            draft={draftMetrics}
            actions={
              preview.draft ? (
                <PreviewActions
                  onKeep={() => preview.draft && replacePlan(preview.draft, `${person?.name ?? 'Time off'} added to the plan`)}
                  onSaveAs={() =>
                    preview.draft && savePlanAs(preview.draft, `${plan.name} — ${person?.name ?? 'parent'} home ${gap.fromYear}–${gap.fromYear + gap.years - 1}`)
                  }
                  onReset={() => setGap((g) => ({ ...g, years: 3, payPercent: 0, thenPercent: 100, pausesChildcare: true }))}
                />
              ) : undefined
            }
          />
        </>
      )}
    </section>
  );
}

// --- a child -----------------------------------------------------------------

function ChildSheet({ id, open, onClose }: { id: string; open: boolean; onClose(): void }) {
  const { stored, result, replacePlan } = usePlanner();
  const child = stored.participants.find((p) => p.id === id);
  const [name, setName] = useState(child?.name ?? '');
  const [born, setBorn] = useState(child?.birthYear ?? stored.settings.startYear);
  const [removing, setRemoving] = useState(false);

  // What they cost each month at each age, from the plan's own budget lines.
  const byAge = useMemo(() => {
    if (!child) return [];
    const out = Array.from({ length: 22 }, () => 0);
    for (const y of result.years) {
      const age = y.year - child.birthYear;
      if (age < 0 || age >= out.length) continue;
      out[age] = budgetView(stored, y).sections.find((s) => s.owner === child.id)?.monthly ?? 0;
    }
    return out;
  }, [child, result, stored]);

  if (!child) return null;
  const today = stored.settings.startYear;
  const stages = kidStages(stored, child, child.birthYear, result.endYear + 40);
  const max = Math.max(1, ...byAge);
  const dirty = name.trim() !== child.name || born !== child.birthYear;

  const save = () => {
    replacePlan(
      {
        ...stored,
        participants: stored.participants.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, birthYear: born } : p)),
      },
      `Updated ${name.trim() || child.name}`,
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={child.name}
      header={<Who plan={stored} id={id} sub={child.birthYear > today ? `due ${child.birthYear}` : `age ${today - child.birthYear}`} />}
      labelledBy={`who-${id}`}
      footer={
        <div className="ns-sheet-actions">
          {removing ? (
            <button
              type="button"
              className="ns-btn ns-btn-danger"
              onClick={() => {
                replacePlan(removeChild(stored, id), `Removed ${child.name}`);
                onClose();
              }}
            >
              Remove — are you sure?
            </button>
          ) : (
            <button type="button" className="ns-btn ns-btn-danger-ghost" onClick={() => setRemoving(true)}>
              Remove
            </button>
          )}
          <div className="ns-sheet-actions-right">
            <button type="button" className="ns-btn" onClick={onClose}>
              {dirty ? 'Cancel' : 'Close'}
            </button>
            <button type="button" className="ns-btn ns-btn-primary" disabled={!dirty} onClick={save}>
              Save
            </button>
          </div>
        </div>
      }
    >
      <div className="ns-sheet-form">
        <div className="ns-field-pair">
          <Field label="Name">
            <input className="ns-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Born">
            <NumberInput value={born} unit="year" step={1} onChange={(v) => v && setBorn(v)} />
          </Field>
        </div>

        {stages.length > 0 && (
          <div className="ns-field">
            <span className="ns-field-label">Stages</span>
            <ul className="tl-stage-list">
              {stages.map((s) => (
                <li key={s.kind}>
                  <span className="tl-stage-name">{s.label}</span>
                  <span className="tl-stage-years ns-num">
                    {s.from}–{s.to - 1} · ages {s.from - child.birthYear}–{s.to - 1 - child.birthYear}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="ns-field">
          <span className="ns-field-label">Monthly cost by age</span>
          <div className="ns-agebars" aria-hidden>
            {byAge.map((v, age) => (
              <span key={age} style={{ height: `${(v / max) * 100}%`, background: ownerColor(stored, id) }} title={`Age ${age}: ${money(v)}/mo`} />
            ))}
          </div>
          <div className="ns-agebars-axis">
            {[0, 5, 13, 18, 21].map((age) => (
              <span key={age} style={{ left: `${((age + 0.5) / byAge.length) * 100}%` }}>
                {age}
              </span>
            ))}
          </div>
          <span className="ns-field-hint">
            Every line is editable on the <Link to="/budget">Budget</Link> page.
          </span>
        </div>
      </div>
    </Sheet>
  );
}

// --- adding people -----------------------------------------------------------

function NewAdultSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { stored, replacePlan } = usePlanner();
  const count = stored.participants.filter((p) => p.role !== 'child').length;
  const [name, setName] = useState('');
  const [born, setBorn] = useState(stored.settings.startYear - 35);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a person"
      footer={
        <div className="ns-sheet-actions">
          <div className="ns-sheet-actions-right">
            <button type="button" className="ns-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-primary"
              onClick={() => {
                replacePlan(addAdult(stored, { name, birthYear: born }), `Added ${name.trim() || `Person ${count + 1}`}`);
                onClose();
              }}
            >
              Add {name.trim() || 'person'}
            </button>
          </div>
        </div>
      }
    >
      <div className="ns-sheet-form">
        <div className="ns-field-pair">
          <Field label="Name">
            <input className="ns-input" value={name} placeholder={`Person ${count + 1}`} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Born">
            <NumberInput value={born} unit="year" step={1} onChange={(v) => v && setBorn(v)} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function NewChildSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { stored, replacePlan } = usePlanner();
  const count = stored.participants.filter((p) => p.role === 'child').length;
  const [name, setName] = useState(`Kid ${count + 1}`);
  const [birthYear, setBirthYear] = useState(stored.settings.startYear + 1);
  const [options, setOptions] = useState<KidOptions>(KID_DEFAULTS);
  const byAge = kidCostByAge(options);
  const max = Math.max(1, ...byAge);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a child"
      footer={
        <div className="ns-sheet-actions">
          <div className="ns-sheet-actions-right">
            <button type="button" className="ns-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-primary"
              onClick={() => {
                replacePlan(addChild(stored, { name, birthYear, options }), `Added ${name || 'a child'}`);
                onClose();
              }}
            >
              Add {name || 'child'}
            </button>
          </div>
        </div>
      }
    >
      <div className="ns-sheet-form">
        <div className="ns-field-pair">
          <Field label="Name">
            <input className="ns-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Born">
            <NumberInput value={birthYear} unit="year" step={1} onChange={(v) => v && setBirthYear(v)} />
          </Field>
        </div>
        <Choice
          label="Childcare, ages 0–4"
          value={options.childcare}
          options={(Object.keys(CHILDCARE_LABEL) as ChildcareChoice[]).map((v) => ({ value: v, label: CHILDCARE_LABEL[v] }))}
          onChange={(childcare) => setOptions((o) => ({ ...o, childcare }))}
        />
        <Choice
          label="School"
          value={options.school}
          options={[
            { value: 'public' as SchoolChoice, label: 'Public' },
            { value: 'private' as SchoolChoice, label: 'Private' },
          ]}
          onChange={(school) => setOptions((o) => ({ ...o, school }))}
        />
        <Choice
          label="College"
          value={options.college}
          options={[
            { value: 'inState' as CollegeChoice, label: 'In-state' },
            { value: 'outOfState' as CollegeChoice, label: 'Out-of-state' },
            { value: 'private' as CollegeChoice, label: 'Private' },
            { value: 'none' as CollegeChoice, label: 'None' },
          ]}
          onChange={(college) => setOptions((o) => ({ ...o, college }))}
        />
        <Field label="Save for college (per month)" hint="Opens a 529-style account for this child and saves into it until 18.">
          <NumberInput
            value={options.collegeSavingsMonthly}
            unit="currency"
            step={50}
            min={0}
            onChange={(v) => setOptions((o) => ({ ...o, collegeSavingsMonthly: v ?? 0 }))}
          />
        </Field>

        <div className="ns-field">
          <span className="ns-field-label">Monthly cost by age, today's dollars</span>
          <div className="ns-agebars" aria-hidden>
            {byAge.map((v, age) => (
              <span key={age} style={{ height: `${(v / max) * 100}%` }} title={`Age ${age}: ${money(v)}/mo`} />
            ))}
          </div>
          <div className="ns-agebars-axis">
            {/* Placed under their own bar — the stages aren't evenly spaced. */}
            {[0, 5, 13, 18, 21].map((age) => (
              <span key={age} style={{ left: `${((age + 0.5) / byAge.length) * 100}%` }}>
                {age}
              </span>
            ))}
          </div>
          <span className="ns-field-hint">
            Rounded national estimates; every line is editable on the Budget page afterwards. Housing and transport stay in your shared
            budget.
          </span>
        </div>
      </div>
    </Sheet>
  );
}
