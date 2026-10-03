import { useMemo } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { LedgerToolbar, LedgerCompareDiff } from '../LedgerToolbar';
import { EventsTab } from '../tabs/EventsTab';
import { planMetaLine } from '../format';
import { eventStats } from '../ledger';
import { rankImpact } from '../NetWorthChart';
import { Page, PageHeader, StatStrip, Stat, SectionCard, EmptyState } from '../ui';
import './ledger.css';

export function EventsPage() {
  const { plan, result, stored, selected, setSelected, editor, upsertEvent } = usePlanner();

  const stats = eventStats(plan.events, result.startYear);
  // Same counterfactual ranking Overview's "next up" already reads
  // (docs/REVIEW.md S13) — each event re-run with itself switched off, diffed
  // against the real horizon figure (docs/ROADMAP-10.md C7).
  const impactByEventId = useMemo(() => rankImpact(plan, result), [plan, result]);
  const hasEvents = plan.events.some((e) => e.kind !== 'endOfPlan' && !e.isHidden);

  const addEventButton = (
    <button type="button" className="ns-btn ns-btn-primary" onClick={() => editor.startNew()}>
      <Plus size={14} strokeWidth={2.25} aria-hidden /> Add event
    </button>
  );

  return (
    <Page>
      <PageHeader title="Events" meta={planMetaLine(stored, result.endYear)} actions={addEventButton} />

      <StatStrip>
        <Stat
          size="xl"
          label="Events"
          value={String(stats.total)}
          explain="Every included, non-hidden event in the plan (End of plan excluded — it's always there, not really an 'event')."
        />
        <Stat
          label="Income events"
          value={String(stats.income)}
          explain="Events tagged as adding cash flow — a job, Social Security, a windfall."
        />
        <Stat
          label="Cost events"
          value={String(stats.cost)}
          explain="Events tagged as costing money — an expense, a home purchase, having a kid, retirement (it stops income and changes spending, so it's filed here)."
        />
        <Stat
          label="Next up"
          value={stats.next?.name ?? '—'}
          sub={
            stats.next
              ? stats.next.yearsAway <= 0
                ? 'this year'
                : `in ${stats.next.yearsAway} yr${stats.next.yearsAway === 1 ? '' : 's'}`
              : undefined
          }
          explain={`The soonest event that hasn't started yet, as of ${result.startYear} — falls back to one starting this year if nothing is still ahead.`}
        />
      </StatStrip>

      <SectionCard title="Life timeline" flush actions={<LedgerToolbar showPager={false} />}>
        <LedgerCompareDiff />
        {hasEvents ? (
          <EventsTab
            events={plan.events}
            result={result}
            selected={selected}
            onSelect={setSelected}
            onEdit={(event) => editor.edit(event)}
            onDragCommit={(eventId, year) => {
              const event = stored.events.find((e) => e.id === eventId);
              if (event) upsertEvent(stored.id, { ...event, startYear: year });
            }}
            impactByEventId={impactByEventId}
            plan={plan}
          />
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No events yet"
            body="Add a life event — a new job, a home, a kid — to see it on the timeline."
            action={addEventButton}
          />
        )}
      </SectionCard>
    </Page>
  );
}
