import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { fireCoachFromTeam } from '@/app/coachCareer'
import { getCoachActiveNarratives } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { refreshNarratives } from './NarrativeEngine'
import { applyNarrativeDormancy } from './NarrativeEngine'
import { createNarrativeThread } from '@/domain/narrative'
import { updateGameWorld } from '@/domain/world'

describe('dynamic narratives', () => {
  it('derives one persistent revenge thread from a canonical firing memory', () => { const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const fired = fireCoachFromTeam(world, team.id); const narrated = refreshNarratives(fired); expect(getCoachActiveNarratives(narrated, world.userCoachId)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'revenge', relatedEntityIds: [team.id] })])); expect(refreshNarratives(narrated)).toEqual(narrated) })
  it('round-trips threads and defaults legacy saves to no narratives', () => { const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const narrated = refreshNarratives(fireCoachFromTeam(world, team.id)); const saved = serializeGameWorldV1(narrated, '2032-10-01T00:00:00.000Z'); expect(deserializeGameWorldV1(saved).narrativesById).toEqual(narrated.narrativesById); const legacy = { ...saved, payload: { ...saved.payload } }; delete (legacy.payload as { narratives?: unknown }).narratives; expect(deserializeGameWorldV1(legacy).narrativesById).toEqual({}) })
  it('preserves a resolved thread as historic after the deterministic inactivity window', () => { const world = createNewGame(); const team = Object.values(world.teams)[0]!; const thread = createNarrativeThread({ id: 'narrative:resolved', type: 'revenge', protagonistIds: [world.userCoachId], relatedEntityIds: [team.id], startedOn: '2032-01-01' as never, lastOccurredOn: '2032-01-01' as never, resolvedOn: '2032-01-01' as never, status: 'resolved', intensity: 90, relevance: 90, supportingMemoryIds: [], tags: ['revenge'], beats: [{ id: 'beat:resolved', semanticKey: 'resolved', occurredOn: '2032-01-01' as never, kind: 'wonMeeting', intensity: 20, context: {} }] }); const dated = updateGameWorld(world, { currentDate: '2034-02-01' as never, narratives: [thread] }); const historic = applyNarrativeDormancy(dated); expect(historic.narrativesById[thread.id]!.status).toBe('historic'); expect(historic.narrativesById[thread.id]!.beats).toEqual(thread.beats) })
})
