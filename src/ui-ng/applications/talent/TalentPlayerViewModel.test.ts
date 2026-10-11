import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { buildTalentPlayerViewModel } from './TalentPlayerViewModel'

describe('buildTalentPlayerViewModel', () => {
  it('does not change when hidden player ratings change', () => {
    const world = createNewGame()
    const player = world.players[getUserTeam(world)!.rosterPlayerIds[0]!]!
    const before = buildTalentPlayerViewModel(world, player.id)!
    const altered = updateGameWorld(world, {
      players: Object.values(world.players).map((candidate) => candidate.id === player.id
        ? { ...candidate, basketball: { ...candidate.basketball, ratings: { ...candidate.basketball.ratings, threePointShooting: 100, passing: 100 } } }
        : candidate),
    })

    expect(buildTalentPlayerViewModel(altered, player.id)).toEqual(before)
  })
})
