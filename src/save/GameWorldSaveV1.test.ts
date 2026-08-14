import { describe, expect, it } from 'vitest'

import { createNewGame, playUserGame } from '@/app/game'
import { calculateAge } from '@/domain/player'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'

describe('GameWorldSaveV1', () => {
  it('round-trips canonical world data independently of the runtime object', () => {
    const world = createNewGame()
    const saved = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)

    expect(loaded).toEqual(world)
    expect(loaded.coachProfessionalProfilesByCoachId).toEqual(world.coachProfessionalProfilesByCoachId)
    expect(loaded.coachRpgProfilesByCoachId).toEqual(world.coachRpgProfilesByCoachId)
    expect(saved.payload.players).not.toBe(Object.values(world.players))
  })

  it('enriches legacy and partial Staff saves without replacing existing Staff', () => {
    const world = createNewGame()
    const envelope = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    const { staffPeople: _staffPeople, teamStaffAssignments: _teamStaffAssignments, ...legacyPayload } = envelope.payload
    const removedAssignment = Object.values(world.teamStaffAssignmentsById)[0]!
    const partialPayload = {
      ...envelope.payload,
      staffPeople: envelope.payload.staffPeople.filter((person) => person.id !== removedAssignment.staffPersonId),
      teamStaffAssignments: envelope.payload.teamStaffAssignments.filter((assignment) => assignment.id !== removedAssignment.id),
    }
    const legacy = deserializeGameWorldV1({ ...envelope, payload: legacyPayload })
    const partial = deserializeGameWorldV1({ ...envelope, payload: partialPayload })

    expect(legacy.staffPeopleById).toEqual(world.staffPeopleById)
    expect(legacy.teamStaffAssignmentsById).toEqual(world.teamStaffAssignmentsById)
    expect(partial.staffPeopleById[removedAssignment.staffPersonId]).toEqual(world.staffPeopleById[removedAssignment.staffPersonId])
    expect(partial.teamStaffAssignmentsById[removedAssignment.id]).toEqual(world.teamStaffAssignmentsById[removedAssignment.id])
    expect(deserializeGameWorldV1(serializeGameWorldV1(partial, envelope.savedAt))).toEqual(partial)
  })

  it('rejects unsupported schemas and corrupted collections', () => {
    expect(() => deserializeGameWorldV1({ schemaVersion: 2, savedAt: '2032-10-01T12:00:00.000Z', payload: {} })).toThrow('Unsupported save version')
    expect(() => deserializeGameWorldV1({ schemaVersion: 1, savedAt: '2032-10-01T12:00:00.000Z', payload: { countries: {} } })).toThrow('Save seasons')
  })

  it('preserves completed match logs and the deterministic next result', () => {
    const completed = playUserGame(createNewGame())
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(completed, '2032-10-01T12:00:00.000Z'))
    const original = createNewGame()
    const loadedBeforePlay = deserializeGameWorldV1(serializeGameWorldV1(original, '2032-10-01T12:00:00.000Z'))

    expect(loaded.matchStatLogsByGameId).toEqual(completed.matchStatLogsByGameId)
    expect(withoutCoachRpgProfiles(playUserGame(loadedBeforePlay))).toEqual(withoutCoachRpgProfiles(playUserGame(original)))
  })

  it('enriches legacy players without bio deterministically', () => {
    const envelope = serializeGameWorldV1(createNewGame(), '2032-10-01T12:00:00.000Z')
    const legacy = { ...envelope, payload: { ...envelope.payload, players: envelope.payload.players.map(({ bio: _bio, ...player }) => player) } }
    const first = deserializeGameWorldV1(legacy)
    const second = deserializeGameWorldV1(legacy)

    expect(Object.values(first.players).map((player) => player.bio)).toEqual(Object.values(second.players).map((player) => player.bio))
    expect(Object.values(first.players).every((player) => calculateAge(player.bio.dateOfBirth, first.seasons[first.currentSeasonId]!.startDate) >= 18 && calculateAge(player.bio.dateOfBirth, first.seasons[first.currentSeasonId]!.startDate) <= 35)).toBe(true)
    expect(serializeGameWorldV1(first, envelope.savedAt).payload.players.every((player) => player.bio !== undefined)).toBe(true)
  })

  it('persists potential and enriches legacy saves without it from current state', () => {
    const envelope = serializeGameWorldV1(createNewGame(), '2032-10-01T12:00:00.000Z')
    const legacy = { ...envelope, payload: { ...envelope.payload, players: envelope.payload.players.map(({ potential: _potential, ...player }) => player) } }
    const first = deserializeGameWorldV1(legacy)
    const second = deserializeGameWorldV1(legacy)

    expect(Object.values(first.players).map((player) => player.potential)).toEqual(Object.values(second.players).map((player) => player.potential))
    expect(serializeGameWorldV1(first, envelope.savedAt).payload.players.every((player) => player.potential !== undefined)).toBe(true)
  })

  it('enriches legacy and partial finance saves without changing existing profiles', () => {
    const world = createNewGame()
    const envelope = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    const legacyPayload = { ...envelope.payload }
    delete (legacyPayload as { teamFinances?: unknown }).teamFinances
    const legacy = deserializeGameWorldV1({ ...envelope, payload: legacyPayload })
    const partialFinances = envelope.payload.teamFinances.slice(0, -1)
    const partial = deserializeGameWorldV1({ ...envelope, payload: { ...envelope.payload, teamFinances: partialFinances } })

    expect(Object.keys(legacy.teamFinancesByTeamId)).toHaveLength(Object.keys(legacy.teams).length)
    expect(Object.keys(partial.teamFinancesByTeamId)).toHaveLength(Object.keys(partial.teams).length)
    expect(Object.values(partialFinances)).toEqual(Object.values(partial.teamFinancesByTeamId).slice(0, -1))
    for (const team of Object.values(legacy.teams)) expect(() => getTeamFinancialSnapshot(legacy, team.id)).not.toThrow()
  })

  it.each([-1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid persisted potential %s', (ceiling) => {
    const envelope = serializeGameWorldV1(createNewGame(), '2032-10-01T12:00:00.000Z')
    const players = envelope.payload.players.map((player, index) => index === 0 ? { ...player, potential: { ceiling } } : player)
    expect(() => deserializeGameWorldV1({ ...envelope, payload: { ...envelope.payload, players } })).toThrow()
  })
})

function withoutCoachRpgProfiles<T extends { readonly coachProfessionalProfilesByCoachId: unknown; readonly coachRpgProfilesByCoachId: unknown }>(world: T): Omit<T, 'coachProfessionalProfilesByCoachId' | 'coachRpgProfilesByCoachId'> {
  const { coachProfessionalProfilesByCoachId: _professional, coachRpgProfilesByCoachId: _rpg, ...remaining } = world
  return remaining
}
