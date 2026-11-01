import { useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { useDismissals } from '../useDismissals';
import { Page } from '../ui/Page';
import { PageHeader } from '../ui/PageHeader';
import { Sheet } from '../ui/Sheet';
import { DismissibleAlert } from '../ui/Alert';

/**
 * Hidden QA route for the v5 foundations (docs/REDESIGN-V5.md §8 unit A3),
 * mounted at /dev/ui only under `import.meta.env.DEV`. Shows Sheet (and a
 * stacked sheet), every Alert tone with dismiss + undo, the restore count,
 * and a type specimen for the system-font switch.
 */
export function DevUiPage() {
  const { planId } = usePlanner();
  const dismissals = useDismissals(planId);
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(false);
  const [signature, setSignature] = useState(1);

  return (
    <Page>
      <PageHeader
        title="UI foundations"
        meta="Sheet · Alert · useDismissals · system type"
        actions={
          <button type="button" className="ns-btn ns-btn-primary" onClick={() => setOpen(true)}>
            Open sheet
          </button>
        }
      />

      <section style={{ display: 'grid', gap: 8 }} aria-label="Alerts">
        <DismissibleAlert
          planId={planId}
          id="dev-danger"
          signature={`s${signature}`}
          tone="danger"
          action={{ label: 'See 2071', onClick: () => undefined }}
        >
          Overdrawn from 2071 to 2091 — up to $1.37M.
        </DismissibleAlert>
        <DismissibleAlert
          planId={planId}
          id="dev-warning"
          signature={`s${signature}`}
          tone="warning"
          action={{ label: 'Review', onClick: () => undefined }}
        >
          Sarah’s income stops in 2040, but her retirement age is 2046.
        </DismissibleAlert>
        <DismissibleAlert planId={planId} id="dev-info" signature={`s${signature}`} tone="info">
          Balances are from your Monarch snapshot on Sep 2.
        </DismissibleAlert>
      </section>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="ns-btn"
          disabled={dismissals.hiddenCount === 0}
          onClick={() => dismissals.restore()}
        >
          Show hidden alerts ({dismissals.hiddenCount})
        </button>
        <button type="button" className="ns-btn" onClick={() => setSignature((s) => s + 1)}>
          Change signature (alerts return)
        </button>
        <span className="ns-num" style={{ color: 'var(--muted)', fontSize: 'var(--fs-meta)' }}>
          signature s{signature}
        </span>
      </div>

      <section aria-label="Type specimen" style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: 'var(--track-display)', lineHeight: 'var(--lh-display)' }}>
          $2,214,908
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 'var(--track-display)', lineHeight: 'var(--lh-display)' }}>
          Net worth in 2071 · $1,370,442
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-body)' }}>
          Body text sits near zero tracking: Sarah retires in 2046, Alex in 2049. Columns:
        </p>
        <div className="ns-num" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 110px)', textAlign: 'right' }}>
          <span>1,111,111</span>
          <span>8,888,888</span>
          <span>$11,008</span>
          <span>1,000,000</span>
          <span>0,000,000</span>
          <span>$88,118</span>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--muted)' }}>
          Code stays mono: <code style={{ fontFamily: 'var(--font-code)' }}>planHealth(result)</code>
        </p>
      </section>

      <Sheet open={open} onClose={() => setOpen(false)} title="Taxable investments">
        <SheetDemoBody label="Parent sheet" action={() => setChild(true)} actionLabel="Open stacked sheet" />
        <Sheet open={child} onClose={() => setChild(false)} title="Stacked: Vanguard brokerage">
          <SheetDemoBody label="Child sheet" />
        </Sheet>
      </Sheet>
    </Page>
  );
}

function SheetDemoBody({
  label,
  action,
  actionLabel,
}: {
  label: string;
  action?(): void;
  actionLabel?: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--fs-body)' }}>
        {label}. Drag the header (or swipe anywhere with touch), fling it, press Esc, click the scrim.
      </p>
      <label style={{ display: 'grid', gap: 4, fontSize: 'var(--fs-meta)' }}>
        Growth rate
        <input defaultValue="6.5" style={{ height: 34, padding: '0 10px', font: 'inherit' }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        {action && (
          <button type="button" className="ns-btn ns-btn-primary" onClick={action}>
            {actionLabel}
          </button>
        )}
        <button type="button" className="ns-btn">
          Another control
        </button>
      </div>
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={i}
          className="ns-num"
          style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--rule)' }}
        >
          <span>{2026 + i}</span>
          <span>{(1_234_567 + i * 98_765).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
