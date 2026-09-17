import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString, staffPersonIdFromString } from '@/domain/ids'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'

import { coachProfileRefsForCoachId, createCoach, createLegacyCoach, projectCoachToStaffRole } from './index'

describe('Coach', () => {
  const input = {
    id: coachIdFromString('coach-a'),
    ...coachProfileRefsForCoachId(coachIdFromString('coach-a')),
    firstName: 'Mara',
    lastName: 'Vega',
    gender: 'female' as const,
    nationalityId: countryIdFromString('country-a'),
  }

  it('creates a valid coach', () => {
    expect(createCoach(input)).toMatchObject(input)
    expect(createCoach(input).personId).toBe('person:staff:coach:coach-a')
    expect(createCoach(input).staffProfileId).toBe('staff:coach:coach-a')
    expect(createCoach(input).personId).not.toMatch(/^person:coach:/)
  })

  it('uses deterministic references only through the explicit legacy adapter', () => {
    const legacy = createLegacyCoach({ id: input.id, firstName: input.firstName, lastName: input.lastName, gender: input.gender, nationalityId: input.nationalityId })
    expect(legacy.personId).toBe(input.personId)
    expect(legacy.staffProfileId).toBe(input.staffProfileId)
  })

  it('rejects empty names', () => {
    expect(() => createCoach({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createCoach({ ...input, lastName: ' ' })).toThrow(TypeError)
  })

  it('rejects the legacy parallel Coach Person id', () => {
    expect(() => createCoach({ ...input, personId: 'person:coach:coach-a' as never })).toThrow(RangeError)
  })

  it('requires explicit canonical Person and StaffProfile references', () => {
    expect(() => createCoach({ ...input, personId: '' as never })).toThrow(TypeError)
    expect(() => createCoach({ ...input, staffProfileId: '' as never })).toThrow(TypeError)
  })

  it('projects the Coach gameplay profile into the canonical coaching Staff role', () => {
    const coach = createCoach(input)
    const staffProfile = createStaffPerson({
      id: staffPersonIdFromString('staff:coach:coach-a'),
      personId: coach.personId,
      identity: { firstName: coach.firstName, lastName: coach.lastName },
      professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as never },
      marketRole: 'headCoach',
      roleFamily: 'coaching',
    })
    expect(projectCoachToStaffRole(coach, staffProfile)).toEqual({ personId: coach.personId, staffProfileId: staffProfile.id, sourceCoachId: coach.id, roleFamily: 'coaching', role: 'headCoach' })
    expect(() => projectCoachToStaffRole(coach, { ...staffProfile, marketRole: 'assistantCoach' })).toThrow(RangeError)
  })
})
