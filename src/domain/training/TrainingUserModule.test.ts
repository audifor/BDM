import { describe, expect, it } from 'vitest'
import { createUserTrainingModule } from './TrainingUserModule'

describe('createUserTrainingModule', () => {
  it('creates a valid module composing a base catalog definition', () => {
    const module = createUserTrainingModule({ id: 'u1', name: 'Custom Shooting', baseDefinitionId: 'threePoint', scope: 'individual', intensity: 'high' })
    expect(module.baseDefinitionId).toBe('threePoint')
  })

  it('rejects an unknown base definition, invalid intensity, and empty fields', () => {
    expect(() => createUserTrainingModule({ id: 'u1', name: 'X', baseDefinitionId: 'not-real', scope: 'team', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createUserTrainingModule({ id: '', name: 'X', baseDefinitionId: 'threePoint', scope: 'team', intensity: 'normal' })).toThrow(RangeError)
    expect(() => createUserTrainingModule({ id: 'u1', name: '', baseDefinitionId: 'threePoint', scope: 'team', intensity: 'normal' })).toThrow(RangeError)
  })

  it('rejects scoping a team-only definition to individual training and vice versa', () => {
    expect(() => createUserTrainingModule({ id: 'u1', name: 'X', baseDefinitionId: 'offensiveSystem', scope: 'individual', intensity: 'normal' })).toThrow(RangeError)
  })
})
