import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { getMarketKnowledge } from '@/domain/market'
import { organizationIdForTeam, type PlayerId, type TeamId } from '@/domain/ids'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome, type DelegationOutcomeId, type ResponsibilityKind } from '@/domain/responsibility'
import { getActivePlayerContract, getEcosystemForTeam, getTeamFinancialSnapshot, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { basketballOperationsQuality, resolveAdvisoryResponsibility } from '@/engine/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { executeTrade, validateTrade } from '@/engine/trade'

const KINDS = ['recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation'] as const

/** Advisory only: candidate discovery is restricted to organization knowledge and known market signals. */
export function progressBasketballOperationsAdvisories(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, id) => KINDS.reduce((current, kind) => record(current, id as TeamId, kind), next), world)
}

function record(world: GameWorld, teamId: TeamId, kind: typeof KINDS[number]): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, kind)
  if (resolution === undefined) return world
  const id = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${kind}:${world.currentDate}`)
  if (world.delegationOutcomesById[id] !== undefined) return world
  const organizationId = organizationIdForTeam(teamId)
  const candidates = [...new Set(world.organizationKnowledge.filter((item) => item.organizationId === organizationId && !world.teams[teamId]!.rosterPlayerIds.includes(item.subjectPlayerId) && world.players[item.subjectPlayerId] !== undefined).map((item) => item.subjectPlayerId))]
    .sort((a, b) => need(world, teamId, world.players[b]!.basketball.primaryPosition) - need(world, teamId, world.players[a]!.basketball.primaryPosition) || value(world, organizationId, b, kind === 'tradeRecommendation' ? 'TRADE' : 'FREE_AGENCY') - value(world, organizationId, a, kind === 'tradeRecommendation' ? 'TRADE' : 'FREE_AGENCY') || a.localeCompare(b))
  const qualityScore = basketballOperationsQuality(resolution.context, `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`)
  const bounded = Math.min(candidates.length, qualityScore >= 70 ? 3 : qualityScore >= 40 ? 5 : 8)
  const candidate = bounded === 0 ? undefined : candidates[new SeededRandomSource(hashStringToSeed(`staff-basketball-ops:${resolution.responsibilityId}:${world.currentDate}`)).nextInt(0, bounded - 1)]
  const finance = getTeamFinancialSnapshot(world, teamId)
  let payload: Record<string, string | number | boolean> | undefined
  if (kind === 'recommendSignings' && candidate !== undefined && isPlayerFreeAgent(world, candidate)) {
    const market = getMarketKnowledge(world.marketKnowledge, organizationId, candidate)
    if (market?.availability !== undefined && market.availability !== 'NOT_FOR_SALE' && market.expectedSalary !== undefined && market.expectedSalary <= finance.remainingPlayerSalaryBudget) payload = { teamId, playerId: candidate, rank: 1, candidateCount: bounded, confidence: certainty(world, organizationId, candidate, 'FREE_AGENCY'), affordable: true, expectedSalary: market.expectedSalary }
  } else if (kind === 'shortlistPlayers' && candidate !== undefined) payload = { teamId, playerId: candidate, rank: 1, candidateCount: bounded, confidence: certainty(world, organizationId, candidate, 'FREE_AGENCY') }
  else if (kind === 'contractRecommendation') {
    const playerId = world.teams[teamId]!.rosterPlayerIds.slice().sort().find((player) => getActivePlayerContract(world, player) !== undefined)
    const contract = playerId === undefined ? undefined : getActivePlayerContract(world, playerId)
    if (playerId !== undefined && contract !== undefined) payload = { teamId, playerId, contractId: contract.id, recommendation: finance.remainingPlayerSalaryBudget < contract.compensation.annualSalary ? 'hold' : 'renew', annualSalary: contract.compensation.annualSalary, budgetStatus: finance.status }
  } else if (kind === 'tradeRecommendation' && candidate !== undefined) {
    const counterpart = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(candidate))
    const outgoing = world.teams[teamId]!.rosterPlayerIds.slice().sort().find((player) => getActivePlayerContract(world, player) !== undefined)
    const ecosystem = getEcosystemForTeam(world, teamId)
    if (counterpart !== undefined && outgoing !== undefined && ecosystem !== undefined && getMarketKnowledge(world.marketKnowledge, organizationId, candidate)?.availability !== 'NOT_FOR_SALE') {
      const proposal = { id: `staff-advisory:${teamId}:${outgoing}:${candidate}:${world.currentDate}`, ecosystemId: ecosystem.id, seasonId: world.currentSeasonId, participantTeamIds: [teamId, counterpart.id], movements: [{ asset: { kind: 'player' as const, playerId: outgoing }, fromTeamId: teamId, toTeamId: counterpart.id }, { asset: { kind: 'player' as const, playerId: candidate }, fromTeamId: counterpart.id, toTeamId: teamId }] }
      if (validateTrade(world, proposal).allowed) payload = { teamId, incomingPlayerId: candidate, outgoingPlayerId: outgoing, counterpartTeamId: counterpart.id, proposalId: proposal.id, rank: 1, candidateCount: bounded, confidence: certainty(world, organizationId, candidate, 'TRADE') }
    }
  }
  if (payload === undefined) return world
  const outcome = createDelegationOutcome({ id, responsibilityId: resolution.responsibilityId, staffId: resolution.staffId, decidedOn: world.currentDate, kind: kind as ResponsibilityKind, applied: false, qualityScore, payload })
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [id]: outcome } }
}
function evaluation(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return deriveOrganizationPlayerValuation({ organizationId, playerId, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context, publicPosition: world.players[playerId]!.basketball.primaryPosition, policy: world.organizationEvaluationPoliciesById[organizationId] }) }
function value(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return evaluation(world, organizationId, playerId, context).priorityScore }
function certainty(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return evaluation(world, organizationId, playerId, context).certainty }
function need(world: GameWorld, teamId: TeamId, position: string): number { return Math.max(0, 2 - world.teams[teamId]!.rosterPlayerIds.filter((id) => world.players[id]!.basketball.primaryPosition === position).length) }

export type AcceptTradeRecommendationFailureReason = 'notFound' | 'invalidKind' | 'alreadyApplied' | 'malformedPayload' | 'staleRecommendation' | 'tradeEngineRejected'
export type AcceptTradeRecommendationResult = { readonly ok: true; readonly world: GameWorld } | { readonly ok: false; readonly reason: AcceptTradeRecommendationFailureReason }

/**
 * Sole canonical application seam for a `tradeRecommendation` advisory outcome (docs
 * §"tradeRecommendation" business rules, mirroring `acceptRecruitingRecommendation` /
 * `acceptMedicalRecommendation`). Rebuilds the exact two-team player-for-player proposal from the
 * frozen payload and revalidates it through the canonical `validateTrade`/`executeTrade` boundary
 * before applying — if ownership, contracts, roster membership, cap, finances or trade rules
 * changed materially since the recommendation was created, `executeTrade`'s own validation rejects
 * it atomically (no partial mutation) and this returns `tradeEngineRejected`. No roster/contract/
 * cap/finance mutation happens anywhere else in this module; this is the only mutating function.
 */
export function acceptTradeRecommendation(world: GameWorld, outcomeId: DelegationOutcomeId): AcceptTradeRecommendationResult {
  const outcome = world.delegationOutcomesById[outcomeId]
  if (outcome === undefined) return { ok: false, reason: 'notFound' }
  if (outcome.kind !== 'tradeRecommendation') return { ok: false, reason: 'invalidKind' }
  if (outcome.applied) return { ok: false, reason: 'alreadyApplied' }

  const { teamId, incomingPlayerId, outgoingPlayerId, counterpartTeamId, proposalId } = outcome.payload
  if (typeof teamId !== 'string' || typeof incomingPlayerId !== 'string' || typeof outgoingPlayerId !== 'string' || typeof counterpartTeamId !== 'string' || typeof proposalId !== 'string') return { ok: false, reason: 'malformedPayload' }

  const ecosystem = getEcosystemForTeam(world, teamId as TeamId)
  if (ecosystem === undefined) return { ok: false, reason: 'staleRecommendation' }
  const proposal = {
    id: proposalId,
    ecosystemId: ecosystem.id,
    seasonId: world.currentSeasonId,
    participantTeamIds: [teamId as TeamId, counterpartTeamId as TeamId],
    movements: [
      { asset: { kind: 'player' as const, playerId: outgoingPlayerId as PlayerId }, fromTeamId: teamId as TeamId, toTeamId: counterpartTeamId as TeamId },
      { asset: { kind: 'player' as const, playerId: incomingPlayerId as PlayerId }, fromTeamId: counterpartTeamId as TeamId, toTeamId: teamId as TeamId },
    ],
  }
  const result = executeTrade(world, proposal)
  if (!result.validation.allowed) return { ok: false, reason: 'tradeEngineRejected' }
  const updatedOutcome: DelegationOutcome = { ...outcome, applied: true }
  return { ok: true, world: { ...result.world, delegationOutcomesById: { ...result.world.delegationOutcomesById, [outcomeId]: updatedOutcome } } }
}
