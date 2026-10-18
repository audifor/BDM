import { createMemory, type MemoryRecord } from '@/domain/memory'
import { addMemoriesToGameWorld, applyRelationshipEventToWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import type { Personality } from '@/domain/personality'


export function recordMemory(world: GameWorld, memory: MemoryRecord): GameWorld {
  return recordMemories(world, [memory])
}

/** One semantic-index pass and one canonical merge for a human simulation wave.
 * The single-record API uses this same authority and keeps its original contract. */
export function recordMemories(world: GameWorld, memories: readonly MemoryRecord[]): GameWorld {
  if (!memories.length) return world
  const candidates = memories.map(createMemory).filter(memory => world.memoriesById[memory.id] === undefined)
  if (!candidates.length) return world
  const key = (memory: MemoryRecord) => JSON.stringify([memory.owner.id, memory.semanticKey])
  const seen = new Set(Object.values(world.memoriesById).map(key))
  const ids = new Set<string>()
  const additions: MemoryRecord[] = []
  for (const created of candidates) {
    if (ids.has(created.id) || seen.has(key(created))) continue
    ids.add(created.id)
    seen.add(key(created))
    additions.push(created)
  }
  if (!additions.length) return world
  let next = addMemoriesToGameWorld(world, additions)
  for (const created of additions) if (created.relationshipImpact !== undefined && isPerson(next, created.owner.id) && isPerson(next, created.relationshipImpact.targetPersonId)) next = applyRelationshipEventToWorld(next, created.owner.id, created.relationshipImpact.targetPersonId, { id: `memory:${created.id}`, gameDate: created.occurredOn, source: 'professionalInteraction', delta: created.relationshipImpact.delta, context: { memoryId: created.id, memoryType: created.type } })
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
export function recordTierMovementMemories(world: GameWorld, input: { readonly resolutionId: string; readonly competitionId: string; readonly seasonId: string; readonly teamId: string; readonly coachId: string | undefined; readonly occurredOn: import('@/domain/date').GameDate; readonly movement: 'promotion' | 'relegation' }): GameWorld {
  const positive = input.movement === 'promotion'; const tag = input.movement
  let next = recordMemory(world, { id: `memory:${tag}:team:${input.resolutionId}:${input.teamId}`, owner: { kind: 'team', id: input.teamId }, type: 'historicSeason', occurredOn: input.occurredOn, entityRefs: [{ kind: 'team', id: input.teamId }, { kind: 'competition', id: input.competitionId }, { kind: 'season', id: input.seasonId }, ...(input.coachId === undefined ? [] : [{ kind: 'coach' as const, id: input.coachId }])], sourceId: input.resolutionId, semanticKey: `${tag}:${input.resolutionId}`, importance: 'major', valence: positive ? 90 : -75, intensity: positive ? 90 : 80, decayPerMonth: 0, permanent: true, tags: ['competition', tag, 'legacy'], context: { resolutionId: input.resolutionId, seasonId: input.seasonId, movement: tag } })
  if (input.coachId !== undefined) next = recordMemory(next, { id: `memory:${tag}:coach:${input.resolutionId}:${input.coachId}`, owner: { kind: 'coach', id: input.coachId }, type: 'historicSeason', occurredOn: input.occurredOn, entityRefs: [{ kind: 'team', id: input.teamId }, { kind: 'competition', id: input.competitionId }, { kind: 'season', id: input.seasonId }], sourceId: input.resolutionId, semanticKey: `${tag}:${input.resolutionId}`, importance: 'major', valence: positive ? 90 : -75, intensity: positive ? 90 : 80, decayPerMonth: 0, permanent: true, tags: ['competition', tag, 'legacy'], context: { resolutionId: input.resolutionId, seasonId: input.seasonId, movement: tag } })
  return next
}
function isPerson(world: GameWorld, id: string): boolean { return world.coaches[id as keyof typeof world.coaches] !== undefined || world.players[id as keyof typeof world.players] !== undefined || world.staffPeopleById[id as keyof typeof world.staffPeopleById] !== undefined }
