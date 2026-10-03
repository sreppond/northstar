import { useState } from 'react';
import { LineChart } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { Field, NumberInput } from '../drawer/fields';
import { MiniChart } from '../views/MiniChart';
import { asOfDateLabel, money, planMetaLine, signedMoney } from '../format';
import {
  emptyProgressPoint,
  planAsOfFraction,
  progressPointFromPlan,
  projectedNetWorthAt,
  summarizeProgress,
  yearFraction,
  type ProgressPoint,
} from '../progress';
import { DeltaTag, EmptyState, Page, PageHeader, SectionCard, Stat, StatStrip } from '../ui';

/**
 * The historical counterpart to the projection: what net worth actually
 * was, on a given date — distinct from what every other page projects it
 * to be. Purely a user-entered ledger.
 */
export function ProgressPage() {
  const { plan, progressPoints, upsertProgressPoint, deleteProgressPoint, stored, result } = usePlanner();
  const [draft, setDraft] = useState<ProgressPoint | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { sortedAscending, sortedDescending, latest, allTimeChange } = summarizeProgress(progressPoints);
  const earliest = sortedAscending[0];
  const hasPoints = progressPoints.length > 0;
  // S1: a from-scratch visitor and a returning one shouldn't both see a
  // second, near-identical empty state below the first — the Log card
  // (table + form) stays hidden until there's at least one point to show,
  // OR a draft is already open (the very first "Log today's net worth"
  // click needs somewhere to land before a point exists).
  const showLogCard = hasPoints || draft !== null;

  const asOf = planAsOfFraction(plan.settings);

  function save() {
    if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return;
    upsertProgressPoint(draft);
    setDraft(null);
  }

  function confirmDelete(id: string) {
    deleteProgressPoint(id);
    setConfirmDeleteId(null);
  }

  const vsPlanDelta = latest ? latest.netWorth - projectedNetWorthAt(result, yearFraction(latest.date), asOf) : 0;

  // M14 (second bug): with a single logged point the x-domain used to
  // collapse to one value, so the "Plan" series had nowhere to draw a line
  // (only its end-label dot showed). The domain now always spans from
  // whichever is earlier of the first point or "today", to whichever is
  // later of the last point or "today plus a year" — anchored on `asOf`
  // exactly like `projectedNetWorthAt` itself — with the plan sampled at
  // every one of those positions. "Actual" only has real values at real
  // logged dates; `NaN` elsewhere marks a gap `MiniChart` breaks the line at
  // rather than interpolates across, so it still only ever draws through
  // dates that were actually logged.
  const pointFractions = sortedAscending.map((p) => yearFraction(p.date));
  const domain = hasPoints
    ? Array.from(
        new Set([Math.min(asOf, ...pointFractions), ...pointFractions, Math.max(asOf + 1, ...pointFractions)]),
      ).sort((a, b) => a - b)
    : [];
  const actualByFraction = new Map(sortedAscending.map((p, i) => [pointFractions[i], p.netWorth]));

  return (
    <Page>
      <PageHeader
        title="Progress"
        meta={planMetaLine(stored, result.endYear)}
        actions={
          hasPoints &&
          !draft && (
            <button type="button" className="ns-btn ns-btn-sm" onClick={() => setDraft(emptyProgressPoint())}>
              + Add progress point
            </button>
          )
        }
      />

      {!hasPoints && !draft ? (
        <div className="ns-card">
          <EmptyState
            icon={LineChart}
            title="No progress logged yet"
            body={
              <>
                A record of what your net worth actually was over time, separate from the plan's projected future.
                Running <code>npm run monarch:sync</code> builds this history automatically on every sync — or log
                today's balance by hand to start the record, or backfill an old statement.
              </>
            }
            action={
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                onClick={() =>
                  setDraft(
                    progressPointFromPlan({ settings: plan.settings, years: result.years, opening: result.opening }),
                  )
                }
              >
                Log today's net worth
              </button>
            }
          />
        </div>
      ) : (
        hasPoints && (
          <>
            <StatStrip>
              <Stat
                size="xl"
                label="Latest actual"
                value={money(latest!.netWorth)}
                sub={`As of ${asOfDateLabel(latest!.date)}`}
                explain={`The most recently logged real net worth entry, dated ${asOfDateLabel(latest!.date)} — a number you entered, not a projection.`}
              />
              <Stat
                label="Vs. plan"
                value={
                  <DeltaTag
                    value={signedMoney(vsPlanDelta)}
                    // A logged point right on `asOf` reads a few cents of
                    // float residue as a "loss" — neutral below a $50 noise
                    // floor instead of always calling it an "out."
                    tone={Math.abs(vsPlanDelta) < 50 ? 'neutral' : vsPlanDelta > 0 ? 'in' : 'out'}
                  />
                }
                sub="Actual minus projected, same date"
                explain="Your latest logged net worth minus what the plan projected for that same date — positive means you're ahead of the projection, negative means behind."
              />
              <Stat
                label="Points logged"
                value={String(sortedAscending.length)}
                explain="How many net-worth entries you've logged, across every date."
              />
              <Stat
                label="Since first point"
                value={signedMoney(allTimeChange)}
                sub={earliest && earliest !== latest ? `Since ${asOfDateLabel(earliest.date)}` : 'Log another point to see change'}
                explain="Latest logged net worth minus your very first logged entry — the real change over the whole time you've been tracking, not a projection."
              />
            </StatStrip>

            <SectionCard title="Actual vs. plan" divider={false}>
              <MiniChart
                height={200}
                years={domain}
                formatX={(y) => String(Math.floor(y))}
                endLabels
                series={[
                  {
                    label: 'Actual',
                    color: 'var(--data-nw)',
                    values: domain.map((x) => actualByFraction.get(x) ?? NaN),
                    dots: true,
                  },
                  {
                    label: 'Plan',
                    color: 'var(--muted-light)',
                    values: domain.map((x) => projectedNetWorthAt(result, x, asOf)),
                    dashed: true,
                  },
                ]}
              />
            </SectionCard>
          </>
        )
      )}

      {showLogCard && (
        <SectionCard title="Log" flush>
          {sortedDescending.length === 0 ? (
            <div className="ns-view-empty">No progress points yet — add one above to start the record.</div>
          ) : (
            <div className="ns-table-scroll">
              <table className="ns-datatable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Net worth</th>
                    <th>Assets</th>
                    <th>Liabilities</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedDescending.map((point) => (
                    <tr key={point.id}>
                      <td>{point.date}</td>
                      <td>{money(point.netWorth)}</td>
                      <td>{money(point.assets)}</td>
                      <td>{money(point.liabilities)}</td>
                      <td className="ns-datatable-actions">
                        <button type="button" className="ns-btn ns-btn-sm" onClick={() => setDraft(point)}>
                          Edit
                        </button>
                        {confirmDeleteId === point.id ? (
                          <>
                            <button
                              type="button"
                              className="ns-btn ns-btn-sm ns-btn-danger-ghost"
                              onClick={() => confirmDelete(point.id)}
                            >
                              Confirm delete
                            </button>
                            <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          // S17: delete shouldn't be the loudest thing in the
                          // row -- a ghost button (not a filled red one) that
                          // asks for a second click before it commits.
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm ns-btn-danger-ghost"
                            onClick={() => setConfirmDeleteId(point.id)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {draft && (
            <div className="ns-progress-form">
              <Field label="Date">
                <input
                  type="date"
                  className="ns-input"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="Net worth">
                <NumberInput
                  unit="currency"
                  value={draft.netWorth}
                  onChange={(v) => setDraft({ ...draft, netWorth: v ?? 0 })}
                />
              </Field>
              <Field label="Assets">
                <NumberInput
                  unit="currency"
                  value={draft.assets}
                  onChange={(v) => setDraft({ ...draft, assets: v ?? 0 })}
                />
              </Field>
              <Field label="Liabilities">
                <NumberInput
                  unit="currency"
                  value={draft.liabilities}
                  onChange={(v) => setDraft({ ...draft, liabilities: v ?? 0 })}
                />
              </Field>
              <div className="ns-progress-form-actions">
                <button type="button" className="ns-btn ns-btn-ghost" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ns-btn ns-btn-primary"
                  disabled={!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)}
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </Page>
  );
}
