export type DeltaTone = 'in' | 'out' | 'neutral';

/**
 * A tiny mono tag for a signed change in money — `--in-deep` on `--in-tint`
 * for positive, `--out-deep` on `--out-tint` for negative
 * (docs/REDESIGN-V3.md "Delta tag"): these are data, encoding a change in
 * money, not chrome, which is why they reach for the same hues the ledger
 * tables already use for income vs. cost rather than a neutral chip.
 *
 * The caller formats `value` (e.g. `signedMoney(...)` from `format.ts`) —
 * this component only supplies the tone and the tag chrome around it.
 */
export function DeltaTag({ value, tone }: { value: string; tone: DeltaTone }) {
  return <span className={`ns-ui-delta ns-ui-delta-${tone}`}>{value}</span>;
}
