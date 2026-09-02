import { usePlanner } from '../PlannerContext';
import { RetirementForecastView } from '../views/RetirementForecastView';

export function RetirementPage() {
  const { plan, result, onSetRetirementYear } = usePlanner();
  return <RetirementForecastView plan={plan} result={result} onSetRetirementYear={onSetRetirementYear} />;
}
