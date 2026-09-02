import type { Personality } from '@/domain/personality'
import { createMemory, type MemoryImportance, type MemoryRecord, type MemoryType } from '@/domain/memory'
import { recordMemory } from '@/engine/memory'
import { applyRelationshipEvent, createRelationshipProfile, getRelationshipDimensions, relationshipKey, type RelationshipEvent, type RelationshipProfile } from '@/domain/relationships'
import { applyRelationshipEventToWorld, getStaffAssignment, getStaffPerson, updateGameWorld, type GameWorld } from '@/domain/world'
import { relationshipFacetDeltasFor } from './StaffProfessionalRelationshipDefinitions'
import {
  clampHumanStateValue,
  createStaffHumanState,
  createStaffReactionRecord,
  reactionDefinitionFor,
  staffReactionRecordIdFor,
  IMPORTANCE_SCALING,
  STAFF_HUMAN_STATE_DIMENSIONS,
  type StaffHumanContext,
  type StaffHumanEvent,
  type StaffHumanState,
  type StaffHumanStateDelta,
  type StaffHumanStateDimension,
  type StaffReactionRecord,
} from '@/domain/staffHumanState'

/**
 * Wave 5A §11 — the sole authority applying a `StaffHumanEvent` to `StaffHumanState`. Pipeline:
 * resolve base reaction → importance scaling → personality modulation → relationship modulation →
 * saturation → update Human State → StaffReactionRecord → optional Memory/Relationship bridge.
 * Deterministic, no RNG. Idempotent: `applyStaffHumanEvent` is a no-op if a `StaffReactionRecord`
 * already exists for `(staffId, contextId, sourceEventId, kind)`.
 */
export interface StaffHumanReactionResult {
  readonly world: GameWorld
  /** `undefined` when the event was a no-op (already processed — idempotency). */
  readonly reaction?: StaffReactionRecord
}

/**
 * Single-event entry point — used by the low-frequency Responsibility/Advisory integration
 * (one event per user action). §36: callers that process MANY events per tick (the daily
 * workload/pattern sweep over every Staff person) MUST use `applyStaffHumanEventsBatch` instead —
 * each call here performs its own `recordMemory`/`applyRelationshipEventToWorld`, and those go
 * through the canonical full-world `updateGameWorld` validation, which is O(world size) per call
 * and becomes O(staff × world size) if looped naively.
 */
export function applyStaffHumanEvent(world: GameWorld, context: StaffHumanContext, event: StaffHumanEvent): StaffHumanReactionResult {
  const computed = computeReaction(world, event)
  if (computed === undefined) return { world }

  let next: GameWorld = {
    ...world,
    staffHumanStatesByContextId: { ...world.staffHumanStatesByContextId, [event.contextId]: computed.state },
    staffReactionRecordsById: { ...world.staffReactionRecordsById, [computed.reaction.id]: computed.reaction },
  }
  if (computed.memory !== undefined) next = recordMemory(next, computed.memory)
  if (computed.relationshipEvent !== undefined) next = applyRelationshipEventToWorld(next, event.staffId, computed.relationshipEvent.actorId, computed.relationshipEvent.event)
  return { world: next, reaction: computed.reaction }
}

interface ComputedReaction {
  readonly state: StaffHumanState
  readonly reaction: StaffReactionRecord
  readonly memory?: MemoryRecord
  readonly relationshipEvent?: { readonly actorId: string; readonly event: RelationshipEvent }
}

/** Pure computation — no world writes. Shared by both the single-event and batch entry points so the reaction semantics never diverge between the two call paths. */
function computeReaction(world: GameWorld, event: StaffHumanEvent): ComputedReaction | undefined {
  const reactionId = staffReactionRecordIdFor(event.staffId, event.contextId, event.sourceEventId, event.kind)
  if (world.staffReactionRecordsById[reactionId] !== undefined) return undefined

  const definition = reactionDefinitionFor(event.kind)
  const currentState = world.staffHumanStatesByContextId[event.contextId]
  if (currentState === undefined) return undefined

  const personality = resolvePersonality(world, event.staffId)
  const relationshipModifier = resolveRelationshipModifier(world, event, definition.attributable)
  const importanceScale = IMPORTANCE_SCALING[event.importance]

  const stateDelta: Record<StaffHumanStateDimension, number> = {} as never
  for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
    const base = definition.baseDelta[dimension]
    if (base === undefined || base === 0) continue
    const personalityModifier = resolvePersonalityModifier(personality, dimension, base)
    const raw = base * importanceScale * personalityModifier * relationshipModifier
    const before = currentState[dimension]
    const saturated = applySoftSaturation(before, raw)
    stateDelta[dimension] = saturated
  }

  const updatedState = createStaffHumanState({
    ...currentState,
    ...Object.fromEntries(Object.entries(stateDelta).map(([dimension, delta]) => [dimension, clampHumanStateValue(currentState[dimension as StaffHumanStateDimension] + delta)])),
    lastEvaluatedOn: event.occurredOn,
  })

  const reaction = createStaffReactionRecord({
    id: reactionId,
    staffId: event.staffId,
    contextId: event.contextId,
    sourceEventId: event.sourceEventId,
    eventKind: event.kind,
    importance: event.importance,
    occurredOn: event.occurredOn,
    stateDelta,
    attribution: event.attribution,
  })

  const memory = computeMemory(world, event, reaction)
  const relationshipEvent = computeRelationshipEvent(world, event, definition.attributable)

  return { state: updatedState, reaction, memory, relationshipEvent }
}

/**
 * §36 — batched entry point for many events in one tick (the daily workload sweep, pattern
 * detection). Computes every reaction against the SAME starting `world` snapshot (events in one
 * batch never see each other's effects — matches one calendar day/checkpoint being simultaneous),
 * then commits every Human State/Reaction/Memory/Relationship change in exactly ONE
 * `updateGameWorld`-validated write, instead of one validation pass per event.
 */
export function applyStaffHumanEventsBatch(world: GameWorld, events: readonly StaffHumanEvent[]): GameWorld {
  if (events.length === 0) return world

  const states: Record<string, StaffHumanState> = { ...world.staffHumanStatesByContextId }
  const reactions: Record<string, StaffReactionRecord> = { ...world.staffReactionRecordsById }
  const memories: MemoryRecord[] = []
  const relationshipUpdates = new Map<string, RelationshipProfile>()

  for (const event of events) {
    const computed = computeReaction(world, event)
    if (computed === undefined) continue
    states[event.contextId] = computed.state
    reactions[computed.reaction.id] = computed.reaction
    if (computed.memory !== undefined) memories.push(computed.memory)
    if (computed.relationshipEvent !== undefined) {
      const key = relationshipKey(event.staffId, computed.relationshipEvent.actorId)
      const existing = relationshipUpdates.get(key) ?? world.relationshipsByKey[key] ?? createRelationshipProfile(event.staffId, computed.relationshipEvent.actorId)
      relationshipUpdates.set(key, applyRelationshipEvent(existing, computed.relationshipEvent.event))
    }
  }

  const deduplicatedMemories = dedupeMemories(world, memories)

  return updateGameWorld(world, {
    staffHumanStates: Object.values(states),
    staffReactionRecords: Object.values(reactions),
    ...(deduplicatedMemories.length === 0 ? {} : { memories: [...Object.values(world.memoriesById), ...deduplicatedMemories] }),
    ...(relationshipUpdates.size === 0 ? {} : { relationshipsByKey: { ...world.relationshipsByKey, ...Object.fromEntries(relationshipUpdates) } }),
  })
}

/** Mirrors `recordMemory`'s own dedupe rule (by id, and by owner+semanticKey) since the batch path bypasses `recordMemory` itself for performance. */
function dedupeMemories(world: GameWorld, candidates: readonly MemoryRecord[]): readonly MemoryRecord[] {
  const seen = new Set(Object.values(world.memoriesById).map((memory) => `${memory.owner.id}:${memory.semanticKey}`))
  const result: MemoryRecord[] = []
  for (const memory of candidates) {
    const key = `${memory.owner.id}:${memory.semanticKey}`
    if (world.memoriesById[memory.id] !== undefined || seen.has(key)) continue
    seen.add(key)
    result.push(memory)
  }
  return result
}

/** §13 — Personality modulates MAGNITUDE only, within an approximately 0.6x-1.5x band; never rewrites the direction/semantics of a reaction. Missing personality (should not happen once a person exists) is a neutral 1.0x. */
function resolvePersonalityModifier(personality: Personality | undefined, dimension: StaffHumanStateDimension, baseDelta: number): number {
  if (personality === undefined) return 1
  const { ambition, professionalism, resilience, loyalty, adaptability } = personality.values
  const positive = baseDelta > 0
  let raw = 1
  if (dimension === 'frustration' || dimension === 'stress') {
    // Low resilience/adaptability amplifies negative emotional swings; high resilience dampens them.
    raw = 1 + (50 - resilience) / 100 + (50 - adaptability) / 200
  } else if (dimension === 'recognitionSatisfaction' || dimension === 'influenceSatisfaction') {
    // Ambition raises sensitivity to recognition/influence swings in either direction.
    raw = 1 + (ambition - 50) / 150
  } else if (dimension === 'organizationalCommitment') {
    raw = 1 + (loyalty - 50) / 150
  } else if (dimension === 'professionalFulfillment' || dimension === 'roleSatisfaction') {
    raw = 1 + (professionalism - 50) / 150
  }
  if (!positive && (dimension === 'frustration' || dimension === 'stress')) raw = Math.max(raw, 1) // never let personality soften negative emotional buildup below neutral via this branch alone
  return Math.max(0.6, Math.min(1.5, raw))
}

/** §14/Wave 5B §16 — a good relationship with the attributed actor amortizes a negative event; a bad one amplifies it, always within bounds. Prefers the DIRECTIONAL staff→actor profile (facets are directional per Wave 5B §9); falls back to the reverse-direction profile, then to neutral. When facets exist (trust/professionalRespect/communicationQuality), they drive the modulation as the richer signal; a legacy profile with no facets falls back to `value` exactly as before — never a behavior change for pre-5B saves/fixtures. Bounded 0.8x-1.2x, same envelope as before, to avoid runaway feedback loops. */
function resolveRelationshipModifier(world: GameWorld, event: StaffHumanEvent, attributable: boolean): number {
  if (!attributable || event.attribution.actorId === undefined) return 1
  // Directional per Relationship canon: only the Staff person's OWN perception of the actor
  // (staff->actor) can modulate how the Staff interprets this event — the actor's perception of
  // the Staff (actor->staff) is a completely different, independent profile and must never be
  // consulted here, even as a fallback.
  const relationship = world.relationshipsByKey[`${event.staffId}->${event.attribution.actorId}`]
  if (relationship === undefined) return 1

  if (relationship.dimensions !== undefined) {
    const dimensions = getRelationshipDimensions(relationship)
    const signal = (dimensions.trust + dimensions.professionalRespect + dimensions.communicationQuality) / 3
    const normalized = signal / 100
    return Math.max(0.8, Math.min(1.2, 1 - normalized * 0.2))
  }
  // Legacy fallback: identical to pre-5B behavior.
  const normalized = relationship.value / 100
  return Math.max(0.8, Math.min(1.2, 1 - normalized * 0.2))
}

/** §24 — soft saturation: near-extreme values resist trivial additional movement in the same direction. */
function applySoftSaturation(currentValue: number, delta: number): number {
  if (delta === 0) return 0
  const headroom = delta > 0 ? 100 - currentValue : currentValue
  const saturationFactor = Math.max(0.15, Math.min(1, headroom / 25))
  return delta * saturationFactor
}

function resolvePersonality(world: GameWorld, staffId: string): Personality | undefined {
  return world.personalitiesByPersonId[staffId]
}

const MEMORY_TYPE_BY_VALENCE: Readonly<Record<'positive' | 'negative', MemoryType>> = { positive: 'trust', negative: 'conflict' }

/** §30 — Memory bridge: ROUTINE normally none, IMPORTANT usually yes when personally relevant, CRITICAL almost always. Produces a `MemoryRecord` for the canonical Memory engine to persist — never writes `world` directly, so both the single-event and batch entry points commit it identically. */
function computeMemory(world: GameWorld, event: StaffHumanEvent, reaction: StaffReactionRecord): MemoryRecord | undefined {
  if (event.importance === 'ROUTINE') return undefined
  if (event.importance === 'MEANINGFUL' && !hasPersonalRelevance(reaction)) return undefined
  const staff = getStaffPerson(world, event.staffId as never)
  if (staff === undefined) return undefined

  const netValence = Object.values(reaction.stateDelta).reduce((sum, value) => sum + (value ?? 0), 0)
  if (netValence === 0) return undefined
  const valenceSign: 'positive' | 'negative' = netValence > 0 ? 'positive' : 'negative'
  const importance: MemoryImportance = event.importance === 'CRITICAL' ? 'major' : event.importance === 'IMPORTANT' ? 'notable' : 'minor'
  const intensity = Math.max(1, Math.min(100, Math.round(Math.abs(netValence) * 4)))

  const semanticKey = `staff-human:${event.kind}:${event.contextId}`
  const entityRefs = [{ kind: 'staff' as const, id: event.staffId }, ...(event.attribution.actorId === undefined ? [] : [attributionEntityRef(world, event.attribution.actorId)])].filter((ref): ref is { readonly kind: 'staff' | 'coach' | 'player'; readonly id: string } => ref !== undefined)

  return createMemory({
    id: `memory:staff-human:${reaction.id}`,
    owner: { kind: 'staff', id: event.staffId },
    type: MEMORY_TYPE_BY_VALENCE[valenceSign],
    occurredOn: event.occurredOn,
    entityRefs,
    sourceId: event.sourceEventId,
    semanticKey,
    importance,
    valence: valenceSign === 'positive' ? intensity : -intensity,
    intensity,
    decayPerMonth: event.importance === 'CRITICAL' ? 2 : 5,
    permanent: false,
    tags: ['staffHumanState', event.kind],
    context: { eventKind: event.kind, contextId: event.contextId },
  })
}

function attributionEntityRef(world: GameWorld, actorId: string): { readonly kind: 'staff' | 'coach' | 'player'; readonly id: string } | undefined {
  if (world.staffPeopleById[actorId as never] !== undefined) return { kind: 'staff', id: actorId }
  if (world.coaches[actorId as never] !== undefined) return { kind: 'coach', id: actorId }
  return undefined
}

function hasPersonalRelevance(reaction: StaffReactionRecord): boolean {
  return Object.values(reaction.stateDelta).some((value) => Math.abs(value ?? 0) >= 4)
}

/** §31/Wave 5B §10-11 — Relationship bridge: only ever modifies a relationship when a real PERSON is attributable, and only through the canonical `applyRelationshipEventToWorld` boundary. Systemic/non-attributable events never touch personal relationships. Facet deltas come from the single `StaffProfessionalRelationshipDefinitions` mapping authority; `delta` (the legacy scalar) is derived from the SAME facet vector so `value` stays coherent with the facets it summarizes, never a second independent computation. */
function computeRelationshipEvent(world: GameWorld, event: StaffHumanEvent, attributable: boolean): { readonly actorId: string; readonly event: RelationshipEvent } | undefined {
  if (!attributable || event.attribution.actorId === undefined) return undefined
  if (event.importance === 'ROUTINE') return undefined
  const facetBase = relationshipFacetDeltasFor(event.kind)
  if (facetBase === undefined) return undefined
  const actorId = event.attribution.actorId
  if (getStaffPerson(world, actorId as never) === undefined && world.coaches[actorId as never] === undefined) return undefined

  const scale = IMPORTANCE_SCALING[event.importance]
  const dimensionDeltas: Record<string, number> = {}
  let facetSum = 0
  for (const [key, base] of Object.entries(facetBase)) {
    if (base === undefined || base === 0) continue
    const scaled = Math.sign(base) * Math.max(1, Math.round(Math.abs(base) * scale))
    dimensionDeltas[key] = scaled
    facetSum += scaled
  }
  if (Object.keys(dimensionDeltas).length === 0) return undefined

  // Legacy scalar `value` summary: average of the facet deltas, bounded the same way the old
  // dimension-summed heuristic was — never a second independent computation of "how positive/negative".
  const averageMagnitude = Math.round(facetSum / Object.keys(dimensionDeltas).length)
  const delta = Math.max(-8, Math.min(8, averageMagnitude === 0 ? Math.sign(facetSum) : averageMagnitude))
  if (delta === 0) return undefined

  return {
    actorId,
    event: {
      id: `staff-human:${event.id}`,
      gameDate: event.occurredOn,
      source: 'professionalInteraction',
      delta,
      context: { eventKind: event.kind, contextId: event.contextId },
      dimensionDeltas,
    },
  }
}

/** Small helper reused by the Responsibility/Advisory integration layers to confirm a Staff person actually has a live Team assignment before emitting an event on their behalf. */
export function hasLiveAssignment(world: GameWorld, staffId: string, teamId: string): boolean {
  const assignment = getStaffAssignment(world, staffId as never)
  return assignment !== undefined && assignment.teamId === teamId
}
