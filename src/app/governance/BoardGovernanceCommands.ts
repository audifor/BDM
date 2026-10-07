import { deriveGovernanceDecisionStatus, resolveGovernanceDecisionRights, type GovernanceActor, type GovernanceDecision, type GovernanceDecisionStatus } from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

import { executeGovernanceCoachFiringDecision } from './GovernanceDecisionExecutionService'
import { recordPlayerContractSigningDecisionEvent } from './PlayerContractSigningGovernanceService'
import { recordTradeCommitmentEvent } from '@/app/trades'

/**
 * MX0.7 — club-scoped application commands for canonical Governance decisions.
 *
 * The manager surface never mutates governance state itself: each command resolves the club's own
 * institution and then delegates to the canonical per-type service that owns that decision's rules
 * (contract signing, trade commitment) or to the canonical execution service. Those services keep
 * their own authority, lifecycle and consequence logic; this layer only adds club scoping, the
 * user's appointment check, and a stable reason vocabulary for the UI. Decision types without a
 * canonical command stay read-only and are reported as such.
 */

export const GOVERNANCE_COMMAND_REASONS = [
  'UNKNOWN_TEAM',
  'DECISION_NOT_FOUND',
  'NOT_CLUB_DECISION',
  'DECISION_ALREADY_TERMINAL',
  'DECISION_TYPE_NOT_ACTIONABLE',
  'BODY_NOT_USER_APPOINTED',
  'CANONICAL_COMMAND_REFUSED',
] as const
export type GovernanceCommandReason = (typeof GOVERNANCE_COMMAND_REASONS)[number]

export type GovernanceDecisionEventChoice = 'APPROVED' | 'REJECTED' | 'VETOED'

/**
 * Decision types whose event recording has a canonical application command. Types outside this table
 * are owned by canon elsewhere (for example a `COACH_FIRING` approval comes from the board-side
 * evaluation flow), so the manager surface shows them read-only instead of inventing an event.
 */
export const GOVERNANCE_EVENT_COMMAND_DECISION_TYPES: readonly GovernanceDecision['decisionType'][] = ['PLAYER_CONTRACT_SIGNING', 'PLAYER_TRADE_COMMITMENT']

export function governanceDecisionTypeHasEventCommand(decisionType: GovernanceDecision['decisionType']): boolean {
  return GOVERNANCE_EVENT_COMMAND_DECISION_TYPES.includes(decisionType)
}

export interface GovernanceCommandResult {
  readonly status: 'APPLIED' | 'BLOCKED'
  readonly world: GameWorld
  readonly decisionId: string
  readonly reasons: readonly GovernanceCommandReason[]
  /** The canonical service's own status, passed through unmodified. */
  readonly canonicalStatus: string | null
  /** The canonical service's own reason code(s), passed through unmodified. */
  readonly canonicalReasons: readonly string[]
  readonly decisionStatus: GovernanceDecisionStatus | undefined
}

export interface RecordClubGovernanceDecisionEventInput {
  readonly teamId: TeamId
  readonly decisionId: string
  readonly kind: GovernanceDecisionEventChoice
  readonly bodyId: string
}

export interface ExecuteClubGovernanceDecisionInput {
  readonly teamId: TeamId
  readonly decisionId: string
  readonly executorBodyId: string
}

const TERMINAL_STATUSES: readonly GovernanceDecisionStatus[] = ['REJECTED', 'VETOED', 'WITHDRAWN', 'EXECUTED']

function blocked(world: GameWorld, decisionId: string, reason: GovernanceCommandReason, canonicalReasons: readonly string[] = []): GovernanceCommandResult {
  return Object.freeze({ status: 'BLOCKED', world, decisionId, reasons: Object.freeze([reason]), canonicalStatus: null, canonicalReasons: Object.freeze([...canonicalReasons]), decisionStatus: undefined })
}

function resolveClubDecision(
  world: GameWorld,
  teamId: TeamId,
  decisionId: string,
): { readonly decision: GovernanceDecision; readonly decisionStatus: GovernanceDecisionStatus | undefined } | { readonly reason: GovernanceCommandReason } {
  const team = world.teams[teamId]
  if (team === undefined) return { reason: 'UNKNOWN_TEAM' }
  const decision = world.governanceDecisionsById[decisionId]
  if (decision === undefined) return { reason: 'DECISION_NOT_FOUND' }
  const institution = world.governanceInstitutionsById[decision.institutionId]
  if (institution === undefined || !institution.teamIds.includes(teamId)) return { reason: 'NOT_CLUB_DECISION' }
  const rights = resolveGovernanceDecisionRights({
    decisionType: decision.decisionType,
    institutionId: decision.institutionId,
    asOfDate: decision.proposedOn,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
  return { decision, decisionStatus: deriveGovernanceDecisionStatus(events, rights.approverBodyIds) }
}

function isActiveUserAppointee(world: GameWorld, bodyId: string, asOf = world.currentDate): boolean {
  return Object.values(world.governanceAppointmentsById).some(
    (appointment) =>
      appointment.bodyId === bodyId &&
      appointment.actor.kind === 'COACH' &&
      appointment.actor.id === world.userCoachId &&
      appointment.startedOn <= asOf &&
      (appointment.endedOn === undefined || appointment.endedOn >= asOf),
  )
}

function userActor(world: GameWorld): GovernanceActor {
  return { kind: 'COACH', id: world.userCoachId }
}

function applied(world: GameWorld, decisionId: string, canonicalStatus: string, canonicalReasons: readonly string[], decisionStatus: GovernanceDecisionStatus | undefined): GovernanceCommandResult {
  return Object.freeze({ status: 'APPLIED', world, decisionId, reasons: Object.freeze([]), canonicalStatus, canonicalReasons: Object.freeze([...canonicalReasons]), decisionStatus })
}

/**
 * Canonical per-type outcomes that represent a recorded decision event (an approval, a rejection, a
 * veto, a withdrawal or a completed consequence) rather than a refusal.
 */
const SIGNING_RECORDED_STATUSES: readonly string[] = ['APPROVED', 'REQUIRES_APPROVAL', 'SIGNED', 'ALREADY_SIGNED', 'REJECTED', 'VETOED', 'WITHDRAWN']
const TRADE_RECORDED_STATUSES: readonly string[] = ['APPROVED', 'REQUIRES_APPROVAL', 'READY_TO_EXECUTE', 'EXECUTED', 'ALREADY_EXECUTED', 'REJECTED', 'VETOED', 'WITHDRAWN']

/**
 * Translates one canonical per-type outcome into the club command result. A status the type records,
 * or any world the canonical service actually changed, counts as applied; a refusal keeps the input
 * world reference so the caller cannot mistake it for a mutation.
 */
function fromCanonical(
  world: GameWorld,
  canonicalWorld: GameWorld,
  decisionId: string,
  canonicalStatus: string,
  canonicalReasons: readonly string[],
  recordedStatuses: readonly string[],
): GovernanceCommandResult {
  const status = decisionStatusOfId(canonicalWorld, decisionId)
  if (recordedStatuses.includes(canonicalStatus) || canonicalWorld !== world) return applied(canonicalWorld, decisionId, canonicalStatus, canonicalReasons, status)
  return blocked(world, decisionId, canonicalStatus === 'NO_AUTHORITY' ? 'BODY_NOT_USER_APPOINTED' : 'CANONICAL_COMMAND_REFUSED', [canonicalStatus, ...canonicalReasons])
}

function decisionStatusOfId(world: GameWorld, decisionId: string): GovernanceDecisionStatus | undefined {
  const decision = world.governanceDecisionsById[decisionId]
  return decision === undefined ? undefined : decisionStatusOf(world, decision)
}

/**
 * Records one real governance decision event as the user coach's active appointment in `bodyId`.
 * The per-type service performs every authority, lifecycle and consequence check; a type without a
 * canonical command is reported as `DECISION_TYPE_NOT_ACTIONABLE` instead of being implemented here.
 */
export function recordClubGovernanceDecisionEvent(world: GameWorld, input: RecordClubGovernanceDecisionEventInput): GovernanceCommandResult {
  const resolved = resolveClubDecision(world, input.teamId, input.decisionId)
  if ('reason' in resolved) return blocked(world, input.decisionId, resolved.reason)
  const { decision, decisionStatus } = resolved
  if (decisionStatus !== undefined && TERMINAL_STATUSES.includes(decisionStatus)) return blocked(world, input.decisionId, 'DECISION_ALREADY_TERMINAL')
  if (!isActiveUserAppointee(world, input.bodyId)) return blocked(world, input.decisionId, 'BODY_NOT_USER_APPOINTED')
  if (!governanceDecisionTypeHasEventCommand(decision.decisionType)) return blocked(world, decision.id, 'DECISION_TYPE_NOT_ACTIONABLE')

  if (decision.decisionType === 'PLAYER_CONTRACT_SIGNING') {
    const result = recordPlayerContractSigningDecisionEvent(world, { decisionId: decision.id, kind: input.kind, bodyId: input.bodyId, actor: userActor(world) })
    return fromCanonical(world, result.world, decision.id, result.status, result.reason === undefined ? [] : [result.reason], SIGNING_RECORDED_STATUSES)
  }

  if (decision.decisionType === 'PLAYER_TRADE_COMMITMENT') {
    const result = recordTradeCommitmentEvent(world, { decisionId: decision.id, kind: input.kind, bodyId: input.bodyId, actor: userActor(world) })
    return fromCanonical(world, result.world, decision.id, result.status, result.reasons, TRADE_RECORDED_STATUSES)
  }

  return blocked(world, decision.id, 'DECISION_TYPE_NOT_ACTIONABLE')
}

/** Executes a decision whose canonical execution command exists (`COACH_FIRING`); every other type stays read-only. */
export function executeClubGovernanceDecision(world: GameWorld, input: ExecuteClubGovernanceDecisionInput): GovernanceCommandResult {
  const resolved = resolveClubDecision(world, input.teamId, input.decisionId)
  if ('reason' in resolved) return blocked(world, input.decisionId, resolved.reason)
  const { decision, decisionStatus } = resolved
  if (decisionStatus !== undefined && TERMINAL_STATUSES.includes(decisionStatus)) return blocked(world, input.decisionId, 'DECISION_ALREADY_TERMINAL')
  if (!isActiveUserAppointee(world, input.executorBodyId)) return blocked(world, input.decisionId, 'BODY_NOT_USER_APPOINTED')
  if (decision.decisionType !== 'COACH_FIRING') return blocked(world, input.decisionId, 'DECISION_TYPE_NOT_ACTIONABLE')

  try {
    const executed = executeGovernanceCoachFiringDecision(world, { decisionId: decision.id, executorBodyId: input.executorBodyId, effectiveOn: world.currentDate })
    return applied(executed.world, decision.id, 'EXECUTED', [], decisionStatusOfId(executed.world, decision.id))
  } catch (error) {
    return blocked(world, decision.id, 'CANONICAL_COMMAND_REFUSED', [error instanceof Error ? error.message : String(error)])
  }
}

function decisionStatusOf(world: GameWorld, decision: GovernanceDecision): GovernanceDecisionStatus | undefined {
  const rights = resolveGovernanceDecisionRights({
    decisionType: decision.decisionType,
    institutionId: decision.institutionId,
    asOfDate: decision.proposedOn,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
  return deriveGovernanceDecisionStatus(events, rights.approverBodyIds)
}

/** Presentation text for the app-level reason codes only; canonical reasons are shown verbatim. */
export const GOVERNANCE_COMMAND_REASON_TEXT: Readonly<Record<GovernanceCommandReason, string>> = Object.freeze({
  UNKNOWN_TEAM: 'No club is assigned to the user coach.',
  DECISION_NOT_FOUND: 'That governance decision no longer exists.',
  NOT_CLUB_DECISION: 'That decision belongs to another club institution.',
  DECISION_ALREADY_TERMINAL: 'That decision is already resolved.',
  DECISION_TYPE_NOT_ACTIONABLE: 'This decision type has no canonical command yet, so it is shown read-only.',
  BODY_NOT_USER_APPOINTED: 'The user coach holds no active appointment in that governing body.',
  CANONICAL_COMMAND_REFUSED: 'The canonical governance command refused this action; its own reason is shown below.',
})
