import type { Responsibility } from '@/domain/responsibility'
import type { StaffPersonId } from '@/domain/ids'
import { getUserCoach, type GameWorld } from '@/domain/world'
import {
  createStaffHumanEvent,
  staffHumanContextIdFor,
  SYSTEMIC_ATTRIBUTION,
  type StaffHumanEventAttribution,
  type StaffHumanEventKind,
} from '@/domain/staffHumanState'
import { applyStaffHumanEvent } from '@/engine/staff/StaffHumanReactionEngine'

/**
 * Wave 5A §17 — hooked directly from `setTeamResponsibility` (the sole canonical Responsibility
 * Application boundary). Diffs `before`/`after` for the SAME (team, kind) row and emits exactly
 * one idempotent Human Event for the real transition that occurred. Never fabricates scope
 * changes that have no canonical signal (§17 "No inferir ni fabricar scope changes ficticios").
 */
export function emitResponsibilityTransitionEvents(world: GameWorld, before: Responsibility | undefined, after: Responsibility): GameWorld {
  const transition = classifyTransition(before, after)
  if (transition === undefined) return world

  const { staffId, kind } = transition
  const context = mostRecentContextFor(world, staffId)
  if (context === undefined) return world // no Human Context yet (e.g. Staff appointed same day, context not yet ensured) — the daily pipeline will create it and this transition is not retroactively fabricated

  const attribution = resolveAttribution(world)
  const sourceEventId = `responsibility:${after.id}:${transitionRevision(before, after)}`
  const event = createStaffHumanEvent({
    id: `event:${sourceEventId}:${transition.kind}`,
    kind: transition.kind,
    staffId,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance: transitionImportance(transition.kind),
    sourceEventId,
    attribution,
    payload: { responsibilityKind: after.kind, mode: after.mode },
  })
  return applyStaffHumanEvent(world, context, event).world
}

interface Transition {
  readonly staffId: StaffPersonId
  readonly kind: StaffHumanEventKind
}

function classifyTransition(before: Responsibility | undefined, after: Responsibility): Transition | undefined {
  const beforeHolder = before?.holderStaffId
  const afterHolder = after.holderStaffId
  const beforeMode = before?.mode
  const afterMode = after.mode

  if (beforeHolder === undefined && afterHolder !== undefined) return { staffId: afterHolder, kind: 'responsibilityGranted' }
  if (beforeHolder !== undefined && afterHolder === undefined) return { staffId: beforeHolder, kind: 'responsibilityRemoved' }
  if (beforeHolder !== undefined && afterHolder !== undefined && beforeHolder !== afterHolder) return { staffId: beforeHolder, kind: 'responsibilityReassignedAway' }
  if (beforeHolder !== undefined && afterHolder !== undefined && beforeHolder === afterHolder && beforeMode !== afterMode) {
    // advisory -> delegated normally improves autonomy; delegated -> advisory can reduce it (§17).
    if (beforeMode === 'advisory' && afterMode === 'delegated') return { staffId: afterHolder, kind: 'responsibilityModeIncreased' }
    if (beforeMode === 'delegated' && afterMode === 'advisory') return { staffId: afterHolder, kind: 'responsibilityModeReduced' }
  }
  return undefined
}

/** Reassignment-away also grants the NEW holder a distinct event, when there is one — modeled as a second call from the caller rather than doubling up here, since one (before,after) diff only carries one holder transition per invocation cleanly. Kept intentionally simple: only the losing holder's event fires from a single diff; the gaining holder's `responsibilityGranted`/`responsibilityReassignedToStaff` needs the OLD holder to be known, which `classifyTransition` above does not lose — see emitResponsibilityTransitionEvents call site below for the second emission. */
export function emitReassignmentGainEvent(world: GameWorld, before: Responsibility | undefined, after: Responsibility): GameWorld {
  const beforeHolder = before?.holderStaffId
  const afterHolder = after.holderStaffId
  if (beforeHolder === undefined || afterHolder === undefined || beforeHolder === afterHolder) return world
  const context = mostRecentContextFor(world, afterHolder)
  if (context === undefined) return world
  const attribution = resolveAttribution(world)
  const sourceEventId = `responsibility:${after.id}:${transitionRevision(before, after)}:gain`
  const event = createStaffHumanEvent({
    id: `event:${sourceEventId}:responsibilityReassignedToStaff`,
    kind: 'responsibilityReassignedToStaff',
    staffId: afterHolder,
    contextId: context.id,
    occurredOn: world.currentDate,
    importance: 'MEANINGFUL',
    sourceEventId,
    attribution,
    payload: { responsibilityKind: after.kind, mode: after.mode },
  })
  return applyStaffHumanEvent(world, context, event).world
}

function transitionImportance(kind: StaffHumanEventKind): 'ROUTINE' | 'MEANINGFUL' | 'IMPORTANT' | 'CRITICAL' {
  if (kind === 'responsibilityGranted' || kind === 'responsibilityRemoved' || kind === 'responsibilityReassignedAway') return 'IMPORTANT'
  return 'MEANINGFUL'
}

/** Deterministic revision marker so re-applying the exact same (before,after) pair twice in the same day is idempotent, while a genuinely new transition on the same responsibility later gets a distinct source id. */
function transitionRevision(before: Responsibility | undefined, after: Responsibility): string {
  return `${before?.mode ?? 'none'}:${before?.holderStaffId ?? 'none'}->${after.mode}:${after.holderStaffId ?? 'none'}`
}

function mostRecentContextFor(world: GameWorld, staffId: string) {
  return Object.values(world.staffHumanContextsById)
    .filter((context) => context.staffId === staffId && context.endedOn === undefined)
    .sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
}

/** Responsibility changes are made by the user coach in the current UI — the only real decision-maker seam that exists today for this boundary. A future GM/executive seam can supply richer attribution without changing this module's contract. */
function resolveAttribution(world: GameWorld): StaffHumanEventAttribution {
  try {
    const coach = getUserCoach(world)
    return { actorKind: 'USER_COACH', actorId: coach.id }
  } catch {
    return SYSTEMIC_ATTRIBUTION
  }
}
