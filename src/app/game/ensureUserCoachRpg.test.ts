import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { ensureUserCoachRpgProfile } from './ensureUserCoachRpg'

describe('User Coach RPG completeness', () => {
  it('restores a missing RPG profile using canonical zero-state defaults', () => {
    const world = createNewGame()
    const incomplete = updateGameWorld(world, { coachRpgProfilesByCoachId: {} })
    const repaired = ensureUserCoachRpgProfile(incomplete)
    expect(repaired.coachRpgProfilesByCoachId[world.userCoachId]).toBeDefined()
    expect(repaired.coachRpgProfilesByCoachId[world.userCoachId]!.development.developmentPoints).toBe(0)
    expect(repaired.coachRpgProfilesByCoachId[world.userCoachId]!.development.globalProgress).toBe(0)
    expect(repaired.coachRpgProfilesByCoachId[world.userCoachId]!.professionalTraits).toEqual([])
    expect(repaired.coaches).toEqual(incomplete.coaches)
  })
  it('never replaces a materialized profile or changes its progression', () => {
    const world = createNewGame()
    expect(ensureUserCoachRpgProfile(world)).toBe(world)
    expect(ensureUserCoachRpgProfile(world).coachRpgProfilesByCoachId[world.userCoachId])
      .toBe(world.coachRpgProfilesByCoachId[world.userCoachId])
  })
})
