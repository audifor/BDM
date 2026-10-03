import { getPlayerContractStatus, type PlayerContract } from '@/domain/contract'
import type { MarketKnowledge } from '@/domain/market'
import type { EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { TradeAsset } from '@/domain/trade'
import { getOrganizationRatingEvaluation } from '@/domain/intelligence/OrganizationPlayerEvaluation'
import type { PlayerAggregateScoutingDimension } from '@/domain/player/PlayerTruthCatalog'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import { assessRoutedAcquisitionProposalIntelligence } from './AcquisitionProposalIntelligenceService'
import { inspectGMPlanWorkflows } from '@/app/gmPlanning/GMPlanWorkflowService'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { getTradeWindowStatus, validateTrade, type TradeValidationReason, type TradeWindowStatus } from '@/engine/trade'
import type { AcquisitionProposalIntelligence } from '@/engine/marketIntelligence'
import type { ClubNeed } from '@/engine/clubNeeds'

export type TradePackageCheck = 'PASS' | 'FAIL' | 'NOT_ASSESSED'
export type TradePackageReadiness = 'MORE_INFORMATION_REQUIRED' | 'BLOCKED'

export interface TradePlayerKnowledgeCoverage {
  readonly knownDimensions: readonly string[]
  readonly missingDimensions: readonly string[]
}

export interface TradeMarketObservation {
  readonly availability?: MarketKnowledge['availability']
  readonly sellerWillingness?: {
    readonly value: number
    readonly source: MarketKnowledge['source']
    readonly confidence: number
    readonly assessedAt: MarketKnowledge['assessedAt']
  }
}

export interface TradeClubPackageKnowledge {
  readonly teamId: TeamId
  readonly organizationId: string
  readonly incomingPlayerId: PlayerId
  readonly outgoingPlayerId: PlayerId
  readonly incomingPlayer: TradePlayerKnowledgeCoverage
  readonly outgoingPlayer: TradePlayerKnowledgeCoverage
  readonly incomingMarketObservation?: TradeMarketObservation
}

export interface TradeClubAuthorityStatus {
  readonly teamId: TeamId
  readonly negotiation: 'USER_CONTROLLED' | 'DELEGATED' | 'UNKNOWN'
  readonly execution: 'USER_CONTROLLED' | 'DELEGATED' | 'UNKNOWN'
  readonly governance: 'UNKNOWN'
}

/** A derived, non-persistent package view. It deliberately is not a TradeProposal command. */
export interface TradePackageIntelligence {
  readonly packageId: string
  /** Stable for the selected target and incoming plan even when the outgoing package changes. */
  readonly pursuitId: string
  readonly initiatingTeamId: TeamId
  readonly counterpartyTeamId: TeamId
  readonly ecosystemId: EcosystemId
  readonly seasonId: SeasonId
  readonly incomingPlanId: string
  readonly incomingNeedId: string
  readonly outgoingPlanId: string
  readonly outgoingNeedId: string
  readonly outgoingNeedKind: ClubNeed['kind']
  readonly outgoingReasonEvidence: readonly string[]
  readonly outgoingAssets: readonly TradeAsset[]
  readonly incomingAssets: readonly TradeAsset[]
  readonly routeSupport: 'SUPPORTED'
  readonly legality: {
    readonly ecosystemSupport: TradePackageCheck
    readonly roster: TradePackageCheck
    readonly contract: TradePackageCheck
    readonly contractReasons: readonly TradeValidationReason[]
    readonly salaryCap: TradePackageCheck
    readonly tradeWindow: TradeWindowStatus
    readonly assetEligibility: TradePackageCheck
    readonly assetReasons: readonly TradeValidationReason[]
    readonly salaryReasons: readonly TradeValidationReason[]
  }
  readonly economicStatus: 'UNKNOWN'
  readonly executionAuthority: 'UNKNOWN'
  readonly contractTransferSemantics: 'SAME_CONTRACT_ID_MOVES_TO_NEW_TEAM'
  readonly clubKnowledge: readonly TradeClubPackageKnowledge[]
  readonly authorityByTeam: readonly TradeClubAuthorityStatus[]
  readonly readiness: TradePackageReadiness
  readonly blockers: readonly string[]
}

export interface TradePackageIntelligenceResult {
  readonly teamId: TeamId
  readonly packages: readonly TradePackageIntelligence[]
  readonly blockers: readonly string[]
}

const RATING_DIMENSIONS: readonly (PlayerAggregateScoutingDimension | 'potential:physical')[] = Object.freeze(['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical', 'potential:physical'])

/**
 * Joins current need-selected BS10 trade enquiries to current BS9 outgoing-review plans.
 * Each derived candidate is one player for one player; the TradeEngine's wider N-team,
 * multi-asset proposal model remains intact. This query does not write any world state.
 */
export function assessTradePackageIntelligence(world: GameWorld, teamId: TeamId): TradePackageIntelligenceResult {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)

  const acquisitionProposals = assessRoutedAcquisitionProposalIntelligence(world, teamId)
    .filter((proposal) => proposal.proposalType === 'TRADE_ENQUIRY' && proposal.preferredCandidate?.feasibility.routeSupport === 'SUPPORTED')
  const workflows = inspectGMPlanWorkflows(world, teamId)
  const context = assessGMDecisionContext(world, teamId)
  const outgoingReviews = workflows.decisions
    .filter((decision) => decision.currentValidity === 'CURRENT'
      && decision.currentPlanningEligibility === 'SELECTABLE'
      && decision.responseFamily === 'OUTGOING_MARKET_REVIEW'
      && decision.route === 'MARKET_INTELLIGENCE_REQUIRED')
    .flatMap((decision) => {
      const need = context.needsAssessment.needs.find((item) => item.id === decision.needId)
      return need === undefined || !['POSITION_SURPLUS', 'AGING_CORE'].includes(need.kind) ? [] : [{ decision, need }]
    })

  const packages: TradePackageIntelligence[] = []
  for (const acquisition of acquisitionProposals) {
    const target = acquisition.preferredCandidate
    const counterpartyTeamId = target?.currentTeam?.teamId
    if (target === undefined || counterpartyTeamId === undefined || counterpartyTeamId === teamId) continue

    const activeTradeSeasons = resolveActiveTradeSeasons(world, teamId, counterpartyTeamId, acquisition)
    if (activeTradeSeasons.length === 0) continue
    for (const { ecosystemId, seasonId } of activeTradeSeasons) {
      for (const { decision: outgoingDecision, need } of outgoingReviews) {
        for (const outgoingPlayerId of need.relatedPlayerIds) {
          if (outgoingPlayerId === target.playerId || !team.rosterPlayerIds.includes(outgoingPlayerId)) continue
          const outgoingContract = activeContractFor(world, outgoingPlayerId, teamId)
          if (outgoingContract === undefined) continue

          const incomingAsset: TradeAsset = { kind: 'player', playerId: target.playerId }
          const outgoingAsset: TradeAsset = { kind: 'player', playerId: outgoingPlayerId }
          const packageId = packageCompositionId(ecosystemId, seasonId, teamId, counterpartyTeamId, outgoingAsset, incomingAsset)
          const validation = validateTrade(world, {
            id: packageId,
            ecosystemId,
            seasonId,
            participantTeamIds: [teamId, counterpartyTeamId],
            movements: [
              { asset: outgoingAsset, fromTeamId: teamId, toTeamId: counterpartyTeamId },
              { asset: incomingAsset, fromTeamId: counterpartyTeamId, toTeamId: teamId },
            ],
          })
          const incomingContract = activeContractFor(world, target.playerId, counterpartyTeamId)
          const rosterCheck: TradePackageCheck = team.rosterPlayerIds.includes(outgoingPlayerId)
            && world.teams[counterpartyTeamId]?.rosterPlayerIds.includes(target.playerId) === true ? 'PASS' : 'FAIL'
          const contractReasons = validation.teamResults.flatMap((result) => result.reasons.filter((reason) => reason === 'PLAYER_CONTRACT_NOT_ACTIVE'))
          const contractCheck: TradePackageCheck = incomingContract !== undefined && outgoingContract !== undefined && contractReasons.length === 0 ? 'PASS' : 'FAIL'
          const salaryRulesAvailable = world.salaryRulesBySeasonId[seasonId] !== undefined
          const tradeWindow = getTradeWindowStatus(world, { seasonId, ecosystemId })
          const salaryReasons = validation.teamResults.flatMap((result) => result.reasons.filter((reason) => reason === 'SALARY_MATCHING_FAILED' || reason === 'EXCEPTION_UNAVAILABLE'))
          const assetReasons = [...validation.globalReasons.filter((reason) => reason !== 'TRADE_WINDOW_CLOSED' && reason !== 'TRADE_WINDOW_NOT_CONFIGURED'), ...validation.teamResults.flatMap((result) => result.reasons.filter((reason) => reason !== 'SALARY_MATCHING_FAILED' && reason !== 'EXCEPTION_UNAVAILABLE' && reason !== 'PLAYER_CONTRACT_NOT_ACTIVE'))]
          const assetCheck: TradePackageCheck = assetReasons.length > 0 ? 'FAIL' : 'PASS'
          const salaryCheck: TradePackageCheck = !salaryRulesAvailable ? 'NOT_ASSESSED' : salaryReasons.length > 0 ? 'FAIL' : 'PASS'
          const market = marketObservation(world.marketKnowledge, team.organizationId, target.playerId)
          const hardFailures = [rosterCheck, contractCheck, assetCheck, salaryCheck].includes('FAIL') || tradeWindow !== 'OPEN' || market?.availability === 'NOT_FOR_SALE'
          const blockers = [
            ...(rosterCheck === 'FAIL' ? ['PLAYER_ROSTER_OWNERSHIP_FAILED'] : []),
            ...(contractCheck === 'FAIL' ? ['PLAYER_CONTRACT_NOT_ACTIVE'] : []),
            ...(assetCheck === 'FAIL' ? assetReasons : []),
            ...(salaryCheck === 'FAIL' ? salaryReasons : []),
            ...(!salaryRulesAvailable ? ['SALARY_CAP_RULES_NOT_ASSESSED'] : []),
            ...(tradeWindow === 'NOT_CONFIGURED' ? ['TRADE_WINDOW_NOT_CONFIGURED'] : []),
            ...(tradeWindow === 'CLOSED' ? ['TRADE_WINDOW_CLOSED'] : []),
            ...(market?.availability === undefined ? ['SELLER_AVAILABILITY_UNKNOWN'] : []),
            ...(market?.availability === 'NOT_FOR_SALE' ? ['SELLER_KNOWN_NOT_FOR_SALE'] : []),
            ...(market?.sellerWillingness === undefined ? ['SELLER_WILLINGNESS_UNKNOWN'] : []),
            'TRADE_NEGOTIATION_REQUIRED',
            'TRADE_GOVERNANCE_AUTHORITY_UNKNOWN',
          ]
          packages.push(Object.freeze({
            packageId,
            pursuitId: tradePursuitId(acquisition, counterpartyTeamId),
            initiatingTeamId: teamId,
            counterpartyTeamId,
            ecosystemId,
            seasonId,
            incomingPlanId: acquisition.planId!,
            incomingNeedId: acquisition.needId!,
            outgoingPlanId: outgoingDecision.planId,
            outgoingNeedId: outgoingDecision.needId,
            outgoingNeedKind: need.kind,
            outgoingReasonEvidence: Object.freeze(need.evidence.map((item) => item.code).sort()),
            outgoingAssets: Object.freeze([outgoingAsset]),
            incomingAssets: Object.freeze([incomingAsset]),
            routeSupport: 'SUPPORTED',
            legality: Object.freeze({
              ecosystemSupport: 'PASS',
              roster: rosterCheck,
              contract: contractCheck,
              contractReasons: Object.freeze(contractReasons),
              salaryCap: salaryCheck,
              tradeWindow,
              assetEligibility: assetCheck,
              assetReasons: Object.freeze(assetReasons),
              salaryReasons: Object.freeze(salaryReasons),
            }),
            economicStatus: 'UNKNOWN',
            executionAuthority: 'UNKNOWN',
            contractTransferSemantics: 'SAME_CONTRACT_ID_MOVES_TO_NEW_TEAM',
            clubKnowledge: Object.freeze([
              clubKnowledge(world, team, target.playerId, outgoingPlayerId, market),
              clubKnowledge(world, world.teams[counterpartyTeamId]!, outgoingPlayerId, target.playerId, marketObservation(world.marketKnowledge, world.teams[counterpartyTeamId]!.organizationId, outgoingPlayerId)),
            ]),
            authorityByTeam: Object.freeze([
              clubAuthority(world, teamId),
              clubAuthority(world, counterpartyTeamId),
            ]),
            readiness: hardFailures ? 'BLOCKED' : 'MORE_INFORMATION_REQUIRED',
            blockers: Object.freeze([...new Set(blockers)]),
          }))
        }
      }
    }
  }

  const blockers = packages.length > 0 ? [] : [
    ...(acquisitionProposals.length === 0 ? ['NO_CURRENT_SUPPORTED_TRADE_ENQUIRY'] : []),
    ...(outgoingReviews.length === 0 ? ['NO_CURRENT_NEED_BASED_OUTGOING_REVIEW'] : []),
    ...(acquisitionProposals.length > 0 && outgoingReviews.length > 0 ? ['NO_ACTIVE_SHARED_TRADE_RULES_FOR_SELECTED_TARGET'] : []),
  ]
  packages.sort((a, b) => a.packageId.localeCompare(b.packageId))
  return Object.freeze({ teamId, packages: Object.freeze(packages), blockers: Object.freeze(blockers) })
}

function resolveActiveTradeSeasons(world: GameWorld, teamId: TeamId, counterpartyTeamId: TeamId, acquisition: AcquisitionProposalIntelligence): readonly { readonly ecosystemId: EcosystemId; readonly seasonId: SeasonId }[] {
  const player = acquisition.preferredCandidate
  if (player === undefined || player.feasibility.route !== 'TRADE' || player.feasibility.routeSupport !== 'SUPPORTED') return []
  return Object.values(world.seasons).flatMap((season) => {
    const competition = world.competitions[season.competitionId]
    const rules = world.tradeRulesBySeasonId[season.id]
    const participants = season.participantTeamIds ?? competition?.participantTeamIds ?? []
    if (competition === undefined || rules === undefined || rules.seasonId !== season.id
      || rules.ecosystemId !== competition.ecosystemId || !rules.allowedAssetKinds.includes('player')
      || !participants.includes(teamId) || !participants.includes(counterpartyTeamId)
      || world.currentDate < season.startDate || world.currentDate > season.endDate
      || player.currentTeam?.teamId !== counterpartyTeamId) return []
    return [{ ecosystemId: competition.ecosystemId, seasonId: season.id }]
  }).sort((a, b) => a.seasonId.localeCompare(b.seasonId))
}

function activeContractFor(world: GameWorld, playerId: PlayerId, teamId: TeamId): PlayerContract | undefined {
  return Object.values(world.contractsById).find((contract) => contract.playerId === playerId
    && contract.teamId === teamId
    && getPlayerContractStatus(contract, world.currentDate) === 'active')
}

function marketObservation(records: readonly MarketKnowledge[], organizationId: string, playerId: PlayerId): TradeMarketObservation | undefined {
  const knowledge = records.filter((item) => item.organizationId === organizationId && item.playerId === playerId)
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt) || b.confidence - a.confidence || a.source.localeCompare(b.source))[0]
  if (knowledge === undefined) return undefined
  return Object.freeze({
    ...(knowledge.availability === undefined ? {} : { availability: knowledge.availability }),
    ...(knowledge.sellerWillingness === undefined ? {} : { sellerWillingness: Object.freeze({ value: knowledge.sellerWillingness, source: knowledge.source, confidence: knowledge.confidence, assessedAt: knowledge.assessedAt }) }),
  })
}

function clubAuthority(world: GameWorld, teamId: TeamId): TradeClubAuthorityStatus {
  const getStatus = (kind: 'negotiatePlayerTrade' | 'executePlayerTrade'): TradeClubAuthorityStatus['negotiation'] => {
    const responsibility = world.responsibilitiesById[responsibilityIdForTeam(teamId, kind)]
    if (responsibility?.mode === 'userControlled' && world.teams[teamId]?.coachId === world.userCoachId) return 'USER_CONTROLLED'
    if (responsibility?.mode === 'delegated' && responsibility.holderStaffId !== undefined) return 'DELEGATED'
    return 'UNKNOWN'
  }
  return Object.freeze({ teamId, negotiation: getStatus('negotiatePlayerTrade'), execution: getStatus('executePlayerTrade'), governance: 'UNKNOWN' })
}

function clubKnowledge(world: GameWorld, team: GameWorld['teams'][TeamId], incomingPlayerId: PlayerId, outgoingPlayerId: PlayerId, incomingMarketObservation?: TradeMarketObservation): TradeClubPackageKnowledge {
  return Object.freeze({
    teamId: team.id,
    organizationId: team.organizationId,
    incomingPlayerId,
    outgoingPlayerId,
    incomingPlayer: summarizeKnowledge(world, team.organizationId, incomingPlayerId),
    outgoingPlayer: summarizeKnowledge(world, team.organizationId, outgoingPlayerId),
    ...(incomingMarketObservation === undefined ? {} : { incomingMarketObservation }),
  })
}

function summarizeKnowledge(world: GameWorld, organizationId: string, playerId: PlayerId): TradePlayerKnowledgeCoverage {
  const knownDimensions = RATING_DIMENSIONS.filter((dimension) => getOrganizationRatingEvaluation({
    organizationId: organizationId as never,
    playerId,
    dimension,
    knowledge: world.organizationKnowledge,
    currentDate: world.currentDate,
    publicPosition: world.players[playerId]?.basketball.primaryPosition,
  }).mode !== 'UNKNOWN').sort()
  return Object.freeze({ knownDimensions: Object.freeze(knownDimensions), missingDimensions: Object.freeze(RATING_DIMENSIONS.filter((dimension) => !knownDimensions.includes(dimension))) })
}

function packageCompositionId(ecosystemId: EcosystemId, seasonId: SeasonId, initiatingTeamId: TeamId, counterpartyTeamId: TeamId, outgoing: TradeAsset, incoming: TradeAsset): string {
  return ['trade-package-v1', ecosystemId, seasonId, initiatingTeamId, counterpartyTeamId, assetIdentity(outgoing), assetIdentity(incoming)].map(encodeURIComponent).join(':')
}

function tradePursuitId(acquisition: AcquisitionProposalIntelligence, counterpartyTeamId: TeamId): string {
  return ['trade-pursuit-v1', acquisition.teamId, acquisition.planId ?? 'no-plan', acquisition.needId ?? 'no-need', acquisition.preferredCandidate?.playerId ?? 'no-target', counterpartyTeamId].map(encodeURIComponent).join(':')
}

function assetIdentity(asset: TradeAsset): string {
  return asset.kind === 'player' ? `player:${asset.playerId}`
    : asset.kind === 'draftPick' ? `draftPick:${asset.draftPickId}`
      : asset.kind === 'futureDraftPick' ? `futureDraftPick:${asset.futureDraftPickRightId}`
        : asset.kind === 'playerRights' ? `playerRights:${asset.playerRightsId}`
          : asset.kind === 'draftPickSwapRight' ? `draftPickSwapRight:${asset.draftPickSwapRightId}`
            : `cash:${asset.amount}`
}
