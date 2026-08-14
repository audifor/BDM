import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getLatestTrainingSession, getTrainingSessionsForTeam } from '@/domain/world'
import { executeTeamTraining, setTeamTrainingPlan } from './TrainingEngine'
import { advanceDay } from '@/engine/calendar'

describe('TrainingEngine', () => {
  it('creates one deterministic session without changing ratings directly', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!; const before = world.players[playerId]!.basketball.ratings
    const trained = advanceDay(world)
    expect(trained.players[playerId]!.basketball.ratings).toEqual(before)
    expect(getLatestTrainingSession(trained, teamId)?.playerResults).toHaveLength(world.teams[teamId]!.rosterPlayerIds.length)
    expect(trained.developmentStimulusByPlayerId[playerId]!.byRating.finishing).toBeGreaterThan(0)
    expect(executeTeamTraining(trained, teamId)).toBe(trained)
  })

  it('updates team plans and exposes sessions in deterministic order', () => {
    const world = createNewGame(); const teamId = Object.values(world.teams)[0]!.id
    const updated = setTeamTrainingPlan(world, teamId, { intensity: 'high', focus: 'shooting' })
    expect(updated.trainingPlansByTeamId[teamId]).toMatchObject({ intensity: 'high', focus: 'shooting' })
    expect(getTrainingSessionsForTeam(advanceDay(updated), teamId)).toHaveLength(1)
  })
})
