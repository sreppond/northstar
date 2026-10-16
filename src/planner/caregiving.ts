/**
 * "Can Sarah take time off to be home with the kids?" (docs/REDESIGN-V4.md
 * §4.3) as one pure transformation: a stretch of reduced (or no) pay on the
 * person's job, followed by part- or full-time, with the kids' childcare
 * paused for the stretch when a parent is covering it. The Family page runs
 * this as a preview against the real plan, so the answer is the whole
 * forecast's answer, not an estimate beside it.
 */
import type { Anchor, Plan, PlanEvent, WorkPhase } from '@northstar/engine';
import { resolveAnchor } from '@northstar/engine';

export interface CareGap {
  participantId: string;
  fromYear: number;
  years: number;
  /** Share of full pay during the stretch, 0–100. */
  payPercent: number;
  /** Share of full pay afterwards, 0–100; 100 is back to full-time. */
  thenPercent: number;
  /** Pause the children's childcare lines while a parent is home. */
  pausesChildcare: boolean;
}

/** The jobs this person holds in `year` — the ones a care gap scales. */
export function jobsHeldIn(plan: Plan, participantId: string, year: number): PlanEvent[] {
  return plan.events.filter((e) => {
    if (!e.isIncluded || (e.kind !== 'job' && e.kind !== 'newJob')) return false;
    const c = e.config as { participantId?: string; endYear?: number };
    return c.participantId === participantId && e.startYear <= year && (c.endYear ?? Infinity) >= year;
  });
}

export function applyCareGap(plan: Plan, gap: CareGap): Plan {
  const until = gap.fromYear + Math.max(1, gap.years);
  const jobIds = new Set(jobsHeldIn(plan, gap.participantId, gap.fromYear).map((e) => e.id));
  const scope = { events: plan.events, participants: plan.participants };

  const events = plan.events.map((e) => {
    if (!jobIds.has(e.id)) return e;
    const config = e.config as { phases?: WorkPhase[] };
    // Phases inside the stretch are replaced by it; earlier and later ones stand.
    const kept = (config.phases ?? []).filter((p) => {
      const y = resolveAnchor(p.from as Anchor, scope);
      return y === undefined || y < gap.fromYear || y > until;
    });
    const after: WorkPhase =
      gap.thenPercent >= 100
        ? { from: { kind: 'year', year: until }, mode: 'full' }
        : gap.thenPercent <= 0
          ? { from: { kind: 'year', year: until }, mode: 'off' }
          : { from: { kind: 'year', year: until }, mode: 'part', percent: gap.thenPercent };
    const phases: WorkPhase[] = [
      ...kept,
      { from: { kind: 'year', year: gap.fromYear }, mode: 'leave', percent: gap.payPercent },
      after,
    ];
    // `newJob` has no phases; `job` is its superset, so it simply becomes one.
    return { ...e, kind: 'job' as const, config: { rsuVesting: [], compSteps: [], ...config, phases } };
  });

  const budget = gap.pausesChildcare
    ? (plan.budget ?? []).map((l) => {
        const child = plan.participants.find((p) => p.id === l.owner && p.role === 'child');
        if (!child || l.category !== 'childcare') return l;
        return {
          ...l,
          pauses: [...(l.pauses ?? []), { from: { kind: 'year' as const, year: gap.fromYear }, until: { kind: 'year' as const, year: until } }],
        };
      })
    : plan.budget;

  return { ...plan, events, ...(budget ? { budget } : {}) };
}

export interface CareerSegment {
  from: number;
  /** Exclusive. */
  to: number;
  label: string;
  /** Share of full pay, 0–1. */
  share: number;
  eventId: string;
}

/**
 * One adult's working life as spans (docs/REDESIGN-V4.md §4.3, "Careers"):
 * each job until the next one replaces it, cut at retirement, split by its
 * work phases. What the Family page's career track draws.
 */
export function careerSegments(plan: Plan, participantId: string, startYear: number, endYear: number): CareerSegment[] {
  const scope = { events: plan.events, participants: plan.participants };
  const jobs = plan.events
    .filter((e) => e.isIncluded && (e.kind === 'job' || e.kind === 'newJob') && (e.config as { participantId?: string }).participantId === participantId)
    .sort((a, b) => a.startYear - b.startYear);
  const retirement = plan.events.find(
    (e) => e.isIncluded && e.kind === 'retirement' && (e.config as { participantId?: string }).participantId === participantId,
  );
  const stop = Math.min(endYear + 1, retirement?.startYear ?? Infinity);

  const out: CareerSegment[] = [];
  jobs.forEach((job, i) => {
    const c = job.config as { endYear?: number; phases?: WorkPhase[]; replacesEarnedIncome?: boolean };
    const next = jobs[i + 1];
    const replacedAt = next && (next.config as { replacesEarnedIncome?: boolean }).replacesEarnedIncome !== false ? next.startYear : Infinity;
    const from = Math.max(startYear, job.startYear);
    const to = Math.min(stop, (c.endYear ?? Infinity) + 1, replacedAt);
    if (to <= from) return;

    const breaks = (c.phases ?? [])
      .map((p) => ({ year: resolveAnchor(p.from as Anchor, scope), phase: p }))
      .filter((b): b is { year: number; phase: WorkPhase } => b.year !== undefined)
      .sort((a, b) => a.year - b.year);

    let cursor = from;
    let share = 1;
    let label = job.name;
    for (const b of breaks) {
      if (b.year <= cursor) {
        ({ share, label } = phaseLabel(job.name, b.phase));
        continue;
      }
      if (b.year >= to) break;
      out.push({ from: cursor, to: b.year, label, share, eventId: job.id });
      cursor = b.year;
      ({ share, label } = phaseLabel(job.name, b.phase));
    }
    out.push({ from: cursor, to, label, share, eventId: job.id });
  });
  return out.filter((s) => s.to > s.from);
}

function phaseLabel(jobName: string, phase: WorkPhase): { share: number; label: string } {
  switch (phase.mode) {
    case 'full':
      return { share: 1, label: jobName };
    case 'part':
      return { share: (phase.percent ?? 60) / 100, label: `Part-time ${phase.percent ?? 60}%` };
    case 'leave':
      return { share: (phase.percent ?? 0) / 100, label: (phase.percent ?? 0) > 0 ? `Leave · ${phase.percent}% pay` : 'Home with the kids' };
    case 'off':
      return { share: 0, label: 'Not working' };
  }
}
