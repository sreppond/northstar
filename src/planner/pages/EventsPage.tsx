import { usePlanner } from '../PlannerContext';
import { LedgerToolbar } from '../LedgerToolbar';
import { EventsTab } from '../tabs/EventsTab';

export function EventsPage() {
  const { plan, result, selected, setSelected, editor } = usePlanner();

  return (
    <section className="ns-card">
      <LedgerToolbar showPager={false} />
      <EventsTab
        events={plan.events}
        result={result}
        selected={selected}
        onSelect={setSelected}
        onEdit={(event) => editor.edit(event)}
        plan={plan}
      />
    </section>
  );
}
