import { usePlanner } from '../PlannerContext';
import { RetirementForecastView } from '../views/RetirementForecastView';
import { planMetaLine } from '../format';
import { Page, PageHeader } from '../ui';

export function RetirementPage() {
  const { plan, result, stored, onSetRetirementYear } = usePlanner();
  return (
    <Page>
      <PageHeader title="Retirement" meta={planMetaLine(stored, result.endYear)} />
      <RetirementForecastView plan={plan} result={result} onSetRetirementYear={onSetRetirementYear} />
    </Page>
  );
}
