import { CalendarClock, Plus } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { LedgerToolbar, LedgerCompareDiff } from '../LedgerToolbar';
import { EventsTab } from '../tabs/EventsTab';
import { planMetaLine } from '../format';
import { eventStats } from '../ledger';
import { Page, PageHeader, StatStrip, Stat, SectionCard, EmptyState } from '../ui';
import './ledger.css';

export function EventsPage() {
  const { plan, result, stored, selected, setSelected, editor } = usePlanner();

  const stats = eventStats(plan.events, result.startYear);
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
        <Stat size="xl" label="Events" value={String(stats.total)} />
        <Stat label="Income events" value={String(stats.income)} />
        <Stat label="Cost events" value={String(stats.cost)} />
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
