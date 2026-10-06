import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createOrganizationKnowledge } from '@/domain/knowledge'
import { createGMPlanState } from '@/domain/gmPlanning'
import { createClubStrategicState } from '@/domain/clubStrategy'
import { createTradeRules } from '@/domain/trade'
import type { MarketKnowledge } from '@/domain/market'
import type { OrganizationKnowledge } from '@/domain/knowledge'
import type { PlayerId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { PLAYER_RATING_FAMILY_KEYS, ratingKnowledgeDimensionFor } from '@/domain/player'

import { assessTradePackageIntelligence } from './TradePackageIntelligenceService'

function configuredTradeWorld(): { readonly world: GameWorld; readonly teamId: TeamId; readonly targetTeamId: TeamId; readonly targetPlayerId: PlayerId } {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const participantIds = season.participantTeamIds ?? base.competitions[season.competitionId]!.participantTeamIds
  const team = Object.values(base.teams).find((item) => participantIds.includes(item.id) && item.coachId !== base.userCoachId)!
  const targetTeam = Object.values(base.teams).find((item) => participantIds.includes(item.id) && item.id !== team.id)!
  const targetPlayerId = targetTeam.rosterPlayerIds.find((playerId) => base.players[playerId]!.basketball.primaryPosition === 'SG')!
  const sgPlayers = team.rosterPlayerIds.filter((playerId) => base.players[playerId]!.basketball.primaryPosition === 'SG')
  const reassigned = sgPlayers.slice(0, 2)
  const players = Object.values(base.players).map((player) => reassigned.includes(player.id)
    ? { ...player, basketball: { ...player.basketball, primaryPosition: 'PG' as const, secondaryPositions: [] } }
    : player)
  const strategy = createClubStrategicState({ teamId: team.id, mode: 'SELL', horizon: 'NEAR_TERM', financialPosture: 'HEALTHY', riskTolerance: 'MODERATE', developmentEmphasis: 40, retentionPosture: 'OPEN', acquisitionAggression: 'LOW', sellingWillingness: 'HIGH', establishedOn: season.startDate, lastReviewedOn: season.startDate, transitionReason: 'INITIAL_ASSESSMENT' })
  let world = updateGameWorld(base, {
    currentDate: season.startDate,
    currentSeasonId: season.id,
    players,
    clubStrategicStatesByTeamId: { ...base.clubStrategicStatesByTeamId, [team.id]: strategy },
  })
  const context = assessGMDecisionContext(world, team.id)
  const outgoingNeed = context.needsAssessment.needs.find((need) => need.kind === 'POSITION_SURPLUS' && context.options.some((option) => option.needId === need.id && option.kind === 'OUTGOING_MARKET_REVIEW'))!
  const acquisitionNeed = context.needsAssessment.needs.find((need) => context.options.some((option) => option.needId === need.id && option.kind === 'EXTERNAL_ACQUISITION'))!
  const outgoingOption = context.options.find((option) => option.needId === outgoingNeed.id && option.kind === 'OUTGOING_MARKET_REVIEW')!
  const acquisitionOption = context.options.find((option) => option.needId === acquisitionNeed.id && option.kind === 'EXTERNAL_ACQUISITION')!
  world = updateGameWorld(world, {
    gmPlanStates: [
      createGMPlanState({ id: `${team.id}:${outgoingNeed.id}`, teamId: team.id, needId: outgoingNeed.id, selectedOptionKind: 'OUTGOING_MARKET_REVIEW', selectedOn: world.currentDate, lastReviewedOn: world.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: outgoingOption.executionReadiness as 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'UNKNOWN_AUTHORITY', strategyAtSelection: context.strategy, originalOptionPriority: outgoingOption.priority }),
      createGMPlanState({ id: `${team.id}:${acquisitionNeed.id}`, teamId: team.id, needId: acquisitionNeed.id, selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: world.currentDate, lastReviewedOn: world.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: acquisitionOption.executionReadiness as 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'UNKNOWN_AUTHORITY', strategyAtSelection: context.strategy, originalOptionPriority: acquisitionOption.priority }),
    ],
  })
  const orgA = world.teams[team.id]!.organizationId
  const orgB = world.teams[targetTeam.id]!.organizationId
  const marketKnowledge: readonly MarketKnowledge[] = [
    { organizationId: orgA, playerId: targetPlayerId as never, availability: 'LISTENING', sellerWillingness: 65, confidence: 85, assessedAt: world.currentDate, source: 'CLUB_CONTACT' },
  ]
  const organizationKnowledge: readonly OrganizationKnowledge[] = [
    createOrganizationKnowledge({ organizationId: orgA, subjectPlayerId: targetPlayerId as never, dimensions: Object.fromEntries(PLAYER_RATING_FAMILY_KEYS.shooting.slice(0, 6).map((key) => [ratingKnowledgeDimensionFor(key), { coverage: 1, confidence: 0.9, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 68, uncertainty: 5 }])) }),
    createOrganizationKnowledge({ organizationId: orgB, subjectPlayerId: targetPlayerId as never, dimensions: { finishing: { coverage: 0.7, confidence: 0.8, assessedAt: world.currentDate, provenance: 'ownObservation', estimate: 72, uncertainty: 4 } } }),
    createOrganizationKnowledge({ organizationId: orgB, subjectPlayerId: team.rosterPlayerIds[0] as never, dimensions: { creation: { coverage: 0.95, confidence: 0.95, assessedAt: world.currentDate, provenance: 'ownObservation', estimate: 74, uncertainty: 2 } } }),
  ]
  world = updateGameWorld(world, { marketKnowledge, organizationKnowledge })
  return { world, teamId: team.id, targetTeamId: targetTeam.id, targetPlayerId }
}

describe('TradePackageIntelligenceService', () => {
  it('derives stable need-based 1:1 player package views with distinct pursuit and composition identities', () => {
    const { world, teamId, targetTeamId, targetPlayerId } = configuredTradeWorld()
    const before = JSON.stringify(world)
    const first = assessTradePackageIntelligence(world, teamId)
    const second = assessTradePackageIntelligence(world, teamId)

    expect(first.packages.length).toBeGreaterThan(0)
    expect(second.packages.map((item) => item.packageId)).toEqual(first.packages.map((item) => item.packageId))
    expect(new Set(first.packages.map((item) => item.packageId)).size).toBe(first.packages.length)
    expect(new Set(first.packages.map((item) => item.pursuitId)).size).toBe(1)
    expect(first.packages.every((item) => item.counterpartyTeamId === targetTeamId)).toBe(true)
    expect(first.packages.every((item) => item.incomingAssets.length === 1 && item.outgoingAssets.length === 1)).toBe(true)
    expect(first.packages.every((item) => item.incomingAssets[0]?.kind === 'player' && item.outgoingAssets[0]?.kind === 'player')).toBe(true)
    expect(first.packages[0]!.incomingAssets[0]).toEqual({ kind: 'player', playerId: targetPlayerId })
    expect(first.packages[0]!.outgoingAssets[0]).toMatchObject({ kind: 'player' })
    expect((first.packages[0]!.outgoingAssets[0] as { playerId: PlayerId }).playerId).not.toBe(targetPlayerId)
    expect(first.packages[0]!.outgoingNeedKind).toBe('POSITION_SURPLUS')
    expect(first.packages[0]!.legality).toMatchObject({ ecosystemSupport: 'PASS', roster: 'PASS', contract: 'PASS', tradeWindow: 'OPEN' })
    expect(first.packages[0]!.economicStatus).toBe('UNKNOWN')
    expect(first.packages[0]!.contractTransferSemantics).toBe('SAME_CONTRACT_ID_MOVES_TO_NEW_TEAM')
    expect(first.packages[0]!.clubKnowledge[0]!.incomingPlayer.knownDimensions).toContain('shooting')
    expect(first.packages[0]!.clubKnowledge[0]!.incomingPlayer.knownDimensions).not.toContain('finishing')
    expect(first.packages[0]!.clubKnowledge[1]!.outgoingPlayer.knownDimensions).toContain('finishing')
    expect(first.packages[0]!.clubKnowledge[1]!.outgoingPlayer.knownDimensions).not.toContain('shooting')
    expect(first.packages[0]!.blockers).toContain('TRADE_GOVERNANCE_AUTHORITY_UNKNOWN')
    expect(first.packages[0]!.blockers).toContain('TRADE_NEGOTIATION_REQUIRED')
    expect(first.packages[0]!.authorityByTeam).toHaveLength(2)
    expect(JSON.stringify(world)).toBe(before)
  })

  it('keeps external club knowledge organization-scoped and ignores MarketReality and hidden ratings', () => {
    const setup = configuredTradeWorld()
    const original = assessTradePackageIntelligence(setup.world, setup.teamId).packages
    const target = setup.world.players[setup.targetPlayerId]!
    const hiddenChanged = updateGameWorld(setup.world, {
      players: Object.values(setup.world.players).map((player) => player.id === target.id ? { ...player, basketball: { ...player.basketball, ratings: { ...player.basketball.ratings, shooting: player.basketball.ratings.shooting + 15 } } } : player),
      marketReality: [{ playerId: target.id, availability: 'NOT_FOR_SALE', expectedSalary: 99_000_000, expectedYears: 4, playerWillingness: 0, sellerWillingness: 0, competition: 100 }],
    })
    const changed = assessTradePackageIntelligence(hiddenChanged, setup.teamId).packages
    expect(changed.map((item) => item.packageId)).toEqual(original.map((item) => item.packageId))
    expect(changed.map((item) => item.clubKnowledge)).toEqual(original.map((item) => item.clubKnowledge))
    expect(changed.map((item) => item.blockers)).toEqual(original.map((item) => item.blockers))
  })

  it('does not form a trade package when current shared trade rules are absent', () => {
    const { world, teamId } = configuredTradeWorld()
    const withoutRules = updateGameWorld(world, { tradeRulesBySeasonId: {} })
    const result = assessTradePackageIntelligence(withoutRules, teamId)
    expect(result.packages).toEqual([])
    expect(result.blockers).toContain('NO_CURRENT_SUPPORTED_TRADE_ENQUIRY')
  })

  it('keeps a missing trade window NOT_CONFIGURED and blocks package readiness', () => {
    const { world, teamId } = configuredTradeWorld()
    const { tradeWindow: _tradeWindow, ...rulesWithoutWindow } = world.tradeRulesBySeasonId[world.currentSeasonId]!
    const unconfigured = updateGameWorld(world, { tradeRulesBySeasonId: { ...world.tradeRulesBySeasonId, [world.currentSeasonId]: createTradeRules(rulesWithoutWindow) } })
    const result = assessTradePackageIntelligence(unconfigured, teamId)
    expect(result.packages.length).toBeGreaterThan(0)
    expect(result.packages[0]!.legality.tradeWindow).toBe('NOT_CONFIGURED')
    expect(result.packages[0]!.readiness).toBe('BLOCKED')
    expect(result.packages[0]!.blockers).toContain('TRADE_WINDOW_NOT_CONFIGURED')
  })

  it('keeps unknown seller availability and economic value explicit', () => {
    const { world, teamId } = configuredTradeWorld()
    const withoutSignal = updateGameWorld(world, { marketKnowledge: [] })
    const result = assessTradePackageIntelligence(withoutSignal, teamId)
    expect(result.packages.length).toBeGreaterThan(0)
    expect(result.packages[0]!.economicStatus).toBe('UNKNOWN')
    expect(result.packages[0]!.blockers).toContain('SELLER_AVAILABILITY_UNKNOWN')
  })
})
