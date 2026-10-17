import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from './createAcbTestGame'
import { applyUserCoachCreation, type UserCoachCreationInput } from './UserCoachCreator'
import { createConfiguredGame, createConfiguredGameAsync } from './createConfiguredGame'
import { WORLD_DB_SPAIN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const created: UserCoachCreationInput = {
  firstName: '  Elena ',
  lastName: ' Villalobos ',
  dateOfBirth: '1991-06-19',
  gender: 'female',
  background: 'inDebt',
  disposition: 'ambitious',
  coachingStyle: 'tactician',
}

describe('BS19B user-created Coach foundation', () => {
  it('keeps a single Person/StaffProfile/Coach identity and records opening debt in the actual GameWorld', () => {
    const original = createAcbTestGame()
    const priorCoach = original.coaches[original.userCoachId]!
    const previousFinance = original.coachFinancesByCoachId[original.userCoachId]!
    const previousProfessional = original.staffPeopleById[priorCoach.staffProfileId]!.professional
    const world = applyUserCoachCreation(original, created)
    const coach = world.coaches[world.userCoachId]!
    const staff = world.staffPeopleById[coach.staffProfileId]!
    const person = world.personsById[coach.personId]!

    expect(coach.id).toBe(priorCoach.id)
    expect(coach.staffProfileId).toBe(priorCoach.staffProfileId)
    expect(coach.personId).toBe(priorCoach.personId)
    expect([coach.firstName, coach.lastName, coach.gender]).toEqual(['Elena', 'Villalobos', 'female'])
    expect([staff.identity.firstName, staff.identity.lastName, staff.identity.dateOfBirth]).toEqual(['Elena', 'Villalobos', '1991-06-19'])
    expect([person.firstName, person.lastName, person.dateOfBirth, person.gender]).toEqual(['Elena', 'Villalobos', '1991-06-19', 'female'])
    expect(person.profileRefs).toContainEqual({ kind: 'staff', profileId: coach.staffProfileId })
    expect(Object.values(world.personsById).filter((row) => row.id === coach.personId)).toHaveLength(1)
    expect(world.staffPeopleById[coach.staffProfileId]!.professional.attributes.tacticalKnowledge).toBeGreaterThan(previousProfessional.attributes.tacticalKnowledge)
    expect(world.personalitiesByPersonId[coach.id]!.values.ambition).toBeGreaterThanOrEqual(70)
    expect(world.coachFinancesByCoachId[coach.id]!.cash).toBe(2_500)
    expect(world.coachFinancesByCoachId[coach.id]!.debts).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalRemaining: 30_000, monthlyPayment: 850, status: 'active' }),
    ]))
    expect(previousFinance.debts).toHaveLength(0)
    expect(original.coaches[original.userCoachId]!.firstName).toBe('BDM')
  })

  it('preserves created Person, StaffProfile, personality and debt across Save V4', () => {
    const world = applyUserCoachCreation(createAcbTestGame(), created)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-10-17T10:00:00.000Z'))
    const coach = restored.coaches[restored.userCoachId]!
    expect([coach.firstName, coach.lastName, coach.gender]).toEqual(['Elena', 'Villalobos', 'female'])
    expect(restored.staffPeopleById[coach.staffProfileId]!.identity.dateOfBirth).toBe('1991-06-19')
    expect(restored.personsById[coach.personId]!.dateOfBirth).toBe('1991-06-19')
    expect(restored.personalitiesByPersonId[coach.id]!.values.ambition).toBeGreaterThanOrEqual(70)
    expect(restored.coachFinancesByCoachId[coach.id]!.cash).toBe(2_500)
    expect(restored.coachFinancesByCoachId[coach.id]!.debts[0]!.principalRemaining).toBe(30_000)
  })

  it('preserves the source identity if no creation request was supplied', () => {
    const world = createConfiguredGame({ universeId: 'prototype' })
    expect(world.coaches[world.userCoachId]).toBeDefined()
    const coach = world.coaches[world.userCoachId]!
    expect(coach.personId).toBe(world.staffPeopleById[coach.staffProfileId]?.personId)
  })

  it('rejects underage, unknown nationality and invalid background before mutating the original world', () => {
    const original = createAcbTestGame()
    expect(() => applyUserCoachCreation(original, { ...created, dateOfBirth: '2020-01-01' })).toThrow(/18 and 99/)
    expect(() => applyUserCoachCreation(original, { ...created, nationalityId: 'unknown-country' as never })).toThrow(/country/)
    expect(() => applyUserCoachCreation(original, { ...created, background: 'fake' as never })).toThrow(/background/)
    expect(original.coaches[original.userCoachId]!.firstName).toBe('BDM')
  })

  it('requires the actual WorldDB catalog and a valid team for a new historical-world appointment', async () => {
    await expect(createConfiguredGameAsync({
      universeId: WORLD_DB_SPAIN_UNIVERSE_ID,
      userTeamKey: '',
      userCoachCreation: created,
    })).rejects.toThrow()
  })
})
