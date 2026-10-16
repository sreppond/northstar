import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { BudgetLine, Plan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { money, percent, planMetaLine } from '../format';
import { Page, PageHeader, SectionCard, Segmented, Stat, StatStrip, StackedBar } from '../ui';
import {
  budgetSeries,
  budgetView,
  lifeStage,
  lineTiming,
  ownerColor,
  SHARED_FIXED_COLOR,
  type BudgetRow,
  type BudgetSection,
} from '../budgetView';
import { isHouseholdModel } from '../household';
import { HouseholdSetup } from '../HouseholdSetup';
import { ImpactStrip, PreviewActions, impactMetrics, usePreview } from '../ImpactStrip';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { BudgetColumns } from '../views/BudgetColumns';
import { BudgetLineDrawer, newBudgetLine } from '../drawer/BudgetLineDrawer';
import './household.css';

export function BudgetPage() {
  const { stored, result } = usePlanner();
  return (
    <Page>
      <PageHeader title="Budget" meta={planMetaLine(stored, result.endYear)} />
      {isHouseholdModel(stored) ? <BudgetBody /> : <HouseholdSetup page="budget" />}
    </Page>
  );
}

type Unit = 'mo' | 'yr';

/** Columns shown by default — enough to see kids grow up, few enough to read. */
const CHART_YEARS = 25;

function BudgetBody() {
  const { stored, result, replacePlan, savePlanAs, editor, setAssumptionsDraft, updateSettings } = usePlanner();
  const years = result.years;
  const [year, setYear] = useState(() => (years.some((y) => y.year === stored.settings.startYear + 1) ? stored.settings.startYear + 1 : years[0]?.year));
  const [unit, setUnit] = useState<Unit>('mo');
  const [editing, setEditing] = useState<{ line: BudgetLine; isNew: boolean } | null>(null);
  const [allYears, setAllYears] = useState(false);

  const snapshot = years.find((y) => y.year === year) ?? years[0];
  const view = useMemo(() => budgetView(stored, snapshot), [stored, snapshot]);
  const scale = unit === 'yr' ? 12 : 1;
  const fmt = (monthly: number) => money(monthly * scale);
  const per = unit === 'yr' ? '/yr' : '/mo';

  const preview = usePreview(stored);
  const current = useMemo(() => impactMetrics(stored, result, snapshot.year), [stored, result, snapshot.year]);
  const draftMetrics = useMemo(
    () => (preview.draft && preview.draftResult ? impactMetrics(preview.draft, preview.draftResult, snapshot.year) : null),
    [preview.draft, preview.draftResult, snapshot.year],
  );

  const series = useMemo(() => budgetSeries(stored, years), [stored, years]);
  const people = stored.participants.filter((p) => p.isIncluded);
  const layers = [
    { key: 'shared', label: 'Shared', color: SHARED_FIXED_COLOR },
    ...people.map((p) => ({ key: p.id, label: p.name, color: ownerColor(stored, p.id) })),
  ].filter((l) => series.some((s) => (s.byOwner.get(l.key) ?? 0) > 0));

  const stepYear = (delta: number) => {
    const i = years.findIndex((y) => y.year === snapshot.year);
    const next = years[i + delta];
    if (next) setYear(next.year);
  };

  const total = (role: BudgetSection['role']) => view.sections.filter((s) => s.role === role).reduce((sum, s) => sum + s.monthly, 0);
  const shared = total('shared');
  const adults = total('adult');
  const kids = total('child');

  const openRow = (row: BudgetRow) => {
    if (row.line) setEditing({ line: row.line, isNew: false });
    else if (row.sourceEventId) {
      const event = stored.events.find((e) => e.id === row.sourceEventId);
      if (event) editor.edit(event);
    } else setAssumptionsDraft(structuredClone(stored));
  };

  return (
    <>
      <div className="ns-hh-toolbar">
        <div className="ns-year-stepper">
          <button type="button" className="ns-btn ns-btn-square" aria-label="Previous year" onClick={() => stepYear(-1)} disabled={snapshot.year === years[0].year}>
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
          </button>
          <span className="ns-year-stepper-label ns-num">{snapshot.year}</span>
          <button
            type="button"
            className="ns-btn ns-btn-square"
            aria-label="Next year"
            onClick={() => stepYear(1)}
            disabled={snapshot.year === years[years.length - 1].year}
          >
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <span className="ns-hh-stage">{lifeStage(stored, snapshot.year)}</span>
        <div className="ns-hh-toolbar-right">
          <Segmented size="sm" ariaLabel="Per month or per year" value={unit} onChange={(v) => setUnit(v as Unit)} options={[{ value: 'mo', label: '/mo' }, { value: 'yr', label: '/yr' }]} />
          <Segmented
            size="sm"
            ariaLabel="Dollars"
            value={stored.settings.dollarMode}
            onChange={(v) => updateSettings(stored.id, { dollarMode: v as Plan['settings']['dollarMode'] })}
            options={[
              { value: 'todaysDollars', label: "Today's $" },
              { value: 'futureDollars', label: 'Future $' },
            ]}
          />
        </div>
      </div>

      <p className="ns-hh-answer">
        In {snapshot.year} you bring home <strong>{fmt(view.afterTax)}{per}</strong> after tax. Shared bills take {fmt(shared)},
        {adults > 0 ? ` your own spending ${fmt(adults)},` : ''}
        {kids > 0 ? ` the kids ${fmt(kids)},` : ''}{' '}
        {view.saved >= 0 ? (
          <>
            leaving <strong>{fmt(view.saved)}</strong> to save{view.savingsRate !== undefined ? ` (${percent(view.savingsRate, 0)})` : ''}.
          </>
        ) : (
          <>
            which is <strong>{fmt(-view.saved)}</strong> more than comes in — drawn from savings.
          </>
        )}
      </p>

      <PlanCheckBanner only={['rent-after-purchase']} />

      <StatStrip>
        <Stat size="xl" label="After-tax income" value={`${fmt(view.afterTax)}`} sub={`${per} · ${snapshot.year}`} explain="Every paycheck and other income this year, minus income tax. 401(k) contributions come out of this and show under Savings." />
        <Stat label="Shared bills" value={fmt(shared)} sub={per} explain="Everything paid from the shared pool: rent or the mortgage, groceries, utilities, insurance and the rest." />
        {adults > 0 && <Stat label="Personal" value={fmt(adults)} sub={per} explain="Each adult's allowance and anything else that's theirs alone." />}
        {kids > 0 && <Stat label="Kids" value={fmt(kids)} sub={per} explain="Every cost a child owns — childcare, food and clothing, school, activities." />}
        <Stat
          label="Left to save"
          value={fmt(view.saved)}
          sub={view.savingsRate !== undefined ? `${percent(view.savingsRate, 0)} of after-tax` : per}
          explain="After-tax income minus every recurring cost. One-time costs this year are listed separately and come out of savings."
        />
      </StatStrip>

      <SectionCard title="Where each month goes" meta={String(snapshot.year)} divider={false}>
        <StackedBar
          segments={view.buckets.map((b) => ({ key: b.key, label: b.label, value: b.monthly * scale, color: b.color }))}
          format={(v) => money(v)}
        />
        {view.saved < 0 && (
          <p className="ns-hh-note">Spending is more than after-tax income this year — the difference comes out of savings.</p>
        )}
      </SectionCard>

      <SectionCard
        title="Budget by year"
        meta="Click a year to read it below"
        divider={false}
        actions={
          series.length > CHART_YEARS ? (
            <Segmented
              size="sm"
              ariaLabel="Years shown"
              value={allYears ? 'all' : 'near'}
              onChange={(v) => setAllYears(v === 'all')}
              options={[
                { value: 'near', label: `${CHART_YEARS} yrs` },
                { value: 'all', label: 'All' },
              ]}
            />
          ) : undefined
        }
      >
        <BudgetColumns
          years={(allYears || series.findIndex((x) => x.year === snapshot.year) >= CHART_YEARS ? series : series.slice(0, CHART_YEARS)).map((s) => ({ year: s.year, afterTax: s.afterTax * scale, values: Object.fromEntries([...s.byOwner].map(([k, v]) => [k, v * scale])) }))}
          layers={layers}
          selectedYear={snapshot.year}
          onSelect={setYear}
        />
      </SectionCard>

      <div className="ns-hh-split">
        <SectionCard title={`The budget · ${snapshot.year}`} meta={per === '/mo' ? 'Per month' : 'Per year'} flush>
          <div className="ns-bt">
            {view.sections.map((s) => (
              <BudgetSectionRows
                key={s.owner}
                section={s}
                plan={stored}
                fmt={fmt}
                onOpen={openRow}
                onAdd={() => setEditing({ line: newBudgetLine(stored, s.owner), isNew: true })}
              />
            ))}
            {/* Anyone without a line yet this year is reachable from here —
                the drawer's "Whose" picks them. */}
            <div className="ns-bt-add-row ns-bt-add-any">
              <button type="button" className="ns-btn-ghost" onClick={() => setEditing({ line: newBudgetLine(stored, 'shared'), isNew: true })}>
                <Plus size={13} aria-hidden /> Add a line
              </button>
            </div>

            {view.contributions.length > 0 && (
              <div className="ns-bt-section">
                <div className="ns-bt-head">
                  <span className="ns-bt-dot" style={{ background: 'var(--in)' }} aria-hidden />
                  <span className="ns-bt-title">Saved on purpose</span>
                  <span className="ns-bt-total ns-num">{fmt(view.contributions.reduce((s, r) => s + r.monthly, 0))}</span>
                </div>
                {view.contributions.map((r) => (
                  <button key={r.key} type="button" className="ns-bt-row" onClick={() => openRow(r)}>
                    <span className="ns-bt-name">{r.label}</span>
                    <span className="ns-bt-spacer" />
                    <span className="ns-bt-amt ns-num">{fmt(r.monthly)}</span>
                  </button>
                ))}
              </div>
            )}

            {view.oneTime.length > 0 && (
              <div className="ns-bt-section">
                <div className="ns-bt-head">
                  <span className="ns-bt-title">Once this year</span>
                  <span className="ns-bt-total ns-num">{money(view.oneTime.reduce((s, r) => s + r.amount, 0))}</span>
                </div>
                {view.oneTime.map((o) => (
                  <div key={o.key} className="ns-bt-row ns-bt-row-static">
                    <span className="ns-bt-name">{o.label}</span>
                    <span className="ns-bt-spacer" />
                    <span className="ns-bt-amt ns-num">{money(o.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        <TryAChange
          plan={stored}
          preview={preview}
          current={current}
          draftMetrics={draftMetrics}
          onKeep={() => preview.draft && replacePlan(preview.draft, 'Budget updated')}
          onSaveAs={() => preview.draft && savePlanAs(preview.draft, `${stored.name} — budget change`)}
        />
      </div>

      {editing && (
        <BudgetLineDrawer
          line={editing.line}
          plan={stored}
          isNew={editing.isNew}
          onCancel={() => setEditing(null)}
          onSave={(line) => {
            const budget = stored.budget ?? [];
            const next = editing.isNew ? [...budget, line] : budget.map((l) => (l.id === line.id ? line : l));
            replacePlan({ ...stored, budget: next }, editing.isNew ? `Added ${line.name}` : `Updated ${line.name}`);
            setEditing(null);
          }}
          onDelete={() => {
            replacePlan({ ...stored, budget: (stored.budget ?? []).filter((l) => l.id !== editing.line.id) }, `Removed ${editing.line.name}`);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function BudgetSectionRows({
  section,
  plan,
  fmt,
  onOpen,
  onAdd,
}: {
  section: BudgetSection;
  plan: Plan;
  fmt(monthly: number): string;
  onOpen(row: BudgetRow): void;
  onAdd(): void;
}) {
  const rows = [...section.rows].sort((a, b) => Number(b.essential) - Number(a.essential) || b.monthly - a.monthly);
  return (
    <div className="ns-bt-section">
      <div className="ns-bt-head">
        <span className="ns-bt-dot" style={{ background: ownerColor(plan, section.owner) }} aria-hidden />
        <span className="ns-bt-title">{section.title}</span>
        <span className="ns-bt-total ns-num">{fmt(section.monthly)}</span>
      </div>
      {rows.map((r) => {
        const timing = r.line ? lineTiming(r.line, plan) : r.sourceEventId ? 'from an event' : undefined;
        return (
          <button key={r.key} type="button" className="ns-bt-row" onClick={() => onOpen(r)}>
            <span className="ns-bt-name">
              {r.label}
              {timing && <span className="ns-bt-timing">{timing}</span>}
            </span>
            <span className={`ns-bt-tag${r.essential ? '' : ' ns-bt-tag-flex'}`}>
              {r.line?.kind === 'allowance' ? 'Allowance' : r.essential ? 'Fixed' : 'Flexible'}
            </span>
            <span className="ns-bt-amt ns-num">{fmt(r.monthly)}</span>
          </button>
        );
      })}
      <div className="ns-bt-add-row">
        <button type="button" className="ns-btn-ghost" onClick={onAdd}>
          <Plus size={13} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * The questions the household actually asks of a budget — what if rent is
 * higher, what if our allowances change, what if fixed bills creep up —
 * as levers on a draft, judged by the Impact strip (docs/REDESIGN-V4.md §4.2).
 */
function TryAChange({
  plan,
  preview,
  current,
  draftMetrics,
  onKeep,
  onSaveAs,
}: {
  plan: Plan;
  preview: ReturnType<typeof usePreview>;
  current: ReturnType<typeof impactMetrics>;
  draftMetrics: ReturnType<typeof impactMetrics> | null;
  onKeep(): void;
  onSaveAs(): void;
}) {
  const budget = plan.budget ?? [];
  const housing = budget
    .filter((l) => l.isIncluded && l.owner === 'shared' && l.category === 'housing' && l.kind === 'expense' && l.cadence === 'monthly')
    .sort((a, b) => b.amount - a.amount)[0];
  const allowances = budget.filter((l) => l.isIncluded && l.kind === 'allowance' && l.cadence === 'monthly');
  const allowanceNow = allowances.length ? Math.max(...allowances.map((l) => l.amount)) : 0;

  const draft = preview.draft;
  const draftLine = (id: string | undefined) => draft?.budget?.find((l) => l.id === id);
  const rent = draftLine(housing?.id)?.amount ?? housing?.amount ?? 0;
  const allowance = allowances.length ? Math.max(...allowances.map((l) => draftLine(l.id)?.amount ?? l.amount)) : 0;
  const [fixedPct, setFixedPct] = useState(0);
  // The draft can vanish from under the levers (the plan was edited
  // elsewhere, or a different plan opened) — the percent lever has no draft
  // value to read back, so it follows.
  useEffect(() => {
    if (!draft) setFixedPct(0);
  }, [draft]);

  const build = (next: { rent?: number; allowance?: number; fixedPct?: number }) => {
    const r = next.rent ?? rent;
    const a = next.allowance ?? allowance;
    const pct = next.fixedPct ?? fixedPct;
    const changed = (housing && r !== housing.amount) || (allowances.length > 0 && a !== allowanceNow) || pct !== 0;
    if (!changed) return preview.reset();
    preview.setDraft({
      ...plan,
      budget: budget.map((l) => {
        if (housing && l.id === housing.id) return { ...l, amount: r };
        if (l.kind === 'allowance' && allowances.some((x) => x.id === l.id)) return { ...l, amount: a };
        if (pct !== 0 && l.owner === 'shared' && l.essential && l.kind === 'expense' && l.category !== 'housing') {
          return { ...l, amount: l.amount * (1 + pct / 100) };
        }
        return l;
      }),
    });
  };

  return (
    <SectionCard title="Try a change" meta="Nothing changes until you keep it" divider={false}>
      <div className="ns-levers">
        {housing ? (
          <Lever
            label={housing.name}
            value={rent}
            min={0}
            max={Math.max(8_000, Math.round(housing.amount * 2))}
            step={50}
            display={`${money(rent)}/mo`}
            changed={rent !== housing.amount}
            onChange={(v) => build({ rent: v })}
          />
        ) : (
          <p className="ns-drawer-hint">Add rent as a shared Housing line to try different amounts here.</p>
        )}
        {allowances.length > 0 && (
          <Lever
            label={allowances.length > 1 ? 'Allowance, each of you' : allowances[0].name}
            value={allowance}
            min={0}
            max={Math.max(8_000, allowanceNow * 2)}
            step={100}
            display={`${money(allowance)}/mo`}
            changed={allowance !== allowanceNow}
            onChange={(v) => build({ allowance: v })}
          />
        )}
        <Lever
          label="Other fixed bills"
          value={fixedPct}
          min={-30}
          max={30}
          step={5}
          display={`${fixedPct > 0 ? '+' : ''}${fixedPct}%`}
          changed={fixedPct !== 0}
          onChange={(v) => {
            setFixedPct(v);
            build({ fixedPct: v });
          }}
        />
      </div>
      <ImpactStrip
        current={current}
        draft={draftMetrics}
        actions={
          draft ? (
            <PreviewActions
              onKeep={() => {
                onKeep();
                setFixedPct(0);
              }}
              onSaveAs={onSaveAs}
              onReset={() => {
                preview.reset();
                setFixedPct(0);
              }}
            />
          ) : undefined
        }
      />
    </SectionCard>
  );
}

function Lever({
  label,
  value,
  min,
  max,
  step,
  display,
  changed,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  changed: boolean;
  onChange(value: number): void;
}) {
  return (
    <label className="ns-lever">
      <span className="ns-lever-head">
        <span className="ns-lever-label">{label}</span>
        <span className={`ns-lever-value ns-num${changed ? ' ns-lever-changed' : ''}`}>{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
