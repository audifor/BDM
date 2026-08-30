import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { getLatestTrainingSession, getTrainingSessionsForTeam, updateGameWorld, type GameWorld } from '@/domain/world'
import { executeTeamTraining, getTrainingLoad, setIndividualTrainingFocus, setIndividualTrainingIntensity, setTeamTrainingPlan } from './TrainingEngine'
import { advanceDay } from '@/engine/calendar'

/** Legacy pipeline no-ops on a date with a scheduled game (canTeamTrainOnDate); bump past it without touching the canonical scheduled pipeline. */
function skipToTrainableDate(world: GameWorld): GameWorld {
  return updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
}

describe('TrainingEngine (legacy plan pipeline, no longer auto-applied by advanceDay)', () => {
  it('creates one deterministic session without changing ratings directly, when explicitly invoked', () => {
    const world = skipToTrainableDate(createNewGame()); const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!; const before = world.players[playerId]!.basketball.ratings
    const trained = executeTeamTraining(world, teamId)
    expect(trained.players[playerId]!.basketball.ratings).toEqual(before)
    expect(getLatestTrainingSession(trained, teamId)?.playerResults).toHaveLength(world.teams[teamId]!.rosterPlayerIds.length)
    expect(Object.values(trained.developmentStimulusByPlayerId[playerId]!.byRating).some((value) => value > 0)).toBe(true)
    expect(executeTeamTraining(trained, teamId)).toBe(trained)
  })

  it('advanceDay no longer auto-applies the legacy team training plan', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id
    expect(getTrainingSessionsForTeam(advanceDay(world), teamId)).toHaveLength(0)
  })

  it('updates team plans and exposes sessions in deterministic order when explicitly executed', () => {
    const world = skipToTrainableDate(createNewGame()); const teamId = Object.values(world.teams)[0]!.id
    const updated = setTeamTrainingPlan(world, teamId, { intensity: 'high', focus: 'shooting' })
    expect(updated.trainingPlansByTeamId[teamId]).toMatchObject({ intensity: 'high', focus: 'shooting' })
    expect(getTrainingSessionsForTeam(executeTeamTraining(updated, teamId), teamId)).toHaveLength(1)
  })

  it('redistributes an individual player stimulus and load without changing ratings directly, when explicitly executed', () => {
    const world = skipToTrainableDate(createNewGame()); const teamId = Object.values(world.teams)[0]!.id; const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const shooting = executeTeamTraining(setIndividualTrainingFocus(world, playerId, 'shooting'), teamId)
    const high = executeTeamTraining(setIndividualTrainingIntensity(setIndividualTrainingFocus(world, playerId, 'shooting'), playerId, 'high'), teamId)
    const shootingResult = getLatestTrainingSession(shooting, teamId)!.playerResults.find((result) => result.playerId === playerId)!
    const highResult = getLatestTrainingSession(high, teamId)!.playerResults.find((result) => result.playerId === playerId)!
    expect(shootingResult.stimulus.shooting).toBeGreaterThan(shootingResult.stimulus.finishing!)
    expect(highResult.careerFatigueAdded).toBeGreaterThan(shootingResult.careerFatigueAdded)
    expect(getTrainingLoad(high, teamId).find((item) => item.playerId === playerId)!.individualPlanLoad).toBeGreaterThan(0)
  })
})
