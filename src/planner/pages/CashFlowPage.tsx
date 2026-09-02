import { usePlanner } from '../PlannerContext';
import { LedgerToolbar } from '../LedgerToolbar';
import { CashFlowTab } from '../tabs/CashFlowTab';
import { CashFlowSankey } from '../CashFlowSankey';

export function CashFlowPage() {
  const { windowYears, plan, scrubYear, editor, setAssumptionsDraft, stored } = usePlanner();
  const sankeyYear = windowYears.find((y) => y.year === scrubYear) ?? windowYears[0];

  return (
    <section className="ns-card">
      <LedgerToolbar showPager />

      {sankeyYear && (
        <div className="ns-sankey-wrap">
          <p className="ns-view-sub">
            Where {sankeyYear.year}'s money came from and where it went.
            {scrubYear === undefined || scrubYear === null ? ' Scrub the Overview chart to see another year.' : ''}
          </p>
          <CashFlowSankey snapshot={sankeyYear} />
        </div>
      )}

      <CashFlowTab
        window={windowYears}
        events={plan.events}
        highlightYear={scrubYear}
        onEdit={(event) => editor.edit(event)}
        onEditAssumptions={() => setAssumptionsDraft(structuredClone(stored))}
      />
    </section>
  );
}
