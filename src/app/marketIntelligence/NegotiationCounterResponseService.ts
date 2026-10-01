import { type ContractNegotiation, type FormalOfferClubAction, type NegotiationResponsibleActor, type NegotiationTermSet } from '@/domain/market'
import type { TeamId } from '@/domain/ids'
import { canTeamAffordAdditionalSalary, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { respondToNegotiationCounter as applyNegotiationCounterResponse } from '@/engine/market'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'
import { resolveOfferExecutionResponsibility } from '@/engine/market/NegotiationOfferAuthority'

export type ClubCounterDecision =
  | { readonly kind: 'ACCEPT_COUNTER' }
  | { readonly kind: 'DECLINE_COUNTER' }
  | { readonly kind: 'REVISE_OFFER'; readonly terms: NegotiationTermSet }

export interface RespondToNegotiationCounterRequest {
  readonly teamId: TeamId
  readonly negotiationId: string
  readonly expectedRound: number
  readonly decision: ClubCounterDecision
}

export type ClubCounterDecisionStatus =
  | 'APPLIED'
  | 'ALREADY_APPLIED'
  | 'NO_EXECUTION_OWNER'
  | 'PLAYER_NOT_FREE_AGENT'
  | 'FINANCIAL_BLOCK'
  | 'LIFECYCLE_CONFLICT'
  | 'BLOCKED'

export interface ClubCounterDecisionResult {
  readonly status: ClubCounterDecisionStatus
  readonly world: GameWorld
  readonly negotiation?: ContractNegotiation
  readonly reason?: string
}

/** Applies an explicit user decision or a current, bounded AI decision to one canonical counter. */
export function respondToNegotiationCounter(world: GameWorld, request: RespondToNegotiationCounterRequest): ClubCounterDecisionResult {
  const negotiation = world.negotiationsById[request.negotiationId]
  if (negotiation === undefined || negotiation.teamId !== request.teamId) return { status: 'LIFECYCLE_CONFLICT', world, reason: 'NEGOTIATION_NOT_FOUND_FOR_TEAM' }
  const team = world.teams[request.teamId]
  if (team === undefined) return { status: 'BLOCKED', world, reason: 'TEAM_NOT_FOUND' }

  const prior = findPriorExactAction(negotiation, request)
  if (prior !== undefined) return { status: 'ALREADY_APPLIED', world, negotiation }
  if (negotiation.status !== 'COUNTERED' || negotiation.round !== request.expectedRound) {
    return { status: 'LIFECYCLE_CONFLICT', world, negotiation, reason: 'COUNTER_OR_ROUND_IS_STALE' }
  }
  if (!isPlayerFreeAgent(world, negotiation.playerId)) {
    const closedWorld = applyNegotiationCounterResponse(world, {
      negotiationId: negotiation.id,
      teamId: request.teamId,
      expectedRound: request.expectedRound,
      action: { kind: 'DECLINE_COUNTER' },
      actor: { kind: 'USER' },
    })
    return { status: 'PLAYER_NOT_FREE_AGENT', world: closedWorld, negotiation: closedWorld.negotiationsById[negotiation.id], reason: 'PLAYER_NO_LONGER_FREE_AGENT' }
  }

  const actor = resolveActor(world, request.teamId)
  if (actor === undefined) return { status: 'NO_EXECUTION_OWNER', world, negotiation, reason: 'NO_CURRENT_NEGOTIATION_EXECUTOR' }
  const engineAction = request.decision.kind === 'REVISE_OFFER'
    ? { kind: 'REVISE_OFFER' as const, terms: request.decision.terms }
    : { kind: request.decision.kind, }
  try {
    const next = applyNegotiationCounterResponse(world, {
      negotiationId: negotiation.id,
      teamId: request.teamId,
      expectedRound: request.expectedRound,
      action: engineAction,
      actor,
    })
    return { status: 'APPLIED', world: next, negotiation: next.negotiationsById[negotiation.id] }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const status: ClubCounterDecisionStatus = reason.includes('no longer a free agent')
      ? 'PLAYER_NOT_FREE_AGENT'
      : reason.includes('cannot afford')
        ? 'FINANCIAL_BLOCK'
        : reason.includes('authorized')
          ? 'NO_EXECUTION_OWNER'
          : reason.includes('stale') || reason.includes('canonical')
            ? 'LIFECYCLE_CONFLICT'
            : 'BLOCKED'
    return { status, world, negotiation, reason }
  }
}

/** A bounded post-response application checkpoint; it never polls GM planning globally. */
export function progressAiNegotiationCounterResponses(world: GameWorld): { readonly world: GameWorld; readonly results: readonly ClubCounterDecisionResult[] } {
  let current = world
  const pending = Object.values(world.negotiationsById)
    .filter((item) => item.status === 'COUNTERED' && item.teamId !== undefined && current.teams[item.teamId]?.coachId !== current.userCoachId)
    .sort((a, b) => a.id.localeCompare(b.id))
  const results: ClubCounterDecisionResult[] = []
  for (const negotiation of pending) {
    const latest = current.negotiationsById[negotiation.id]
    if (latest?.status !== 'COUNTERED' || latest.teamId === undefined) continue
    const executor = resolveActor(current, latest.teamId)
    if (executor === undefined) continue
    const currentProposal = assessRoutedFreeAgentOfferIntelligence(current, latest.teamId)
      .some((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.playerId === latest.playerId
        && offer.sourcePlanId === latest.sourcePlanId && offer.sourceProposalId === latest.sourceProposalId)
    const canAccept = currentProposal && isPlayerFreeAgent(current, latest.playerId)
      && canTeamAffordAdditionalSalary(current, latest.teamId, latest.salary)
    results.push(respondToNegotiationCounter(current, {
      teamId: latest.teamId,
      negotiationId: latest.id,
      expectedRound: latest.round,
      decision: canAccept ? { kind: 'ACCEPT_COUNTER' } : { kind: 'DECLINE_COUNTER' },
    }))
    current = results[results.length - 1]!.world
  }
  return { world: current, results: Object.freeze(results) }
}

function resolveActor(world: GameWorld, teamId: TeamId): NegotiationResponsibleActor | undefined {
  const responsibility = resolveOfferExecutionResponsibility(world, teamId)
  if (responsibility.owner?.kind === 'USER') return { kind: 'USER' }
  if (responsibility.owner?.kind === 'STAFF') return { kind: 'STAFF', staffPersonId: responsibility.owner.staffPersonId }
  return undefined
}

function findPriorExactAction(negotiation: ContractNegotiation, request: RespondToNegotiationCounterRequest): FormalOfferClubAction | undefined {
  const expectedOutcome: FormalOfferClubAction['outcome'] = request.decision.kind === 'ACCEPT_COUNTER' ? 'ACCEPTED_COUNTER'
    : request.decision.kind === 'DECLINE_COUNTER' ? 'DECLINED_COUNTER' : 'REVISED_OFFER'
  const action = [...(negotiation.roundHistory ?? [])].reverse().map((entry) => entry.clubAction)
    .find((entry) => entry?.round === request.expectedRound)
  const lastAction = action ?? negotiation.clubAction
  if (lastAction?.round !== request.expectedRound || lastAction.outcome !== expectedOutcome) return undefined
  if (request.decision.kind === 'REVISE_OFFER' && !sameTerms(lastAction.revisedTerms, request.decision.terms)) return undefined
  return lastAction
}

function sameTerms(a: NegotiationTermSet | undefined, b: NegotiationTermSet): boolean {
  return a?.salary === b.salary && a.years === b.years && a.role === b.role && a.agentFee === b.agentFee
}
