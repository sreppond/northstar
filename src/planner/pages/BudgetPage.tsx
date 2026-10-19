import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { BudgetLine, Plan, YearSnapshot } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { useBreakpoint } from '../useBreakpoint';
import { money } from '../format';
import { DonutChart, type DonutSegment } from '../charts';
import { Page, PageHeader, Segmented } from '../ui';
import {
  FROM_SAVINGS_COLOR,
  KIDS_COLOR,
  REMAINDER_LINE_ID,
  SAVED_COLOR,
  SHARED_FIXED_COLOR,
  UNFUNDED_COLOR,
  WITHDRAWAL_TAX_COLOR,
  adultAges,
  budgetEnvelopes,
  budgetView,
  envelopeShare,
  inUnit,
  lineTiming,
  monthsIn,
  ownerColor,
  setAdultEnvelope,
  setSharedEnvelope,
  type BudgetEnvelopes,
  type BudgetRow,
  type BudgetSection,
} from '../budgetView';
import { isHouseholdModel } from '../household';
import { HouseholdSetup } from '../HouseholdSetup';
import { ImpactStrip, PreviewActions, impactMetrics, usePreview } from '../ImpactStrip';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { KidsSheet } from '../KidsSheet';
import { BudgetShare, type ShareLayer } from '../views/BudgetShare';
import { healthDangerBand } from '../health';
import { BudgetLineDrawer, newBudgetLine } from '../drawer/BudgetLineDrawer';
import './household.css';
import './budget.css';

export function BudgetPage() {
  const { stored } = usePlanner();
  return <Page>{isHouseholdModel(stored) ? <BudgetBody /> : <><PageHeader title="Budget" /><HouseholdSetup page="budget" /></>}</Page>;
}

type Unit = 'mo' | 'yr';

/** Whole dollars with separators: an envelope is read and typed exactly, not rounded to $9.4K. */
const exact = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

/** What one ↑/↓ press moves an envelope, per month (docs/REDESIGN-V5.md §5.3). */
const NUDGE = 100;

/** Bills a "+/− %" nudge applies to: shared, fixed, not housing and not the remainder the envelope edit owns. */
const isFixedBill = (l: BudgetLine) =>
  l.isIncluded && l.owner === 'shared' && l.essential && l.kind === 'expense' && l.category !== 'housing' && l.id !== REMAINDER_LINE_ID;

const sameBudget = (a: Plan, b: Plan) => JSON.stringify(a.budget) === JSON.stringify(b.budget);

function BudgetBody() {
  const {
    stored,
    result,
    replacePlan,
    savePlanAs,
    editor,
    setAssumptionsDraft,
    updateSettings,
    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    health,
  } = usePlanner();
  const phone = useBreakpoint() === 'phone';
  const years = result.years;
  const today = stored.settings.startYear;

  // One focus year for the whole page (§1 principle 3): hovering the by-year
  // chart previews a month, else the pin, else the first full year. There is
  // no stepper (V5-REVIEW-1 F17: hover used to be ignored).
  const defaultYear = years.some((y) => y.year === today + 1) ? today + 1 : years[0]?.year;
  const pinnedYear = focusYear !== null && years.some((y) => y.year === focusYear) ? focusYear : defaultYear;
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const year = hoverYear !== null && years.some((y) => y.year === hoverYear) ? hoverYear : pinnedYear;
  const snapshot = years.find((y) => y.year === year) ?? years[0];
  // Typing over an envelope while the pointer drifts across the chart must not
  // retarget the figure being typed into.
  const previewYear = (y: number | null) => {
    if (document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('ns-bgt-fig-input')) return;
    setHoverYear(y);
  };

  const [unit, setUnit] = useState<Unit>('mo');
  const scale = unit === 'yr' ? 12 : 1;
  const per = unit === 'yr' ? '/yr' : '/mo';
  const fmt = (monthly: number) => money(monthly * scale);

  const [editing, setEditing] = useState<{ line: BudgetLine; isNew: boolean } | null>(null);
  // The sheet animates out, so it needs the last line to keep rendering while `editing` is already null.
  const lastEditing = useRef(editing);
  if (editing) lastEditing.current = editing;
  const [kidsOpen, setKidsOpen] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(['shared']));
  const [clampedKey, setClampedKey] = useState<string | null>(null);
  const [fixedPct, setFixedPct] = useState(0);

  // --- preview, then keep: every envelope edit lands on a draft ------------
  const preview = usePreview(stored);
  useEffect(() => {
    if (!preview.draft) {
      setFixedPct(0);
      setClampedKey(null);
    }
  }, [preview.draft]);
  const draftSnapshot = preview.draftResult?.years.find((y) => y.year === snapshot.year);
  const workPlan = preview.draft ?? stored;
  const workSnapshot: YearSnapshot = draftSnapshot ?? snapshot;

  const view = useMemo(() => budgetView(stored, snapshot), [stored, snapshot]);
  const shownView = useMemo(() => (preview.draft && draftSnapshot ? budgetView(preview.draft, draftSnapshot) : view), [preview.draft, draftSnapshot, view]);
  const baseEnv = useMemo(() => budgetEnvelopes(stored, snapshot, view), [stored, snapshot, view]);
  const env = useMemo(() => budgetEnvelopes(workPlan, workSnapshot, shownView), [workPlan, workSnapshot, shownView]);

  const current = useMemo(() => impactMetrics(stored, result, snapshot.year), [stored, result, snapshot.year]);
  const draftMetrics = useMemo(
    () => (preview.draft && preview.draftResult ? impactMetrics(preview.draft, preview.draftResult, snapshot.year) : null),
    [preview.draft, preview.draftResult, snapshot.year],
  );

  const adults = env.perAdult;
  const hasFixedBills = (stored.budget ?? []).some(isFixedBill);
  const hasKids = stored.participants.some((p) => p.isIncluded && p.role === 'child') || env.kids > 0;

  /** Writes `plan` as the draft, or drops the draft if it has come back to what is saved. */
  const setDraft = (plan: Plan) => (sameBudget(plan, stored) ? preview.reset() : preview.setDraft(plan));

  const editShared = (monthly: number) => {
    const { plan, clamped } = setSharedEnvelope(workPlan, monthly, workSnapshot);
    setClampedKey(clamped ? 'shared' : null);
    setDraft(plan);
  };
  const editAdult = (id: string) => (monthly: number) => {
    const { plan, clamped } = setAdultEnvelope(workPlan, id, monthly, workSnapshot);
    setClampedKey(clamped ? id : null);
    setDraft(plan);
  };
  // The "other fixed bills ±%" lever lives in the Shared popover. It scales
  // from the SAVED amounts, so dragging it back and forth never compounds,
  // and an envelope edit made alongside it (which only touches the
  // remainder line) is left alone.
  const editFixedPct = (pct: number) => {
    setFixedPct(pct);
    const saved = new Map((stored.budget ?? []).map((l) => [l.id, l]));
    setDraft({
      ...workPlan,
      budget: (workPlan.budget ?? []).map((l) => {
        const was = saved.get(l.id);
        return was && isFixedBill(was) ? { ...l, amount: was.amount * (1 + pct / 100) } : l;
      }),
    });
  };
  const resetDraft = () => {
    preview.reset();
    setFixedPct(0);
    setClampedKey(null);
  };

  // --- the chart rows -------------------------------------------------------
  const envelopeSeries = useMemo(() => years.map((y) => budgetEnvelopes(stored, y)), [stored, years]);
  const draftSeries = useMemo(
    () => (preview.draft && preview.draftResult ? preview.draftResult.years.map((y) => budgetEnvelopes(preview.draft!, y)) : null),
    [preview.draft, preview.draftResult],
  );
  const yearList = useMemo(() => years.map((y) => y.year), [years]);
  const shares = useMemo(() => envelopeSeries.map(envelopeShare), [envelopeSeries]);
  const draftShares = useMemo(() => (draftSeries ? draftSeries.map(envelopeShare) : null), [draftSeries]);
  const layers: ShareLayer[] = useMemo(() => {
    const all: ShareLayer[] = [
      { key: 'shared', label: 'Shared', color: SHARED_FIXED_COLOR, values: shares.map((e) => e.shared) },
      ...stored.participants
        .filter((p) => p.isIncluded && p.role !== 'child')
        .map((p) => ({
          key: p.id,
          label: p.name,
          color: ownerColor(stored, p.id),
          values: shares.map((e) => e.perAdult.find((a) => a.id === p.id)?.share ?? 0),
        })),
      { key: 'kids', label: 'Kids', color: KIDS_COLOR, values: shares.map((e) => e.kids) },
      { key: 'wtax', label: 'Tax on withdrawals', color: WITHDRAWAL_TAX_COLOR, values: shares.map((e) => e.withdrawalTax) },
      // In a gap year this layer is what was still set aside on purpose
      // ("Saved on purpose"), so the upper stack always reaches 100% (V5-REVIEW-2 N1).
      { key: 'saved', label: 'Saved', color: SAVED_COLOR, values: shares.map((e) => e.saved + e.intoSavings) },
    ];
    return all.filter((l) => l.key === 'saved' || l.values.some((v) => v > 0.5));
  }, [shares, stored]);
  const savedSeries = useMemo(() => shares.map((e) => e.saved), [shares]);
  const intoSavingsSeries = useMemo(() => shares.map((e) => e.intoSavings), [shares]);
  const fromSavingsSeries = useMemo(() => shares.map((e) => e.fromSavings), [shares]);
  const unfundedSeries = useMemo(() => shares.map((e) => e.unfunded), [shares]);
  const afterTaxSeries = useMemo(() => envelopeSeries.map((e) => e.afterTax * scale), [envelopeSeries, scale]);

  // The band is the plan's own short years (F2); the amount is in this page's
  // unit (F10), dividing by the months each year really covers.
  const danger = useMemo(
    () => inUnit(healthDangerBand(health, result), (y) => (unit === 'yr' ? 1 : monthsIn(stored, y) || 12)),
    [health, result, unit, stored],
  );
  // Short only where the plan is (health.shortYears), never because a number is negative (F3).
  // A draft is judged by its own run: the engine reports a shortfall in exactly
  // the years `health.shortYears` lists, so the two agree for the saved plan.
  const yearIsShort = health.shortYears.includes(snapshot.year) || (!!preview.draft && (workSnapshot.unfundedShortfall ?? 0) > 0);
  const unfundedNow = yearIsShort ? Math.max(0, env.unfunded) : 0;
  // A gap year: outgoings (spending, money set aside, tax on withdrawals) beat
  // after-tax income. Its remainder is three separate things, never one
  // "From savings" (V5-REVIEW-2 N1): what was set aside, what accounts really
  // paid, and what nothing paid.
  const gapYear = env.gap >= 0.5;

  // --- the donut -------------------------------------------------------------
  const segments: DonutSegment[] = [
    { key: 'shared', label: 'Shared', value: env.shared * scale, color: SHARED_FIXED_COLOR },
    ...adults.map((a) => ({ key: a.id, label: a.name, value: a.monthly * scale, color: ownerColor(stored, a.id) })),
    ...(hasKids ? [{ key: 'kids', label: 'Kids', value: env.kids * scale, color: KIDS_COLOR }] : []),
    ...(env.withdrawalTax >= 0.5 ? [{ key: 'wtax', label: 'Tax on withdrawals', value: env.withdrawalTax * scale, color: WITHDRAWAL_TAX_COLOR }] : []),
    // A surplus year saves what is left; a gap year sets aside only what it still
    // pays in, draws on accounts for what they really cover, and shows the rest
    // as unfunded. The keys stay put so the arcs morph rather than remount.
    { key: 'saved', label: 'Saved', value: gapYear ? 0 : Math.max(0, env.saved) * scale, color: SAVED_COLOR },
    { key: 'into', label: 'Saved on purpose', value: gapYear ? env.intoSavings * scale : 0, color: SAVED_COLOR },
    { key: 'drawn', label: 'From savings', value: gapYear ? env.fromSavings * scale : 0, color: FROM_SAVINGS_COLOR },
    { key: 'unfunded', label: 'Unfunded', value: unfundedNow * scale, color: UNFUNDED_COLOR, tone: 'danger' },
  ];

  const openRow = (row: BudgetRow) => {
    if (row.line) {
      const saved = stored.budget?.find((l) => l.id === row.line!.id);
      // A line that exists only in the draft (the remainder, just created) opens as new.
      setEditing(saved ? { line: saved, isNew: false } : { line: row.line, isNew: true });
    } else if (row.sourceEventId) {
      const event = stored.events.find((e) => e.id === row.sourceEventId);
      if (event) editor.edit(event);
    } else setAssumptionsDraft(structuredClone(stored));
  };

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const secRefs = useRef(new Map<string, HTMLElement>());
  const selectSlice = (key: string) => {
    if (key === 'kids') return setKidsOpen(true);
    if (key !== 'shared' && !adults.some((a) => a.id === key)) return;
    setOpen((s) => new Set(s).add(key));
    requestAnimationFrame(() => secRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const rowsFor = (owner: string): BudgetRow[] =>
    [...(shownView.sections.find((s) => s.owner === owner)?.rows ?? [])].sort((a, b) => Number(b.essential) - Number(a.essential) || b.monthly - a.monthly);
  const childSections = shownView.sections.filter((s) => s.role === 'child');
  const savedOnPurpose = shownView.contributions.reduce((s, r) => s + r.monthly, 0);
  const onceTotal = shownView.oneTime.reduce((s, r) => s + r.amount, 0);

  const envRows: EnvRowSpec[] = [
    {
      key: 'shared',
      label: 'Shared',
      color: SHARED_FIXED_COLOR,
      monthly: env.shared,
      edited: Math.abs(env.shared - baseEnv.shared) >= 0.5,
      onChange: editShared,
      note: clampedKey === 'shared' ? 'That is less than the other shared lines add up to, so Other shared spending is held at $0.' : undefined,
      popover: (
        <>
          <p>
            Changes “Other shared spending”; rent and the other bills stay. Applies every year this line runs.
          </p>
          {hasFixedBills && (
            <label className="ns-bgt-pop-lever">
              <span className="ns-bgt-pop-lever-head">
                <span>Other fixed bills</span>
                <span className="ns-num">
                  {fixedPct > 0 ? '+' : ''}
                  {fixedPct}%
                </span>
              </span>
              <input type="range" min={-30} max={30} step={5} value={fixedPct} onChange={(e) => editFixedPct(Number(e.target.value))} />
            </label>
          )}
        </>
      ),
    },
    ...adults.map((a): EnvRowSpec => ({
      key: a.id,
      label: a.name,
      color: ownerColor(stored, a.id),
      monthly: a.monthly,
      edited: Math.abs(a.monthly - (baseEnv.perAdult.find((x) => x.id === a.id)?.monthly ?? 0)) >= 0.5,
      onChange: editAdult(a.id),
      note: clampedKey === a.id ? 'That is less than their other lines add up to, so the allowance is held at $0.' : undefined,
      popover: <p>Sets {a.name}’s allowance. Applies every year this line runs.</p>,
    })),
    ...(hasKids ? [{ key: 'kids', label: 'Kids', color: KIDS_COLOR, monthly: env.kids, edited: false, opens: () => setKidsOpen(true) } satisfies EnvRowSpec] : []),
    ...(env.withdrawalTax >= 0.5
      ? [{ key: 'wtax', label: 'Tax on withdrawals', color: WITHDRAWAL_TAX_COLOR, monthly: env.withdrawalTax, edited: false, derived: true } satisfies EnvRowSpec]
      : []),
    // What is left. A surplus year is "Saved". A gap year is three rows
    // (V5-REVIEW-2 N1): "Saved on purpose" (money still set aside), "From savings"
    // (a real drawdown, orange, not an error) and "Unfunded" (the shortfall,
    // red). "Short" belongs to Unfunded alone, and only in a short year (F3).
    ...(gapYear
      ? ([
          ...(env.intoSavings >= 0.5
            ? [
                {
                  key: 'into',
                  label: 'Saved on purpose',
                  caption: 'still paid in',
                  color: SAVED_COLOR,
                  monthly: env.intoSavings,
                  edited: Math.abs(env.intoSavings - baseEnv.intoSavings) >= 0.5,
                  derived: true,
                } satisfies EnvRowSpec,
              ]
            : []),
          {
            key: 'drawn',
            label: 'From savings',
            color: FROM_SAVINGS_COLOR,
            monthly: env.fromSavings,
            edited: Math.abs(env.fromSavings - baseEnv.fromSavings) >= 0.5,
            derived: true,
          } satisfies EnvRowSpec,
          ...(unfundedNow >= 0.5
            ? [
                {
                  key: 'unfunded',
                  label: 'Unfunded',
                  glyph: true,
                  color: UNFUNDED_COLOR,
                  danger: true,
                  monthly: unfundedNow,
                  edited: false,
                  derived: true,
                  short: unfundedNow,
                } satisfies EnvRowSpec,
              ]
            : []),
        ] as EnvRowSpec[])
      : [
          {
            key: 'saved',
            label: 'Saved',
            color: SAVED_COLOR,
            monthly: env.saved,
            edited: Math.abs(env.saved - baseEnv.saved) >= 0.5,
            derived: true,
          } satisfies EnvRowSpec,
        ]),
  ];

  const sectionSpecs: SectionSpec[] = [
    { key: 'shared', title: 'Shared', color: SHARED_FIXED_COLOR, monthly: env.shared, rows: rowsFor('shared'), owner: 'shared' },
    ...adults.map((a): SectionSpec => ({ key: a.id, title: a.name, color: ownerColor(stored, a.id), monthly: a.monthly, rows: rowsFor(a.id), owner: a.id })),
  ];

  const unitToggles = (
    <div className="ns-bgt-toggles">
      <Segmented
        size="sm"
        ariaLabel="Per month or per year"
        value={unit}
        onChange={(v) => setUnit(v as Unit)}
        options={[
          { value: 'mo', label: '/mo' },
          { value: 'yr', label: '/yr' },
        ]}
      />
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
  );

  return (
    <>
      <PageHeader title="Budget" actions={unitToggles} />
      <PlanCheckBanner only={['rent-after-purchase']} />

      <div className="ns-bgt">
        <section aria-labelledby="bgt-month">
          <h2 className="ns-bgt-section-title" id="bgt-month">
            Your month in {snapshot.year}
          </h2>
          <div className="ns-bgt-month">
            <div className="ns-bgt-donut">
              <DonutChart
                segments={segments}
                center={
                  unfundedNow >= 0.5
                    ? { value: `Short\u00A0${money(unfundedNow * scale)}`, label: `${per === '/mo' ? 'a month' : 'a year'} in ${snapshot.year}`, tone: 'danger' }
                    : { value: money(env.afterTax * scale), label: `after tax ${per}` }
                }
                size={phone ? 224 : 280}
                thickness={phone ? 26 : 30}
                legend={false}
                format={money}
                hoveredKey={hoverKey}
                onHoverKey={setHoverKey}
                onSelect={selectSlice}
                ariaLabel={`Where the ${per === '/mo' ? 'month' : 'year'} goes in ${snapshot.year}`}
              />
            </div>
            <div className="ns-bgt-envs" role="list" aria-label="Envelopes">
              {envRows.map((row) => (
                <EnvelopeRow
                  key={row.key}
                  row={row}
                  scale={scale}
                  per={per}
                  hovered={hoverKey === row.key}
                  dimmed={hoverKey !== null && hoverKey !== row.key}
                  onHover={(k) => setHoverKey(k)}
                />
              ))}
            </div>
          </div>
          {preview.draft && (
            <div className="ns-bgt-impact">
              <ImpactStrip
                current={current}
                draft={draftMetrics}
                actions={
                  <PreviewActions
                    onKeep={() => preview.draft && replacePlan(preview.draft, 'Budget updated')}
                    onSaveAs={() => preview.draft && savePlanAs(preview.draft, `${stored.name} — budget change`)}
                    onReset={resetDraft}
                  />
                }
              />
            </div>
          )}
        </section>

        <section aria-labelledby="bgt-years">
          {/* The readout names the chart ("Where each dollar goes"); a gap year's base is its outgoings, not after-tax income. */}
          <h2 className="ns-bgt-section-title" id="bgt-years">
            Year by year
          </h2>
          <BudgetShare
            years={yearList}
            layers={layers}
            saved={savedSeries}
            intoSavings={intoSavingsSeries}
            fromSavings={fromSavingsSeries}
            unfunded={unfundedSeries}
            afterTax={afterTaxSeries}
            draftSpentShare={draftShares?.map((e) => e.spent)}
            draftSavedShare={draftShares?.map((e) => e.saved)}
            range={chartRange}
            onRange={setChartRange}
            todayYear={today}
            focusYear={focusYear}
            onFocusYear={setFocusYear}
            onHoverYear={previewYear}
            shownYear={snapshot.year}
            agesFor={(y) => adultAges(stored, y)}
            danger={danger}
            perLabel={per}
            height={phone ? 280 : 360}
            label="Where each dollar goes"
            compactRange={phone}
          />
        </section>

        <section aria-labelledby="bgt-lines">
          <h2 className="ns-bgt-section-title" id="bgt-lines">
            The budget in {snapshot.year}
          </h2>
          <div className="ns-bgt-secs">
            {sectionSpecs.map((s) => (
              <div key={s.key} className={`ns-bgt-sec${open.has(s.key) ? ' ns-bgt-sec-open' : ''}`} ref={(el) => void (el ? secRefs.current.set(s.key, el) : secRefs.current.delete(s.key))}>
                <SectionHead
                  title={s.title}
                  color={s.color}
                  total={fmt(s.monthly)}
                  open={open.has(s.key)}
                  onToggle={() => toggle(s.key)}
                  edited={Math.abs(s.monthly - (s.key === 'shared' ? baseEnv.shared : (baseEnv.perAdult.find((a) => a.id === s.key)?.monthly ?? 0))) >= 0.5}
                />
                {open.has(s.key) && (
                  <div className="ns-bgt-sec-body">
                    {s.rows.length === 0 && <p className="ns-bgt-sec-empty">Nothing here in {snapshot.year}.</p>}
                    {s.rows.map((r) => (
                      <LineRow key={r.key} row={r} plan={stored} fmt={fmt} onOpen={openRow} />
                    ))}
                    <div className="ns-bt-add-row">
                      <button type="button" className="ns-btn-ghost" onClick={() => setEditing({ line: newBudgetLine(stored, s.owner), isNew: true })}>
                        <Plus size={13} aria-hidden /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {hasKids && (
              <div className={`ns-bgt-sec${open.has('kids') ? ' ns-bgt-sec-open' : ''}`}>
                <SectionHead
                  title="Kids"
                  color={KIDS_COLOR}
                  total={fmt(env.kids)}
                  open={open.has('kids')}
                  onToggle={() => toggle('kids')}
                  edited={Math.abs(env.kids - baseEnv.kids) >= 0.5}
                  extra={
                    <button type="button" className="ns-btn-ghost ns-bgt-link" onClick={() => setKidsOpen(true)}>
                      Cost by age <ChevronRight size={13} aria-hidden style={{ verticalAlign: '-2px' }} />
                    </button>
                  }
                />
                {open.has('kids') && (
                  <div className="ns-bgt-sec-body">
                    {childSections.length === 0 && <p className="ns-bgt-sec-empty">No costs in {snapshot.year} yet.</p>}
                    {childSections.map((s) => (
                      <div key={s.owner}>
                        <div className="ns-bgt-sub">
                          <span>{s.title}</span>
                          <span className="ns-bt-total ns-num">{fmt(s.monthly)}</span>
                        </div>
                        {sortRows(s).map((r) => (
                          <LineRow key={r.key} row={r} plan={stored} fmt={fmt} onOpen={openRow} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {savedOnPurpose > 0 && (
              <div className={`ns-bgt-sec${open.has('saved') ? ' ns-bgt-sec-open' : ''}`}>
                <SectionHead title="Saved on purpose" color="var(--in)" total={fmt(savedOnPurpose)} open={open.has('saved')} onToggle={() => toggle('saved')} />
                {open.has('saved') && (
                  <div className="ns-bgt-sec-body">
                    {shownView.contributions.map((r) => (
                      <LineRow key={r.key} row={r} plan={stored} fmt={fmt} onOpen={openRow} bare />
                    ))}
                  </div>
                )}
              </div>
            )}

            {shownView.oneTime.length > 0 && (
              <div className={`ns-bgt-sec${open.has('once') ? ' ns-bgt-sec-open' : ''}`}>
                <SectionHead title="Once this year" total={money(onceTotal)} open={open.has('once')} onToggle={() => toggle('once')} />
                {open.has('once') && (
                  <div className="ns-bgt-sec-body">
                    {shownView.oneTime.map((o) => (
                      <div key={o.key} className="ns-bt-row ns-bt-row-static">
                        <span className="ns-bt-name">{o.label}</span>
                        <span />
                        <span className="ns-bt-amt ns-num">{money(o.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="ns-bt-add-row" style={{ paddingLeft: 0, paddingTop: 12 }}>
            <button type="button" className="ns-btn-ghost" onClick={() => setEditing({ line: newBudgetLine(stored, 'shared'), isNew: true })}>
              <Plus size={13} aria-hidden /> Add a line
            </button>
          </div>
        </section>
      </div>

      <KidsSheet
        open={kidsOpen}
        onClose={() => setKidsOpen(false)}
        plan={stored}
        result={result}
        shownYear={snapshot.year}
        onFocusYear={setFocusYear}
        onOpenLine={(line) => setEditing({ line, isNew: false })}
      />

      {lastEditing.current && (
        <BudgetLineDrawer
          open={editing !== null}
          line={lastEditing.current.line}
          plan={stored}
          isNew={lastEditing.current.isNew}
          onCancel={() => setEditing(null)}
          onSave={(line) => {
            const budget = stored.budget ?? [];
            const isNew = lastEditing.current!.isNew;
            const next = isNew ? [...budget, line] : budget.map((l) => (l.id === line.id ? line : l));
            replacePlan({ ...stored, budget: next }, isNew ? `Added ${line.name}` : `Updated ${line.name}`);
            setEditing(null);
          }}
          onDelete={() => {
            const id = lastEditing.current!.line.id;
            replacePlan({ ...stored, budget: (stored.budget ?? []).filter((l) => l.id !== id) }, `Removed ${lastEditing.current!.line.name}`);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

interface EnvRowSpec {
  key: string;
  label: string;
  color: string;
  /** Per month, in the dollars shown. */
  monthly: number;
  edited: boolean;
  /** Present when the figure can be typed over. */
  onChange?(monthly: number): void;
  /** Kids: the figure opens a sheet instead. */
  opens?(): void;
  /** Saved / Into / From / Unfunded: worked out, never edited. */
  derived?: boolean;
  /** Small muted words after the label ("still paid in"). */
  caption?: string;
  /** Leads the label with ✗ and draws the dot hatched: the unfunded row. */
  glyph?: boolean;
  /** The danger styling: the row's figure wears the danger red. */
  danger?: boolean;
  /** Per month: the unfunded part of a short year. Only then does the row say Short. */
  short?: number;
  note?: string;
  popover?: ReactNode;
}

interface SectionSpec {
  key: string;
  title: string;
  color: string;
  monthly: number;
  rows: BudgetRow[];
  owner: string;
}

const sortRows = (s: BudgetSection) =>
  [...s.rows].sort((a, b) => Number(b.essential) - Number(a.essential) || b.monthly - a.monthly);

/**
 * One envelope: its label and the big figure (docs/REDESIGN-V5.md §5.3).
 * Click the figure and it becomes an input in place: type then Enter or
 * click away to preview, ↑/↓ nudge by $100, Esc to back out. The popover
 * under it says how far the edit reaches. Kids opens its sheet; Saved is
 * worked out from the rest. It reads "From savings" when negative and says
 * ✗ Short only in a year the plan is short (V5-REVIEW-1 F3).
 */
function EnvelopeRow({
  row,
  scale,
  per,
  hovered,
  dimmed,
  onHover,
}: {
  row: EnvRowSpec;
  scale: number;
  per: string;
  hovered: boolean;
  dimmed: boolean;
  onHover(key: string | null): void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // What the figure read when editing began, for Esc.
  const startValue = useRef(0);
  const shown = row.monthly * scale;
  const editable = !!row.onChange;

  const begin = () => {
    startValue.current = row.monthly;
    setText(String(Math.round(shown)));
    setEditing(true);
  };
  const parse = (t: string): number | null => {
    const n = Number(t.replace(/[$,\s]/g, ''));
    return t.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const apply = (display: number) => row.onChange?.(display / scale);
  const commit = () => {
    const n = parse(text);
    if (n !== null && Math.abs(n / scale - row.monthly) >= 0.005) apply(n);
  };
  const close = () => setEditing(false);
  const nudge = (dir: 1 | -1) => {
    const base = parse(text) ?? shown;
    const next = Math.max(0, Math.round(base + dir * NUDGE * scale));
    setText(String(next));
    apply(next);
  };

  // The popover's slider can move this figure while the input isn't focused;
  // keep the text in step so Enter doesn't write the stale number back.
  useEffect(() => {
    if (editing && document.activeElement !== input.current) setText(String(Math.round(shown)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.monthly]);

  // The popover holds a slider for Shared, and focus moves into it, so
  // "closed when focus leaves the input" would shut it mid-drag. Close on a
  // press outside this row instead (and on Esc / Enter).
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        commit();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, text]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      close();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (Math.abs(row.monthly - startValue.current) >= 0.005) row.onChange?.(startValue.current);
      close();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(e.key === 'ArrowUp' ? 1 : -1);
    }
  };

  const figure = exact(shown);
  return (
    <div
      ref={wrap}
      role="listitem"
      className={`ns-bgt-env${hovered ? ' ns-bgt-env-on' : ''}${dimmed ? ' ns-bgt-env-dim' : ''}${row.danger ? ' ns-bgt-env-danger' : ''}`}
      onPointerEnter={() => onHover(row.key)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(row.key)}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (wrap.current?.contains(to)) return;
        onHover(null);
        // Tabbing out of the row ends the edit too (a press elsewhere is
        // handled by the document listener above; Safari reports no target).
        if (editing && to) {
          commit();
          close();
        }
      }}
    >
      <span className="ns-bgt-env-label">
        <span
          className={`ns-bgt-env-dot${row.glyph ? ' ns-bgt-env-dot-hatch' : ''}`}
          style={row.glyph ? { ['--dot' as string]: row.color } : { background: row.color }}
          aria-hidden
        />
        <span className="ns-bgt-env-name">
          {row.glyph && <span aria-hidden>✗ </span>}
          {row.label}
          {row.caption && <span className="ns-bgt-env-caption">{row.caption}</span>}
        </span>
      </span>
      <span className="ns-bgt-env-value">
        {editing ? (
          <input
            ref={input}
            className="ns-bgt-fig-input"
            inputMode="numeric"
            autoFocus
            aria-label={`${row.label} ${per === '/mo' ? 'per month' : 'per year'}`}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={commit}
          />
        ) : editable ? (
          <button type="button" className="ns-bgt-fig ns-num" onClick={begin} aria-label={`Edit ${row.label}: ${figure} ${per === '/mo' ? 'per month' : 'per year'}`}>
            {figure}
          </button>
        ) : row.opens ? (
          <button type="button" className="ns-bgt-fig ns-bgt-fig-open ns-num" onClick={row.opens} aria-label={`${row.label}: ${figure}. See what the kids cost`}>
            {figure}
            <ChevronRight size={20} strokeWidth={2.25} className="ns-bgt-chev" aria-hidden />
          </button>
        ) : (
          <span className={`ns-bgt-fig ns-bgt-fig-static ns-num${row.key === 'drawn' ? ' ns-bgt-fig-drawn' : ''}`}>
            {figure}
          </span>
        )}
        {row.short !== undefined && (
          <span className="ns-bgt-short">
            <span aria-hidden>✗</span> Short {exact(row.short * scale)}
            {per}
          </span>
        )}
        {row.edited && <span className="ns-bgt-edited" role="img" aria-label="Changed, not kept yet" title="Changed, not kept yet" />}
      </span>
      {row.note && <p className="ns-bgt-env-note">{row.note}</p>}
      {editing && row.popover && <div className="ns-bgt-pop" role="group" aria-label={`About editing ${row.label}`}>{row.popover}</div>}
    </div>
  );
}

function SectionHead({
  title,
  color,
  total,
  open,
  onToggle,
  edited,
  extra,
}: {
  title: string;
  color?: string;
  total: string;
  open: boolean;
  onToggle(): void;
  edited?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div className="ns-bgt-sec-head">
      <button type="button" className="ns-bgt-sec-toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronRight size={16} strokeWidth={2.25} className="ns-bgt-sec-caret" aria-hidden />
        {color && <span className="ns-bt-dot" style={{ background: color }} aria-hidden />}
        <span className="ns-bgt-sec-title">{title}</span>
        {edited && <span className="ns-bgt-edited" role="img" aria-label="Changed, not kept yet" />}
        <span className="ns-bgt-sec-total ns-num">{total}</span>
      </button>
      {extra}
    </div>
  );
}

function LineRow({
  row,
  plan,
  fmt,
  onOpen,
  bare,
}: {
  row: BudgetRow;
  plan: Plan;
  fmt(monthly: number): string;
  onOpen(row: BudgetRow): void;
  bare?: boolean;
}) {
  const timing = row.line ? lineTiming(row.line, plan) : row.sourceEventId ? 'from an event' : undefined;
  return (
    <button type="button" className="ns-bt-row" onClick={() => onOpen(row)}>
      <span className="ns-bt-name">
        {row.label}
        {timing && <span className="ns-bt-timing">{timing}</span>}
      </span>
      {bare ? (
        <span />
      ) : (
        <span className={`ns-bt-tag${row.essential ? '' : ' ns-bt-tag-flex'}`}>
          {row.line?.kind === 'allowance' ? 'Allowance' : row.essential ? 'Fixed' : 'Flexible'}
        </span>
      )}
      <span className="ns-bt-amt ns-num">{fmt(row.monthly)}</span>
    </button>
  );
}
