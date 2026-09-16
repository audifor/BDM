import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString, staffPersonIdFromString } from '@/domain/ids'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'

import { createCoach, projectCoachToStaffRole } from './index'

describe('Coach', () => {
  const input = {
    id: coachIdFromString('coach-a'),
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

  it('rejects empty names', () => {
    expect(() => createCoach({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createCoach({ ...input, lastName: ' ' })).toThrow(TypeError)
  })

  it('rejects the legacy parallel Coach Person id', () => {
    expect(() => createCoach({ ...input, personId: 'person:coach:coach-a' as never })).toThrow(RangeError)
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
