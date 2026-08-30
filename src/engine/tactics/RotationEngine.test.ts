import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'
import { activeLineupPlayerIds, rotationRegulationPeriodMinutes, updateRotationMinutesForTeam } from './RotationEngine'

function withStarterLineup(base: ReturnType<typeof createNewGame>) {
  const team = getUserTeam(base)!
  const roster = getTeamRoster(base, team.id)
  const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
  return slots.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, roster[index]!.id), base)
}

describe('RotationEngine (Issue #9 blocker 2 write boundary)', () => {
  it('resolves the real active-12 player ids from the canonical lineup', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const ids = activeLineupPlayerIds(world, team.id)
    expect(ids).toHaveLength(12)
    expect(new Set(ids)).toEqual(new Set(roster.map((player) => player.id)))
  })

  it('resolves default FIBA-style regulation period minutes when no game/competition can be resolved', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    expect(rotationRegulationPeriodMinutes(world, team.id)).toEqual([10, 10, 10, 10])
  })

  it('resolves NCAA-men-style regulation period minutes from the actual resolved competition', () => {
    const base = withStarterLineup(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const competitionId = Object.values(base.competitions).find((competition) => competition.participantTeamIds.includes(team.id))!.id
    const ncaaWorld = { ...base, competitions: { ...base.competitions, [competitionId]: { ...base.competitions[competitionId]!, rules: { ...base.competitions[competitionId]!.rules, gameFormat: NCAA_MEN_GAME_FORMAT } } } }
    expect(rotationRegulationPeriodMinutes(ncaaWorld, team.id)).toEqual([20, 20])
    void roster
  })

  it('rejects an invalid allocation and leaves GameWorld.rotationPlansByTeamId completely untouched', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const invalid = Object.fromEntries(roster.map((player) => [player.id, [1, 1, 1, 1]]))

    expect(() => updateRotationMinutesForTeam(world, team.id, invalid)).toThrow(RangeError)
    expect(world.rotationPlansByTeamId[team.id]).toBeUndefined()
  })

  it('accepts a valid allocation and persists it', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const valid = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [10, 10, 10, 10] : [0, 0, 0, 0]]))

    const updated = updateRotationMinutesForTeam(world, team.id, valid)
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod![roster[0]!.id]).toEqual([10, 10, 10, 10])
  })

  it('strips rows for players not in the active lineup before validating/persisting', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const valid = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [10, 10, 10, 10] : [0, 0, 0, 0]]))
    const withStaleRow = { ...valid, 'not-active': [10, 10, 10, 10] }

    const updated = updateRotationMinutesForTeam(world, team.id, withStaleRow as never)
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod!['not-active' as never]).toBeUndefined()
  })

  it('a value that is valid for FIBA (10-minute periods) is invalid for NCAA-men (20-minute periods), and vice versa', () => {
    const base = withStarterLineup(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const fibaValid = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [10, 10, 10, 10] : [0, 0, 0, 0]]))

    const competitionId = Object.values(base.competitions).find((competition) => competition.participantTeamIds.includes(team.id))!.id
    const ncaaWorld = { ...base, competitions: { ...base.competitions, [competitionId]: { ...base.competitions[competitionId]!, rules: { ...base.competitions[competitionId]!.rules, gameFormat: NCAA_MEN_GAME_FORMAT } } } }

    expect(() => updateRotationMinutesForTeam(ncaaWorld, team.id, fibaValid)).toThrow(RangeError)

    const ncaaValid = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [20, 20] : [0, 0]]))
    const updated = updateRotationMinutesForTeam(ncaaWorld, team.id, ncaaValid)
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod![roster[0]!.id]).toEqual([20, 20])
  })

  it('an OT column with zero or partial minutes does not block a valid regulation-time save', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const validWithZeroOt = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [10, 10, 10, 10, 0] : [0, 0, 0, 0, 0]]))

    const updated = updateRotationMinutesForTeam(world, team.id, validWithZeroOt)
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod![roster[0]!.id]).toEqual([10, 10, 10, 10, 0])
  })
})
