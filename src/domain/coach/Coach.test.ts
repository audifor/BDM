import { describe, expect, it } from 'vitest'

import { coachIdFromString, countryIdFromString } from '@/domain/ids'

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
    expect(createCoach(input).personId).toBe('person:coach:coach-a')
  })

  it('rejects empty names', () => {
    expect(() => createCoach({ ...input, firstName: '' })).toThrow(TypeError)
    expect(() => createCoach({ ...input, lastName: ' ' })).toThrow(TypeError)
  })

  it('projects the Coach gameplay profile into the canonical coaching Staff role', () => {
    const coach = createCoach(input)
    expect(projectCoachToStaffRole(coach)).toEqual({ personId: coach.personId, sourceCoachId: coach.id, roleFamily: 'coaching', role: 'headCoach' })
  })
})
