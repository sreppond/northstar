import { useMemo, useState } from 'react';
import { planEndYear } from '@northstar/engine';
import { usePlanner } from './PlannerContext';
import { TimeSeriesChart } from './charts';
import { money } from './format';
import { budgetView, ownerColor } from './budgetView';
import { ImpactStrip, PreviewActions, impactMetrics } from './ImpactStrip';
import { presentResult } from './impact';
import { CHILDCARE_LABEL, type ChildcareChoice, type CollegeChoice, type SchoolChoice } from './kids';
import { applyKidOptions, kidOptionsChanged, readKidChoices, type KidChoices } from './kidStages';
import { Choice, Field, NumberInput } from './drawer/fields';

/**
 * An existing child's life stages, editable (V5-REVIEW-1 F9): childcare,
 * school, college and the 529. It follows "Preview, then keep"
 * (docs/REDESIGN-V4.md §1.4): choosing an option re-draws the child's monthly
 * cost with the plan as it stands kept as a dashed ghost, the Impact strip
 * says what it does to the household, and nothing touches the real plan until
 * Keep, which is one `replacePlan` and so one Undo.
 */
export function KidStagesEditor({ childId }: { childId: string }) {
  const { stored, result, replacePlan, savePlanAs } = usePlanner();
  const child = stored.participants.find((p) => p.id === childId && p.role === 'child');
  const current = useMemo(() => readKidChoices(stored, childId), [stored, childId]);
  // `null` until something is pressed, so a stage the user hand-edited (reads
  // as null) is never silently rewritten by an unrelated change.
  const [edit, setEdit] = useState<KidChoices | null>(null);
  const shown = edit ?? current;
  const set = (patch: Partial<KidChoices>) => setEdit({ ...shown, ...patch });

  const draft = useMemo(
    () => (edit && kidOptionsChanged(stored, childId, edit) ? applyKidOptions(stored, childId, edit) : null),
    [edit, stored, childId],
  );
  const draftResult = useMemo(() => (draft ? presentResult(draft) : null), [draft]);

  const monthly = (plan: typeof stored, res: typeof result) =>
    res.years.map((y) => budgetView(plan, y).sections.find((s) => s.owner === childId)?.monthly ?? 0);
  const now = useMemo(() => monthly(stored, result), [stored, result, childId]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => (draft && draftResult ? monthly(draft, draftResult) : null), [draft, draftResult, childId]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = result.years.map((y) => y.year);
  // Through the last year either version costs anything, plus a little air.
  const lastIndex = Math.min(
    years.length - 1,
    Math.max(
      0,
      ...[now, next ?? now].map((vals) => vals.reduce((last, v, i) => (v > 0.5 ? i : last), 0)),
    ) + 2,
  );

  const metricYear = child ? Math.min(planEndYear(stored), Math.max(stored.settings.startYear, child.birthYear)) : stored.settings.startYear;
  const currentMetrics = useMemo(() => impactMetrics(stored, result, metricYear), [stored, result, metricYear]);
  const draftMetrics = useMemo(
    () => (draft && draftResult ? impactMetrics(draft, draftResult, metricYear) : null),
    [draft, draftResult, metricYear],
  );

  if (!child) return null;
  const reset = () => setEdit(null);

  return (
    <section className="ns-retain ns-kid-stages" aria-label={`${child.name}'s stages`}>
      <div className="ns-retain-title">Stages and what they cost</div>

      <Choice<string>
        label="Childcare, ages 0–4"
        value={shown.childcare ?? ''}
        options={(Object.keys(CHILDCARE_LABEL) as ChildcareChoice[]).map((v) => ({ value: v, label: CHILDCARE_LABEL[v] }))}
        onChange={(childcare) => set({ childcare: childcare as ChildcareChoice })}
      />
      <Choice<string>
        label="School"
        value={shown.school}
        options={[
          { value: 'public' as SchoolChoice, label: 'Public' },
          { value: 'private' as SchoolChoice, label: 'Private' },
        ]}
        onChange={(school) => set({ school: school as SchoolChoice })}
      />
      <Choice<string>
        label="College"
        value={shown.college ?? ''}
        options={[
          { value: 'inState' as CollegeChoice, label: 'In-state' },
          { value: 'outOfState' as CollegeChoice, label: 'Out-of-state' },
          { value: 'private' as CollegeChoice, label: 'Private' },
          { value: 'none' as CollegeChoice, label: 'None' },
        ]}
        onChange={(college) => set({ college: college as CollegeChoice })}
      />
      <Field label="Save for college (per month)">
        <NumberInput
          value={shown.collegeSavingsMonthly}
          unit="currency"
          step={50}
          min={0}
          onChange={(v) => set({ collegeSavingsMonthly: v ?? 0 })}
        />
      </Field>

      {draft && next && (
        <>
          <TimeSeriesChart
            years={years.slice(0, lastIndex + 1)}
            series={[
              {
                id: 'draft',
                label: `${child.name}, with this change`,
                color: ownerColor(stored, childId),
                kind: 'area',
                values: next.slice(0, lastIndex + 1),
              },
            ]}
            ghost={{ id: 'now', label: 'As it is', color: 'var(--ink)', values: now.slice(0, lastIndex + 1) }}
            readout={{ label: 'Cost per month', size: 'compact', format: money }}
            height={170}
            drawKey={childId}
            ariaLabel={`${child.name}'s monthly cost with the change, against as it is`}
          />
          <ImpactStrip
            current={currentMetrics}
            draft={draftMetrics}
            actions={
              <PreviewActions
                onKeep={() => {
                  replacePlan(draft, `Updated ${child.name}'s stages`);
                  reset();
                }}
                onSaveAs={() => {
                  savePlanAs(draft, `${stored.name} — ${child.name}'s stages`);
                  reset();
                }}
                onReset={reset}
              />
            }
          />
        </>
      )}
    </section>
  );
}
