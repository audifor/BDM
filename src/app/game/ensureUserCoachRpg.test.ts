import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { useGameStore } from '@/stores/gameStore'
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
  it('repairs loaded saves through the game store, preserving the rest of the world', () => {
    const world = createNewGame()
    const missing = updateGameWorld(world, { coachRpgProfilesByCoachId: {} })
    useGameStore.getState().replaceWorld(missing)
    const loaded = useGameStore.getState().world!
    expect(loaded.coachRpgProfilesByCoachId[world.userCoachId]).toBeDefined()
    expect(loaded.games).toEqual(missing.games)
    useGameStore.getState().resetGame()
  })
  it('never replaces a materialized profile or changes its progression', () => {
    const world = createNewGame()
    expect(ensureUserCoachRpgProfile(world)).toBe(world)
    expect(ensureUserCoachRpgProfile(world).coachRpgProfilesByCoachId[world.userCoachId])
      .toBe(world.coachRpgProfilesByCoachId[world.userCoachId])
  })
})
