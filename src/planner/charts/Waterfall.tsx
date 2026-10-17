import { useId } from 'react';
import './waterfall.css';

/**
 * A horizontal waterfall (docs/REDESIGN-V5.md §5.2): one row per step, each
 * bar floating between the running total before and after it. It is the only
 * waterfall in the app, a different shape from the time charts, so a year's
 * money reads as a walk from what came in to what is left.
 *
 * Plain DOM rather than SVG: the rows are labelled text with a bar beside
 * them, so the label column, wrapping and the phone layout come from CSS, and
 * each row is a real focusable list item (the chart is its own accessible
 * fallback). Hover is lifted to the caller (`hot`/`onHot`) so the page can
 * link a bar to the table row it summarises and the other way round.
 */

export interface WaterfallBar {
  key: string;
  label: string;
  /** `delta` floats between two running totals; `total` stands on zero. */
  kind: 'total' | 'delta';
  /** The bar spans these two values. */
  from: number;
  to: number;
  /** Signed amount printed beside the bar: negative takes money away. */
  amount: number;
  color: string;
  /** `danger` draws the hatched red bar: money the plan could not find. */
  tone?: 'danger';
  /** A total drawn in pieces (what was saved on purpose, and what was left). */
  segments?: { from: number; to: number; color: string }[];
  /** Quiet text after the amount. */
  note?: string;
}

export interface WaterfallProps {
  bars: WaterfallBar[];
  format(value: number): string;
  /** The bar (or table row) being pointed at; the rest recede. */
  hot?: string | null;
  onHot?(key: string | null): void;
  ariaLabel: string;
}

/** Real minus sign (U+2212), as the rest of the app prints one. */
const MINUS = '−';

function amountText(bar: WaterfallBar, format: (v: number) => string): string {
  if (bar.amount < -0.5) return `${MINUS}${format(-bar.amount)}`;
  return format(bar.amount);
}

function operator(bar: WaterfallBar, index: number): string {
  if (bar.tone === 'danger') return '✗';
  if (index === 0) return '';
  if (bar.kind === 'total') return '=';
  return bar.amount < 0 ? MINUS : '+';
}

export function Waterfall({ bars, format, hot = null, onHot, ariaLabel }: WaterfallProps) {
  const uid = useId();
  if (bars.length === 0) return null;

  let lo = 0;
  let hi = 0;
  for (const b of bars) {
    lo = Math.min(lo, b.from, b.to, ...(b.segments ?? []).flatMap((s) => [s.from, s.to]));
    hi = Math.max(hi, b.from, b.to, ...(b.segments ?? []).flatMap((s) => [s.from, s.to]));
  }
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const hasNegative = lo < -0.5;

  return (
    <ul className="ns-wfall" role="list" aria-label={ariaLabel} data-hot={hot ?? undefined}>
      {bars.map((bar, i) => {
        const right = pct(Math.max(bar.from, bar.to));
        const prev = bars[i - 1];
        const isHot = hot === bar.key;
        return (
          <li
            key={bar.key}
            id={`${uid}-${bar.key}`}
            className="ns-wfall-row"
            data-kind={bar.kind}
            data-tone={bar.tone}
            data-active={isHot || undefined}
            data-dim={(hot !== null && !isHot) || undefined}
            tabIndex={0}
            onPointerEnter={() => onHot?.(bar.key)}
            onPointerLeave={() => onHot?.(null)}
            onFocus={() => onHot?.(bar.key)}
            onBlur={() => onHot?.(null)}
          >
            <span className="ns-wfall-label">
              <span className="ns-wfall-op" aria-hidden="true">
                {operator(bar, i)}
              </span>
              {bar.label}
            </span>
            <span className="ns-wfall-plot">
              {hasNegative && <span className="ns-wfall-zero" style={{ left: `${pct(0)}%` }} aria-hidden="true" />}
              {prev && <span className="ns-wfall-conn" style={{ left: `${pct(prev.to)}%` }} aria-hidden="true" />}
              {(bar.segments ?? [{ from: bar.from, to: bar.to, color: bar.color }]).map((s, j) => (
                <span
                  key={j}
                  className="ns-wfall-bar"
                  style={{
                    left: `${pct(Math.min(s.from, s.to))}%`,
                    width: `${Math.max(0.4, Math.abs(pct(s.to) - pct(s.from)))}%`,
                    ['--bar' as string]: s.color,
                  }}
                  aria-hidden="true"
                />
              ))}
              <span className="ns-wfall-value" style={{ left: `calc(${right}% + 8px)` }}>
                <span className="ns-wfall-amount">{amountText(bar, format)}</span>
                {bar.note && <span className="ns-wfall-note"> · {bar.note}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
