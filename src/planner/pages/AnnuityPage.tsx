import { usePlanner } from '../PlannerContext';
import { AnnuityForecastView } from '../views/AnnuityForecastView';

export function AnnuityPage() {
  const { plan, result } = usePlanner();
  return <AnnuityForecastView plan={plan} result={result} />;
}
