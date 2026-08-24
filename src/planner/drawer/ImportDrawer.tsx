import { useEffect, useMemo, useState } from 'react';
import type { AccountClass, ImportReport, MonarchSnapshot, Plan } from '@northstar/engine';
import {
  ACCOUNT_TYPES,
  ambiguousAccounts,
  applyImport,
  parseSnapshot,
  previewImport,
} from '@northstar/engine';
import { money } from '../format';
import { Toggle } from './fields';

/**
 * Importing a Monarch capture.
 *
 * The drawer is a DIFF, not a file picker. Paste lands you on the same screen
 * you would get from clicking through — every class the import would touch,
 * its balance before and after, and the linked accounts that rolled into it.
 * Nothing is written until Save, so the whole thing is inspectable first.
 *
 * The one interactive part is the ambiguity queue: Monarch's `get_accounts`
 * returns no subtype, so a bare brokerage could be taxable, tax-deferred or
 * Roth. Those accounts are quarantined out of the diff until they are
 * answered, and the answers are handed back on save so the next capture can
 * carry them and skip the question.
 */
interface Props {
  plan: Plan;
  /**
   * A snapshot the server already fetched from Monarch. When present the paste
   * box is hidden — the user did not paste anything and showing them an empty
   * box asking for JSON would be nonsense. The diff is the same either way.
   */
  fetched?: MonarchSnapshot | null;
  onImport(next: Plan, overrides: Record<string, AccountClass>): void;
  onCancel(): void;
}

const CHOICE_LABELS: Record<string, string> = {
  taxableInvestment: 'Taxable',
  taxDeferredInvestment: 'Tax-deferred',
  taxFreeInvestment: 'Roth / tax-free',
};

export function ImportDrawer({ plan, fetched, onImport, onCancel }: Props) {
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<Record<string, AccountClass>>({});
  const [applyCashflow, setApplyCashflow] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const parsed = useMemo((): { snapshot: MonarchSnapshot } | { error: string } | null => {
    if (fetched) return { snapshot: fetched };
    if (!text.trim()) return null;
    try {
      return { snapshot: parseSnapshot(JSON.parse(text)) };
    } catch (e) {
      // A paste that half-worked is worse than one that plainly did not, so
      // the message names the field rather than saying "invalid".
      const message =
        e instanceof SyntaxError
          ? 'That is not valid JSON — check the paste is complete.'
          : describeZodError(e);
      return { error: message };
    }
  }, [text, fetched]);

  const snapshot = parsed && 'snapshot' in parsed ? parsed.snapshot : null;

  // Three sources, narrowest last: what the capture carried, what the plan
  // remembers from a previous import, and what is being answered right now.
  // The plan's memory is why the same brokerage is only ever asked about once.
  const saved = plan.settings.monarchOverrides;
  const resolved = useMemo(
    () =>
      snapshot ? { ...snapshot, overrides: { ...snapshot.overrides, ...saved, ...answers } } : null,
    [snapshot, saved, answers],
  );

  const report = useMemo(
    () => (resolved ? previewImport(plan, resolved) : null),
    [plan, resolved],
  );

  // The question list is derived from the capture alone, so it does not move
  // as it is filled in. See `ambiguousAccounts`.
  const questions = useMemo(() => (snapshot ? ambiguousAccounts(snapshot) : []), [snapshot]);
  const answeredAll = questions.every((q) => resolved?.overrides?.[q.id]);

  const ready = Boolean(report && report.lines.length > 0 && answeredAll);

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Import from Monarch">
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">Import from Monarch</div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          <div className="ns-section">
            <div className="ns-section-title">Snapshot</div>
            <p className="ns-drawer-hint">
              {fetched
                ? 'Pulled from Monarch just now. Balances are read from it; every rate, tax assumption and withdrawal rule in your plan is left exactly as you set it.'
                : 'Paste a capture from the Monarch MCP server. Balances are read from it; every rate, tax assumption and withdrawal rule in your plan is left exactly as you set it.'}
            </p>
            {!fetched && (
              <>
                <textarea
                  className="ns-input ns-import-paste"
                  rows={6}
                  spellCheck={false}
                  autoFocus
                  value={text}
                  placeholder='{ "capturedAt": "…", "accounts": [ … ] }'
                  onChange={(e) => setText(e.target.value)}
                  onPaste={() => setAnswers({})}
                />
                {parsed && 'error' in parsed && <p className="ns-import-error">{parsed.error}</p>}
              </>
            )}
            {report && (
              <p className="ns-drawer-hint">
                Captured {report.capturedAt} · net worth {money(report.netWorth)}
              </p>
            )}
          </div>

          {questions.length > 0 && (
            <div className="ns-section">
              <div className="ns-section-title">How is each of these taxed?</div>
              <p className="ns-drawer-hint">
                Monarch reports these only as “brokerage”, which does not say how they are taxed —
                and that is the one thing the projection turns on. Each stays out of the import
                until you answer it. Answers are saved with the plan, so a later capture will not
                ask again.
              </p>
              {questions.map((account) => {
                const answer = resolved?.overrides?.[account.id];
                return (
                  <div key={account.id} className="ns-import-choice" data-answered={Boolean(answer)}>
                    <div className="ns-import-choice-head">
                      <span className="ns-import-name">{account.name}</span>
                      <span className="ns-import-amount">{money(account.balance)}</span>
                    </div>
                    {account.institution && (
                      <div className="ns-import-inst">{account.institution}</div>
                    )}
                    <div className="ns-choice">
                      {account.candidates.map((candidate) => (
                        <button
                          key={candidate}
                          type="button"
                          className="ns-choice-opt"
                          aria-pressed={answer === candidate}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [account.id]: candidate }))
                          }
                        >
                          {CHOICE_LABELS[candidate] ?? ACCOUNT_TYPES[candidate].label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {report && report.lines.length > 0 && (
            <div className="ns-section">
              <div className="ns-section-title">What this changes</div>
              <table className="ns-import-table">
                <thead>
                  <tr>
                    <th>Balance</th>
                    <th>Now</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((line) => (
                    <tr key={line.accountClass}>
                      <td>
                        <div className="ns-import-name">
                          {line.label}
                          {line.isNew && <span className="ns-import-tag">new</span>}
                        </div>
                        <div className="ns-import-inst">
                          {line.sources.map((s) => s.name).join(' · ')}
                        </div>
                      </td>
                      <td className="ns-num-cell">{line.isNew ? '–' : money(line.before)}</td>
                      <td className="ns-num-cell ns-import-after">{money(line.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report?.baseline && (
            <div className="ns-section">
              <div className="ns-section-title">Cash flow</div>
              <p className="ns-drawer-hint">
                Monarch’s last period annualises to {money(report.baseline.income)} in and{' '}
                {money(report.baseline.expenses)} out, against {money(report.baseline.currentIncome)}{' '}
                and {money(report.baseline.currentExpenses)} in the plan. Off by default — if your
                salary is modelled as an income event so it can stop at retirement, adding a
                baseline on top of it counts the same money twice.
              </p>
              <Toggle
                label="Also overwrite baseline income and living expenses"
                checked={applyCashflow}
                onChange={setApplyCashflow}
              />
            </div>
          )}

          {report && report.skipped.length > 0 && (
            <div className="ns-section">
              <div className="ns-section-title">Not imported</div>
              {report.skipped.map((s) => (
                <div key={s.id} className="ns-import-skip">
                  <span className="ns-import-name">{s.name}</span>
                  <span className="ns-import-inst">{s.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="ns-drawer-foot">
          <div className="ns-drawer-foot-right">
            <button type="button" className="ns-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-primary"
              disabled={!ready}
              onClick={() => {
                if (!resolved) return;
                const { plan: next } = applyImport(plan, resolved, { applyCashflow });
                onImport(next, { ...saved, ...answers });
              }}
            >
              {report && !answeredAll
                ? `${report.needsChoice.length} still to answer`
                : `Import ${report ? report.lines.length : 0} balance${report?.lines.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

/** Turn a zod failure into the one sentence that says what to fix. */
function describeZodError(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (!issues?.length) return 'That does not look like a Monarch snapshot.';
  const first = issues[0];
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export type { ImportReport };
