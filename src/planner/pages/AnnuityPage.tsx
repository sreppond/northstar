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
import { ChartLegend, MiniChart } from '../views/MiniChart';
import { ImpactStrip, PreviewActions } from '../ImpactStrip';
import { impactMetrics, presentResult } from '../impact';
import { ZERO_DASH, money, planMetaLine } from '../format';
import { EmptyState, Page, PageHeader, SectionCard, Segmented, Select, Stat, StatStrip } from '../ui';
import { NumberInput } from '../drawer/fields';
import './household.css';

/** One table cell: a real figure, or the app's dash for nothing — not a "$0" that reads as a value. */
const cell = (v: number) => (Math.abs(v) < 0.5 ? ZERO_DASH : money(v));

const METHODS: { value: SeppMethod; label: string; hint: string }[] = [
  { value: 'amortization', label: 'Amortization', hint: 'The largest payment — fixed every year.' },
  { value: 'annuitization', label: 'Annuitization', hint: 'Also fixed; usually a little smaller.' },
  { value: 'rmd', label: 'RMD', hint: 'The smallest — recomputed each year from the balance.' },
];

/**
 * Annuity & SEPP (docs/REDESIGN-V4.md §4.8): what the contract is worth over
 * time, the largest SEPP you could start in any year, and how that SEPP
 * draws the balance down while the account keeps growing — run through the
 * real plan (fees, gain-first tax, everything else the household does), not
 * a calculator beside it.
 */
export function AnnuityPage() {
  const { stored, result, setAccountDraft } = usePlanner();
  const candidates = stored.accounts.filter(
    (a) => !a.isSynthetic && a.isIncluded && (isAnnuityContract(a) || a.accountClass === 'taxDeferredInvestment'),
  );

  return (
    <Page>
      <PageHeader title="Annuity & SEPP" meta={planMetaLine(stored, result.endYear)} />
      {candidates.length > 0 ? (
        <SeppSection candidates={candidates} />
      ) : (
        <div className="ns-card">
          <EmptyState
            icon={Umbrella}
            title="No annuity in this plan"
            body="Add your variable annuity to see what it's worth over time, the largest SEPP you could start in any year, and how that SEPP draws it down."
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
  const { stored, result, replacePlan, savePlanAs } = usePlanner();
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
  const at = (rs: typeof rows, year: number | undefined) => rs.find((r) => r.year === year);
  const at60 = birthYear !== undefined ? birthYear + 60 : undefined;
  const todayValue = account.initialBalance;
  const paid = rows.filter((r) => r.locked).reduce((s, r) => s + r.payment, 0);
  const firstPayment = rows.find((r) => r.year === startYear)?.payment ?? option?.annualPayment ?? 0;

  const current = useMemo(() => impactMetrics(stored, result, startYear), [stored, result, startYear]);
  const draftResult = useMemo(() => presentResult(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const draft = useMemo(() => (isDraft ? impactMetrics(draftPlan, draftResult, startYear) : null), [isDraft, draftPlan, draftResult, startYear]);

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
  let running = 0;
  const cumulative = chartRows.map((r) => (running += r.payment));

  return (
    <>
      <p className="ns-hh-answer">
        Today it's worth <strong>{money(todayValue)}</strong>. Started in <strong>{startYear}</strong>, the{' '}
        {method === 'rmd' ? 'RMD-method' : 'largest'} SEPP is <strong>{money(firstPayment)}/yr</strong> ({money(firstPayment / 12)}/mo)
        {lockedUntil !== undefined && (
          <>
            , {method === 'rmd' ? 'recomputed each year' : 'fixed'} until {lockedUntil}
            {birthYear !== undefined ? ` (age ${lockedUntil - birthYear})` : ''}
          </>
        )}
        . {at60 !== undefined && at(rows, at60) && at(withoutRows, at60) && (
          <>
            At 60 the account would be {money(at(rows, at60)!.close)} — vs {money(at(withoutRows, at60)!.close)} without it.
          </>
        )}
      </p>

      <StatStrip>
        <Stat size="xl" label="Worth today" value={money(todayValue)} sub={account.name} explain="The contract's balance as of the plan's as-of date." />
        <Stat
          label={`SEPP from ${startYear}`}
          value={`${money(firstPayment)}/yr`}
          sub={`${money(firstPayment / 12)}/mo`}
          explain="The first year's payment under the chosen method and rate, sized on the balance the account would have at the start of that year."
        />
        <Stat
          label="Locked until"
          value={lockedUntil !== undefined ? String(lockedUntil) : '—'}
          sub={commitYears !== undefined ? `${commitYears} years of payments` : undefined}
          explain="A SEPP must run until the later of five years or age 59½ (treated as 60 here, since the plan stores birth years, not birthdays). Changing it before then voids the exception retroactively."
        />
        <Stat
          label="Paid out by then"
          value={money(paid)}
          explain="Every SEPP payment through the end of the lock — future dollars, as the contract would pay them."
        />
      </StatStrip>

      <SectionCard
        title="Largest SEPP by start year"
        meta="Click a year"
        divider={false}
        actions={
          <div className="ns-sepp-controls">
            {candidates.length > 1 && (
              <Select
                placeholder="Account"
                value={account.id}
                onChange={setAccountId}
                options={candidates.map((a) => ({ value: a.id, label: a.name }))}
              />
            )}
            <Segmented size="sm" ariaLabel="SEPP method" value={method} onChange={(v) => setMethod(v as SeppMethod)} options={METHODS.map(({ value, label }) => ({ value, label }))} />
          </div>
        }
      >
        <SeppBars options={options} selectedYear={startYear} onSelect={setStartYear} />
        <div className="ns-sepp-foot">
          <span className="ns-hh-note">{METHODS.find((m) => m.value === method)?.hint}</span>
          {method !== 'rmd' && (
            <label className="ns-sepp-rate">
              <span>Interest rate</span>
              <NumberInput value={rate} unit="percent" step={0.1} min={0.1} max={10} onChange={(v) => v && setRate(v)} />
            </label>
          )}
        </div>
        {method !== 'rmd' && (
          <p className="ns-hh-note">
            The IRS caps this rate at the greater of 5% or 120% of the federal mid-term rate for either of the two months before the first payment
            (published monthly at irs.gov). A lower rate gives a smaller payment — the way to take less than the maximum.
          </p>
        )}
      </SectionCard>

      <SectionCard title="With and without the SEPP" meta="Future dollars — what the contract statements will show" divider={false}>
        <MiniChart
          years={chartRows.map((r) => r.year)}
          height={260}
          series={[
            { label: 'Without SEPP', color: 'var(--muted)', values: chartWithout.map((r) => r.close), dashed: true },
            { label: 'With SEPP', color: 'var(--data-nw)', values: chartRows.map((r) => r.close), fill: true },
            { label: 'Paid out so far', color: 'var(--in)', values: cumulative },
            ...(chartRows.some((r) => r.basisLeft !== undefined)
              ? [{ label: 'Tax-free basis left', color: 'var(--mix-4)', values: chartRows.map((r) => r.basisLeft ?? NaN), dashed: true }]
              : []),
          ]}
          bandFrom={lockedUntil !== undefined ? lockedUntil + 1 : undefined}
          bandLabel="SEPP over"
        />
        <ChartLegend
          series={[
            { label: 'Without SEPP', color: 'var(--muted)' },
            { label: 'With SEPP', color: 'var(--data-nw)' },
            { label: 'Paid out so far', color: 'var(--in)' },
            ...(rows.some((r) => r.basisLeft !== undefined) ? [{ label: 'Tax-free basis left', color: 'var(--mix-4)' }] : []),
          ]}
        />
      </SectionCard>

      <div className="ns-hh-split">
        <SectionCard title="Year by year" meta={`${startYear}–${lockedUntil ?? ''} shaded: the SEPP's lock`} flush>
          <div className="ns-table-scroll ns-sepp-table-wrap">
            <table className="ns-ladder ns-sepp-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Age</th>
                  <th>Start</th>
                  <th>Growth</th>
                  <th>Fees</th>
                  <th>SEPP</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th>After tax</th>
                  <th>End</th>
                  {rows.some((r) => r.basisLeft !== undefined) && <th>Basis left</th>}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => lockedUntil === undefined || r.year <= lockedUntil + 5)
                  .map((r) => (
                    <tr key={r.year} className={r.locked ? 'ns-sepp-locked' : undefined}>
                      <td>{r.year}</td>
                      <td>{r.age ?? '—'}</td>
                      <td>{cell(r.open)}</td>
                      <td>{cell(r.growth)}</td>
                      <td>{cell(r.fees)}</td>
                      <td>{cell(r.payment)}</td>
                      <td>{cell(r.taxable)}</td>
                      <td>{cell(r.tax)}</td>
                      <td>{cell(r.payment - r.tax)}</td>
                      <td>{cell(r.close)}</td>
                      {rows.some((x) => x.basisLeft !== undefined) && <td>{r.basisLeft !== undefined ? cell(r.basisLeft) : '—'}</td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title={saved && !isDraft ? 'In your plan' : 'Add it to the plan'} meta="Budget and Retirement see it once kept" divider={false}>
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
            <p className="ns-sepp-warning">
              Starting in {startYear} is a {commitYears}-year commitment. Skipping a payment, taking more or less, or adding money before{' '}
              {lockedUntil} voids the exception — the 10% penalty then applies to every payment already taken, plus interest. Not tax advice:
              confirm the method and rate with a CPA before electing.
            </p>
          )}
        </SectionCard>
      </div>

      {isAnnuityContract(account) && (
        <>
          <div className="ns-hh-divider">Contract details</div>
          <AnnuityForecastView plan={stored} result={result} accountId={account.id} />
        </>
      )}
    </>
  );
}
