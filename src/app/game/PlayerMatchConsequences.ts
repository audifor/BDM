import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import type { CanonicalRatingKey } from '@/domain/player'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateFatigueAtEvents, calculateMatchPlayerStats, type MatchSimulation } from '@/engine/match'

/** Applies legacy match load at the canonical result boundary. */
export function applyPlayerMatchConsequences(completedWorld: GameWorld, simulation: MatchSimulation): GameWorld {
  const finalFatigue = calculateFatigueAtEvents(simulation.lineups, simulation.squads, simulation.homeTeamId, simulation.awayTeamId, simulation.events)
  const fatigue = { ...completedWorld.careerFatigueByPlayerId }
  const stimulus = { ...completedWorld.developmentStimulusByPlayerId }
  let changed = false

  for (const stats of calculateMatchPlayerStats(simulation)) {
    const after = finalFatigue[stats.playerId] ?? 0
    const careerDelta = after * 0.125
    if (careerDelta > 0) {
      fatigue[stats.playerId] = clampCareerFatigue((fatigue[stats.playerId] ?? 0) + careerDelta)
      changed = true
    }
    const currentStimulus = stimulus[stats.playerId]
    if (currentStimulus !== undefined && stats.secondsPlayed > 0) {
      stimulus[stats.playerId] = addDevelopmentStimulus(currentStimulus, deriveStimulus(stats.secondsPlayed / 60, stats.threePointAttempted, stats.twoPointAttempted, stats.offensiveRebounds, stats.defensiveRebounds, stats.assists, stats.steals, stats.blocks))
      changed = true
    }
  }
  return changed ? updateGameWorld(completedWorld, { careerFatigueByPlayerId: fatigue, developmentStimulusByPlayerId: stimulus }) : completedWorld
}

function deriveStimulus(minutes: number, threes: number, twos: number, offensiveRebounds: number, defensiveRebounds: number, assists: number, steals: number, blocks: number): Partial<Record<CanonicalRatingKey, number>> {
  const values: Partial<Record<CanonicalRatingKey, number>> = {
    stamina: Math.min(0.2, minutes / 40 * 0.2),
    threePointShooting: Math.min(0.25, threes * 0.025),
    midRangeShooting: Math.min(0.2, twos * 0.015),
    offensiveRebounding: Math.min(0.15, offensiveRebounds * 0.025),
    defensiveRebounding: Math.min(0.15, defensiveRebounds * 0.02),
    passing: Math.min(0.15, assists * 0.02),
    courtVision: Math.min(0.1, assists * 0.01),
    steal: Math.min(0.1, steals * 0.025),
    anticipation: Math.min(0.1, steals * 0.015),
    rimProtection: Math.min(0.1, blocks * 0.025),
    vertical: Math.min(0.1, blocks * 0.015),
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value > 0)) as Partial<Record<CanonicalRatingKey, number>>
}
