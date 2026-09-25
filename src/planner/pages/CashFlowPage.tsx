import { ChevronLeft, ChevronRight, PiggyBank } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { LedgerToolbar, LedgerCompareDiff } from '../LedgerToolbar';
import { CashFlowTab } from '../tabs/CashFlowTab';
import { CashFlowSankey } from '../CashFlowSankey';
import { planMetaLine, money, signedMoney, percent } from '../format';
import { cashFlowStats, moneyDelta } from '../ledger';
import { Page, PageHeader, StatStrip, Stat, SectionCard, EmptyState } from '../ui';
import './ledger.css';

export function CashFlowPage() {
  const { windowYears, plan, result, scrubYear, setScrubYear, editor, setAssumptionsDraft, stored } = usePlanner();

  const years = result.years;
  const fallbackYear = (windowYears[0] ?? years[0])?.year;
  const selectedYear = scrubYear ?? fallbackYear;
  const index = years.findIndex((y) => y.year === selectedYear);
  const snapshot = index >= 0 ? years[index] : years[0];
  const previous = index > 0 ? years[index - 1] : undefined;
  const stats = snapshot ? cashFlowStats(snapshot, previous) : undefined;

  const stepYear = (delta: number) => {
    const next = years[index + delta];
    if (next) setScrubYear(next.year);
  };

  return (
    <Page>
      <PageHeader
        title="Cash Flow"
        meta={planMetaLine(stored, result.endYear)}
        actions={
          <div className="ns-year-stepper">
            <button
              type="button"
              className="ns-btn ns-btn-square"
              aria-label="Previous year"
              disabled={index <= 0}
              onClick={() => stepYear(-1)}
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            </button>
            <span className="ns-year-stepper-label ns-num">{snapshot?.year ?? '—'}</span>
            <button
              type="button"
              className="ns-btn ns-btn-square"
              aria-label="Next year"
              disabled={index < 0 || index >= years.length - 1}
              onClick={() => stepYear(1)}
            >
              <ChevronRight size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
        }
      />

      {stats && (
        <StatStrip>
          <Stat size="xl" label="Income" value={money(stats.income)} delta={moneyDelta(stats.deltaIncome)} />
          <Stat label="Spending" value={money(stats.spending)} delta={moneyDelta(stats.deltaSpending)} />
          <Stat label="Taxes" value={money(stats.taxes)} delta={moneyDelta(stats.deltaTaxes)} />
          <Stat
            label="Saved"
            value={signedMoney(stats.saved)}
            sub={stats.savingsRate !== undefined ? `${percent(stats.savingsRate, 0)} savings rate` : undefined}
            delta={moneyDelta(stats.deltaSaved)}
          />
        </StatStrip>
      )}

      <SectionCard title={snapshot ? `Where ${snapshot.year}'s money went` : 'Where the money went'} flush divider={false}>
        {snapshot ? (
          <div className="ns-sankey-wrap">
            <CashFlowSankey snapshot={snapshot} />
          </div>
        ) : (
          <EmptyState icon={PiggyBank} title="Nothing to show" body="This plan has no projected years yet." />
        )}
      </SectionCard>

      <SectionCard title="Annual cash flow" flush actions={<LedgerToolbar showPager />}>
        <LedgerCompareDiff />
        <CashFlowTab
          window={windowYears}
          events={plan.events}
          highlightYear={scrubYear}
          onEdit={(event) => editor.edit(event)}
          onEditAssumptions={() => setAssumptionsDraft(structuredClone(stored))}
        />
      </SectionCard>
    </Page>
  );
}
