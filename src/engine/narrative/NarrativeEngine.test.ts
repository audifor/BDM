import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { fireCoachFromTeam } from '@/app/coachCareer'
import { getCoachActiveNarratives } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { refreshNarratives } from './NarrativeEngine'

describe('dynamic narratives', () => {
  it('derives one persistent revenge thread from a canonical firing memory', () => { const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const fired = fireCoachFromTeam(world, team.id); const narrated = refreshNarratives(fired); expect(getCoachActiveNarratives(narrated, world.userCoachId)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'revenge', relatedEntityIds: [team.id] })])); expect(refreshNarratives(narrated)).toEqual(narrated) })
  it('round-trips threads and defaults legacy saves to no narratives', () => { const world = createNewGame(); const team = Object.values(world.teams).find((item) => item.coachId === world.userCoachId)!; const narrated = refreshNarratives(fireCoachFromTeam(world, team.id)); const saved = serializeGameWorldV1(narrated, '2032-10-01T00:00:00.000Z'); expect(deserializeGameWorldV1(saved).narrativesById).toEqual(narrated.narrativesById); const legacy = { ...saved, payload: { ...saved.payload } }; delete (legacy.payload as { narratives?: unknown }).narratives; expect(deserializeGameWorldV1(legacy).narrativesById).toEqual({}) })
})
