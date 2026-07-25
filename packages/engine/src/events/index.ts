/**
 * The event registry.
 *
 * Adding a twelfth event kind is one new module plus one line here. Nothing in
 * the year loop changes -- that is the test of whether the compile/simulate
 * split in docs/PLAN.md §4.2 was done correctly.
 */
import type { EventKind, PlanEvent } from '../types.js';
import type { CompileContext, CompiledEvent, EventModule } from './kit.js';
import { emptyCompiled } from './kit.js';
import { income } from './income.js';
import { annualExpense, otherExpense, windfall } from './expenses.js';
import { buyAHome } from './buyAHome.js';
import { careerBreak, newJob, retirement, socialSecurity } from './work.js';
import { endOfPlan, haveAKid } from './life.js';

export const EVENT_MODULES = {
  annualExpense,
  buyAHome,
  careerBreak,
  endOfPlan,
  haveAKid,
  income,
  newJob,
  otherExpense,
  retirement,
  socialSecurity,
  windfall,
} satisfies Record<EventKind, EventModule<any>>;

export type EventModuleMap = typeof EVENT_MODULES;

export function moduleFor(kind: EventKind): EventModule<any> {
  return EVENT_MODULES[kind];
}

export interface CompileFailure {
  eventId: string;
  message: string;
}

/**
 * Validates an event's config against its schema, then compiles it.
 * A config that fails validation produces a warning and contributes nothing,
 * rather than throwing and blanking the whole projection.
 */
export function compileEvent(
  event: PlanEvent,
  ctx: CompileContext,
  failures: CompileFailure[],
): CompiledEvent {
  const mod = moduleFor(event.kind);
  if (!mod) {
    failures.push({ eventId: event.id, message: `Unknown event kind "${event.kind}"` });
    return emptyCompiled(event.id);
  }

  const parsed = mod.schema.safeParse(event.config ?? {});
  if (!parsed.success) {
    failures.push({
      eventId: event.id,
      message: `"${event.name}" has invalid settings: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || 'config'} ${i.message}`)
        .join('; ')}`,
    });
    return emptyCompiled(event.id);
  }

  return mod.compile(event, parsed.data, ctx);
}

export * from './kit.js';
export { income, annualExpense, otherExpense, windfall, buyAHome };
export { careerBreak, newJob, retirement, socialSecurity, endOfPlan, haveAKid };
