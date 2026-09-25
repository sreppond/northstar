import { Home } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { HouseForecastView } from '../views/HouseForecastView';
import { planMetaLine } from '../format';
import { EmptyState, Page, PageHeader } from '../ui';

export function HousePage() {
  const { plan, result, stored, editor } = usePlanner();
  const hasHome = plan.events.some((e) => e.kind === 'buyAHome' && e.isIncluded);

  return (
    <Page>
      <PageHeader title="House" meta={planMetaLine(stored, result.endYear)} />

      {hasHome ? (
        <HouseForecastView plan={plan} result={result} />
      ) : (
        <div className="ns-card">
          <EmptyState
            icon={Home}
            title="No home purchase in this plan"
            body="Add a Buy a home event to see the down-payment goal, the ownership arc, and what buying costs the rest of the plan."
            action={
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                onClick={() => {
                  editor.startNew();
                  editor.pickKind('buyAHome', stored);
                }}
              >
                Add a home purchase
              </button>
            }
          />
        </div>
      )}
    </Page>
  );
}
