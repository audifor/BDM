import type { PlayerId, TeamId } from '@/domain/ids'
import { negotiationIdForOpening, type ContractNegotiation, type NegotiationRole } from '@/domain/market'
import { isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { createNegotiationContact as createContactInEngine, openNegotiation } from '@/engine/market'
import { resolveOfferExecutionResponsibility } from '@/engine/market/NegotiationOfferAuthority'

/**
 * The manager may approach any free agent of the loaded universe. The detected needs of the squad are a recommendation only:
 * this path never reads them, so a player nobody recommended can still receive a contact and a formal offer. Everything after
 * the contact (player response, counter, Governance, Finance, signing) is the one canonical BS10 lifecycle.
 */
export const DIRECT_APPROACH_PLAN_PREFIX = 'user-direct-approach:'

export function isDirectApproachNegotiation(negotiation: Pick<ContractNegotiation, 'sourcePlanId'>): boolean {
  return negotiation.sourcePlanId?.startsWith(DIRECT_APPROACH_PLAN_PREFIX) === true
}

export type DirectFreeAgentContactStatus = 'CREATED' | 'ALREADY_EXISTS' | 'PLAYER_NOT_FREE_AGENT' | 'ACTIVE_NEGOTIATION_EXISTS' | 'NO_EXECUTION_OWNER' | 'BLOCKED'

export interface DirectFreeAgentContactResult {
  readonly status: DirectFreeAgentContactStatus
  readonly world: GameWorld
  readonly reason?: string
  readonly negotiation?: ContractNegotiation
}

function attemptGeneration(world: GameWorld, teamId: TeamId, playerId: PlayerId): number {
  return Object.values(world.negotiationsById).filter((item) => item.teamId === teamId && item.playerId === playerId
    && isDirectApproachNegotiation(item) && ['CLOSED', 'REJECTED', 'WITHDRAWN'].includes(item.status)).length
}

export function contactFreeAgentDirectly(world: GameWorld, teamId: TeamId, playerId: PlayerId): DirectFreeAgentContactResult {
  const team = world.teams[teamId]
  if (team === undefined) return { status: 'BLOCKED', world, reason: 'TEAM_NOT_FOUND' }
  if (world.players[playerId] === undefined) return { status: 'BLOCKED', world, reason: 'PLAYER_NOT_FOUND' }
  if (!isPlayerFreeAgent(world, playerId)) return { status: 'PLAYER_NOT_FREE_AGENT', world, reason: 'PLAYER_NOT_FREE_AGENT' }
  const generation = attemptGeneration(world, teamId, playerId)
  const actionKey = `direct-approach:${playerId}:${generation}`
  const id = negotiationIdForOpening({ organizationId: team.organizationId, teamId, playerId, actionKey })
  const existing = world.negotiationsById[id]
  if (existing !== undefined) return { status: 'ALREADY_EXISTS', world, negotiation: existing }
  const actor = resolveOfferExecutionResponsibility(world, teamId).owner
  if (actor?.kind !== 'USER') return { status: 'NO_EXECUTION_OWNER', world, reason: 'DIRECT_APPROACH_IS_A_MANAGER_DECISION' }
  const result = createContactInEngine(world, {
    organizationId: team.organizationId,
    teamId,
    playerId,
    startedOn: world.currentDate,
    actionKey,
    responsibleActor: { kind: 'USER' },
    sourcePlanId: `${DIRECT_APPROACH_PLAN_PREFIX}${teamId}`,
    sourceProposalId: `${DIRECT_APPROACH_PLAN_PREFIX}${teamId}:${playerId}:${generation}`,
  })
  return { status: result.status, world: result.world, ...('reason' in result ? { reason: result.reason } : { negotiation: result.contact }) }
}

export interface CustomFreeAgentOfferInput {
  readonly teamId: TeamId
  readonly negotiationId: string
  readonly salary: number
  readonly years: number
  readonly role?: NegotiationRole
}

export type CustomFreeAgentOfferStatus = 'SUBMITTED' | 'ALREADY_SUBMITTED' | 'NOT_DIRECT_APPROACH' | 'CONTACT_NOT_POSITIVE' | 'PLAYER_NOT_FREE_AGENT' | 'INVALID_TERMS' | 'FINANCIAL_BLOCK' | 'NO_EXECUTION_OWNER' | 'LIFECYCLE_CONFLICT' | 'BLOCKED'

export interface CustomFreeAgentOfferResult {
  readonly status: CustomFreeAgentOfferStatus
  readonly world: GameWorld
  readonly reason?: string
  readonly negotiation?: ContractNegotiation
}

/** Submits the manager's own formal terms. Finance is evaluated by the engine at the moment the offer is recorded. */
export function submitCustomFreeAgentOffer(world: GameWorld, input: CustomFreeAgentOfferInput): CustomFreeAgentOfferResult {
  const team = world.teams[input.teamId]
  const existing = world.negotiationsById[input.negotiationId]
  if (team === undefined || existing === undefined || existing.teamId !== input.teamId || existing.organizationId !== team.organizationId) {
    return { status: 'LIFECYCLE_CONFLICT', world, reason: 'NEGOTIATION_NOT_FOUND_FOR_TEAM' }
  }
  if (!isDirectApproachNegotiation(existing) || existing.actionKey === undefined || existing.sourcePlanId === undefined || existing.sourceProposalId === undefined) {
    return { status: 'NOT_DIRECT_APPROACH', world, negotiation: existing, reason: 'NEGOTIATION_IS_NOT_A_DIRECT_APPROACH' }
  }
  if (!Number.isSafeInteger(input.salary) || input.salary < 1 || input.salary > 100_000_000 || !Number.isSafeInteger(input.years) || input.years < 1 || input.years > 10) {
    return { status: 'INVALID_TERMS', world, negotiation: existing, reason: 'SALARY_OR_YEARS_INVALID' }
  }
  if (existing.status === 'OPEN' && existing.salary === input.salary && existing.years === input.years && existing.role === input.role) {
    return { status: 'ALREADY_SUBMITTED', world, negotiation: existing }
  }
  if (existing.status !== 'CONTACTED') return { status: 'LIFECYCLE_CONFLICT', world, negotiation: existing, reason: `NEGOTIATION_ALREADY_${existing.status}` }
  if (!isPlayerFreeAgent(world, existing.playerId)) return { status: 'PLAYER_NOT_FREE_AGENT', world, negotiation: existing, reason: 'PLAYER_NO_LONGER_FREE_AGENT' }
  if (existing.contactResponse?.outcome !== 'OPEN_TO_TALKS') return { status: 'CONTACT_NOT_POSITIVE', world, negotiation: existing, reason: 'CONTACT_RESPONSE_NOT_OPEN_TO_TALKS' }
  if (resolveOfferExecutionResponsibility(world, input.teamId).owner?.kind !== 'USER') return { status: 'NO_EXECUTION_OWNER', world, negotiation: existing, reason: 'NO_CURRENT_FORMAL_OFFER_OWNER' }
  try {
    const next = openNegotiation(world, {
      organizationId: team.organizationId,
      teamId: input.teamId,
      playerId: existing.playerId,
      ...(existing.agentId === undefined ? {} : { agentId: existing.agentId }),
      salary: input.salary,
      years: input.years,
      ...(input.role === undefined ? {} : { role: input.role }),
      actionKey: existing.actionKey,
      sourcePlanId: existing.sourcePlanId,
      sourceProposalId: existing.sourceProposalId,
      offerResponsibleActor: { kind: 'USER' },
    })
    const negotiation = next.negotiationsById[input.negotiationId]
    if (negotiation?.status !== 'OPEN') return { status: 'BLOCKED', world, reason: 'ENGINE_DID_NOT_CREATE_OPEN_OFFER' }
    return { status: 'SUBMITTED', world: next, negotiation }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      status: reason.includes('cannot afford') ? 'FINANCIAL_BLOCK' : reason.includes('no longer a free agent') ? 'PLAYER_NOT_FREE_AGENT' : 'BLOCKED',
      world, negotiation: existing, reason,
    }
  }
}
