import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getLatestTrainingSession, getTrainingSessionsForTeam } from '@/domain/world'
import { executeTeamTraining, getTrainingLoad, setIndividualTrainingFocus, setIndividualTrainingIntensity, setTeamTrainingPlan } from './TrainingEngine'
import { advanceDay } from '@/engine/calendar'

describe('TrainingEngine', () => {
  it('creates one deterministic session without changing ratings directly', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!; const before = world.players[playerId]!.basketball.ratings
    const trained = advanceDay(world)
    expect(trained.players[playerId]!.basketball.ratings).toEqual(before)
    expect(getLatestTrainingSession(trained, teamId)?.playerResults).toHaveLength(world.teams[teamId]!.rosterPlayerIds.length)
    expect(Object.values(trained.developmentStimulusByPlayerId[playerId]!.byRating).some((value) => value > 0)).toBe(true)
    expect(executeTeamTraining(trained, teamId)).toBe(trained)
  })

  it('updates team plans and exposes sessions in deterministic order', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id
    const updated = setTeamTrainingPlan(world, teamId, { intensity: 'high', focus: 'shooting' })
    expect(updated.trainingPlansByTeamId[teamId]).toMatchObject({ intensity: 'high', focus: 'shooting' })
    expect(getTrainingSessionsForTeam(advanceDay(updated), teamId)).toHaveLength(1)
  })

  it('redistributes an individual player stimulus and load without changing ratings directly', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id; const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const shooting = advanceDay(setIndividualTrainingFocus(world, playerId, 'shooting'))
    const high = advanceDay(setIndividualTrainingIntensity(setIndividualTrainingFocus(world, playerId, 'shooting'), playerId, 'high'))
    const shootingResult = getLatestTrainingSession(shooting, teamId)!.playerResults.find((result) => result.playerId === playerId)!
    const highResult = getLatestTrainingSession(high, teamId)!.playerResults.find((result) => result.playerId === playerId)!
    expect(shootingResult.stimulus.shooting).toBeGreaterThan(shootingResult.stimulus.finishing!)
    expect(highResult.careerFatigueAdded).toBeGreaterThan(shootingResult.careerFatigueAdded)
    expect(getTrainingLoad(high, teamId).find((item) => item.playerId === playerId)!.individualPlanLoad).toBeGreaterThan(0)
  })
})
