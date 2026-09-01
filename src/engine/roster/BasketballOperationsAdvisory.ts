import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { getMarketKnowledge } from '@/domain/market'
import { organizationIdForTeam, type EcosystemId, type OrganizationId, type PlayerId, type SeasonId, type TeamId } from '@/domain/ids'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome, type DelegationOutcomeId, type ResponsibilityKind } from '@/domain/responsibility'
import { getActivePlayerContract, getEcosystemForTeam, getTeamFinancialSnapshot, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { basketballOperationsQuality, resolveAdvisoryResponsibility } from '@/engine/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import type { TradeProposal } from '@/domain/trade'
import { executeTrade, validateTrade } from '@/engine/trade'

const KINDS = ['recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation'] as const
const MAX_SHORTLIST = 8

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
  const qualityScore = basketballOperationsQuality(resolution.context, `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`)
  const rngSeed = `staff-basketball-ops:${resolution.responsibilityId}:${world.currentDate}`

  let payload: Record<string, string | number | boolean> | undefined
  if (kind === 'recommendSignings') payload = recommendSignings(world, teamId, organizationId, qualityScore, rngSeed)
  else if (kind === 'shortlistPlayers') payload = shortlistPlayers(world, teamId, organizationId, qualityScore)
  else if (kind === 'contractRecommendation') payload = contractRecommendation(world, teamId, organizationId, qualityScore)
  else if (kind === 'tradeRecommendation') payload = tradeRecommendation(world, teamId, organizationId, qualityScore, rngSeed)

  if (payload === undefined) return world
  const outcome = createDelegationOutcome({ id, responsibilityId: resolution.responsibilityId, staffId: resolution.staffId, decidedOn: world.currentDate, kind: kind as ResponsibilityKind, applied: false, qualityScore, payload })
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [id]: outcome } }
}

/** Depth of the ranked/eligible window a quality band is allowed to draw a pick from. */
function candidateWindow(qualityScore: number): number {
  return qualityScore >= 70 ? 3 : qualityScore >= 40 ? 5 : 8
}

/** Known (via OrganizationKnowledge), currently unrostered-by-this-team candidate PlayerIds, ranked by need then valuation then id. Ranking only — no eligibility filtering here. */
function rankedKnownCandidates(world: GameWorld, teamId: TeamId, organizationId: OrganizationId, context: 'FREE_AGENCY' | 'TRADE'): PlayerId[] {
  return [...new Set(world.organizationKnowledge.filter((item) => item.organizationId === organizationId && !world.teams[teamId]!.rosterPlayerIds.includes(item.subjectPlayerId) && world.players[item.subjectPlayerId] !== undefined).map((item) => item.subjectPlayerId))]
    .sort((a, b) => need(world, teamId, world.players[b]!.basketball.primaryPosition) - need(world, teamId, world.players[a]!.basketball.primaryPosition) || value(world, organizationId, b, context) - value(world, organizationId, a, context) || a.localeCompare(b))
}

/** Own rostered, currently contracted players ranked from LEAST valuable/most expendable (surplus position, low valuation) to MOST valuable — the preferred order in which to offer assets away. */
function expendableOwnRoster(world: GameWorld, teamId: TeamId, organizationId: OrganizationId): PlayerId[] {
  return world.teams[teamId]!.rosterPlayerIds
    .filter((playerId) => getActivePlayerContract(world, playerId) !== undefined)
    .slice()
    .sort((a, b) => need(world, teamId, world.players[a]!.basketball.primaryPosition) - need(world, teamId, world.players[b]!.basketball.primaryPosition) || value(world, organizationId, a, 'TRADE') - value(world, organizationId, b, 'TRADE') || a.localeCompare(b))
}

/** Eligibility-first pick: filter to the eligible universe, THEN take the deterministic RNG pick from within the eligible ranked window (Blocker 5) — never rank-then-pick-then-check. */
function pickWithinEligibleWindow(eligible: readonly PlayerId[], qualityScore: number, seed: string): PlayerId | undefined {
  if (eligible.length === 0) return undefined
  const bounded = Math.min(eligible.length, candidateWindow(qualityScore))
  return eligible[new SeededRandomSource(hashStringToSeed(seed)).nextInt(0, bounded - 1)]
}

function recommendSignings(world: GameWorld, teamId: TeamId, organizationId: OrganizationId, qualityScore: number, rngSeed: string): Record<string, string | number | boolean> | undefined {
  const ranked = rankedKnownCandidates(world, teamId, organizationId, 'FREE_AGENCY')
  const finance = getTeamFinancialSnapshot(world, teamId)
  const eligible = ranked.filter((candidate) => {
    if (!isPlayerFreeAgent(world, candidate)) return false
    const market = getMarketKnowledge(world.marketKnowledge, organizationId, candidate)
    return market?.availability !== undefined && market.availability !== 'NOT_FOR_SALE' && market.expectedSalary !== undefined && market.expectedSalary <= finance.remainingPlayerSalaryBudget
  })
  const candidate = pickWithinEligibleWindow(eligible, qualityScore, `staff-basketball-ops:recommendSignings:${rngSeed}`)
  if (candidate === undefined) return undefined
  const market = getMarketKnowledge(world.marketKnowledge, organizationId, candidate)!
  return { teamId, playerId: candidate, rank: 1, candidateCount: Math.min(eligible.length, candidateWindow(qualityScore)), confidence: certainty(world, organizationId, candidate, 'FREE_AGENCY'), affordable: true, expectedSalary: market.expectedSalary! }
}

/** Bounded shortlist as flat indexed scalar fields (DelegationOutcome.payload allows only string|number|boolean values). No strict eligibility gate beyond known/unrostered, per spec §Blocker 5 (shortlistPlayers is intentionally advisory-broad, not a signable-now filter). */
function shortlistPlayers(world: GameWorld, teamId: TeamId, organizationId: OrganizationId, qualityScore: number): Record<string, string | number | boolean> | undefined {
  const ranked = rankedKnownCandidates(world, teamId, organizationId, 'FREE_AGENCY')
  const depth = Math.min(ranked.length, candidateWindow(qualityScore), MAX_SHORTLIST)
  if (depth === 0) return undefined
  const payload: Record<string, string | number | boolean> = { teamId, candidateCount: depth }
  for (let i = 0; i < depth; i++) {
    const playerId = ranked[i]!
    payload[`candidate${i + 1}PlayerId`] = playerId
    payload[`candidate${i + 1}Rank`] = i + 1
    payload[`candidate${i + 1}Confidence`] = certainty(world, organizationId, playerId, 'FREE_AGENCY')
  }
  return payload
}

/**
 * Materially determined by Basketball Operations context (Blocker 1): among own rostered
 * contracted players, prioritizes the MOST valuable/most-needed player for a recommendation
 * (the highest-stakes retention decision), rather than "first by PlayerId". `renew` requires both
 * budget headroom AND a quality-adjusted valuation floor — low quality/overloaded staff apply a
 * stricter (harder to clear) effective budget threshold and lower confidence, producing an
 * observably different `recommendation`/`confidence`/`recommendedAnnualSalary`, not just a
 * different `qualityScore`.
 */
function contractRecommendation(world: GameWorld, teamId: TeamId, organizationId: OrganizationId, qualityScore: number): Record<string, string | number | boolean> | undefined {
  const finance = getTeamFinancialSnapshot(world, teamId)
  const ranked = world.teams[teamId]!.rosterPlayerIds
    .filter((playerId) => getActivePlayerContract(world, playerId) !== undefined)
    .slice()
    .sort((a, b) => need(world, teamId, world.players[b]!.basketball.primaryPosition) - need(world, teamId, world.players[a]!.basketball.primaryPosition) || value(world, organizationId, b, 'FREE_AGENCY') - value(world, organizationId, a, 'FREE_AGENCY') || a.localeCompare(b))
  const playerId = ranked[0]
  if (playerId === undefined) return undefined
  const contract = getActivePlayerContract(world, playerId)
  if (contract === undefined) return undefined
  // Low/overloaded quality staff demand a larger safety margin before recommending `renew`: the
  // effective budget available to clear is scaled down by quality, so the same finances can flip
  // the recommendation purely from a quality/workload difference.
  const qualityFactor = 0.6 + (qualityScore / 100) * 0.4
  const effectiveBudget = finance.remainingPlayerSalaryBudget * qualityFactor
  const recommendation: 'renew' | 'hold' = effectiveBudget < contract.compensation.annualSalary ? 'hold' : 'renew'
  const confidence = Math.max(0, Math.min(100, Math.round(certainty(world, organizationId, playerId, 'FREE_AGENCY') * (qualityScore / 100))))
  const recommendedAnnualSalary = recommendation === 'renew' ? Math.round(contract.compensation.annualSalary * (0.95 + (qualityScore / 100) * 0.1)) : contract.compensation.annualSalary
  return { teamId, playerId, contractId: contract.id, recommendation, annualSalary: contract.compensation.annualSalary, recommendedAnnualSalary, budgetStatus: finance.status, confidence }
}

/**
 * Incoming target uses valuation + roster needs (unchanged). Outgoing asset selection (Blocker 2)
 * prefers the most expendable own rostered contracted player (surplus position, lowest valuation)
 * FIRST, and only falls back to the next-preferred outgoing candidate when `validateTrade`
 * rejects it — `validateTrade` stays the legality boundary only, never the desirability ranker.
 * Eligibility-first (Blocker 5): the incoming side is filtered to a legally-tradeable, known,
 * non-NOT_FOR_SALE universe before any candidate is drawn from the ranked/RNG window.
 */
function tradeRecommendation(world: GameWorld, teamId: TeamId, organizationId: OrganizationId, qualityScore: number, rngSeed: string): Record<string, string | number | boolean> | undefined {
  const ecosystem = getEcosystemForTeam(world, teamId)
  const seasonId = seasonForTeam(world, teamId)
  if (ecosystem === undefined || seasonId === undefined) return undefined

  const ranked = rankedKnownCandidates(world, teamId, organizationId, 'TRADE')
  const eligibleIncoming = ranked.filter((candidate) => {
    const counterpart = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(candidate))
    if (counterpart === undefined || counterpart.id === teamId) return false
    return getMarketKnowledge(world.marketKnowledge, organizationId, candidate)?.availability !== 'NOT_FOR_SALE'
  })
  const outgoingCandidates = expendableOwnRoster(world, teamId, organizationId)
  if (outgoingCandidates.length === 0) return undefined

  const bounded = Math.min(eligibleIncoming.length, candidateWindow(qualityScore))
  const window = eligibleIncoming.slice(0, bounded)
  const pickedIncoming = pickWithinEligibleWindow(window, qualityScore, `staff-basketball-ops:tradeRecommendation:${rngSeed}`)
  if (pickedIncoming === undefined) return undefined
  const counterpart = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(pickedIncoming))
  if (counterpart === undefined) return undefined

  for (const outgoing of outgoingCandidates) {
    const proposal: TradeProposal = {
      id: `staff-advisory:${teamId}:${outgoing}:${pickedIncoming}:${world.currentDate}`,
      ecosystemId: ecosystem.id,
      seasonId,
      participantTeamIds: [teamId, counterpart.id],
      movements: [
        { asset: { kind: 'player' as const, playerId: outgoing }, fromTeamId: teamId, toTeamId: counterpart.id },
        { asset: { kind: 'player' as const, playerId: pickedIncoming }, fromTeamId: counterpart.id, toTeamId: teamId },
      ],
    }
    if (validateTrade(world, proposal).allowed) {
      return { teamId, incomingPlayerId: pickedIncoming, outgoingPlayerId: outgoing, counterpartTeamId: counterpart.id, proposalId: proposal.id, ecosystemId: ecosystem.id, seasonId, rank: 1, candidateCount: bounded, confidence: certainty(world, organizationId, pickedIncoming, 'TRADE') }
    }
  }
  return undefined
}

function evaluation(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return deriveOrganizationPlayerValuation({ organizationId, playerId, knowledge: world.organizationKnowledge, currentDate: world.currentDate, context, publicPosition: world.players[playerId]!.basketball.primaryPosition, policy: world.organizationEvaluationPoliciesById[organizationId] }) }
function value(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return evaluation(world, organizationId, playerId, context).priorityScore }
function certainty(world: GameWorld, organizationId: ReturnType<typeof organizationIdForTeam>, playerId: PlayerId, context: 'FREE_AGENCY' | 'TRADE') { return evaluation(world, organizationId, playerId, context).certainty }
/** A low/negative need for a position means surplus (safer to trade/retain-lower-priority); a high need means scarcity (higher retention/acquisition priority). */
function need(world: GameWorld, teamId: TeamId, position: string): number { return Math.max(0, 2 - world.teams[teamId]!.rosterPlayerIds.filter((id) => world.players[id]!.basketball.primaryPosition === position).length) }

/**
 * Canonical, non-insertion-order team→season resolution for trade context (Blocker 3). BDM is
 * multi-competition: a team may participate in more than one Season's competition simultaneously
 * (`docs/ARCHITECTURE.md` — "a Team may occur in multiple Competition participant lists"), so
 * `Object.values(world.seasons).find(...)` picking the first season by insertion order is
 * ambiguous and fragile. Trades are only meaningful where `TradeRules` are actually configured
 * (FIBA-like ecosystems intentionally have none, per ARCHITECTURE.md's Trade system v1 section),
 * so the deterministic selection requires all three: the team participates in the season's
 * competition, that competition's ecosystem matches the team's canonical `getEcosystemForTeam`
 * resolution (itself already ecosystem-id-sorted, not insertion-order), and the season has a
 * `tradeRulesBySeasonId` entry. Ties (more than one season still qualifying) break on SeasonId
 * string ordering — stable regardless of `world.seasons` key insertion/iteration order.
 */
function seasonForTeam(world: GameWorld, teamId: TeamId): SeasonId | undefined {
  const ecosystem = getEcosystemForTeam(world, teamId)
  if (ecosystem === undefined) return undefined
  return Object.values(world.seasons)
    .filter((season) => world.competitions[season.competitionId]?.participantTeamIds.includes(teamId) && world.competitions[season.competitionId]?.ecosystemId === ecosystem.id && world.tradeRulesBySeasonId[season.id] !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id))[0]?.id
}

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

  const { teamId, incomingPlayerId, outgoingPlayerId, counterpartTeamId, proposalId, ecosystemId, seasonId } = outcome.payload
  if (typeof teamId !== 'string' || typeof incomingPlayerId !== 'string' || typeof outgoingPlayerId !== 'string' || typeof counterpartTeamId !== 'string' || typeof proposalId !== 'string' || typeof ecosystemId !== 'string' || typeof seasonId !== 'string') return { ok: false, reason: 'malformedPayload' }

  // Reconstruct the exact proposal frozen at recommendation time — never reinterpret it against
  // `world.currentSeasonId`, which may have advanced (or never applied to this team/ecosystem) since
  // creation. If the frozen season/ecosystem no longer exist or no longer relate to each other, the
  // recommendation is stale and must fail safely with no mutation.
  const season = world.seasons[seasonId as SeasonId]
  if (season === undefined) return { ok: false, reason: 'staleRecommendation' }
  const competition = world.competitions[season.competitionId]
  if (competition === undefined || competition.ecosystemId !== ecosystemId) return { ok: false, reason: 'staleRecommendation' }
  const proposal = {
    id: proposalId,
    ecosystemId: ecosystemId as EcosystemId,
    seasonId: seasonId as SeasonId,
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
