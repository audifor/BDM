import { createMemory, type MemoryRecord } from '@/domain/memory'
import { applyRelationshipEventToWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import type { Personality } from '@/domain/personality'

export function recordMemory(world: GameWorld, memory: MemoryRecord): GameWorld {
  const created = createMemory(memory)
  if (world.memoriesById[created.id] !== undefined || Object.values(world.memoriesById).some((item) => item.owner.id === created.owner.id && item.semanticKey === created.semanticKey)) return world
  let next = updateGameWorld(world, { memories: [...Object.values(world.memoriesById), created] })
  if (created.relationshipImpact !== undefined && isPerson(next, created.owner.id) && isPerson(next, created.relationshipImpact.targetPersonId)) next = applyRelationshipEventToWorld(next, created.owner.id, created.relationshipImpact.targetPersonId, { id: `memory:${created.id}`, gameDate: created.occurredOn, source: 'professionalInteraction', delta: created.relationshipImpact.delta, context: { memoryId: created.id, memoryType: created.type } })
  return next
}
/** Personality adjusts an observer's interpretation, never the underlying event. */
export function interpretMemoryValence(baseValence: number, personality: Personality | undefined): number { if (personality === undefined) return baseValence; const adjustment = Math.round((personality.values.resilience + personality.values.professionalism - 100) / 5); return Math.max(-100, Math.min(100, baseValence + adjustment)) }
export function decayMemoriesForMonth(world: GameWorld): GameWorld {
  const month = world.currentDate.slice(0, 7); const memories = Object.values(world.memoriesById).map((memory) => memory.permanent || memory.lastDecayedMonth === month ? memory : { ...memory, intensity: Math.max(1, memory.intensity - memory.decayPerMonth), lastDecayedMonth: month })
  return memories.some((memory, index) => memory !== Object.values(world.memoriesById)[index]) ? updateGameWorld(world, { memories }) : world
}
export function recordChampionMemories(world: GameWorld, input: { readonly seasonId: string; readonly competitionId: string; readonly teamId: string; readonly coachId?: string; readonly occurredOn: import('@/domain/date').GameDate }): GameWorld {
  let next = recordMemory(world, { id: `memory:champion:team:${input.seasonId}:${input.teamId}`, owner: { kind: 'team', id: input.teamId }, type: 'championship', occurredOn: input.occurredOn, entityRefs: [{ kind: 'team', id: input.teamId }, { kind: 'competition', id: input.competitionId }, { kind: 'season', id: input.seasonId }, ...(input.coachId === undefined ? [] : [{ kind: 'coach' as const, id: input.coachId }])], sourceId: input.seasonId, semanticKey: `championship:${input.seasonId}`, importance: 'historic', valence: 100, intensity: 100, decayPerMonth: 0, permanent: true, tags: ['competition', 'championship', 'legacy'], context: { seasonId: input.seasonId, competitionId: input.competitionId } })
  if (input.coachId !== undefined) next = recordMemory(next, { id: `memory:champion:coach:${input.seasonId}:${input.coachId}`, owner: { kind: 'coach', id: input.coachId }, type: 'championship', occurredOn: input.occurredOn, entityRefs: [{ kind: 'team', id: input.teamId }, { kind: 'competition', id: input.competitionId }, { kind: 'season', id: input.seasonId }], sourceId: input.seasonId, semanticKey: `championship:${input.seasonId}`, importance: 'historic', valence: 100, intensity: 100, decayPerMonth: 0, permanent: true, tags: ['competition', 'championship', 'legacy'], context: { seasonId: input.seasonId, competitionId: input.competitionId } })
  return next
}
function isPerson(world: GameWorld, id: string): boolean { return world.coaches[id as keyof typeof world.coaches] !== undefined || world.players[id as keyof typeof world.players] !== undefined || world.staffPeopleById[id as keyof typeof world.staffPeopleById] !== undefined }
