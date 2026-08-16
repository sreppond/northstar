/**
 * The hero reading: one sentence that says what the plan actually does.
 *
 * This exists because a number on its own answers the wrong question. "$4.28M"
 * is a fact about a projection; "15.6% a year, through a new role in 2028, a
 * home in 2031 and two kids" is a description of a life, and it is the thing
 * someone opened the app to check. No dashboard component can say it, which is
 * exactly why the four KPI tiles it replaced never earned their space.
 *
 * Presentation only — like `presentation.ts`, none of this belongs in the
 * engine. Copy is a UI decision.
 */
import type { PathMarkers, Plan, PlanResult } from '@northstar/engine';
import { detailMoney, percent } from './format';

/** Written out to about a dozen, because "2 kids" in prose reads as a form. */
const COUNTS = [
  'no',
  'a',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function count(n: number): string {
  return COUNTS[n] ?? String(n);
}

/**
 * Join with an Oxford-free "and", which is how someone would say it out loud:
 * "a new role in 2028, a home in 2031 and two kids".
 */
function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The milestones worth naming, in the order they happen.
 *
 * Only life events get a clause. Income, windfalls, expenses and the plan
 * horizon are all real inputs but they do not describe a life the way a house
 * or a kid does, and a sentence that lists everything describes nothing.
 * Repeats of the same kind collapse into a count, which is why two kids read
 * as "two kids" rather than as two separate clauses with two separate years.
 */
function milestones(plan: Plan): string[] {
  const live = plan.events
    .filter((e) => e.isIncluded && !e.isHidden)
    .slice()
    .sort((a, b) => a.startYear - b.startYear);

  const kids = live.filter((e) => e.kind === 'haveAKid');
  const clauses: { year: number; text: string }[] = [];

  for (const e of live) {
    switch (e.kind) {
      case 'buyAHome':
        clauses.push({ year: e.startYear, text: `a home in ${e.startYear}` });
        break;
      case 'retirement':
        clauses.push({ year: e.startYear, text: `retirement in ${e.startYear}` });
        break;
      case 'newJob':
        clauses.push({ year: e.startYear, text: `a new role in ${e.startYear}` });
        break;
      case 'careerBreak':
        clauses.push({ year: e.startYear, text: `a career break in ${e.startYear}` });
        break;
      case 'haveAKid':
        // One kid gets a year; several collapse to a count on the first one,
        // since "a kid in 2028 and a kid in 2030" is a list, not a sentence.
        if (e !== kids[0]) break;
        clauses.push({
          year: e.startYear,
          text: kids.length === 1 ? `a kid in ${e.startYear}` : `${count(kids.length)} kids`,
        });
        break;
      default:
        break;
    }
  }

  // Three is the limit a sentence carries before it becomes an inventory.
  return clauses
    .sort((a, b) => a.year - b.year)
    .slice(0, 3)
    .map((c) => c.text);
}

export interface HeroReading {
  /** The one figure, at display size. */
  figure: number;
  /** The plain-language sentence under it. */
  read: string;
  /** True when `read` is reporting a failure rather than describing a plan. */
  isAlarm: boolean;
}

export function heroReading(
  plan: Plan,
  result: PlanResult,
  markers: PathMarkers,
  growth: number | undefined,
): HeroReading {
  const last = result.years[result.years.length - 1];
  const figure = last?.netWorth ?? 0;

  // A plan that runs out of money is the only thing worth saying here. The
  // growth rate of a plan that fails is a statistic about a failure.
  const dry = markers.shortfallYears[0];
  if (dry !== undefined) {
    const years = markers.shortfallYears.length;
    return {
      figure,
      isAlarm: true,
      read:
        years === 1
          ? `Runs dry in ${dry}, with ${detailMoney(markers.shortfallTotal)} of spending unfunded.`
          : `Runs dry in ${dry}. ${years} years fall short, ${detailMoney(
              markers.shortfallTotal,
            )} unfunded in total.`,
    };
  }

  const rate = growth === undefined ? null : `${percent(growth)} a year`;
  const through = milestones(plan);

  let read: string;
  if (rate && through.length > 0) read = `${rate}, through ${sentenceList(through)}.`;
  else if (rate) read = `${rate}, with nothing else in the way.`;
  else if (through.length > 0) read = `Through ${sentenceList(through)}.`;
  else read = 'No milestones in this plan yet.';

  return { figure, read, isAlarm: false };
}
