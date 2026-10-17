import { useEffect, useMemo, useState } from 'react';
import { Umbrella } from 'lucide-react';
import type { SeppElection, SeppMethod } from '@northstar/engine';
import {
  DEFAULT_SEPP_RATE_PERCENT,
  MANDATORY_AGE,
  newAccountOfType,
  runPlan,
  seppOwnerBirthYear,
  seppStartOptions,
  seppYearRows,
  withSeppElection,
} from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { AnnuityForecastView, isAnnuityContract } from '../views/AnnuityForecastView';
import { SeppBars } from '../views/SeppBars';
import { RangePicker, TimeSeriesChart } from '../charts';
import { DataTable, type TableRow } from '../tabs/DataTable';
import { ImpactStrip, PreviewActions } from '../ImpactStrip';
import { impactMetrics, presentResult } from '../impact';
import { planHealth } from '../health';
import { dangerBandFor, useHeroHeight } from '../decisionKit';
import { ZERO_DASH, money } from '../format';
import { EmptyState, Page, PageHeader, Segmented, Select } from '../ui';
import { NumberInput } from '../drawer/fields';
import './household.css';
import './decisions.css';

/** One table cell: a real figure, or the app's dash for nothing — not a "$0" that reads as a value. */
const cell = (v: number) => (Math.abs(v) < 0.5 ? ZERO_DASH : money(v));

const METHODS: { value: SeppMethod; label: string }[] = [
  { value: 'amortization', label: 'Amortization' },
  { value: 'annuitization', label: 'Annuitization' },
  { value: 'rmd', label: 'RMD' },
];

/**
 * Annuity & SEPP (docs/REDESIGN-V4.md §4.8, on the v5 kit,
 * docs/REDESIGN-V5.md §5.5): the largest SEPP you could start in any year, how
 * that SEPP draws the balance down while the account keeps growing — run
 * through the real plan (fees, gain-first tax, everything else the household
 * does), not a calculator beside it — and the contract's own makeup.
 */
export function AnnuityPage() {
  const { stored, setAccountDraft } = usePlanner();
  const candidates = stored.accounts.filter(
    (a) => !a.isSynthetic && a.isIncluded && (isAnnuityContract(a) || a.accountClass === 'taxDeferredInvestment'),
  );

  return (
    <Page>
      <PageHeader title="Annuity & SEPP" />
      {candidates.length > 0 ? (
        <SeppSection candidates={candidates} />
      ) : (
        <div className="ns-card">
          <EmptyState
            icon={Umbrella}
            title="No annuity in this plan"
            body="Add your variable annuity to see the largest SEPP you could start in any year, and how that SEPP draws it down."
            action={
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                onClick={() => setAccountDraft(structuredClone(newAccountOfType('variableAnnuity')))}
              >
                Add a variable annuity
              </button>
            }
          />
        </div>
      )}
    </Page>
  );
}

function SeppSection({ candidates }: { candidates: ReturnType<typeof usePlanner>['stored']['accounts'] }) {
  const { stored, result, replacePlan, savePlanAs, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const heroHeight = useHeroHeight();
  const funded = candidates.filter((a) => a.initialBalance > 0);
  const preferred =
    candidates.find((a) => a.seppElection) ??
    funded.find((a) => a.accountClass === 'variableAnnuity') ??
    funded[0] ??
    candidates[0];
  const [accountId, setAccountId] = useState(preferred.id);
  const account = candidates.find((a) => a.id === accountId) ?? preferred;
  const birthYear = seppOwnerBirthYear(stored, account);
  const start = stored.settings.startYear;

  const saved = account.seppElection;
  const [method, setMethod] = useState<SeppMethod>(saved?.method ?? 'amortization');
  const [rate, setRate] = useState<number>(saved?.ratePercent ?? DEFAULT_SEPP_RATE_PERCENT);
  const [startYear, setStartYear] = useState<number>(saved?.startYear ?? start + 1);
  useEffect(() => {
    setMethod(saved?.method ?? 'amortization');
    setRate(saved?.ratePercent ?? DEFAULT_SEPP_RATE_PERCENT);
    setStartYear(saved?.startYear ?? start + 1);
  }, [account.id, saved, start]);

  const lastStart = birthYear !== undefined ? birthYear + MANDATORY_AGE - 1 : start + 20;
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = start; y <= Math.max(start, lastStart); y++) out.push(y);
    return out;
  }, [start, lastStart]);

  // Every reading below comes from real plan runs: one with no SEPP on this
  // account, one with the SEPP being looked at.
  const withoutPlan = useMemo(() => withSeppElection(stored, account.id, undefined), [stored, account.id]);
  const withoutNominal = useMemo(() => runPlan(withoutPlan), [withoutPlan]);
  const options = useMemo(
    () => seppStartOptions(withoutPlan, withoutNominal, account.id, years, method, rate),
    [withoutPlan, withoutNominal, account.id, years, method, rate],
  );
  const election: SeppElection = { startYear, method, ratePercent: rate };
  const draftPlan = useMemo(() => withSeppElection(stored, account.id, election), [stored, account.id, startYear, method, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftNominal = useMemo(() => runPlan(draftPlan), [draftPlan]);
  const rows = useMemo(() => seppYearRows(draftPlan, draftNominal, account.id), [draftPlan, draftNominal, account.id]);
  const withoutRows = useMemo(() => seppYearRows(withoutPlan, withoutNominal, account.id), [withoutPlan, withoutNominal, account.id]);

  const isDraft = !saved || saved.startYear !== startYear || saved.method !== method || saved.ratePercent !== rate;
  const option = options.find((o) => o.startYear === startYear);
  const lockedUntil = option?.lockedUntil;
  const commitYears = lockedUntil !== undefined ? lockedUntil - startYear + 1 : undefined;
  const todayValue = account.initialBalance;

  const current = useMemo(() => impactMetrics(stored, result, startYear), [stored, result, startYear]);
  const draftResult = useMemo(() => presentResult(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const draft = useMemo(() => (isDraft ? impactMetrics(draftPlan, draftResult, startYear) : null), [isDraft, draftPlan, draftResult, startYear]);
  // The draft's own health: starting a SEPP can move where the money runs out.
  const draftHealth = useMemo(() => planHealth(draftResult, draftPlan), [draftResult, draftPlan]);
  const danger = useMemo(() => dangerBandFor(draftHealth, draftResult), [draftHealth, draftResult]);

  if (todayValue <= 0) {
    return (
      <div className="ns-card">
        <EmptyState
          icon={Umbrella}
          title={`${account.name} has no balance yet`}
          body="Set its current value (and, for an annuity, what you've paid in) on Accounts to see what a SEPP from it could pay."
          action={
            candidates.length > 1 ? (
              <Select placeholder="Account" value={account.id} onChange={setAccountId} options={candidates.map((a) => ({ value: a.id, label: a.name }))} />
            ) : undefined
          }
        />
      </div>
    );
  }

  // The chart's window: through the lock and ten years past it — far
  // enough to see the SEPP draw the balance down and what's left after,
  // near enough that decades of compounding don't flatten it.
  const chartEnd = (lockedUntil ?? start + 30) + 10;
  const chartRows = rows.filter((r) => r.year <= chartEnd);
  const chartWithout = withoutRows.filter((r) => r.year <= chartEnd);
  const chartYears = chartRows.map((r) => r.year);
  const ageByYear = new Map(rows.map((r) => [r.year, r.age]));

  // The table is every year, sideways-scrolling (§3.7). A year inside the
  // SEPP's lock gets a small marker under its header.
  const lockedYears = new Set(rows.filter((r) => r.locked).map((r) => r.year));
  const showBasis = rows.some((r) => r.basisLeft !== undefined);
  const tableRows: TableRow[] = [
    { key: 'age', kind: 'child', label: 'Age', cells: rows.map((r) => (r.age !== undefined ? String(r.age) : ZERO_DASH)) },
    { key: 'open', kind: 'child', label: 'Start', cells: rows.map((r) => cell(r.open)) },
    { key: 'growth', kind: 'child', label: 'Growth', cells: rows.map((r) => cell(r.growth)) },
    { key: 'fees', kind: 'child', label: 'Fees', cells: rows.map((r) => cell(r.fees)) },
    { key: 'sepp', kind: 'group', label: 'SEPP', cells: rows.map((r) => cell(r.payment)) },
    { key: 'taxable', kind: 'child', label: 'Taxable', cells: rows.map((r) => cell(r.taxable)) },
    { key: 'tax', kind: 'child', label: 'Tax', cells: rows.map((r) => cell(r.tax)) },
    { key: 'net', kind: 'child', label: 'After tax', cells: rows.map((r) => cell(r.payment - r.tax)) },
    { key: 'close', kind: 'total', label: 'End', cells: rows.map((r) => cell(r.close)) },
    ...(showBasis ? [{ key: 'basis', kind: 'child' as const, label: 'Basis left', cells: rows.map((r) => (r.basisLeft !== undefined ? cell(r.basisLeft) : ZERO_DASH)) }] : []),
  ];

  const controls = (
    <div className="ns-dec-controls">
      {candidates.length > 1 && (
        <Select placeholder="Account" value={account.id} onChange={setAccountId} options={candidates.map((a) => ({ value: a.id, label: a.name }))} />
      )}
      <Segmented size="sm" ariaLabel="SEPP method" value={method} onChange={(v) => setMethod(v as SeppMethod)} options={METHODS} />
    </div>
  );

  return (
    <>
      <section className="ns-dec-section">
        <SeppBars options={options} selectedYear={startYear} onSelect={setStartYear} height={heroHeight} actions={controls} />
        {method !== 'rmd' && (
          <label className="ns-sepp-rate">
            <span>Interest rate</span>
            <NumberInput value={rate} unit="percent" step={0.1} min={0.1} max={10} onChange={(v) => v && setRate(v)} />
          </label>
        )}
      </section>

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">{saved && !isDraft ? 'In your plan' : 'Add it to the plan'}</h2>
        </div>
        <ImpactStrip
          current={current}
          draft={draft}
          actions={
            isDraft ? (
              <PreviewActions
                onKeep={() => replacePlan(draftPlan, `SEPP from ${account.name} starts ${startYear}`)}
                onSaveAs={() => savePlanAs(draftPlan, `${stored.name} — SEPP from ${startYear}`)}
                onReset={() => {
                  setMethod(saved?.method ?? 'amortization');
                  setRate(saved?.ratePercent ?? DEFAULT_SEPP_RATE_PERCENT);
                  setStartYear(saved?.startYear ?? start + 1);
                }}
              />
            ) : (
              <button type="button" className="ns-btn" onClick={() => replacePlan(withoutPlan, `Removed the SEPP from ${account.name}`)}>
                Remove the SEPP
              </button>
            )
          }
        />
        {commitYears !== undefined && (
          <p className="ns-sepp-commit">
            <strong>
              {commitYears}-year commitment, through {lockedUntil}.
            </strong>{' '}
            Skipping, changing or adding money before then voids the exception: the 10% penalty applies to every payment already taken, plus interest.
          </p>
        )}
      </section>

      <section className="ns-dec-section">
        <TimeSeriesChart
          years={chartYears}
          series={[
            { id: 'with', label: 'With SEPP', color: 'var(--data-nw)', values: chartRows.map((r) => r.close), kind: 'area' },
            { id: 'without', label: 'Without SEPP', color: 'var(--muted)', values: chartWithout.map((r) => r.close), dashed: true },
          ]}
          range={chartRange}
          todayYear={start}
          height={heroHeight - 100}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          bandFrom={lockedUntil !== undefined && lockedUntil + 1 <= chartEnd ? lockedUntil + 1 : undefined}
          bandLabel="SEPP over"
          readout={{
            label: `${account.name}, with and without the SEPP`,
            primaryId: 'with',
            agesFor: (year) => {
              const age = ageByYear.get(year);
              return age !== undefined ? `Age ${age}` : undefined;
            },
            actions: <RangePicker value={chartRange} onChange={setChartRange} years={chartYears} openingYear={start} />,
          }}
          ariaLabel={`${account.name} balance with and without the SEPP`}
        />
      </section>

      <section className="ns-dec-section ns-dec-table">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">Year by year</h2>
        </div>
        <DataTable
          caption="Future dollars"
          years={rows.map((r) => r.year)}
          rows={tableRows}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          dangerYears={draftHealth.shortYears}
          columnSubLabel={(y) => (lockedYears.has(y) ? 'SEPP' : undefined)}
        />
      </section>

      {isAnnuityContract(account) && <AnnuityForecastView plan={stored} result={result} accountId={account.id} />}
    </>
  );
}
