import { tuning } from '@/engine/match-next/tuning'
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
      physical: { ...profile.physical }, kinematics: gameSpeedKinematics(profile.kinematics), offense: { ...profile.offense },
      passing: profile.passing === undefined ? undefined : { ...profile.passing },
      defense: { ...profile.defense }, rebounding: { ...profile.rebounding },
      dynamicState: { careerFatigue: world.careerFatigueByPlayerId[profile.playerId] ?? 0 },
    })),
    ...options.playerProfiles.away.map((profile) => ({
      playerId: profile.playerId, teamId: awayTeamId, primaryPosition: profile.primaryPosition,
      secondaryPositions: world.players[profile.playerId]!.basketball.secondaryPositions,
      physical: { ...profile.physical }, kinematics: gameSpeedKinematics(profile.kinematics), offense: { ...profile.offense },
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
    clockRules: { ...clock, shotClockSeconds: clock.shotClockSeconds ?? 24, offensiveReboundShotClockSeconds: clock.offensiveReboundShotClockSeconds ?? null },
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

/**
 * The shared player profile gives limits for a generic athlete (acceleration 2.4-3.6, braking 3.2-4.8 m/s2): at those values a runner
 * needs about three seconds to reverse, which is skating. On court a player plants and cuts: he accelerates and brakes harder and turns
 * on a grip of his own (BT4.1). The scale is a tuning parameter so audits can sweep it.
 */
function gameSpeedKinematics(kinematics: { readonly maxSpeedMps: number; readonly accelerationMps2: number; readonly brakingMps2: number }): MatchNextPlayerProfile['kinematics'] {
  const { movementAgility, lateralGripFactor } = tuning()
  const braking = kinematics.brakingMps2 * movementAgility
  return {
    maxSpeedMps: kinematics.maxSpeedMps, accelerationMps2: kinematics.accelerationMps2 * movementAgility, brakingMps2: braking,
    ...(lateralGripFactor > 0 ? { lateralGripMps2: braking * lateralGripFactor } : {}),
  }
}
