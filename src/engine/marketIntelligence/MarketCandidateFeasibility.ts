import type { MarketKnowledge } from '@/domain/market'
import type { GameDate } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { getEcosystemForTeam, canTeamAffordAdditionalSalary, type GameWorld } from '@/domain/world'
import type { OrganizationId, PlayerId, TeamId } from '@/domain/ids'
import type { ClubNeed } from '@/engine/clubNeeds'
import type { MarketCandidateAssessment, MarketCandidateIntelligence } from './MarketCandidateIntelligence'

export type AcquisitionRoute = 'FREE_AGENT_SIGNING' | 'TRADE' | 'TRANSFER' | 'UNAVAILABLE' | 'UNKNOWN'
export type RouteSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN'
export type Affordability = 'AFFORDABLE' | 'OVER_BUDGET' | 'UNKNOWN' | 'NOT_APPLICABLE'
export type Approachability = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' | 'BLOCKED'

export interface MarketSignalEvidence {
  readonly value: number
  readonly source: 'AGENT' | 'CLUB_CONTACT' | 'MEDIA'
  readonly confidence: number
  readonly assessedAt: GameDate
}

export interface MarketCandidateFeasibility {
  readonly playerId: PlayerId
  readonly route: AcquisitionRoute
  readonly routeSupport: RouteSupport
  readonly routeReason?: string
  readonly availability: MarketCandidateIntelligence['availabilityStatus']
  readonly marketAvailability?: MarketKnowledge['availability']
  readonly expectedSalary?: MarketSignalEvidence
  readonly affordability: Affordability
  readonly currentContractAnnualSalary?: number
  readonly playerInterest?: MarketSignalEvidence
  readonly sellerWillingness?: MarketSignalEvidence
  readonly perceivedEconomicValue: 'UNKNOWN'
  readonly tradePackageLegality: 'NOT_ASSESSED'
  readonly financeV2Context: ClubNeed['financialContext']
  readonly approachability: Approachability
  readonly blockers: readonly string[]
}

export interface MarketCandidateFeasibilityAssessment extends MarketCandidateAssessment {
  readonly candidates: readonly (MarketCandidateIntelligence & { readonly feasibility: MarketCandidateFeasibility })[]
}

/** Adds read-only, organization-scoped feasibility to the exact candidate IDs already found by BS10A. */
export function assessMarketCandidateFeasibility(
  world: GameWorld,
  assessment: MarketCandidateAssessment,
): MarketCandidateFeasibilityAssessment {
  const team = world.teams[assessment.teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${assessment.teamId}`)

  const candidates = assessment.candidates.map((candidate) => ({
    ...candidate,
    feasibility: assessCandidateFeasibility(world, assessment.teamId, assessment.need, candidate),
  })).sort(compareFeasibilityCandidates)

  return Object.freeze({ ...assessment, candidates: Object.freeze(candidates) })
}

function assessCandidateFeasibility(
  world: GameWorld,
  teamId: TeamId,
  need: ClubNeed,
  candidate: MarketCandidateIntelligence,
): MarketCandidateFeasibility {
  const organizationId = world.teams[teamId]!.organizationId
  const knowledge = clubMarketKnowledge(world.marketKnowledge, organizationId, candidate)
  const routeResult = acquisitionRoute(world, teamId, candidate)
  const expectedSalary = knownMoney(knowledge?.expectedSalary, knowledge)
  const affordability: Affordability = routeResult.route !== 'FREE_AGENT_SIGNING'
    ? 'NOT_APPLICABLE'
    : expectedSalary === undefined
      ? 'UNKNOWN'
      : canTeamAffordAdditionalSalary(world, teamId, expectedSalary.value) ? 'AFFORDABLE' : 'OVER_BUDGET'
  const activeContract = Object.values(world.contractsById).find((contract) => contract.playerId === candidate.playerId
    && getPlayerContractStatus(contract, world.currentDate) === 'active')
  const blockers = [
    ...(routeResult.support === 'UNSUPPORTED' ? [routeResult.reason ?? 'ACQUISITION_ROUTE_UNSUPPORTED'] : []),
    ...(affordability === 'OVER_BUDGET' ? ['KNOWN_EXPECTED_SALARY_EXCEEDS_PLAYER_BUDGET'] : []),
  ]
  const approachability = routeResult.support === 'UNSUPPORTED' || affordability === 'OVER_BUDGET'
    ? 'BLOCKED'
    : routeResult.support !== 'SUPPORTED' || affordability === 'UNKNOWN'
      ? 'UNKNOWN'
      : knowledge?.availability === 'NOT_FOR_SALE'
        ? 'LOW'
        : knowledge?.availability === 'LISTENING' || knowledge?.availability === 'OPEN'
          ? 'MEDIUM'
          : candidate.availabilityStatus === 'FREE_AGENT'
            ? 'HIGH'
            : 'UNKNOWN'

  return Object.freeze({
    playerId: candidate.playerId,
    route: routeResult.route,
    routeSupport: routeResult.support,
    ...(routeResult.reason === undefined ? {} : { routeReason: routeResult.reason }),
    availability: candidate.availabilityStatus,
    ...(knowledge?.availability === undefined ? {} : { marketAvailability: knowledge.availability }),
    ...(expectedSalary === undefined ? {} : { expectedSalary }),
    affordability,
    ...(activeContract === undefined ? {} : { currentContractAnnualSalary: activeContract.compensation.annualSalary }),
    ...(knownSignal(knowledge?.playerInterest, knowledge) === undefined ? {} : { playerInterest: knownSignal(knowledge?.playerInterest, knowledge) }),
    ...(knownSignal(knowledge?.sellerWillingness, knowledge) === undefined ? {} : { sellerWillingness: knownSignal(knowledge?.sellerWillingness, knowledge) }),
    perceivedEconomicValue: 'UNKNOWN',
    tradePackageLegality: 'NOT_ASSESSED',
    financeV2Context: need.financialContext,
    approachability,
    blockers: Object.freeze(blockers),
  })
}

function clubMarketKnowledge(
  records: readonly MarketKnowledge[],
  organizationId: OrganizationId,
  candidate: MarketCandidateIntelligence,
): MarketKnowledge | undefined {
  const candidates = records.filter((item) => item.organizationId === organizationId && item.playerId === candidate.playerId)
  candidates.sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)
    || b.confidence - a.confidence
    || a.source.localeCompare(b.source)
    || (a.availability ?? 'UNKNOWN').localeCompare(b.availability ?? 'UNKNOWN'))
  return candidates[0]
}

function acquisitionRoute(world: GameWorld, teamId: TeamId, candidate: MarketCandidateIntelligence): { route: AcquisitionRoute; support: RouteSupport; reason?: string } {
  if (candidate.acquisitionContext === 'FREE_AGENT') return { route: 'FREE_AGENT_SIGNING', support: 'SUPPORTED' }
  if (candidate.acquisitionContext === 'TRANSFER_CONTEXT') return { route: 'TRANSFER', support: 'UNSUPPORTED', reason: 'NO_CANONICAL_PLAYER_TRANSFER_OR_FEE_MODEL' }
  if (candidate.acquisitionContext === 'TRADE_CONTEXT' && candidate.currentTeam !== undefined) {
    const sourceEcosystem = getEcosystemForTeam(world, candidate.currentTeam.teamId)
    const targetEcosystem = getEcosystemForTeam(world, teamId)
    const supported = sourceEcosystem !== undefined && targetEcosystem?.id === sourceEcosystem.id
      && Object.values(world.seasons).some((season) => {
        const competition = world.competitions[season.competitionId]
        const participants = season.participantTeamIds ?? competition?.participantTeamIds ?? []
        return competition?.ecosystemId === targetEcosystem.id
          && participants.includes(teamId)
          && participants.includes(candidate.currentTeam!.teamId)
          && world.tradeRulesBySeasonId[season.id]?.ecosystemId === targetEcosystem.id
          && world.tradeRulesBySeasonId[season.id]?.allowedAssetKinds.includes('player') === true
          && world.currentDate >= season.startDate
          && world.currentDate <= season.endDate
      })
    return supported ? { route: 'TRADE', support: 'SUPPORTED' } : { route: 'TRADE', support: 'UNSUPPORTED', reason: 'NO_ACTIVE_CANONICAL_TRADE_RULES' }
  }
  if (candidate.acquisitionContext === 'RECRUITING_CONTEXT') return { route: 'UNAVAILABLE', support: 'UNSUPPORTED', reason: 'RECRUITING_IS_A_SEPARATE_ACQUISITION_DOMAIN' }
  if (candidate.contractStatus === 'UNDER_CONTRACT') return { route: 'UNKNOWN', support: 'UNKNOWN', reason: 'CONTRACTED_PLAYER_HAS_NO_SUPPORTED_ROUTE' }
  return { route: 'UNKNOWN', support: 'UNKNOWN', reason: 'ACQUISITION_ROUTE_UNKNOWN' }
}

function knownMoney(value: number | undefined, knowledge: MarketKnowledge | undefined): MarketSignalEvidence | undefined {
  return Number.isInteger(value) && (value ?? 0) > 0 ? knownSignal(value, knowledge) : undefined
}

function knownSignal(value: number | undefined, knowledge: MarketKnowledge | undefined): MarketSignalEvidence | undefined {
  if (value === undefined || knowledge === undefined) return undefined
  return Object.freeze({ value, source: knowledge.source, confidence: knowledge.confidence, assessedAt: knowledge.assessedAt })
}

const APPROACHABILITY_ORDER: Readonly<Record<Approachability, number>> = { HIGH: 0, MEDIUM: 1, UNKNOWN: 2, LOW: 3, BLOCKED: 4 }
const ROUTE_ORDER: Readonly<Record<RouteSupport, number>> = { SUPPORTED: 0, UNKNOWN: 1, UNSUPPORTED: 2 }
const FIT_ORDER: Readonly<Record<MarketCandidateIntelligence['needFit'], number>> = { HIGH: 0, MODERATE: 1, LOW: 2, UNKNOWN: 3 }

function compareFeasibilityCandidates(
  a: MarketCandidateIntelligence & { feasibility: MarketCandidateFeasibility },
  b: MarketCandidateIntelligence & { feasibility: MarketCandidateFeasibility },
): number {
  return APPROACHABILITY_ORDER[a.feasibility.approachability] - APPROACHABILITY_ORDER[b.feasibility.approachability]
    || ROUTE_ORDER[a.feasibility.routeSupport] - ROUTE_ORDER[b.feasibility.routeSupport]
    || FIT_ORDER[a.needFit] - FIT_ORDER[b.needFit]
    || a.playerId.localeCompare(b.playerId)
}
