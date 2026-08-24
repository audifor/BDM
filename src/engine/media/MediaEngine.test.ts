import { describe, expect, it } from 'vitest'
import { createGameWorld, getPendingMediaOpportunities, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createNarrativeThread } from '@/domain/narrative'
import { createGame } from '@/domain/game'
import { createPreMatchMediaOpportunity, respondToMediaOpportunity, skipMediaOpportunity } from './MediaEngine'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

function finalWorld() { const world = createGameWorld(createValidGameWorldInput()); const game = createGame({ ...world.games['game-a' as keyof typeof world.games]!, stakes: 'final' }); return updateGameWorld(world, { games: [game] }) }

describe('MediaEngine', () => {
  it('does not create media for an ordinary game but creates one for a relevant final', () => {
    const ordinary = createGameWorld(createValidGameWorldInput()); expect(createPreMatchMediaOpportunity(ordinary, ordinary.games['game-a' as keyof typeof ordinary.games]!.id).mediaOpportunitiesById).toEqual({})
    const world = finalWorld(); const media = createPreMatchMediaOpportunity(world, world.games['game-a' as keyof typeof world.games]!.id)
    expect(getPendingMediaOpportunities(media, media.userCoachId)).toHaveLength(1); expect(Object.keys(media.newsItemsById)).toHaveLength(1)
  })

  it('uses former-club narrative context deterministically and deduplicates it', () => {
    const world = finalWorld(); const team = world.teams['team-away' as keyof typeof world.teams]!; const narrative = createNarrativeThread({ id: 'narrative:former', type: 'formerClub', protagonistIds: [world.userCoachId], relatedEntityIds: [team.id], startedOn: world.currentDate, lastOccurredOn: world.currentDate, status: 'active', intensity: 80, relevance: 90, supportingMemoryIds: [], tags: ['formerClub'], beats: [{ id: 'narrative:former:origin', semanticKey: 'origin', occurredOn: world.currentDate, kind: 'departure', intensity: 55, context: {} }] }); const withNarrative = updateGameWorld(world, { narratives: [narrative] }); const first = createPreMatchMediaOpportunity(withNarrative, world.games['game-a' as keyof typeof world.games]!.id); const second = createPreMatchMediaOpportunity(first, world.games['game-a' as keyof typeof world.games]!.id)
    expect(getPendingMediaOpportunities(first, first.userCoachId)[0]!.questions[0]!.topic).toBe('formerClub'); expect(Object.keys(second.mediaOpportunitiesById)).toHaveLength(1)
  })

  it('records a response once, allows skipping, and persists media state', () => {
    const world = createPreMatchMediaOpportunity(finalWorld(), 'game-a' as never); const id = Object.keys(world.mediaOpportunitiesById)[0]!; const answered = respondToMediaOpportunity(world, id, 'diplomatic'); const repeated = respondToMediaOpportunity(answered, id, 'diplomatic'); const skipped = skipMediaOpportunity(createPreMatchMediaOpportunity(finalWorld(), 'game-a' as never), id)
    expect(Object.keys(answered.mediaInteractionsById)).toHaveLength(1); expect(repeated).toBe(answered); expect(skipped.mediaOpportunitiesById[id]!.status).toBe('skipped')
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(answered, '2032-10-01T00:00:00.000Z')); expect(loaded.mediaInteractionsById).toEqual(answered.mediaInteractionsById)
    const legacy = { ...serializeGameWorldV1(answered, '2032-10-01T00:00:00.000Z'), payload: { ...serializeGameWorldV1(answered, '2032-10-01T00:00:00.000Z').payload } }; delete (legacy.payload as { mediaOpportunities?: unknown }).mediaOpportunities; delete (legacy.payload as { mediaInteractions?: unknown }).mediaInteractions; delete (legacy.payload as { mediaProfiles?: unknown }).mediaProfiles; expect(deserializeGameWorldV1(legacy).mediaOpportunitiesById).toEqual({})
  })
})
