import { describe, expect, it } from 'vitest'

import { createNewGame, playUserGame } from '@/app/game'
import { calculateAge } from '@/domain/player'
import { createDeadMoneyCharge, createTeamSalaryException } from '@/domain/salary'
import { updateGameWorld } from '@/domain/world'
import { getTeamFinancialSnapshot } from '@/domain/world/finances'
import { deserializeGameWorldV1, serializeGameWorldV1 } from './GameWorldSaveV1'
import { executeTeamTraining } from '@/engine/training'
import { advanceDay } from '@/engine/calendar'

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

  it('round-trips eligibility history and initializes neutral NCAA profiles for legacy saves', () => {
    const world = createNewGame()
    const profile = Object.values(world.eligibilityProfilesById)[0]!
    const seasonId = Object.values(world.seasons).find((season) => world.competitions[season.competitionId]!.ecosystemId === profile.ecosystemId)!.id
    const withHistory = updateGameWorld(world, { eligibilityProfiles: Object.values(world.eligibilityProfilesById).map((item) => item.id === profile.id ? { ...profile, seasonsUsed: 1, seasonRecordsBySeasonId: { [seasonId]: { seasonId, gamesParticipated: 2, gameIds: ['game:test'], eligibilityConsumed: true, resolved: true } } } : item), eligibilityRestrictions: [{ id: 'eligibility-restriction:save', playerId: profile.playerId, ecosystemId: profile.ecosystemId, reasonCode: 'test', startsAt: world.currentDate }] })
    const saved = serializeGameWorldV1(withHistory, '2032-10-01T12:00:00.000Z')
    expect(deserializeGameWorldV1(saved)).toEqual(withHistory)
    const { eligibilityRules: _rules, eligibilityProfiles: _profiles, eligibilityRestrictions: _restrictions, ...legacy } = saved.payload
    const loadedLegacy = deserializeGameWorldV1({ ...saved, payload: legacy })
    expect(Object.values(loadedLegacy.eligibilityProfilesById)).not.toHaveLength(0)
    expect(Object.values(loadedLegacy.eligibilityProfilesById).every((item) => item.seasonsUsed === 0 && Object.keys(item.seasonRecordsBySeasonId).length === 0)).toBe(true)
  })

  it('round-trips salary rules and obligations while legacy saves keep them empty', () => {
    const base = createNewGame()
    const [seasonId] = Object.keys(base.salaryRulesBySeasonId) as (keyof typeof base.seasons)[]
    const teamId = Object.values(base.teams)[0]!.id
    const world = updateGameWorld(base, { salaryExceptions: [createTeamSalaryException({ id: 'exception:test', ruleId: 'standard', teamId, seasonId, originalAmount: 10, remainingAmount: 4, expiresAfterSeasonId: seasonId, status: 'active' })], deadMoneyCharges: [createDeadMoneyCharge({ id: 'dead:test', teamId, seasonId, amount: 7, reason: 'release' })] })
    const saved = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    const loaded = deserializeGameWorldV1(saved)
    expect(loaded.salaryRulesBySeasonId).toEqual(world.salaryRulesBySeasonId)
    expect(loaded.salaryExceptionsById).toEqual(world.salaryExceptionsById)
    expect(loaded.deadMoneyChargesById).toEqual(world.deadMoneyChargesById)
    const { salaryRules: _rules, salaryExceptions: _exceptions, deadMoneyCharges: _charges, ...legacy } = saved.payload
    expect(deserializeGameWorldV1({ ...saved, payload: legacy }).salaryExceptionsById).toEqual({})
  })

  it('round-trips training state and supplies deterministic legacy defaults', () => {
    const base = createNewGame(); const trained = advanceDay(base)
    const saved = serializeGameWorldV1(trained, '2032-10-01T12:00:00.000Z')
    expect(deserializeGameWorldV1(saved)).toEqual(trained)
    const { trainingPlans: _plans, trainingSessions: _sessions, developmentStimulus: _stimulus, careerFatigue: _fatigue, ...legacyPayload } = saved.payload
    const legacy = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(Object.values(legacy.trainingSessionsById)).toEqual([])
    expect(Object.values(legacy.careerFatigueByPlayerId).every((value) => value === 0)).toBe(true)
    expect(deserializeGameWorldV1(serializeGameWorldV1(legacy, saved.savedAt))).toEqual(legacy)
  })

  it('round-trips scheduled training sessions and user-created modules, and legacy saves default them to empty', () => {
    const base = createNewGame()
    const teamId = Object.values(base.teams)[0]!.id
    const playerId = base.teams[teamId]!.rosterPlayerIds[0]!
    const world = updateGameWorld(base, {
      scheduledTrainingSessionsById: {
        'session:test': { id: 'session:test', teamId, date: base.currentDate, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal', status: 'scheduled' },
      },
      userTrainingModulesById: {
        'module:test': { id: 'module:test', name: 'Custom Threes', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'high' },
      },
    })
    const saved = serializeGameWorldV1(world, '2032-10-01T12:00:00.000Z')
    expect(deserializeGameWorldV1(saved)).toEqual(world)
    const { scheduledTrainingSessions: _sessions, userTrainingModules: _modules, ...legacyPayload } = saved.payload
    const legacy = deserializeGameWorldV1({ ...saved, payload: legacyPayload })
    expect(legacy.scheduledTrainingSessionsById).toEqual({})
    expect(legacy.userTrainingModulesById).toEqual({})
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
