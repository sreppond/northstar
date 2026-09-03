import { useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { Field, NumberInput } from '../drawer/fields';
import { MiniChart } from '../views/MiniChart';
import { detailMoney, signedMoney } from '../format';
import { emptyProgressPoint, summarizeProgress, type ProgressPoint } from '../progress';

/**
 * The historical counterpart to the projection: what net worth actually
 * was, on a given date — distinct from what every other page projects it
 * to be. Purely a user-entered ledger; nothing here reads from `result`.
 */
export function ProgressPage() {
  const { progressPoints, upsertProgressPoint, deleteProgressPoint } = usePlanner();
  const [draft, setDraft] = useState<ProgressPoint | null>(null);

  const { sortedAscending, sortedDescending, latest, allTimeChange } = summarizeProgress(progressPoints);

  function save() {
    if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return;
    upsertProgressPoint(draft);
    setDraft(null);
  }

  return (
    <div className="ns-card ns-card-view">
      <div className="ns-view-head">
        <div className="ns-view-title">Progress</div>
        <p className="ns-view-sub">
          A record of what your net worth actually was over time, separate from the plan's projected future. Add a
          point directly to log today's balance or backfill an old statement.
        </p>
      </div>

      {progressPoints.length === 0 ? (
        <div className="ns-view-empty">No progress points yet — add one below to start the record.</div>
      ) : (
        <>
          <div className="ns-progress-summary">
            <div className="ns-progress-stat">
              <span className="ns-progress-stat-label">Latest</span>
              <span className="ns-progress-stat-value">{detailMoney(latest!.netWorth)}</span>
            </div>
            {sortedAscending.length > 1 && (
              <div className="ns-progress-stat">
                <span className="ns-progress-stat-label">All time</span>
                <span
                  className="ns-progress-stat-value"
                  style={{ color: allTimeChange >= 0 ? 'var(--in)' : 'var(--out)' }}
                >
                  {signedMoney(allTimeChange)}
                </span>
              </div>
            )}
          </div>
          <MiniChart
            height={160}
            years={sortedAscending.map((p) => yearFraction(p.date))}
            formatX={(y) => String(Math.floor(y))}
            series={[{ label: 'Net worth', color: 'var(--data-nw)', values: sortedAscending.map((p) => p.netWorth), fill: true }]}
          />
        </>
      )}

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
                <td>{detailMoney(point.netWorth)}</td>
                <td>{detailMoney(point.assets)}</td>
                <td>{detailMoney(point.liabilities)}</td>
                <td className="ns-datatable-actions">
                  <button type="button" className="ns-btn ns-btn-sm" onClick={() => setDraft(point)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ns-btn ns-btn-sm ns-btn-danger"
                    onClick={() => deleteProgressPoint(point.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft ? (
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
      ) : (
        <button type="button" className="ns-btn ns-btn-sm" onClick={() => setDraft(emptyProgressPoint())}>
          + Add progress point
        </button>
      )}
    </div>
  );
}

function yearFraction(date: string): number {
  const d = new Date(`${date}T00:00:00`);
  const startOfYear = new Date(`${d.getFullYear()}-01-01T00:00:00`);
  const dayOfYear = (d.getTime() - startOfYear.getTime()) / 86_400_000;
  return d.getFullYear() + dayOfYear / 365;
}
