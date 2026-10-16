import { usePlanner } from '../PlannerContext';
import { RetirementForecastView } from '../views/RetirementForecastView';
import { planMetaLine } from '../format';
import { Page, PageHeader } from '../ui';
import { PlanCheckBanner } from '../PlanCheckBanner';

export function RetirementPage() {
  const { plan, result, stored, onSetRetirementYear } = usePlanner();
  return (
    <Page>
      <PageHeader title="Retirement" meta={planMetaLine(stored, result.endYear)} />
      <PlanCheckBanner only={['horizon', 'unearned-wages', 'high-growth']} />
      <RetirementForecastView plan={plan} result={result} onSetRetirementYear={onSetRetirementYear} />
    </Page>
  );
}
