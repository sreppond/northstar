import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { toast } from './Toast';
import { useDismissals } from '../useDismissals';

export type AlertTone = 'danger' | 'warning' | 'info';

export interface AlertAction {
  label: string;
  onClick(): void;
}

/** Collapse length (docs/REDESIGN-V5.md §4.3). Kept in step with
    `.ns-alert-collapse` in ui.css. */
const COLLAPSE_MS = 200;

/**
 * A dismissible inline alert (docs/REDESIGN-V5.md §4.3, R2).
 *
 * The tone is never carried by colour alone (feedback has four kinds,
 * §1.8): danger gets a ✗ in a circle, warning a triangle, info an "i" — three
 * different shapes. `danger` is the "runs dry" error and is deliberately
 * loud; warnings (plan checks) are the quiet, dismissible kind.
 *
 * Dismissing collapses height and opacity over 200ms, THEN calls
 * `onDismiss` (so the parent unmounts a row that has already left, not one
 * that is still on screen) and raises a "Hidden · Undo" toast. Omit
 * `onDismiss` for an alert that must stay (no × is drawn). Undo calls
 * `onUndo`; both are the caller's, because the alert is unmounted by then and
 * the caller owns what "hidden" means — usually `useDismissals`, which is
 * what `DismissibleAlert` below wires up.
 */
export function Alert({
  tone,
  children,
  action,
  onDismiss,
  onUndo,
}: {
  tone: AlertTone;
  children: ReactNode;
  action?: AlertAction;
  onDismiss?(): void;
  onUndo?(): void;
}) {
  const [collapsing, setCollapsing] = useState(false);
  const done = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onDismiss, onUndo });
  callbacks.current = { onDismiss, onUndo };

  // The collapse completes on `transitionend`; the timer is the fallback for
  // when no transition runs (reduced motion collapses it to 1ms, a hidden
  // tab throttles it). `done` makes the two idempotent.
  const finish = () => {
    if (done.current) return;
    done.current = true;
    callbacks.current.onDismiss?.();
    toast('Hidden', {
      action: callbacks.current.onUndo
        ? { label: 'Undo', onClick: () => callbacks.current.onUndo?.() }
        : undefined,
    });
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const dismiss = () => {
    if (collapsing) return;
    setCollapsing(true);
    timer.current = setTimeout(finish, COLLAPSE_MS + 80);
  };

  const Icon = tone === 'danger' ? CircleX : tone === 'warning' ? TriangleAlert : Info;

  return (
    <div
      className={`ns-alert-collapse${collapsing ? ' ns-alert-collapsing' : ''}`}
      onTransitionEnd={(e) => {
        if (collapsing && e.target === e.currentTarget && e.propertyName === 'grid-template-rows') finish();
      }}
    >
      <div className="ns-alert-clip">
        {/* `role=alert` for danger so a screen reader announces it when it
            appears; the rest are polite status text. */}
        <div className={`ns-alert ns-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
          <Icon size={16} strokeWidth={2} aria-hidden className="ns-alert-icon" />
          <div className="ns-alert-text">{children}</div>
          {action && (
            <button type="button" className="ns-btn ns-alert-action" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="ns-alert-dismiss"
              aria-label="Hide this alert"
              onClick={dismiss}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `Alert` wired to `useDismissals` (§4.3): hidden per `id` + `signature`, so
 * it returns when the signature changes, and "Undo" restores it. Renders
 * nothing while hidden. This is the form the shell's banners take.
 */
export function DismissibleAlert({
  planId,
  id,
  signature,
  ...alert
}: {
  planId: string;
  /** Stable alert kind, no ':' (e.g. `plan-check:no-income`). */
  id: string;
  /** What makes this instance of the problem this one (a message, a year). */
  signature: string;
  tone: AlertTone;
  children: ReactNode;
  action?: AlertAction;
}) {
  const dismissals = useDismissals(planId);
  if (dismissals.isDismissed(id, signature)) return null;
  return (
    <Alert
      {...alert}
      onDismiss={() => dismissals.dismiss(id, signature)}
      onUndo={() => dismissals.restore(id)}
    />
  );
}
