import { createNewGame } from '@/app/game'
import { getEcosystemForTeam, getKnownBasketballRating, getPlayerKnowledge } from '@/domain/world'
import { describe, expect, it } from 'vitest'
import { ensurePlayerKnowledge } from './PlayerKnowledgeEnrichment'

describe('Player knowledge', () => {
  it('creates deterministic sparse records only for players in the observer category and preserves them', () => {
    const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const category = getEcosystemForTeam(world, team.id)!.category; const own = team.rosterPlayerIds[0]!; const external = Object.values(world.players).find((player) => !team.rosterPlayerIds.includes(player.id) && getEcosystemForTeam(world, Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(player.id))!.id)!.category === category)!; const otherCategoryPlayer = Object.values(world.players).find((player) => getEcosystemForTeam(world, Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(player.id))!.id)!.category !== category)!
    expect(Object.values(world.playerKnowledgeById)).toHaveLength(0)
    expect(world.organizationKnowledge).toEqual([])
    const legacyWorld = ensurePlayerKnowledge(world)
    expect(Object.values(legacyWorld.playerKnowledgeById).every((record) => {
      const observerCategory = getEcosystemForTeam(world, record.observerTeamId)!.category
      const subjectTeam = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(record.subjectPlayerId))!
      return getEcosystemForTeam(world, subjectTeam.id)!.category === observerCategory
    })).toBe(true)
    expect(getPlayerKnowledge(legacyWorld, team.id, otherCategoryPlayer.id)).toBeUndefined()
    expect(ensurePlayerKnowledge(legacyWorld)).toEqual(legacyWorld)
    expect(getPlayerKnowledge(legacyWorld, team.id, own)?.basketball.ratings.finishing.uncertainty).toBeLessThanOrEqual(2)
    expect(getPlayerKnowledge(legacyWorld, team.id, external.id)?.basketball.ratings.finishing.uncertainty).toBeGreaterThanOrEqual(4)
  })
  it('returns unknown rather than Player truth when knowledge is absent', () => {
    const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const player = Object.values(world.players)[0]!
    const unknown = { ...world, playerKnowledgeById: {} }
    expect(getKnownBasketballRating(unknown, team.id, player.id, 'shooting')).toEqual({ status: 'unknown' })
  })
})
