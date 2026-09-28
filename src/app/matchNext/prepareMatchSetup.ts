import type { Game } from '@/domain/game'
import type { GameWorld } from '@/domain/world'
import { courtRulesetForEcosystem, createCourtGeometry } from '@/domain/court'
import { getEcosystemForCompetition, resolveGameClockRulesForGame } from '@/domain/world'
import type { MatchTacticalPlan } from '@/engine/match'
import { prepareMatchOptions, type MatchSeedFactory } from '@/app/game/playUserGame'
import type { MatchSetup, MatchNextPlayerProfile } from '@/engine/match-next'

/** Resolves canonical game inputs at the app boundary, then returns data-only kernel input. */
export function prepareMatchSetup(
  world: GameWorld,
  game: Game,
  matchSeed?: number | MatchSeedFactory,
  tacticalPlanOverrides?: Partial<{ home: MatchTacticalPlan; away: MatchTacticalPlan }>,
): MatchSetup {
  const options = prepareMatchOptions(world, game, tacticalPlanOverrides, matchSeed)
  const homeTeamId = game.homeTeamId
  const awayTeamId = game.awayTeamId
  const profiles: MatchNextPlayerProfile[] = [
    ...options.playerProfiles.home.map((profile) => ({
      playerId: profile.playerId, teamId: homeTeamId, primaryPosition: profile.primaryPosition,
      secondaryPositions: world.players[profile.playerId]!.basketball.secondaryPositions,
      physical: { ...profile.physical }, kinematics: { ...profile.kinematics }, offense: { ...profile.offense },
      passing: profile.passing === undefined ? undefined : { ...profile.passing },
      defense: { ...profile.defense }, rebounding: { ...profile.rebounding },
      dynamicState: { careerFatigue: world.careerFatigueByPlayerId[profile.playerId] ?? 0 },
    })),
    ...options.playerProfiles.away.map((profile) => ({
      playerId: profile.playerId, teamId: awayTeamId, primaryPosition: profile.primaryPosition,
      secondaryPositions: world.players[profile.playerId]!.basketball.secondaryPositions,
      physical: { ...profile.physical }, kinematics: { ...profile.kinematics }, offense: { ...profile.offense },
      passing: profile.passing === undefined ? undefined : { ...profile.passing },
      defense: { ...profile.defense }, rebounding: { ...profile.rebounding },
      dynamicState: { careerFatigue: world.careerFatigueByPlayerId[profile.playerId] ?? 0 },
    })),
  ]
  const resolvedTacticalPlans = options.tacticalPlans ?? {
    home: { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } },
    away: { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } },
  }
  const ecosystem = getEcosystemForCompetition(world, game.competitionId)
  const clock = resolveGameClockRulesForGame(world, game)
  return {
    gameId: game.id,
    homeTeamId,
    awayTeamId,
    court: createCourtGeometry(courtRulesetForEcosystem(ecosystem.kind, ecosystem.category)),
    // Competition/domain rules do not yet own shot-clock values. This remains an inert adapter placeholder.
    clockRules: { ...clock, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: [...options.squads.home],
    awaySquad: [...options.squads.away],
    initialLineups: { home: [...options.lineups.home], away: [...options.lineups.away] },
    players: profiles,
    coachingPlans: options.coachingPlans,
    tacticalPlans: {
      home: { ...resolvedTacticalPlans.home, shotProfile: { ...resolvedTacticalPlans.home.shotProfile }, defense: { ...resolvedTacticalPlans.home.defense } },
      away: { ...resolvedTacticalPlans.away, shotProfile: { ...resolvedTacticalPlans.away.shotProfile }, defense: { ...resolvedTacticalPlans.away.defense } },
    },
    defensiveMatchupOverrides: {
      home: (options.defensiveMatchups?.home ?? []).map(({ ourPlayerId, opponentPlayerId }) => ({ playerId: ourPlayerId, opponentPlayerId })),
      away: (options.defensiveMatchups?.away ?? []).map(({ ourPlayerId, opponentPlayerId }) => ({ playerId: ourPlayerId, opponentPlayerId })),
    },
    matchSeed: options.matchSeed,
    autonomousActions: true,
  }
}
