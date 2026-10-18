import { addDays, addYears } from '@/domain/date'
import {
  HUMAN_LIMITS, humanKnowledgeId, humanSourceKey,
  type HumanActor, type HumanFact, type HumanKnowledge, type HumanSimulationState, type HumanSituation, type HumanSource,
} from '@/domain/hrpg/HumanSimulation'
import { humanActorPersonId, humanActorsForPerson } from '@/domain/hrpg/validateHumanSimulationWorld'
import { evaluateFull50PairCompatibility } from '@/domain/personality/SemanticPairCompatibility'
import { getCurrentlyRelevantMemories, type MemoryRecord } from '@/domain/memory'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { applyMoraleEventToWorld, applyRelationshipEventsToWorld, liveStaffContextByStaff, memoriesByOwner, updateGameWorld, type GameWorld } from '@/domain/world'
import { interpretMemoryValence, recordMemories, recordMemory } from '@/engine/memory/MemoryEngine'

export interface HumanAction {
  readonly id: string
  readonly label: string
  readonly effect: 'reflect' | 'discuss' | 'authority' | 'ignore'
}
export interface HumanRule {
  readonly id: string
  readonly topics: readonly string[]
  readonly actions: readonly HumanAction[]
  readonly actors: 'first' | 'all'
  readonly cadence: 'source' | 'month'
  readonly timeoutDays?: number
  readonly reviewAfterDays?: number
}
/** Code-owned adapters. Save data cannot register rules, commands or consequences. */
export interface HumanRuntime {
  readonly rules: readonly HumanRule[]
  readonly readFact: (world: GameWorld, source: HumanSource) => HumanFact | undefined
  readonly isAvailable: (world: GameWorld, situation: HumanSituation, action: HumanAction) => boolean
  readonly executeAuthority: (world: GameWorld, situation: HumanSituation, actionId: string) => GameWorld | undefined
  readonly canCommunicate: (world: GameWorld, speakerPersonId: string, recipientPersonId: string) => boolean
  /** Supplied by the existing Staff AI authority; no competing career AI. */
  readonly chooseNpcAction: (world: GameWorld, situation: HumanSituation, actions: readonly HumanAction[]) => string | undefined
}
export type HumanCommandResult = { readonly status: 'APPLIED'; readonly world: GameWorld }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: string }
export interface HumanIngestionResult { readonly world: GameWorld; readonly examined: number; readonly admitted: number; readonly suppressed: number }

function save(world: GameWorld, state: HumanSimulationState): GameWorld {
  return updateGameWorld(world, { humanSimulation: Object.freeze(state) })
}
function orderedSituations(world: GameWorld): readonly HumanSituation[] {
  return Object.values(world.humanSimulation.situationsById).sort((a, b) => a.openedOn.localeCompare(b.openedOn) || a.id.localeCompare(b.id))
}
function ruleFor(situation: HumanSituation, runtime: HumanRuntime): HumanRule | undefined {
  return runtime.rules.find(rule => rule.id === situation.ruleId)
}
const situationIdFor = (ruleId: string, personId: string, discriminator: string): string => JSON.stringify(['hrpg', ruleId, personId, discriminator])
export function humanKnowledge(world: GameWorld, source: HumanSource, observerPersonId: string, runtime: HumanRuntime):
  { readonly basis: HumanKnowledge['basis']; readonly description: string; readonly speakerPersonId?: string } | undefined {
  const knowledge = world.humanSimulation.knowledgeById[humanKnowledgeId(source, observerPersonId)]
  const fact = runtime.readFact(world, source)
  if (!fact || fact.occurredOn > world.currentDate) return undefined
  if (knowledge?.basis === 'witnessed' || knowledge?.basis === 'public') return { basis: knowledge.basis, description: fact.title }
  if (knowledge) return { basis: knowledge.basis, description: knowledge.claim!, speakerPersonId: knowledge.speakerPersonId }
  // An owner-perspective canonical Memory already IS a recorded observation.
  if (source.kind === 'memory' && fact.participants.some(p => humanActorPersonId(world, p) === observerPersonId)) return { basis: 'witnessed', description: fact.title }
  // Retiring the runtime episode must not erase something its owner remembers.
  // Reconstruct awareness from canonical Memory provenance, retaining uncertainty.
  for (const actor of humanActorsForPerson(world, observerPersonId)) {
    const memory = (memoriesByOwner(world.memoriesById).get(actor.id) ?? []).find(m =>
      m.tags.includes('hrpg') && m.sourceId === source.id && m.context.sourceKind === source.kind)
    if (!memory) continue
    const basis = memory.context.knowledgeBasis
    if (basis === 'witnessed' || basis === 'public') return { basis, description: fact.title }
    if ((basis === 'report' || basis === 'rumour') && typeof memory.context.claim === 'string') return { basis, description: memory.context.claim,
      ...(typeof memory.context.speakerPersonId === 'string' ? { speakerPersonId: memory.context.speakerPersonId } : {}) }
  }
  return undefined
}

export function queryPublicHumanInformation(world: GameWorld, source: HumanSource, runtime: HumanRuntime): string | undefined {
  const fact = runtime.readFact(world, source)
  return fact?.public && fact.occurredOn <= world.currentDate ? fact.title : undefined
}

/** Public availability is not automatic individual awareness. Reading a public
 * record is an explicit observation, distinct from private reports and rumours. */
export function observePublicHumanInformation(world: GameWorld, source: HumanSource, observerPersonId: string, runtime: HumanRuntime): HumanCommandResult {
  if (!Object.hasOwn(world.personsById, observerPersonId) || !queryPublicHumanInformation(world, source, runtime)) return { status: 'BLOCKED', world, reason: 'NOT_PUBLIC' }
  const id = humanKnowledgeId(source, observerPersonId)
  if (world.humanSimulation.knowledgeById[id]?.basis === 'witnessed' || world.humanSimulation.knowledgeById[id]?.basis === 'public') return { status: 'BLOCKED', world, reason: 'ALREADY_KNOWN' }
  const count = Object.values(world.humanSimulation.knowledgeById).filter(k => humanSourceKey(k.source) === humanSourceKey(source)).length
  if (count >= HUMAN_LIMITS.maxKnowledgePerSource) return { status: 'BLOCKED', world, reason: 'AUDIENCE_LIMIT' }
  return { status: 'APPLIED', world: save(world, { ...world.humanSimulation, knowledgeById: { ...world.humanSimulation.knowledgeById,
    [id]: { id, source, observerPersonId, learnedOn: world.currentDate, basis: 'public' } } }) }
}

/** Narrative is a perspective projection of source facts and Memory, not another
 * mutable history or script. Related situations may coexist and resolve independently. */
export function queryHumanContinuity(world: GameWorld, observer: HumanActor, runtime: HumanRuntime) {
  const observerId = humanActorPersonId(world, observer)
  if (!observerId) return []
  const sources = new Map<string, HumanSource>()
  for (const situation of Object.values(world.humanSimulation.situationsById)) {
    if (humanActorPersonId(world, situation.actor) === observerId) sources.set(humanSourceKey(situation.source), situation.source)
  }
  const ownedMemories = humanActorsForPerson(world, observerId).flatMap(actor => [...(memoriesByOwner(world.memoriesById).get(actor.id) ?? [])])
  for (const memory of ownedMemories) {
    if (memory.tags.includes('promise') || memory.tags.includes('hrpg')) sources.set(humanSourceKey({ kind: 'memory', id: memory.id }), { kind: 'memory', id: memory.id })
    if (memory.tags.includes('hrpg') && memory.sourceId && typeof memory.context.sourceKind === 'string') {
      const source = { kind: memory.context.sourceKind as HumanSource['kind'], id: memory.sourceId }
      sources.set(humanSourceKey(source), source)
    }
  }
  const chains = new Map<string, { readonly source: HumanSource; readonly occurredOn: HumanFact['occurredOn']; readonly stage: NonNullable<HumanFact['stage']>; readonly narration: NonNullable<ReturnType<typeof humanKnowledge>> }[]>()
  for (const source of sources.values()) {
    const fact = runtime.readFact(world, source)
    const narration = humanKnowledge(world, source, observerId, runtime)
    if (!fact || !narration) continue
    const subjective = narration.basis === 'report' || narration.basis === 'rumour'
    const rememberedDate = ownedMemories.find(memory => memory.sourceId === source.id && memory.context.sourceKind === source.kind)?.context.learnedOn
    const learnedOn = world.humanSimulation.knowledgeById[humanKnowledgeId(source, observerId)]?.learnedOn
      ?? (typeof rememberedDate === 'string' ? rememberedDate as HumanFact['occurredOn'] : undefined)
    // A recipient knows when they heard a claim, not a hidden source's true date or crisis stage.
    if (subjective && !learnedOn) continue
    const causalKey = fact.causalKey ?? humanSourceKey(source)
    const entries = chains.get(causalKey) ?? []
    entries.push({ source, occurredOn: subjective ? learnedOn! : fact.occurredOn, stage: subjective ? 'development' : fact.stage ?? 'origin', narration })
    chains.set(causalKey, entries)
  }
  return [...chains].sort(([a], [b]) => a.localeCompare(b)).map(([id, entries]) => ({ id,
    entries: entries.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || humanSourceKey(a.source).localeCompare(humanSourceKey(b.source))) }))
}

/** One pass over supplied source references. Re-reads truth; caller hints are never evidence. */
export function ingestHumanSources(world: GameWorld, sources: readonly HumanSource[], runtime: HumanRuntime): HumanIngestionResult {
  const state = world.humanSimulation
  const situations = { ...state.situationsById }
  const knowledge = { ...state.knowledgeById }
  const activeByActor = new Map<string, number>()
  let activeTotal = 0
  for (const s of Object.values(situations)) if (s.status === 'open') {
    activeTotal++
    const personId = humanActorPersonId(world, s.actor)!
    activeByActor.set(personId, (activeByActor.get(personId) ?? 0) + 1)
  }
  let admitted = 0
  let suppressed = 0
  let changed = false
  const unique = new Map(sources.map(source => [humanSourceKey(source), source]))
  for (const source of [...unique.values()].sort((a, b) => humanSourceKey(a).localeCompare(humanSourceKey(b)))) {
    const fact = runtime.readFact(world, source)
    if (!fact || fact.occurredOn > world.currentDate || (!fact.ongoing && fact.occurredOn < addDays(world.currentDate, -HUMAN_LIMITS.retainedDays))) continue
    const participants = fact.participants.slice(0, HUMAN_LIMITS.maxKnowledgePerSource)
    suppressed += fact.participants.length - participants.length
    let observed = false
    for (const rule of runtime.rules) {
      if (!rule.topics.includes(fact.topic)) continue
      const actors = rule.actors === 'first' ? participants.slice(0, 1) : participants
      for (const actor of actors) {
        const personId = humanActorPersonId(world, actor)!
        const discriminator = rule.cadence === 'source' ? humanSourceKey(source) : world.currentDate.slice(0, 7)
        const id = situationIdFor(rule.id, personId, discriminator)
        if (situations[id]) {
          if (humanSourceKey(situations[id].source) === humanSourceKey(source)) observed = true
          continue
        }
        if (activeTotal >= HUMAN_LIMITS.activeTotal || (activeByActor.get(personId) ?? 0) >= HUMAN_LIMITS.activePerActor) { suppressed++; continue }
        const candidate: HumanSituation = { id, ruleId: rule.id, source, actor, participants,
          openedOn: world.currentDate, ...(rule.timeoutDays === undefined ? {} : { dueOn: addDays(world.currentDate, rule.timeoutDays) }), phase: 'origin', status: 'open',
          ...(fact.causalKey === undefined ? {} : { causalKey: fact.causalKey }) }
        if (!rule.actions.some(action => runtime.isAvailable(world, candidate, action))) continue
        situations[id] = candidate
        activeTotal++
        activeByActor.set(personId, (activeByActor.get(personId) ?? 0) + 1)
        admitted++
        changed = true
        observed = true
      }
    }
    // Bound knowledge to the admitted human episodes. Skipped sporting/financial
    // facts remain in their own ledgers, without a second unbounded HRPG history.
    if (observed) for (const participant of participants) {
      const personId = humanActorPersonId(world, participant)
      if (!personId) continue
      const id = humanKnowledgeId(source, personId)
      if (knowledge[id]?.basis !== 'witnessed') {
        knowledge[id] = { id, source, observerPersonId: personId, learnedOn: world.currentDate, basis: 'witnessed' }
        changed = true
      }
    }
  }
  return { world: changed ? save(world, { ...state, situationsById: situations, knowledgeById: knowledge }) : world, examined: unique.size, admitted, suppressed }
}

export function availableHumanActions(world: GameWorld, situation: HumanSituation, runtime: HumanRuntime): readonly HumanAction[] {
  if (situation.status !== 'open' || situation.phase !== 'origin' || (situation.dueOn && world.currentDate > situation.dueOn)) return []
  const personId = humanActorPersonId(world, situation.actor)
  if (!personId || !humanKnowledge(world, situation.source, personId, runtime)) return []
  return (ruleFor(situation, runtime)?.actions ?? []).filter(action => runtime.isAvailable(world, situation, action))
}

/** Derived only for actual participants. No persisted personality/fit/emotion copies. */
export function inspectHumanContext(world: GameWorld, situation: HumanSituation) {
  const actor = situation.actor
  const other = situation.participants.find(p => humanActorPersonId(world, p) !== humanActorPersonId(world, actor))
  const personality = world.personalitiesByPersonId[actor.id]
  const otherPersonality = other && world.personalitiesByPersonId[other.id]
  const actorPersonId = humanActorPersonId(world, actor)!
  const otherPersonId = other && humanActorPersonId(world, other)
  const otherIds = new Set(otherPersonId ? humanActorsForPerson(world, otherPersonId).map(alias => alias.id) : [])
  const owned = humanActorsForPerson(world, actorPersonId).flatMap(alias => [...(memoriesByOwner(world.memoriesById).get(alias.id) ?? [])])
  const relevant = owned.filter(memory => memory.sourceId === situation.source.id || memory.entityRefs.some(ref => otherIds.has(ref.id)))
  const memories = getCurrentlyRelevantMemories(relevant, world.currentDate, 12).map(item => item.memory)
  return { personality, morale: world.moraleByPersonId[actor.id]?.value,
    relationship: getRelationshipDimensions(other ? world.relationshipsByKey[relationshipKey(actor.id, other.id)] : undefined),
    compatibility: personality && otherPersonality ? evaluateFull50PairCompatibility(personality, otherPersonality) : undefined,
    memories, staffHumanState: (() => {
      const staffId = actor.kind === 'coach' ? world.coaches[actor.id as keyof GameWorld['coaches']]!.staffProfileId : actor.id
      const context = liveStaffContextByStaff(world.staffHumanContextsById).get(staffId)
      return context ? world.staffHumanStatesByContextId[context.id] : undefined
    })(),
  }
}

export function queryHumanSituations(world: GameWorld, observerPersonId: string, runtime: HumanRuntime) {
  return orderedSituations(world).flatMap(situation => {
    const perceived = humanKnowledge(world, situation.source, observerPersonId, runtime)
    // A public match is not permission to inspect somebody else's private decision.
    if (!perceived || humanActorPersonId(world, situation.actor) !== observerPersonId) return []
    return [{ id: situation.id, source: situation.source, openedOn: situation.openedOn, phase: situation.phase, status: situation.status,
      participants: situation.participants.map(actor => {
        const personId = humanActorPersonId(world, actor)!
        const person = world.personsById[personId as keyof GameWorld['personsById']]!
        return { personId, role: actor.kind, name: `${person.firstName} ${person.lastName}` }
      }),
      narration: perceived, choices: availableHumanActions(world, situation, runtime).map(action => ({ id: action.id, label: action.label })),
    }]
  })
}

function rememberAction(world: GameWorld, situation: HumanSituation, action: HumanAction, runtime: HumanRuntime, memoryBatch?: MemoryRecord[]): GameWorld {
  if (action.effect === 'ignore') return world
  const actor = situation.actor
  const observer = humanActorPersonId(world, actor)!
  const perception = humanKnowledge(world, situation.source, observer, runtime)!
  let next = world
  const participants = action.effect === 'discuss' ? situation.participants : [actor]
  for (const participant of participants) {
    const personId = humanActorPersonId(next, participant)!
    const actualKnowledge = humanKnowledge(next, situation.source, personId, runtime)
    if (!actualKnowledge) continue
    const learnedOn = next.humanSimulation.knowledgeById[humanKnowledgeId(situation.source, personId)]?.learnedOn
    const id = `memory:${situation.id}:${participant.kind}:${participant.id}`
    const memory: MemoryRecord = { id, owner: participant, type: action.effect === 'discuss' ? 'support' : 'opportunity',
      occurredOn: world.currentDate, sourceId: situation.source.id, semanticKey: id,
      entityRefs: situation.participants.filter(p => p.id !== participant.id), importance: 'notable',
      valence: action.effect === 'discuss' ? interpretMemoryValence(12, world.personalitiesByPersonId[participant.id]) : 0,
      intensity: 45, decayPerMonth: 2, permanent: false,
      tags: ['hrpg', situation.phase, actualKnowledge.basis],
      context: { ruleId: situation.ruleId, actionId: action.id, sourceKind: situation.source.kind,
        causalKey: situation.causalKey ?? humanSourceKey(situation.source), knowledgeBasis: actualKnowledge.basis,
        ...(learnedOn ? { learnedOn } : {}),
        ...(actualKnowledge.speakerPersonId ? { speakerPersonId: actualKnowledge.speakerPersonId } : {}),
        ...(actualKnowledge.basis === 'rumour' || actualKnowledge.basis === 'report' ? { claim: actualKnowledge.description } : {}) },
    }
    if (memoryBatch) memoryBatch.push(memory)
    else next = recordMemory(next, memory)
    if (action.effect === 'discuss') {
      const dob = next.personsById[personId as keyof GameWorld['personsById']]?.dateOfBirth
      next = applyMoraleEventToWorld(next, { id: `morale:${id}`, personId: participant.id, gameDate: world.currentDate,
        source: 'professionalInteraction', delta: 2,
        context: { humanSituationId: situation.id, ...(dob && addYears(dob, 15) <= world.currentDate ? { personalityEventKind: 'TEAM_MEETING' } : {}) },
      })
      // Coach and StaffProfile are projections of one Person, not two evolving people.
      if (participant.kind === 'coach') {
        const coach = next.coaches[participant.id as keyof GameWorld['coaches']]!
        const personality = next.personalitiesByPersonId[participant.id]
        if (personality) next = updateGameWorld(next, { personalitiesByPersonId: { ...next.personalitiesByPersonId, [coach.staffProfileId]: personality } })
      }
    }
  }
  if (action.effect === 'discuss') {
    const other = participants.find(p => p.id !== actor.id)!
    // RelationshipEvents owns PERSON50 compatibility shaping, exactly once.
    const delta = 3
    next = applyRelationshipEventsToWorld(next, [[actor, other], [other, actor]].map(([from, to]) => ({
      sourceId: from!.id, targetId: to!.id, event: { id: `relationship:${situation.id}:${from!.id}`, gameDate: world.currentDate,
        source: 'professionalInteraction' as const, delta,
        dimensionDeltas: { communicationQuality: delta, perceivedSupport: delta },
        context: { humanSituationId: situation.id, knowledgeBasis: perception.basis } },
    })))
  }
  return next
}

/** Authenticated actor is required; external/UI callers use the application user command. */
export function resolveHumanAction(world: GameWorld, situationId: string, actionId: string, actorPersonId: string, runtime: HumanRuntime): HumanCommandResult {
  return executeHumanAction(world, situationId, actionId, actorPersonId, runtime)
}
function executeHumanAction(world: GameWorld, situationId: string, actionId: string, actorPersonId: string, runtime: HumanRuntime, memoryBatch?: MemoryRecord[]): HumanCommandResult {
  const situation = world.humanSimulation.situationsById[situationId]
  if (!situation || situation.status !== 'open') return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  if (humanActorPersonId(world, situation.actor) !== actorPersonId) return { status: 'BLOCKED', world, reason: 'NOT_ACTOR' }
  const action = availableHumanActions(world, situation, runtime).find(item => item.id === actionId)
  if (!action) return { status: 'BLOCKED', world, reason: 'ACTION_UNAVAILABLE' }
  const executed = action.effect === 'authority' ? runtime.executeAuthority(world, situation, action.id) : rememberAction(world, situation, action, runtime, memoryBatch)
  if (!executed) return { status: 'BLOCKED', world, reason: 'AUTHORITY_REJECTED' }
  const situations = { ...executed.humanSimulation.situationsById,
    [situationId]: { ...situation, status: 'resolved' as const, resolution: { actionId, resolvedOn: world.currentDate } } }
  const rule = ruleFor(situation, runtime)!
  if (rule.reviewAfterDays && action.effect !== 'ignore') {
    const id = `${situation.id}:aftermath`
    situations[id] = { ...situation, id, parentId: situation.id, phase: 'aftermath', status: 'open',
      openedOn: world.currentDate, dueOn: addDays(world.currentDate, rule.reviewAfterDays) }
  }
  return { status: 'APPLIED', world: save(executed, { ...executed.humanSimulation, situationsById: situations }) }
}

/** Attributed communication requires real access. A rumour never grants source truth. */
export function shareHumanClaim(world: GameWorld, source: HumanSource, speakerPersonId: string, recipientPersonId: string,
  basis: 'report' | 'rumour', claim: string, runtime: HumanRuntime): HumanCommandResult {
  const speaker = humanKnowledge(world, source, speakerPersonId, runtime)
  if (!speaker || !claim.trim() || claim.length > 280 || !['report', 'rumour'].includes(basis) || speakerPersonId === recipientPersonId ||
    !runtime.canCommunicate(world, speakerPersonId, recipientPersonId) || (basis === 'report' && (speaker.basis === 'rumour' || claim !== speaker.description))) {
    return { status: 'BLOCKED', world, reason: 'COMMUNICATION_UNAVAILABLE' }
  }
  const id = humanKnowledgeId(source, recipientPersonId)
  const existing = world.humanSimulation.knowledgeById[id]
  if (existing) return { status: 'BLOCKED', world, reason: 'ALREADY_KNOWN' }
  const key = humanSourceKey(source)
  if (Object.values(world.humanSimulation.knowledgeById).filter(item => humanSourceKey(item.source) === key).length >= HUMAN_LIMITS.maxKnowledgePerSource) return { status: 'BLOCKED', world, reason: 'AUDIENCE_LIMIT' }
  const situations = { ...world.humanSimulation.situationsById }
  const actor = humanActorsForPerson(world, recipientPersonId)[0]
  const rule = runtime.rules.find(r => r.topics.includes('reportedInformation'))
  const active = Object.values(situations).filter(s => s.status === 'open')
  if (actor && rule && active.length < HUMAN_LIMITS.activeTotal && active.filter(s => humanActorPersonId(world, s.actor) === recipientPersonId).length < HUMAN_LIMITS.activePerActor) {
    const situationId = situationIdFor(rule.id, recipientPersonId, world.currentDate.slice(0, 7))
    if (!situations[situationId]) situations[situationId] = { id: situationId, ruleId: rule.id, source, actor, participants: [actor],
      openedOn: world.currentDate, ...(rule.timeoutDays === undefined ? {} : { dueOn: addDays(world.currentDate, rule.timeoutDays) }),
      phase: 'origin', status: 'open' }
  }
  return { status: 'APPLIED', world: save(world, { ...world.humanSimulation, situationsById: situations, knowledgeById: {
    ...world.humanSimulation.knowledgeById, [id]: { id, source, observerPersonId: recipientPersonId, speakerPersonId,
      learnedOn: world.currentDate, basis, claim },
  } }) }
}

/** Bounded active records only. Durable memories stay in the existing Memory authority. */
export function progressHumanSituations(world: GameWorld, runtime: HumanRuntime): GameWorld {
  let next = world
  const memoryBatch: MemoryRecord[] = []
  for (const original of orderedSituations(world)) {
    const situation = next.humanSimulation.situationsById[original.id]!
    if (situation.status !== 'open') continue
    if (situation.phase === 'aftermath' && situation.dueOn && world.currentDate >= situation.dueOn) {
      const observed = humanKnowledge(next, situation.source, humanActorPersonId(next, situation.actor)!, runtime)
      if (observed) next = rememberAction(next, situation, { id: 'review', label: 'Review', effect: 'reflect' }, runtime, memoryBatch)
      next = save(next, { ...next.humanSimulation, situationsById: { ...next.humanSimulation.situationsById,
        [situation.id]: { ...situation, status: 'resolved', resolution: { actionId: 'review', resolvedOn: world.currentDate } } } })
      continue
    }
    const actions = availableHumanActions(next, situation, runtime)
    if ((situation.dueOn && world.currentDate > situation.dueOn) || (situation.phase === 'origin' && actions.length === 0)) {
      next = save(next, { ...next.humanSimulation, situationsById: { ...next.humanSimulation.situationsById,
        [situation.id]: { ...situation, status: 'expired', resolution: { actionId: 'elapsed', resolvedOn: world.currentDate } } } })
      continue
    }
    if (humanActorPersonId(world, situation.actor) === world.coaches[world.userCoachId]!.personId || situation.phase !== 'origin') continue
    // One immutable appraisal snapshot for the wave: indexes are built once,
    // and NPCs cannot instantly react to each other's newly private thoughts.
    // The chosen action is still revalidated against `next` at execution.
    const actionId = runtime.chooseNpcAction(world, original, actions)
    if (actionId) {
      const result = executeHumanAction(next, situation.id, actionId, humanActorPersonId(next, situation.actor)!, runtime, memoryBatch)
      if (result.status === 'APPLIED') next = result.world
    }
  }
  next = recordMemories(next, memoryBatch)
  const cutoff = addDays(world.currentDate, -HUMAN_LIMITS.retainedDays)
  const entries = Object.values(next.humanSimulation.situationsById)
  // Keep ancestors until all descendants can be retired, preserving causal provenance.
  const retainedParents = new Set(entries.filter(s => s.parentId && (s.status === 'open' || s.resolution!.resolvedOn >= cutoff)).map(s => s.parentId))
  const situations = Object.fromEntries(entries.filter(s => s.status === 'open' || s.resolution!.resolvedOn >= cutoff || retainedParents.has(s.id)).map(s => [s.id, s]))
  const activeSources = new Set(Object.values(situations).map(s => humanSourceKey(s.source)))
  const knowledge = Object.fromEntries(Object.values(next.humanSimulation.knowledgeById)
    .filter(k => k.learnedOn >= cutoff || activeSources.has(humanSourceKey(k.source))).map(k => [k.id, k]))
  if (next.humanSimulation.observedThrough === world.currentDate && Object.keys(situations).length === entries.length && Object.keys(knowledge).length === Object.keys(next.humanSimulation.knowledgeById).length) return next
  return save(next, { situationsById: situations, knowledgeById: knowledge, observedThrough: world.currentDate })
}
