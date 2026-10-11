import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { createDevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import type { CanonicalRatingKey } from '@/domain/player'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateFatigueAtEvents, calculateMatchPlayerStats, type FatigueByPlayerId, type MatchSimulation } from '@/engine/match'

/** Career fatigue (0–100) enters the legacy session on its existing 0–100 scale at half strength. */
export function careerFatigueToMatchSession(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Career fatigue must be finite')
  return Math.min(100, Math.max(0, value)) * 0.5
}

/** Applies legacy match load at the canonical result boundary. */
export function applyPlayerMatchConsequences(worldBeforeMatch: GameWorld, completedWorld: GameWorld, simulation: MatchSimulation, pendingEvidence?: ReturnType<typeof createDevelopmentStimulusEvent>[]): GameWorld {
  const initialFatigue = initialMatchFatigue(simulation.squads, worldBeforeMatch.careerFatigueByPlayerId)
  const finalFatigue = calculateFatigueAtEvents(simulation.lineups, simulation.squads, simulation.homeTeamId, simulation.awayTeamId, simulation.events, initialFatigue)
  const fatigue = { ...completedWorld.careerFatigueByPlayerId }
  const stimulus = { ...completedWorld.developmentStimulusByPlayerId }
  const stimulusEvents = [] as ReturnType<typeof createDevelopmentStimulusEvent>[]
  let changed = false

  for (const stats of calculateMatchPlayerStats(simulation)) {
    const before = initialFatigue[stats.playerId] ?? 0
    const after = finalFatigue[stats.playerId] ?? before
    const careerDelta = Math.max(0, after - before) * 0.125
    if (careerDelta > 0) {
      fatigue[stats.playerId] = clampCareerFatigue((fatigue[stats.playerId] ?? 0) + careerDelta)
      changed = true
    }
    const currentStimulus = stimulus[stats.playerId]
    if (currentStimulus !== undefined && stats.secondsPlayed > 0) {
      const byRating = deriveStimulus(stats.secondsPlayed / 60, stats.threePointAttempted, stats.twoPointAttempted, stats.offensiveRebounds, stats.defensiveRebounds, stats.assists, stats.steals, stats.blocks)
      stimulus[stats.playerId] = addDevelopmentStimulus(currentStimulus, byRating)
      if (Object.values(byRating).some((amount) => amount !== undefined && amount > 0)) stimulusEvents.push(createDevelopmentStimulusEvent({ id: `match:${simulation.gameId}:${stats.playerId}`, playerId: stats.playerId, sourceType: 'match', sourceId: simulation.gameId, date: completedWorld.games[simulation.gameId]!.date, byRating }))
      changed = true
    }
  }
  pendingEvidence?.push(...stimulusEvents)
  return changed ? updateGameWorld(completedWorld, { careerFatigueByPlayerId: fatigue, developmentStimulusByPlayerId: stimulus, ...(pendingEvidence === undefined ? { developmentStimulusEventAdditions: stimulusEvents } : {}) }) : completedWorld
}

export function initialMatchFatigue(squads: MatchSimulation['squads'], careerFatigueByPlayerId: GameWorld['careerFatigueByPlayerId']): FatigueByPlayerId {
  return Object.fromEntries([...squads.home, ...squads.away].map((playerId) => [playerId, careerFatigueToMatchSession(careerFatigueByPlayerId[playerId] ?? 0)])) as FatigueByPlayerId
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
