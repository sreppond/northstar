import { usePlanner } from '../PlannerContext';
import { HouseForecastView } from '../views/HouseForecastView';

export function HousePage() {
  const { plan, result } = usePlanner();
  return <HouseForecastView plan={plan} result={result} />;
}
