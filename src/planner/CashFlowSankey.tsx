import type { YearSnapshot } from '@northstar/engine';
import { tableMoney } from './format';

/**
 * The cash-flow Sankey (docs/BORROW.md-style port of Northstar v2's
 * `Sankey.tsx`) — one year's income sources on the left, expense categories
 * on the right, both routed through a single "Cash flow" waist rather than
 * attempting a many-to-many trace: the engine's `LineItem`s carry a source
 * EVENT, not a source-to-use link, so there is no real per-dollar path from
 * "Amazon salary" to "Living expenses" to draw. A budget-style hub-and-spoke
 * layout is the honest version of this idea (the same shape the classic
 * federal-budget Sankey uses) — it is a proportion diagram, not a trace.
 *
 * Always balances: a year that spends more than it earns adds a "From
 * savings" inflow on the left rather than letting the two sides disagree,
 * and a year with money left over adds a "To savings" outflow on the right.
 * Both are just `|netCashFlow|` under a label, not a new number.
 *
 * Hand-rolled SVG, matching `NetWorthChart.tsx`'s/`RateSchedule.tsx`'s own
 * convention rather than adding a charting dependency.
 */

interface Node {
  label: string;
  amount: number;
  tone: 'in' | 'out' | 'accent';
}

const VB_W = 720;
const VB_H = 320;
const NODE_W = 14;
const LEFT_X = 8;
const RIGHT_X = VB_W - NODE_W - 8;
const HUB_X = VB_W / 2 - NODE_W / 2;
const TOP = 12;
const BOTTOM = VB_H - 12;
const GAP = 6;

export function CashFlowSankey({ snapshot }: { snapshot: YearSnapshot }) {
  const sources: Node[] = snapshot.income
    .reduce<Node[]>((acc, item) => {
      const existing = acc.find((n) => n.label === item.label);
      if (existing) existing.amount += item.amount;
      else acc.push({ label: item.label, amount: item.amount, tone: 'in' });
      return acc;
    }, [])
    .filter((n) => n.amount >= 1)
    .sort((a, b) => b.amount - a.amount);

  for (const item of snapshot.withdrawals) {
    if (item.amount < 1) continue;
    const existing = sources.find((n) => n.label === item.label);
    if (existing) existing.amount += item.amount;
    else sources.push({ label: item.label, amount: item.amount, tone: 'in' });
  }

  const uses: Node[] = snapshot.expenses
    .reduce<Node[]>((acc, item) => {
      const existing = acc.find((n) => n.label === item.label);
      if (existing) existing.amount += item.amount;
      else acc.push({ label: item.label, amount: item.amount, tone: 'out' });
      return acc;
    }, [])
    .filter((n) => n.amount >= 1)
    .sort((a, b) => b.amount - a.amount);

  if (snapshot.totalTaxes >= 1) uses.push({ label: 'Taxes', amount: snapshot.totalTaxes, tone: 'out' });
  uses.sort((a, b) => b.amount - a.amount);

  const totalIn = sources.reduce((s, n) => s + n.amount, 0);
  const totalOut = uses.reduce((s, n) => s + n.amount, 0);
  const net = totalIn - totalOut;

  if (net < -1) sources.unshift({ label: 'From savings', amount: -net, tone: 'accent' });
  if (net > 1) uses.push({ label: 'To savings', amount: net, tone: 'accent' });

  const total = Math.max(1, sources.reduce((s, n) => s + n.amount, 0));

  if (sources.length === 0 || uses.length === 0) {
    return <p className="ns-empty">No cash flow to show for this year.</p>;
  }

  const leftSlices = stack(sources, total);
  const rightSlices = stack(uses, total);

  return (
    <svg className="ns-sankey" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Cash flow by source and use">
      {leftSlices.map((slice, i) => (
        <g key={`l-${i}`}>
          <path d={ribbon(LEFT_X + NODE_W, slice.y0, slice.y1, HUB_X, slice.y0, slice.y1)} className={`ns-sankey-ribbon ns-sankey-ribbon-${slice.node.tone}`} />
          <rect x={LEFT_X} y={slice.y0} width={NODE_W} height={slice.y1 - slice.y0} rx={3} className={`ns-sankey-node ns-sankey-node-${slice.node.tone}`} />
          <text x={LEFT_X + NODE_W + 8} y={(slice.y0 + slice.y1) / 2} dominantBaseline="middle" className="ns-sankey-label">
            {slice.node.label} · {tableMoney(slice.node.amount)}
          </text>
        </g>
      ))}

      {rightSlices.map((slice, i) => (
        <g key={`r-${i}`}>
          <path d={ribbon(HUB_X + NODE_W, slice.y0, slice.y1, RIGHT_X, slice.y0, slice.y1)} className={`ns-sankey-ribbon ns-sankey-ribbon-${slice.node.tone}`} />
          <rect x={RIGHT_X} y={slice.y0} width={NODE_W} height={slice.y1 - slice.y0} rx={3} className={`ns-sankey-node ns-sankey-node-${slice.node.tone}`} />
          <text x={RIGHT_X - 8} y={(slice.y0 + slice.y1) / 2} dominantBaseline="middle" textAnchor="end" className="ns-sankey-label">
            {slice.node.label} · {tableMoney(slice.node.amount)}
          </text>
        </g>
      ))}

      <rect x={HUB_X} y={TOP} width={NODE_W} height={BOTTOM - TOP} rx={3} className="ns-sankey-hub" />
      <text x={HUB_X + NODE_W / 2} y={TOP - 6} textAnchor="middle" className="ns-sankey-label ns-sankey-hub-label">
        Cash flow
      </text>
    </svg>
  );
}

interface Slice {
  node: Node;
  y0: number;
  y1: number;
}

/** Stack nodes top to bottom, each sized proportionally to `total`, with a
    fixed gap between bands so adjacent ribbons stay visually distinct. */
function stack(nodes: Node[], total: number): Slice[] {
  const usable = BOTTOM - TOP - GAP * Math.max(0, nodes.length - 1);
  let y = TOP;
  return nodes.map((node) => {
    const height = Math.max(2, (node.amount / total) * usable);
    const slice = { node, y0: y, y1: y + height };
    y += height + GAP;
    return slice;
  });
}

/** A cubic-bezier ribbon between a slice on one node and the matching
    cumulative slice on the other — the same shape at both ends since both
    columns are stacked in the same proportional order through the hub. */
function ribbon(x0: number, y0a: number, y0b: number, x1: number, y1a: number, y1b: number): string {
  const mx = (x0 + x1) / 2;
  return `M ${x0} ${y0a} C ${mx} ${y0a} ${mx} ${y1a} ${x1} ${y1a} L ${x1} ${y1b} C ${mx} ${y1b} ${mx} ${y0b} ${x0} ${y0b} Z`;
}
