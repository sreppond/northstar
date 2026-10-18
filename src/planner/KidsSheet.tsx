import { useMemo, useState } from 'react';
import type { BudgetLine, Plan, PlanResult } from '@northstar/engine';
import { TimeSeriesChart, type ChartBand, type ChartSeries } from './charts';
import { money } from './format';
import { Segmented, Sheet } from './ui';
import { budgetView, lineTiming, ownerColor } from './budgetView';
import './pages/budget.css';

/**
 * The Kids envelope, opened (docs/REDESIGN-V5.md §5.3): what each child costs
 * as they grow, with the life stages behind it, and the stage lines that make
 * the number. It is where Family's "what the kids cost" chart went, rebuilt
 * on the chart kit: one stacked area per child, scrubbable.
 *
 * Kids is a computed envelope and is not edited as a single figure. To change
 * it, change a stage line below (each opens the budget-line sheet).
 *
 * The chart logic is copied from FamilyPage's `KidChart` rather than
 * imported, because that page is being folded into Timeline in parallel.
 */

/** The stages kids.ts's template is built from (childcare ages 0-4, school 5-17, college 18-21). */
const STAGES = [
  { from: 0, to: 5, label: 'Daycare' },
  { from: 5, to: 18, label: 'School' },
  { from: 18, to: 22, label: 'College' },
];
/** The by-age chart runs to the template's last college year. */
const MAX_AGE = 21;

type View = 'year' | 'age';

export function KidsSheet({
  open,
  onClose,
  plan,
  result,
  shownYear,
  onFocusYear,
  onOpenLine,
}: {
  open: boolean;
  onClose(): void;
  plan: Plan;
  /** The plan's result in the dollars the page shows. */
  result: PlanResult;
  /** The year the page is on; the chart opens there rather than at its last, near-empty year. */
  shownYear: number;
  onFocusYear(year: number | null): void;
  onOpenLine(line: BudgetLine): void;
}) {
  const kids = useMemo(() => plan.participants.filter((p) => p.isIncluded && p.role === 'child'), [plan.participants]);
  const [view, setView] = useState<View>('year');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [agePin, setAgePin] = useState<number | null>(null);
  const picked = kids.find((k) => k.id === pickedId) ?? kids[0];

  // Each child's monthly cost, every year (docs/REDESIGN-V4.md §4.3).
  const perKid = useMemo(
    () => kids.map((k) => result.years.map((y) => budgetView(plan, y).sections.find((s) => s.owner === k.id)?.monthly ?? 0)),
    [kids, plan, result],
  );
  const allYears = useMemo(() => result.years.map((y) => y.year), [result]);

  const chart = useMemo(() => {
    if (kids.length === 0) return null;
    if (view === 'age') {
      const ages = Array.from({ length: MAX_AGE + 1 }, (_, a) => a);
      const series: ChartSeries[] = kids.map((k, ki) => ({
        id: k.id,
        label: k.name,
        color: ownerColor(plan, k.id),
        kind: 'area',
        values: ages.map((a) => {
          const idx = allYears.indexOf(k.birthYear + a);
          return idx >= 0 ? perKid[ki][idx] : 0;
        }),
      }));
      return { xs: ages, series, offset: 0 };
    }
    // Through the last year any child costs anything, plus a little air.
    const lastIndex = Math.min(
      allYears.length - 1,
      Math.max(0, ...perKid.map((k) => k.reduce((last, v, i) => (v > 0.5 ? i : last), 0))) + 2,
    );
    const series: ChartSeries[] = kids.map((k, ki) => ({
      id: k.id,
      label: k.name,
      color: ownerColor(plan, k.id),
      kind: 'area',
      values: perKid[ki].slice(0, lastIndex + 1),
    }));
    return { xs: allYears.slice(0, lastIndex + 1), series, offset: picked?.birthYear ?? 0 };
  }, [kids, view, perKid, allYears, plan, picked]);

  const pickedLines = useMemo(
    () => (picked ? (plan.budget ?? []).filter((l) => l.owner === picked.id && l.isIncluded) : []),
    [plan.budget, picked],
  );
  const early = pickedLines.some((l) => l.category === 'childcare' && l.from?.kind === 'age' && l.from.age === 0) ? 'Daycare' : 'Early years';
  // Half a slot either side of an age, so a stage's edge falls between two points, not on one.
  const bands: ChartBand[] = chart
    ? STAGES.map((s, i) => ({ from: chart.offset + s.from - 0.5, to: chart.offset + s.to - 0.5, label: i === 0 ? early : s.label }))
    : [];

  const startAge = (l: BudgetLine) => (l.from?.kind === 'age' ? l.from.age : 0);
  const sortedLines = [...pickedLines].sort((a, b) => startAge(a) - startAge(b) || b.amount - a.amount);
  const byAge = view === 'age';
  // By age, open on this child's age in the page's year, else where the cost peaks.
  const ageNow = picked ? shownYear - picked.birthYear : -1;
  const peakAge = useMemo(() => {
    if (!chart || !byAge) return 0;
    const totals = chart.xs.map((_, i) => chart.series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
    return chart.xs[totals.indexOf(Math.max(...totals))] ?? 0;
  }, [chart, byAge]);
  const defaultAge = ageNow >= 0 && ageNow <= MAX_AGE ? ageNow : peakAge;

  return (
    <Sheet open={open} onClose={onClose} title="What the kids cost">
      <div className="ns-bgt-kids">
        {!picked || !chart ? (
          <p className="ns-bgt-muted">No kids in the plan yet.</p>
        ) : (
          <>
            <div className="ns-bgt-kids-bar">
              <Segmented
                size="sm"
                ariaLabel="Chart by"
                value={view}
                onChange={(v) => setView(v as View)}
                options={[
                  { value: 'year', label: 'By year' },
                  { value: 'age', label: 'By age' },
                ]}
              />
              {kids.length > 1 && (
                <Segmented
                  size="sm"
                  ariaLabel="Child"
                  value={picked.id}
                  onChange={setPickedId}
                  options={kids.map((k) => ({ value: k.id, label: k.name }))}
                />
              )}
            </div>

            <TimeSeriesChart
              years={chart.xs}
              series={chart.series}
              stacked
              height={260}
              bands={bands}
              focusYear={byAge ? (agePin ?? defaultAge) : shownYear}
              onFocusYear={byAge ? setAgePin : onFocusYear}
              formatX={byAge ? (a) => `Age ${a}` : String}
              drawKey={view}
              readout={{
                label: byAge ? 'Cost per month at this age' : 'Cost per month',
                size: 'compact',
                format: money,
                agesFor: byAge
                  ? undefined
                  : (y) => kids.filter((k) => y >= k.birthYear).map((k) => `${k.name} ${y - k.birthYear}`).join(' · ') || undefined,
              }}
              ariaLabel={byAge ? 'Monthly cost of each child by age' : 'Monthly cost of each child by year'}
            />

            <section className="ns-bgt-kids-lines" aria-label={`${picked.name}'s stage lines`}>
              <h3 className="ns-bgt-subtitle">{picked.name}'s lines</h3>
              <ul>
                {sortedLines.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="ns-bt-row" onClick={() => onOpenLine(l)}>
                      <span className="ns-bt-name">
                        {l.name.replace(new RegExp(`^${escapeRe(picked.name)}\\s*[—-]\\s*`), '')}
                        <span className="ns-bt-timing">{lineTiming(l, plan)}</span>
                      </span>
                      <span className={`ns-bt-tag${l.essential ? '' : ' ns-bt-tag-flex'}`}>
                        {l.kind === 'saving' ? 'Saving' : l.essential ? 'Fixed' : 'Flexible'}
                      </span>
                      <span className="ns-bt-amt ns-num">
                        {money(l.amount)}
                        {l.cadence === 'once' ? '' : '/mo'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="ns-bgt-muted">Rounded national estimates in today's dollars.</p>
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
