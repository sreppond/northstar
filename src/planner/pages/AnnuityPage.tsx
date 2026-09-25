import { Umbrella } from 'lucide-react';
import { newAccountOfType } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { AnnuityForecastView, isAnnuityContract } from '../views/AnnuityForecastView';
import { planMetaLine } from '../format';
import { EmptyState, Page, PageHeader } from '../ui';

export function AnnuityPage() {
  const { plan, result, stored, setAccountDraft } = usePlanner();
  const hasAnnuity = plan.accounts.some((a) => !a.isSynthetic && isAnnuityContract(a));

  return (
    <Page>
      <PageHeader title="Annuity" meta={planMetaLine(stored, result.endYear)} />

      {hasAnnuity ? (
        <AnnuityForecastView plan={plan} result={result} />
      ) : (
        <div className="ns-card">
          <EmptyState
            icon={Umbrella}
            title="No annuity in this plan"
            body="This page shows how much of a contract's balance is basis versus gain, what carrier and advisory fees are costing it, and what leaving early would cost in surrender charges."
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
