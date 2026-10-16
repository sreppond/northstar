/**
 * Resolving an `Anchor` to a calendar year (docs/REDESIGN-V4.md §1.7).
 *
 * Deliberately forgiving: an anchor to an event that is excluded or gone, or
 * to a person who is excluded or gone, resolves to `undefined` and the caller
 * decides what "never" means for it — a line that would START then never
 * starts; a line that would END then runs on. That is what makes switching a
 * home purchase off read correctly: the rent that was to stop when you bought
 * simply keeps going.
 */
import { z } from 'zod';
import type { Anchor, Participant, PlanEvent } from './types.js';

export const anchorSchema = z.union([
  z.object({ kind: z.literal('year'), year: z.number().int() }),
  z.object({ kind: z.literal('event'), eventId: z.string(), offset: z.number().int().optional() }),
  z.object({ kind: z.literal('age'), participantId: z.string(), age: z.number().int().min(0) }),
]);

export interface AnchorScope {
  events: Pick<PlanEvent, 'id' | 'startYear' | 'isIncluded'>[];
  participants: Pick<Participant, 'id' | 'birthYear' | 'isIncluded'>[];
}

export function resolveAnchor(anchor: Anchor, scope: AnchorScope): number | undefined {
  switch (anchor.kind) {
    case 'year':
      return anchor.year;
    case 'event': {
      const event = scope.events.find((e) => e.id === anchor.eventId && e.isIncluded);
      return event ? event.startYear + (anchor.offset ?? 0) : undefined;
    }
    case 'age': {
      const person = scope.participants.find((p) => p.id === anchor.participantId && p.isIncluded);
      return person ? person.birthYear + anchor.age : undefined;
    }
  }
}
