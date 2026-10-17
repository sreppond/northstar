/**
 * The Home page's price curve (docs/REDESIGN-V5.md §5.5): for ONE purchase
 * year, the whole plan run at a ladder of prices. x is the price, y is the
 * housing cost as a share of take-home, so "how much" reads straight off the
 * zone bands (25% and 35%, DEFAULT_ZONES).
 *
 * Each point is `readCandidate`, i.e. the real plan with that purchase in it,
 * carried through the engine's ten-year window, the same math the map and the
 * old ladder table used. Prices are NOMINAL, purchase-year dollars; the page
 * converts to what the user reads.
 */
import { readCandidate, type HomeReading, type Plan } from '@northstar/engine';
import { zoneOf, type HomeTerms, type Zone } from './homeView';

export interface PricePoint {
  /** Nominal, purchase-year dollars. */
  price: number;
  reading: HomeReading;
  zone: Zone;
}

/** Most points on the curve: each is a full plan run, so this is the cost knob. */
const MAX_POINTS = 36;
const STEPS = [25_000, 50_000, 100_000, 250_000];

/**
 * An even ladder from `min` up past `max`, on a round step so every tick is a
 * price people say aloud. Always includes nothing outside `[min, ceil(max)]`.
 */
export function priceGrid(min: number, max: number): number[] {
  const span = Math.max(1, max - min);
  const step = STEPS.find((s) => span / s <= MAX_POINTS) ?? STEPS[STEPS.length - 1];
  const start = Math.max(step, Math.ceil(min / step) * step);
  const out: number[] = [];
  for (let p = start; p <= Math.ceil(max / step) * step; p += step) out.push(p);
  return out;
}

export function pricePoints(plan: Plan, t: HomeTerms, prices: number[]): PricePoint[] {
  return prices.flatMap((price) => {
    const reading = readCandidate(plan, t.year, price, t.terms);
    return reading ? [{ price, reading, zone: zoneOf(reading) }] : [];
  });
}
