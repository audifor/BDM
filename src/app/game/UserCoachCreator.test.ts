import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from './createAcbTestGame'
import { applyUserCoachCreation, type UserCoachCreationInput } from './UserCoachCreator'
import { createConfiguredGame, createConfiguredGameAsync } from './createConfiguredGame'
import { WORLD_DB_SPAIN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld } from '@/domain/world'
import { createCoachFinanceProfile } from '@/domain/coachFinances'
import { getUserCoachAmbitionProgress } from './UserCoachAmbitions'

const created: UserCoachCreationInput = {
  firstName: '  Elena ',
  lastName: ' Villalobos ',
  dateOfBirth: '1991-06-19',
  gender: 'female',
  background: 'inDebt',
  ambition: 'financialFreedom',
  biography: '  Raised in an indebted family, looking for security.  ',
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
    expect(world.coachRpgProfilesByCoachId[coach.id]?.creatorOrigin).toEqual({
      background: 'inDebt', ambition: 'financialFreedom', biography: 'Raised in an indebted family, looking for security.',
    })
    expect(getUserCoachAmbitionProgress(world)?.completed).toBe(false)
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
    expect(restored.coachRpgProfilesByCoachId[coach.id]?.creatorOrigin).toEqual({
      background: 'inDebt', ambition: 'financialFreedom', biography: 'Raised in an indebted family, looking for security.',
    })
  })

  it('derives the personal money objective from actual cash and settled debt, not a separate score', () => {
    const initial = applyUserCoachCreation(createAcbTestGame(), created)
    const coachId = initial.userCoachId
    const existing = initial.coachFinancesByCoachId[coachId]!
    const wealthy = updateGameWorld(initial, { coachFinancesByCoachId: {
      ...initial.coachFinancesByCoachId,
      [coachId]: createCoachFinanceProfile({
        ...existing, cash: 1_100_000,
        debts: existing.debts.map(item => ({ ...item, principalRemaining: 0, status: 'paid' as const })),
      }),
    } })
    expect(getUserCoachAmbitionProgress(wealthy)).toMatchObject({ ambition: 'financialFreedom', completed: true, target: 1_000_000 })
    expect(getUserCoachAmbitionProgress(initial)?.completed).toBe(false)
  })

  it.each([
    ['academyCoach', 'playerDevelopment'],
    ['videoAnalyst', 'analysis'],
    ['formerAssistant', 'coaching'],
  ] as const)('origin %s changes live Staff attributes and persists in CoachRpg', (background, key) => {
    const world = createAcbTestGame()
    const coachId = world.userCoachId
    const staffId = world.coaches[coachId]!.staffProfileId
    const oldValue = world.staffPeopleById[staffId]!.professional.attributes[key]
    const next = applyUserCoachCreation(world, { ...created, background, ambition: 'talentDeveloper' })
    expect(next.staffPeopleById[staffId]!.professional.attributes[key]).toBeGreaterThan(oldValue)
    expect(next.coachRpgProfilesByCoachId[coachId]!.creatorOrigin?.ambition).toBe('talentDeveloper')
    expect(getUserCoachAmbitionProgress(next)).toMatchObject({ metric: 'playerDevelopmentEvents', completed: false })
  })

  it('rejects corrupt origin/ambition and cannot run the career creator a second time', () => {
    const initial = createAcbTestGame()
    expect(() => applyUserCoachCreation(initial, { ...created, ambition: 'unknown' as never })).toThrow(/ambition/)
    expect(() => applyUserCoachCreation(initial, { ...created, biography: 'x'.repeat(601) })).toThrow(/biography/)
    const createdWorld = applyUserCoachCreation(initial, created)
    expect(() => applyUserCoachCreation(createdWorld, created)).toThrow(/already initialized/)
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
