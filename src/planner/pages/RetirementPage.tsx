import { usePlanner } from '../PlannerContext';
import { RetirementForecastView } from '../views/RetirementForecastView';
import { Page, PageHeader } from '../ui';
import { PlanCheckBanner } from '../PlanCheckBanner';

export function RetirementPage() {
  const { plan, result, onSetRetirementYear } = usePlanner();
  return (
    <Page>
      <PageHeader title="Retirement" />
      <PlanCheckBanner only={['horizon', 'unearned-wages', 'high-growth']} />
      <RetirementForecastView plan={plan} result={result} onSetRetirementYear={onSetRetirementYear} />
    </Page>
  );
}
