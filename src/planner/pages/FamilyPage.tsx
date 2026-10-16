import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Plan } from '@northstar/engine';
import { planEndYear } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { money, planMetaLine, signedMoney } from '../format';
import { Page, PageHeader, SectionCard } from '../ui';
import { budgetView, ownerColor } from '../budgetView';
import { isHouseholdModel } from '../household';
import { HouseholdSetup } from '../HouseholdSetup';
import { ImpactStrip, PreviewActions, impactMetrics, usePreview } from '../ImpactStrip';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { applyCareGap, careerSegments, jobsHeldIn, type CareGap } from '../caregiving';
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
} from '../kids';
import { ChartLegend, MiniChart, type ChartSeries } from '../views/MiniChart';
import { Choice, Field, NumberInput } from '../drawer/fields';
import './household.css';

export function FamilyPage() {
  const { stored, result } = usePlanner();
  return (
    <Page>
      <PageHeader title="Family" meta={planMetaLine(stored, result.endYear)} />
      {isHouseholdModel(stored) ? <FamilyBody /> : <HouseholdSetup page="family" />}
    </Page>
  );
}

function FamilyBody() {
  const { stored, result, replacePlan, editor } = usePlanner();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const today = stored.settings.startYear;
  const adults = stored.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const kids = stored.participants.filter((p) => p.isIncluded && p.role === 'child');

  // Each kid's monthly cost, every year (today's or future $, per the plan).
  const kidSeries = useMemo(() => {
    const years = result.years.map((y) => y.year);
    const perKid = kids.map((k) => result.years.map((y) => budgetView(stored, y).sections.find((s) => s.owner === k.id)?.monthly ?? 0));
    return { years, perKid };
  }, [kids, result, stored]);

  const peak = useMemo(() => {
    const totals = kidSeries.years.map((_, i) => kidSeries.perKid.reduce((s, k) => s + k[i], 0));
    const max = Math.max(0, ...totals);
    return max > 0 ? { value: max, year: kidSeries.years[totals.indexOf(max)] } : undefined;
  }, [kidSeries]);

  const names = (list: { name: string }[]) =>
    list.length <= 1 ? (list[0]?.name ?? '') : `${list.slice(0, -1).map((p) => p.name).join(', ')} and ${list[list.length - 1].name}`;

  return (
    <>
      <p className="ns-hh-answer">
        {names(adults)}
        {kids.length > 0 ? `, with ${names(kids.map((k) => ({ name: `${k.name} (born ${k.birthYear})` })))}` : ''}.
        {peak && (
          <>
            {' '}
            The kids cost the most in <strong>{peak.year}</strong> — <strong>{money(peak.value)}/mo</strong>.
          </>
        )}
      </p>

      <PlanCheckBanner only={['unowned-income', 'unearned-wages']} />

      <SectionCard title="Who's in the plan" divider={false}>
        <div className="ns-members">
          {[...adults, ...kids].map((p) => (
            <div key={p.id} className="ns-member">
              <span className="ns-member-avatar" style={{ background: ownerColor(stored, p.id) }} aria-hidden>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="ns-member-text">
                <span className="ns-member-name">{p.name}</span>
                <span className="ns-member-sub">
                  {p.role === 'child' ? (p.birthYear > today ? `due ${p.birthYear}` : `age ${today - p.birthYear}`) : `age ${today - p.birthYear}`}
                </span>
              </span>
              {p.role === 'child' &&
                (removing === p.id ? (
                  <button
                    type="button"
                    className="ns-btn-ghost"
                    onClick={() => {
                      replacePlan(removeChild(stored, p.id), `Removed ${p.name}`);
                      setRemoving(null);
                    }}
                  >
                    Remove — sure?
                  </button>
                ) : (
                  <button type="button" className="ns-btn-ghost" onClick={() => setRemoving(p.id)}>
                    Remove
                  </button>
                ))}
            </div>
          ))}
          <button type="button" className="ns-member-add" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> Add a child
          </button>
        </div>
      </SectionCard>

      <Careers plan={stored} onOpenJob={(id) => {
        const job = stored.events.find((e) => e.id === id);
        if (job) editor.edit(job);
      }} onAddJob={() => editor.startNew()} />

      {kids.length > 0 && (
        <SectionCard title="What the kids cost" meta="Per month, by year" divider={false}>
          <KidChart plan={stored} years={kidSeries.years} perKid={kidSeries.perKid} />
        </SectionCard>
      )}

      <StepBack plan={stored} />

      {adding && (
        <AddChildDrawer
          plan={stored}
          onCancel={() => setAdding(false)}
          onAdd={(input) => {
            replacePlan(addChild(stored, input), `Added ${input.name || 'a child'}`);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function Careers({ plan, onOpenJob, onAddJob }: { plan: Plan; onOpenJob(id: string): void; onAddJob(): void }) {
  const start = plan.settings.startYear;
  const end = planEndYear(plan);
  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const tracks = adults.map((p) => ({ person: p, segments: careerSegments(plan, p.id, start, end) }));
  const lastWorked = Math.max(start + 10, ...tracks.flatMap((t) => t.segments.map((s) => s.to)));
  const span = lastWorked - start;
  const pct = (y: number) => ((y - start) / span) * 100;

  return (
    <SectionCard title="Work" meta="Each of you, over time — click a stretch to edit it" divider={false}>
      <div className="ns-tracks">
        {tracks.map(({ person, segments }) => (
          <div key={person.id} className="ns-track-row">
            <span className="ns-track-who">{person.name}</span>
            {segments.length === 0 ? (
              <span className="ns-track-empty">
                No job assigned to {person.name}.{' '}
                <button type="button" className="ns-btn-ghost" onClick={onAddJob}>
                  Add a job
                </button>
              </span>
            ) : (
              <div className="ns-track">
                {segments.map((s) => (
                  <button
                    key={`${s.eventId}-${s.from}`}
                    type="button"
                    className={`ns-track-seg${s.share < 0.5 ? ' ns-track-seg-light' : ''}`}
                    style={{
                      left: `${pct(s.from)}%`,
                      width: `${pct(s.to) - pct(s.from)}%`,
                      background:
                        s.share >= 1
                          ? ownerColor(plan, person.id)
                          : `color-mix(in srgb, ${ownerColor(plan, person.id)} ${Math.round(25 + s.share * 60)}%, var(--surface))`,
                    }}
                    title={`${s.label} · ${s.from}–${s.to - 1}`}
                    onClick={() => onOpenJob(s.eventId)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="ns-track-axis ns-num">
        <span>{start}</span>
        <span>{Math.round(start + span / 2)}</span>
        <span>{lastWorked}</span>
      </div>
    </SectionCard>
  );
}

function KidChart({ plan, years, perKid }: { plan: Plan; years: number[]; perKid: number[][] }) {
  const kids = plan.participants.filter((p) => p.isIncluded && p.role === 'child');
  // Through the last year any kid costs anything, plus a little air.
  const lastIndex = Math.min(years.length - 1, Math.max(...perKid.map((k) => k.reduce((last, v, i) => (v > 0.5 ? i : last), 0))) + 2);
  const running = years.slice(0, lastIndex + 1).map(() => 0);
  const series: ChartSeries[] = kids.map((k, i) => {
    const lower = [...running];
    perKid[i].slice(0, lastIndex + 1).forEach((v, j) => (running[j] += v));
    return { label: k.name, color: ownerColor(plan, k.id), values: [...running], fill: true, fillTo: lower, fillOpacity: 0.8, lineWidth: 0 };
  });
  return (
    <>
      <MiniChart years={years.slice(0, lastIndex + 1)} series={series} height={220} />
      <ChartLegend series={series.map(({ label, color }) => ({ label, color }))} />
    </>
  );
}

/**
 * "Can one of us take time off with the kids, and what does it do to our
 * budget?" — the decision Family has to make obvious (docs/REDESIGN-V4.md
 * §4.3): lost pay, minus childcare no longer needed, then the Impact strip.
 */
function StepBack({ plan }: { plan: Plan }) {
  const { result, replacePlan, savePlanAs } = usePlanner();
  const start = plan.settings.startYear;
  const end = planEndYear(plan);
  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const firstBirth = plan.participants.filter((p) => p.role === 'child' && p.birthYear >= start).map((p) => p.birthYear).sort()[0];

  const [gap, setGap] = useState<CareGap>(() => ({
    participantId: adults[adults.length - 1]?.id ?? '',
    fromYear: firstBirth ?? start + 1,
    years: 3,
    payPercent: 0,
    thenPercent: 100,
    pausesChildcare: true,
  }));
  const set = (patch: Partial<CareGap>) => setGap((g) => ({ ...g, ...patch }));

  const preview = usePreview(plan);
  const jobs = jobsHeldIn(plan, gap.participantId, gap.fromYear);
  const person = adults.find((p) => p.id === gap.participantId);

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
      v.sections.filter((s) => s.role === 'child').reduce((sum, s) => sum + s.rows.filter((r) => r.line?.category === 'childcare').reduce((a, r) => a + r.monthly, 0), 0);
    return {
      pay: after.afterTax - before.afterTax,
      childcare: childcare(before) - childcare(after),
      net: after.saved - before.saved,
    };
  }, [plan, result, preview.draft, draftResult, year]);

  const years: number[] = [];
  for (let y = start; y <= end; y++) years.push(y);

  return (
    <SectionCard title="Step back from work" meta="Time at home with the kids — try it before you decide" divider={false}>
      <div className="ns-decision-grid">
        <Field label="Who">
          <select className="ns-input" value={gap.participantId} onChange={(e) => set({ participantId: e.target.value })}>
            {adults.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
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
        <p className="ns-drawer-hint">
          {person?.name ?? 'This person'} has no job in {gap.fromYear} to step back from. Set "Person" on their job (Events) so the plan knows whose pay it is.
        </p>
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
                  onSaveAs={() => preview.draft && savePlanAs(preview.draft, `${plan.name} — ${person?.name ?? 'parent'} home ${gap.fromYear}–${gap.fromYear + gap.years - 1}`)}
                  onReset={() =>
                    setGap((g) => ({ ...g, years: 3, payPercent: 0, thenPercent: 100, pausesChildcare: true }))
                  }
                />
              ) : undefined
            }
          />
        </>
      )}
    </SectionCard>
  );
}

function AddChildDrawer({ plan, onAdd, onCancel }: { plan: Plan; onAdd(input: { name: string; birthYear: number; options: KidOptions }): void; onCancel(): void }) {
  const count = plan.participants.filter((p) => p.role === 'child').length;
  const [name, setName] = useState(`Kid ${count + 1}`);
  const [birthYear, setBirthYear] = useState(plan.settings.startYear + 1);
  const [options, setOptions] = useState<KidOptions>(KID_DEFAULTS);
  const byAge = kidCostByAge(options);
  const max = Math.max(1, ...byAge);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Add a child">
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">Add a child</div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="ns-drawer-body">
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
              Rounded national estimates — every line is editable on the Budget page afterwards. Housing and transport stay in your shared
              budget.
            </span>
          </div>
        </div>
        <footer className="ns-drawer-foot">
          <div className="ns-drawer-foot-right">
            <button type="button" className="ns-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="ns-btn ns-btn-primary" onClick={() => onAdd({ name, birthYear, options })}>
              Add {name || 'child'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
