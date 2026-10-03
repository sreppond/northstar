import { useMemo, useState } from 'react';
import { CalendarClock, Target } from 'lucide-react';
import { goalFundingProgress, headlineReturnRate } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { HoverCard, ExplainHint } from '../HoverCard';
import { IconBadge } from '../IconBadge';
import { planDetail } from '../detail';
import { toneFor } from '../presentation';
import { NetWorthChart, rankImpact, type GhostSeries } from '../NetWorthChart';
import { Levers } from '../LeversPanel';
import { MonarchHeaderAction } from '../DataBanner';
import {
  accountMixToday,
  freshnessHeaderStatus,
  horizonPoints,
  planVsReality,
  retirementReadout,
  savingsRateThisYear,
  spreadPercent,
  upcomingEvents,
} from '../dashboard';
import { asOfDateLabel, money, percent, planMetaLine, signedMoney } from '../format';
import {
  Badge,
  DeltaTag,
  EmptyState,
  Page,
  PageHeader,
  ProgressBar,
  SectionCard,
  Segmented,
  Stat,
  StatCard,
  StatStrip,
  StackedBar,
} from '../ui';
import './overview.css';

/**
 * The dashboard (docs/REDESIGN-V3.md "Overview (the dashboard)"). Everything
 * a returning user wants to glance at — net worth today, where it's headed,
 * the range around that, goals funded, what's next, account mix — lives on
 * one screen instead of requiring a tour of every other page. The chart
 * itself stays hand-rolled SVG (`NetWorthChart.tsx`, shared with
 * `ComparePage.tsx`); everything else here is composed from the shared
 * `ui/` kit `PageHeader`/`StatStrip`/`SectionCard`/`StatCard` phase 1 built.
 */
export function OverviewPage() {
  const {
    plan,
    stored,
    result,
    replacePlan,
    reading,
    heroFigure,
    compare,
    spread,
    spreadAtEnd,
    showFan,
    toggleFan,
    fan,
    markers,
    selected,
    setSelected,
    scrubYear,
    setScrubYear,
    setDragDraft,
    editor,
    upsertEvent,
    setAssumptionsDraft,
    monarch,
    progressPoints,
    freshness,
    localMonarch,
    rollPlanForward,
    setImporting,
  } = usePlanner();

  const [ghost, setGhost] = useState<GhostSeries | null>(null);

  const canFan = headlineReturnRate(plan) !== undefined;
  const todayYear = result.startYear;
  // The plan's real balances as of `asOfDate` — not `years[0]`, the
  // projected Dec 31 CLOSE of the (often partial) first plan year
  // (docs/MATH.md "Today vs. years[0]"). `accountMixToday` below already
  // reads `opening`; this brings "Net worth today" in line with it.
  const todayNetWorth = result.opening?.netWorth ?? result.years[0]?.netWorth ?? 0;
  const projectedDeltaTone = heroFigure >= todayNetWorth ? 'in' : 'out';

  const rangeSpread =
    spreadAtEnd && !reading.isAlarm ? spreadPercent(spreadAtEnd.low, spreadAtEnd.high, reading.figure) : undefined;

  const savingsRate = savingsRateThisYear(result, todayYear);
  const freedom = retirementReadout(plan);

  const horizons = horizonPoints(result, spread, todayYear);
  const goals = goalFundingProgress(plan, result);
  const upcoming = upcomingEvents(plan, todayYear);
  const mix = accountMixToday(result);
  // Ranks each upcoming event by |Δ net worth at horizon| (docs/REVIEW.md
  // S13) — the same counterfactual NetWorthChart's own labels use, so "next
  // up" reads as impact rather than the event's raw parameters.
  const impactByEventId = useMemo(() => rankImpact(plan, result), [plan, result]);

  const asOfDate = stored.settings.asOfDate ?? `${stored.settings.startYear}-01-01`;
  const asOfLabel = asOfDateLabel(asOfDate);
  // A plan is "Monarch-linked" once it has ever absorbed an import —
  // `monarchOverrides` is only ever written by `applyImport` (`ImportDrawer`),
  // never hand-authored — regardless of whether THIS browser happens to be
  // connected to the server Monarch flow right now (`monarch.status` below).
  const isMonarchLinked = Boolean(
    stored.settings.monarchOverrides && Object.keys(stored.settings.monarchOverrides).length > 0,
  );
  const freshnessStatus = freshnessHeaderStatus(freshness, asOfDate, isMonarchLinked);
  const reality = planVsReality(progressPoints, result, plan);
  const localSnapshot = localMonarch.snapshot;

  return (
    <Page>
      <PageHeader
        title="Overview"
        meta={
          <>
            {planMetaLine(stored, result.endYear)}
            {/* Folded in at phone widths in place of the status chip below
                (docs/REVIEW.md S11) — see `.ns-ov-meta-status` in
                overview.css. */}
            <span className="ns-ov-meta-status"> · {freshnessStatus.text}</span>
          </>
        }
        status={
          <span className="ns-ov-status-chip">
            <span
              aria-hidden
              className={`ns-ov-status-dot${freshnessStatus.isStale ? ' ns-ov-status-dot-warn' : ''}`}
            >
              ●
            </span>{' '}
            {freshnessStatus.text}
            <ExplainHint label="data freshness">
              <div className="ns-explain-body">
                <p>
                  {isMonarchLinked ? 'Balances came from a Monarch sync' : 'Balances were entered by hand'}, as of{' '}
                  {asOfLabel}.
                </p>
                {freshnessStatus.isStale && (
                  <p>
                    That's over 35 days ago — run <code>npm run monarch:sync</code> to refresh them.
                  </p>
                )}
              </div>
            </ExplainHint>
          </span>
        }
        actions={
          // Wrapped in its own flex-wrap row rather than relying on
          // `.ns-page-actions` (nowrap, shared by every page's header) —
          // three items plus the status chip is more than a 390px header
          // fits on one line, and this is the only Overview page with a
          // status chip *and* two actions competing for that row.
          <div className="ns-ov-header-actions">
            <MonarchHeaderAction
              status={monarch.status}
              busy={monarch.busy}
              onConnect={monarch.openConnect}
              onRefresh={() => void monarch.refresh()}
            />
            <HoverCard detail={planDetail(plan, result.endYear)} side="bottom">
              <button
                type="button"
                className="ns-btn"
                onClick={() => setAssumptionsDraft(structuredClone(stored))}
              >
                Edit assumptions
              </button>
            </HoverCard>
            <button type="button" className="ns-btn ns-btn-primary" onClick={editor.startNew}>
              + Add event
            </button>
          </div>
        }
      />

      {/* Quiet banners under the header — a new local Monarch capture to
          review, or a plan whose clock has fallen behind the calendar
          (docs/ROADMAP-10.md Track B / C4). Both are dismissable by their own
          action rather than an explicit close, since acting on either one is
          exactly what makes it go away (a review that applies calls
          `markApplied`; rolling forward moves `startYear` past
          `needsRollover`'s own test). */}
      {localMonarch.isNew && localSnapshot && (
        <div className="ns-ov-banner">
          <span>
            New Monarch snapshot · {asOfDateLabel(localSnapshot.capturedAt)} · {localSnapshot.accounts.length}{' '}
            accounts
          </span>
          <button type="button" className="ns-btn-ghost" onClick={() => setImporting(true)}>
            Review
          </button>
        </div>
      )}

      {freshness.needsRollover && (
        <div className="ns-ov-banner">
          <span>It's {new Date().getUTCFullYear()} — roll the plan forward?</span>
          <button type="button" className="ns-btn-ghost" onClick={rollPlanForward}>
            Roll forward
          </button>
        </div>
      )}

      <StatStrip>
        <Stat
          size="xl"
          label="Net worth today"
          value={money(todayNetWorth)}
          sub={reading.read}
          explain={
            <div className="ns-explain-body">
              <p>Every account balance minus liabilities, as of {asOfLabel} — the plan's real starting point, not a projection.</p>
            </div>
          }
        />

        <Stat
          label={`Projected at ${scrubYear ?? result.endYear}`}
          value={money(heroFigure)}
          delta={{ value: signedMoney(heroFigure - todayNetWorth), tone: projectedDeltaTone }}
          sub={scrubYear !== null ? 'Following the chart' : `${result.endYear} horizon`}
          explain={
            <div className="ns-explain-body">
              <p>
                Today's balances carried forward through every included income, expense and event, assuming a{' '}
                {percent(headlineReturnRate(plan) ?? 0)} return — as of {asOfLabel}.
              </p>
            </div>
          }
        />

        {rangeSpread !== undefined && spreadAtEnd ? (
          <Stat
            label="Range (±2 pts return)"
            value={percent(rangeSpread, 1)}
            sub={`${money(spreadAtEnd.low)} – ${money(spreadAtEnd.high)}`}
            onClick={toggleFan}
            pressed={showFan}
            explain={
              <div className="ns-explain-body">
                <p>
                  How wide {result.endYear}'s outcome gets if returns run ±{spread?.shift ?? 2} points a year off the{' '}
                  {percent(headlineReturnRate(plan) ?? 0)} assumption. Click to trace both edges on the chart.
                </p>
              </div>
            }
          />
        ) : (
          <Stat
            label="Range (±2 pts return)"
            value="—"
            sub="Add a market return to see a range"
            explain={
              <div className="ns-explain-body">
                <p>Give an account a market-return assumption to see how much the outcome could vary.</p>
              </div>
            }
          />
        )}

        {freedom ? (
          <Stat
            label="Freedom age"
            value={String(freedom.age)}
            sub={`Retiring ${freedom.year}`}
            explain={
              <div className="ns-explain-body">
                <p>The age at the plan's own retirement event in {freedom.year}, read straight off that event's year.</p>
              </div>
            }
          />
        ) : (
          <Stat
            label="Savings rate"
            value={savingsRate !== undefined ? percent(savingsRate, 1) : '—'}
            sub={`${todayYear} income vs. spending`}
            explain={
              <div className="ns-explain-body">
                <p>Net cash flow as a share of income for {todayYear} — of what came in this year, how much stuck.</p>
              </div>
            }
          />
        )}
      </StatStrip>

      <SectionCard
        title="Net worth trajectory"
        // The chart's own legend is hidden here (`hideHead`) — with a
        // compare plan selected on any ledger, its purple dashed line drew
        // with nothing on the card explaining what it was. Same treatment
        // for logged actuals, which otherwise ride along unannounced too.
        meta={`Projected · ${result.startYear}–${result.endYear} · Return ${percent(headlineReturnRate(plan) ?? 0)}${
          compare ? ` · vs ${compare.name}` : ''
        }${progressPoints.length ? ' · Actual' : ''}`}
        actions={
          canFan ? (
            <Segmented
              ariaLabel="Chart range"
              size="sm"
              options={[
                { value: 'plan', label: 'Plan' },
                { value: 'range', label: 'Range' },
              ]}
              value={fan ? 'range' : 'plan'}
              onChange={(v) => {
                if ((v === 'range') !== Boolean(fan)) toggleFan();
              }}
            />
          ) : undefined
        }
        flush
      >
        <div className="ns-ov-chart-slot">
          <Levers plan={plan} stored={stored} result={result} replacePlan={replacePlan} onGhostChange={setGhost} />

          <NetWorthChart
            result={result}
            plan={plan}
            rateLabel={percent(headlineReturnRate(plan) ?? 0)}
            selected={selected}
            compare={compare}
            fan={fan}
            ghost={ghost ?? undefined}
            markers={markers}
            canFan={canFan}
            actuals={progressPoints}
            hideHead
            onToggleFan={toggleFan}
            onSelect={setSelected}
            onScrubYear={setScrubYear}
            onDragPreview={setDragDraft}
            onDragCommit={(eventId, year) => {
              const event = stored.events.find((e) => e.id === eventId);
              if (event) upsertEvent(stored.id, { ...event, startYear: year });
            }}
          />

          {reality && (
            <div className={`ns-ov-reality ns-ov-reality-${reality.tone}`}>
              <span className="ns-ov-reality-dot" aria-hidden />
              {reality.tone === 'in' ? 'Ahead of' : 'Behind'} plan by {money(Math.abs(reality.delta))} since{' '}
              {reality.sinceLabel}
            </div>
          )}

          {selected && (
            <div className="ns-selection">
              <span className={`ns-ref${selected.tone === 'cost' ? ' ns-ref-cost' : ''}`}>{selected.code}</span>
              <span className="ns-selection-label">{selected.label}</span>
              <span className="ns-subtle ns-num">
                {selected.year}
                {selected.detail ? ` · ${selected.detail}` : ''}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="ns-btn-ghost"
                  onClick={() => {
                    const event = stored.events.find((e) => e.id === selected.eventId);
                    if (event) editor.edit(event);
                  }}
                >
                  Edit
                </button>
                <button type="button" className="ns-btn-ghost" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="ns-alarm">
              <strong>
                {result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}:
              </strong>
              <span>{result.warnings[0]}</span>
            </div>
          )}
        </div>
      </SectionCard>

      <div className="ns-ov-horizons">
        {horizons.map((h) => (
          <StatCard
            key={h.year}
            label={h.label}
            badge={h.spreadPercent !== undefined ? <Badge>{percent(h.spreadPercent, 1)} spread</Badge> : undefined}
            value={money(h.p50)}
            footLeft={h.low !== undefined ? `−2 pts ${money(h.low)}` : undefined}
            footRight={h.high !== undefined ? `+2 pts ${money(h.high)}` : undefined}
            selected={scrubYear === h.year}
            onClick={() => setScrubYear(scrubYear === h.year ? null : h.year)}
            explain={
              <div className="ns-explain-body">
                <p>
                  {h.isHorizon
                    ? `The plan's own horizon — its projected net worth in ${h.year}.`
                    : `Net worth ${h.year - todayYear} years out from today, at ${h.year}.`}
                </p>
                {h.spreadPercent !== undefined && (
                  <p>
                    The ±2 pts range shows how this figure moves if returns run {spread?.shift ?? 2} points a year off
                    the assumption — not a statistical percentile. Click to follow this year on the chart.
                  </p>
                )}
              </div>
            }
          />
        ))}
      </div>

      <div className="ns-ov-columns">
        <SectionCard title="Goals" divider={false}>
          {goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No goals yet"
              body="Give an account a target and a date from the drawer to see its funding progress here."
            />
          ) : (
            <div className="ns-ov-goals">
              {goals.map((g) => {
                const target = g.target ?? 0;
                const balance = g.byYearBalance ?? 0;
                const short = Math.max(0, target - balance);
                return (
                  <div key={g.goalId} className="ns-ov-goal">
                    <div className="ns-ov-goal-head">
                      <span className="ns-ov-goal-name">{g.name}</span>
                      {g.target !== undefined && g.byYear !== undefined && (
                        <Badge tone={g.funded ? 'in' : 'out'}>{g.funded ? 'On track' : `Short ${money(short)}`}</Badge>
                      )}
                    </div>
                    {/* Net-worth blue when on track, money-out orange when short — the
                        §5.1 rule `GoalRing` already documents, applied here too
                        (docs/REVIEW.md M16). `--accent` and `--data-nw` are the same
                        token value, so `tone="accent"` is the net-worth hue without
                        `ProgressBar` needing a dedicated "nw" tone. */}
                    <ProgressBar value={balance} max={target} tone={g.funded ? 'accent' : 'out'} />
                    <div className="ns-ov-goal-foot ns-num">
                      <span>
                        {money(balance)} of {money(target)}
                      </span>
                      {g.byYear !== undefined && <span>by {g.byYear}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Coming up" divider={false}>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              body="Add an event to see what's next for this plan."
              action={
                <button type="button" className="ns-btn ns-btn-primary" onClick={editor.startNew}>
                  + Add event
                </button>
              }
            />
          ) : (
            <ul className="ns-ov-upcoming">
              {upcoming.map((u) => {
                // Signed by the event's own tone (income adds, cost takes) —
                // `rankImpact` itself only ranks by magnitude, since the
                // chart's label-packing pass doesn't care about direction.
                const impact = impactByEventId.get(u.event.id);
                const signed = impact === undefined ? undefined : toneFor(u.event.kind) === 'cost' ? -impact : impact;
                return (
                  <li key={u.event.id}>
                    <button type="button" className="ns-ov-upcoming-row" onClick={() => editor.edit(u.event)}>
                      <IconBadge kind={u.event.kind} />
                      <span className="ns-ov-upcoming-name">{u.event.name}</span>
                      {signed !== undefined ? (
                        <DeltaTag
                          value={`${signedMoney(signed)} by ${result.endYear}`}
                          tone={signed >= 0 ? 'in' : 'out'}
                        />
                      ) : (
                        <span className="ns-ov-upcoming-detail">{u.detail}</span>
                      )}
                      <span className="ns-ov-upcoming-year ns-num">
                        {u.yearsOut === 0 ? 'This year' : `in ${u.yearsOut} yr${u.yearsOut === 1 ? '' : 's'}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Where it sits today" divider={false}>
        {mix.segments.length === 0 ? (
          <EmptyState icon={Target} title="No balances yet" body="Add an account to see its share of the total." />
        ) : (
          <>
            <StackedBar segments={mix.segments} format={money} />
            {mix.liabilitiesTotal > 0 && (
              <p className="ns-ov-liabilities-note">
                Plus {money(mix.liabilitiesTotal)} in liabilities, not shown above.
              </p>
            )}
          </>
        )}
      </SectionCard>
    </Page>
  );
}
