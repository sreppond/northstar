/**
 * Small adapters the three Decisions pages share when they hand data to the
 * chart kit (docs/REDESIGN-V5.md §5.5): the adult-ages line under a readout
 * and the shortfall band. Kept apart from the pages so Home, Retirement and
 * Annuity & SEPP can't drift on what "short" means.
 */
import type { Plan, PlanResult } from '@northstar/engine';
import type { DangerBand } from './charts';
import { useBreakpoint } from './useBreakpoint';
import type { PlanHealth } from './health';

/** "Spencer 40 · Sarah 40" for a year, from the engine's own per-year ages. */
export function agesLineFor(plan: Pick<Plan, 'participants'>, result: PlanResult): (year: number) => string | undefined {
  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const byYear = new Map(result.years.map((y) => [y.year, y.ages]));
  return (year) => {
    const ages = byYear.get(year);
    if (!ages) return undefined;
    const parts = adults.filter((p) => ages[p.id] !== undefined).map((p) => `${p.name} ${ages[p.id]}`);
    return parts.length ? parts.join(' · ') : undefined;
  };
}

/** The hatched shortfall band for a chart, or none when the plan pays its bills (§4.2.4). */
export function dangerBandFor(health: PlanHealth, result: PlanResult): DangerBand | undefined {
  if (health.status !== 'short' || health.firstShortYear === undefined) return undefined;
  const byYear = new Map(result.years.map((y) => [y.year, y.unfundedShortfall]));
  return { from: health.firstShortYear, shortFor: (year) => byYear.get(year) };
}

/** A hero chart is 420px on a desktop and 280px on a phone (docs/REDESIGN-V5.md §1.1). */
export function useHeroHeight(): number {
  return useBreakpoint() === 'phone' ? 280 : 420;
}
