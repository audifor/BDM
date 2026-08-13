import { createNewGame } from '@/app/game'
import { getKnownBasketballRating, getPlayerKnowledge } from '@/domain/world'
import { describe, expect, it } from 'vitest'
import { ensurePlayerKnowledge } from './PlayerKnowledgeEnrichment'

describe('Player knowledge', () => {
  it('creates one deterministic sparse user-team record per player and preserves it', () => {
    const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const own = team.rosterPlayerIds[0]!; const external = Object.values(world.players).find((player) => !team.rosterPlayerIds.includes(player.id))!
    expect(Object.values(world.playerKnowledgeById)).toHaveLength(Object.keys(world.players).length)
    expect(Object.values(world.playerKnowledgeById).every((record) => record.observerTeamId === team.id)).toBe(true)
    expect(ensurePlayerKnowledge(world)).toEqual(world)
    expect(getPlayerKnowledge(world, team.id, own)?.basketball.ratings.finishing.uncertainty).toBeLessThanOrEqual(2)
    expect(getPlayerKnowledge(world, team.id, external.id)?.basketball.ratings.finishing.uncertainty).toBeGreaterThanOrEqual(4)
  })
  it('returns unknown rather than Player truth when knowledge is absent', () => {
    const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const player = Object.values(world.players)[0]!
    const unknown = { ...world, playerKnowledgeById: {} }
    expect(getKnownBasketballRating(unknown, team.id, player.id, 'shooting')).toEqual({ status: 'unknown' })
  })
})
