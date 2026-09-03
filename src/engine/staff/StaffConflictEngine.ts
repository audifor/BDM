import { createMemory } from '@/domain/memory'
import { getRelationshipDimensions, applyRelationshipEvent, createRelationshipProfile, relationshipKey, type RelationshipProfile } from '@/domain/relationships'
import { clampHumanStateValue, createStaffHumanState, type StaffHumanState } from '@/domain/staffHumanState'
import { createStaffConflict, createStaffConflictParticipantState, createStaffConflictTrigger, staffConflictGroupingKey, staffConflictIdFor, type StaffConflict, type StaffConflictParticipant, type StaffConflictTrigger } from '@/domain/staffConflict'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateStaffCultureFit } from './StaffCultureEngine'
import { buildStaffUnitRuntimeViews } from './StaffUnitCohesionEngine'

const CREATION_THRESHOLD = 62
export const STAFF_CONFLICT_COOLDOWN_DAYS = 30
export const STAFF_CONFLICT_COOLDOWN_BYPASS_PRESSURE = 86
export function resolveStaffConflictActorKind(world: GameWorld, actorId: string): 'staff' | 'coach' | undefined { return world.staffPeopleById[actorId as never] !== undefined ? 'staff' : world.coaches[actorId as never] !== undefined ? 'coach' : undefined }

export function calculateStaffConflictPressure(world: GameWorld, trigger: StaffConflictTrigger, existing?: StaffConflict): number {
  const subjectState = humanStateFor(world, trigger.subjectActorId)
  const relationship = getRelationshipDimensions(world.relationshipsByKey[relationshipKey(trigger.subjectActorId, trigger.counterpartActorId)])
  const humanVulnerability = subjectState === undefined ? 0 : ((subjectState.frustration + subjectState.stress + (100 - subjectState.autonomySatisfaction) + (100 - subjectState.influenceSatisfaction)) / 4 - 50) * 0.32
  const relationshipVulnerability = ((-relationship.professionalRespect - relationship.communicationQuality - relationship.professionalAlignment) / 3) * 0.3
  const protection = ((relationship.trust + relationship.professionalRespect + relationship.communicationQuality) / 3) * 0.22
  const repetition = existing === undefined ? 0 : Math.min(14, existing.sourceTriggerIds.length * 4)
  return Math.max(0, Math.min(100, Math.round(trigger.basePressure + humanVulnerability + relationshipVulnerability - protection + repetition)))
}

/** Trigger-only conflict creation: no relationship, culture, or Human State value can create an episode without this concrete seam. */
export function applyStaffConflictTrigger(world: GameWorld, input: StaffConflictTrigger): GameWorld {
  const trigger = createStaffConflictTrigger(input)
  if (resolveStaffConflictActorKind(world, trigger.subjectActorId) === undefined || resolveStaffConflictActorKind(world, trigger.counterpartActorId) === undefined) return world
  const active = Object.values(world.staffConflictsById).find((conflict) => conflict.status === 'ACTIVE' && staffConflictGroupingKey(conflict) === staffConflictGroupingKey({ scopeKey: trigger.scopeKey, type: trigger.type, participants: [{ actorId: trigger.subjectActorId, role: 'PRIMARY', state: neutralParticipantState(), joinedOn: trigger.occurredOn }, { actorId: trigger.counterpartActorId, role: 'SECONDARY', state: neutralParticipantState(), joinedOn: trigger.occurredOn }] }))
  if (active?.sourceTriggerIds.includes(trigger.id)) return world
  const pressure = calculateStaffConflictPressure(world, trigger, active)
  if (active === undefined) {
    if (pressure < CREATION_THRESHOLD) return world
    const resolved = Object.values(world.staffConflictsById).filter((conflict) => conflict.status === 'RESOLVED' && staffConflictGroupingKey(conflict) === triggerGroupingKey(trigger)).sort((left, right) => right.resolvedOn!.localeCompare(left.resolvedOn!))[0]
    if (resolved !== undefined && daysBetween(resolved.resolvedOn!, trigger.occurredOn) <= STAFF_CONFLICT_COOLDOWN_DAYS && pressure < STAFF_CONFLICT_COOLDOWN_BYPASS_PRESSURE) return world
  }
  const conflict = active === undefined ? createConflict(trigger, pressure) : applyTrigger(active, trigger, pressure)
  let next = updateGameWorld(world, { staffConflicts: [...Object.values(world.staffConflictsById).filter((item) => item.id !== conflict.id), conflict] })
  const milestone = active === undefined ? 'started' : escalationMilestone(active, conflict)
  return milestone === undefined ? next : recordConflictMemories(applyConflictRelationshipMilestone(next, conflict, milestone), conflict, milestone)
}

export function progressStaffConflicts(world: GameWorld): GameWorld {
  if (isoWeekday(world.currentDate) !== 1) return world
  const active = Object.values(world.staffConflictsById).filter((conflict) => conflict.status === 'ACTIVE')
  if (active.length === 0) return world
  const progressed = active.map((conflict) => progressConflict(world, conflict))
  const changed = progressed.filter((conflict, index) => conflict !== active[index])
  if (changed.length === 0) return world
  let next = updateGameWorld(world, { staffConflicts: Object.values(world.staffConflictsById).map((conflict) => progressed.find((item) => item.id === conflict.id) ?? conflict), staffHumanStates: applyConflictHumanStatePressure(world, progressed) })
  for (const conflict of changed) {
    const before = world.staffConflictsById[conflict.id]!
    if (conflict.status === 'RESOLVED') next = recordConflictMemories(applyConflictRelationshipMilestone(next, conflict, 'resolved'), conflict, 'resolved')
    else if (conflict.stage === 'ESCALATING' && before.stage !== 'ESCALATING') next = recordConflictMemories(applyConflictRelationshipMilestone(next, conflict, 'escalated'), conflict, 'escalated')
  }
  return next
}

function createConflict(trigger: StaffConflictTrigger, pressure: number): StaffConflict {
  const severity = severityFor(pressure); const stage = pressure >= 86 ? 'ESCALATING' : pressure >= 74 ? 'ACTIVE' : 'EMERGING'
  return createStaffConflict({ id: staffConflictIdFor(trigger), scopeKey: trigger.scopeKey, ...(trigger.teamId === undefined ? {} : { teamId: trigger.teamId }), type: trigger.type, primaryCause: trigger.cause, startedOn: trigger.occurredOn, lastEvaluatedOn: trigger.occurredOn, status: 'ACTIVE', stage, severity, participants: [participant(trigger.subjectActorId, 'PRIMARY', trigger.occurredOn, pressure), participant(trigger.counterpartActorId, 'SECONDARY', trigger.occurredOn, Math.round(pressure * 0.75))], sourceTriggerIds: [trigger.id] })
}
function applyTrigger(conflict: StaffConflict, trigger: StaffConflictTrigger, pressure: number): StaffConflict {
  const participants = conflict.participants.map((item) => ({ ...item, state: createStaffConflictParticipantState({ ...item.state, grievance: item.state.grievance + Math.round(pressure / 9), emotionalInvestment: item.state.emotionalInvestment + Math.round(pressure / 18), perceivedFairness: item.state.perceivedFairness - Math.round(pressure / 15) }) }))
  const magnitude = Math.max(pressure, conflictMagnitude({ ...conflict, participants }))
  return createStaffConflict({ ...conflict, primaryCause: trigger.cause, participants, sourceTriggerIds: [...conflict.sourceTriggerIds, trigger.id], stage: magnitude >= 82 ? 'ESCALATING' : conflict.stage === 'LATENT' ? 'EMERGING' : conflict.stage, severity: severityFor(magnitude), lastEvaluatedOn: trigger.occurredOn })
}
function progressConflict(world: GameWorld, conflict: StaffConflict): StaffConflict {
  const magnitude = conflictMagnitude(conflict); const environment = calculateActiveConflictEnvironment(world, conflict)
  const compromise = conflict.participants.reduce((sum, item) => sum + item.state.willingnessToCompromise + item.state.perceivedFairness, 0) / (conflict.participants.length * 2)
  const recovery = environment <= -18 && compromise >= 58 ? 7 : environment <= -6 && compromise >= 52 ? 3 : 0
  const deterioration = environment >= 25 ? 5 : environment >= 12 ? 2 : 0
  const nextParticipants = conflict.participants.map((item) => ({ ...item, state: createStaffConflictParticipantState({ ...item.state, grievance: item.state.grievance - recovery + deterioration, emotionalInvestment: item.state.emotionalInvestment - Math.round(recovery / 2) + Math.round(deterioration / 2), perceivedFairness: item.state.perceivedFairness + recovery - Math.round(deterioration / 2) }) }))
  const nextMagnitude = conflictMagnitude({ ...conflict, participants: nextParticipants })
  if (nextMagnitude <= 22 && compromise >= 60) return createStaffConflict({ ...conflict, participants: nextParticipants, status: 'RESOLVED', stage: 'RESOLVED', severity: 'MINOR', resolvedOn: world.currentDate, resolution: { type: 'FADED', resolvedOn: world.currentDate }, lastEvaluatedOn: world.currentDate })
  const stage = nextMagnitude >= 82 || environment >= 32 ? 'ESCALATING' : recovery > 0 && nextMagnitude <= 36 ? 'RESOLVING' : recovery > 0 && nextMagnitude < magnitude ? 'COOLING' : conflict.stage === 'EMERGING' ? 'ACTIVE' : conflict.stage
  return createStaffConflict({ ...conflict, participants: nextParticipants, stage, severity: severityFor(nextMagnitude), lastEvaluatedOn: world.currentDate })
}
/** Bounded active-episode context; only the episode's own participants are inspected. */
export function calculateActiveConflictEnvironment(world: GameWorld, conflict: StaffConflict): number {
  const [primary, secondary] = conflict.participants.filter((item) => item.role === 'PRIMARY' || item.role === 'SECONDARY')
  if (primary === undefined || secondary === undefined) return 0
  const human = [primary.actorId, secondary.actorId].map((id) => humanStateFor(world, id)).filter((state): state is StaffHumanState => state !== undefined)
  const humanPressure = human.length === 0 ? 0 : human.reduce((sum, state) => sum + state.frustration + state.stress + (100 - state.professionalFulfillment) + (100 - state.organizationalCommitment) + (100 - state.autonomySatisfaction) + (100 - state.influenceSatisfaction) - 300, 0) / (human.length * 6)
  const forward = getRelationshipDimensions(world.relationshipsByKey[relationshipKey(primary.actorId, secondary.actorId)])
  const reverse = getRelationshipDimensions(world.relationshipsByKey[relationshipKey(secondary.actorId, primary.actorId)])
  const relation = ([forward, reverse].reduce((sum, value) => sum + value.trust + value.professionalRespect + value.communicationQuality + value.perceivedSupport + value.professionalAlignment + value.collaboration, 0) / 12)
  const culture = [primary.actorId, secondary.actorId].map((id) => world.staffPeopleById[id as never] === undefined ? undefined : world.staffCultureStatesByScopeKey[conflict.scopeKey] === undefined ? undefined : calculateStaffCultureFit(world, id as never, world.staffCultureStatesByScopeKey[conflict.scopeKey]!).fitScore - 50).filter((value): value is number => value !== undefined)
  const cultureSignal = culture.length === 0 ? 0 : -culture.reduce((sum, value) => sum + value, 0) / culture.length
  const unit = buildStaffUnitRuntimeViews(world, conflict.teamId as never ?? conflict.scopeKey as never).find((view) => view.memberStaffIds.includes(primary.actorId as never) && view.memberStaffIds.includes(secondary.actorId as never))
  const cohesion = unit === undefined ? 0 : ((world.staffUnitCohesionStatesByUnitKey[unit.unitKey]?.current.communication ?? 50) + (world.staffUnitCohesionStatesByUnitKey[unit.unitKey]?.current.coordination ?? 50) - 100) / 2
  return Math.round(Math.max(-40, Math.min(40, humanPressure - relation * 0.45 + cultureSignal * 0.18 - cohesion * 0.18)))
}
function applyConflictHumanStatePressure(world: GameWorld, conflicts: readonly StaffConflict[]): readonly StaffHumanState[] {
  const activeByActor = new Map<string, StaffConflict[]>()
  for (const conflict of conflicts) if (conflict.status === 'ACTIVE') for (const participant of conflict.participants) activeByActor.set(participant.actorId, [...(activeByActor.get(participant.actorId) ?? []), conflict])
  return Object.values(world.staffHumanStatesByContextId).map((state) => {
    const conflictsForStaff = activeByActor.get(state.staffId) ?? []; if (conflictsForStaff.length === 0) return state
    const pressure = Math.min(4, conflictsForStaff.reduce((sum, conflict) => sum + conflictMagnitude(conflict) / 25, 0))
    return createStaffHumanState({ ...state, frustration: clampHumanStateValue(state.frustration + Math.min(2, pressure)), stress: clampHumanStateValue(state.stress + Math.min(2, pressure)), professionalFulfillment: clampHumanStateValue(state.professionalFulfillment - Math.min(2, pressure)), organizationalCommitment: clampHumanStateValue(state.organizationalCommitment - Math.min(2, pressure)), lastEvaluatedOn: world.currentDate })
  })
}
function applyConflictRelationshipMilestone(world: GameWorld, conflict: StaffConflict, milestone: 'started' | 'escalated' | 'resolved'): GameWorld {
  if (conflict.type === 'PERSONAL') return world
  const magnitude = milestone === 'resolved' ? 1 : milestone === 'escalated' ? -5 : -3
  const relationships: Record<string, RelationshipProfile> = { ...world.relationshipsByKey }
  for (const source of conflict.participants.slice(0, 2)) for (const target of conflict.participants.slice(0, 2)) {
    if (source.actorId === target.actorId) continue
    const key = relationshipKey(source.actorId, target.actorId); const profile = relationships[key] ?? createRelationshipProfile(source.actorId, target.actorId)
    relationships[key] = applyRelationshipEvent(profile, { id: `staff-conflict:${conflict.id}:${milestone}:${source.actorId}`, gameDate: conflict.lastEvaluatedOn, source: 'professionalInteraction', delta: magnitude, context: { conflictId: conflict.id, milestone }, dimensionDeltas: { trust: magnitude, professionalRespect: magnitude, communicationQuality: magnitude, collaboration: magnitude, perceivedSupport: magnitude, professionalAlignment: magnitude } })
  }
  return updateGameWorld(world, { relationshipsByKey: relationships })
}
function recordConflictMemories(world: GameWorld, conflict: StaffConflict, milestone: 'started' | 'escalated' | 'resolved'): GameWorld {
  const memories = conflict.participants.slice(0, 2).flatMap((participant) => { const ownerKind = resolveStaffConflictActorKind(world, participant.actorId); if (ownerKind === undefined) return []; const refs = conflict.participants.filter((item) => item.actorId !== participant.actorId).flatMap((item) => { const kind = resolveStaffConflictActorKind(world, item.actorId); return kind === undefined ? [] : [{ kind, id: item.actorId }] }); return [createMemory({ id: `memory:staff-conflict:${conflict.id}:${milestone}:${participant.actorId}`, owner: { kind: ownerKind, id: participant.actorId }, type: 'conflict', occurredOn: conflict.lastEvaluatedOn, entityRefs: refs, sourceId: conflict.id, semanticKey: `staff-conflict:${conflict.id}:${milestone}`, importance: milestone === 'escalated' ? 'important' : 'notable', valence: milestone === 'resolved' ? 15 : -45, intensity: milestone === 'escalated' ? 70 : 45, decayPerMonth: 3, permanent: false, tags: ['staff', 'conflict', milestone], context: { conflictId: conflict.id, milestone } })] })
  const fresh = memories.filter((memory) => world.memoriesById[memory.id] === undefined && !Object.values(world.memoriesById).some((item) => item.owner.id === memory.owner.id && item.semanticKey === memory.semanticKey))
  return fresh.length === 0 ? world : updateGameWorld(world, { memories: [...Object.values(world.memoriesById), ...fresh] })
}
function participant(actorId: string, role: 'PRIMARY' | 'SECONDARY', date: string, pressure: number): StaffConflictParticipant { return { actorId, role, joinedOn: date as never, state: createStaffConflictParticipantState({ grievance: 30 + pressure / 2, willingnessToCompromise: 55 - pressure / 8, perceivedFairness: 65 - pressure / 3, emotionalInvestment: 25 + pressure / 2 }) } }
function neutralParticipantState() { return { grievance: 50, willingnessToCompromise: 50, perceivedFairness: 50, emotionalInvestment: 50 } }
function conflictMagnitude(conflict: Pick<StaffConflict, 'participants' | 'sourceTriggerIds'>): number { const states = conflict.participants.map((item) => item.state); return Math.max(0, Math.min(100, Math.round(states.reduce((sum, item) => sum + item.grievance * 0.6 + item.emotionalInvestment * 0.25 + (100 - item.perceivedFairness) * 0.15, 0) / Math.max(1, states.length) + Math.min(12, conflict.sourceTriggerIds.length * 3)))) }
function severityFor(magnitude: number): StaffConflict['severity'] { return magnitude >= 88 ? 'CRITICAL' : magnitude >= 74 ? 'SEVERE' : magnitude >= 58 ? 'SERIOUS' : magnitude >= 42 ? 'MODERATE' : 'MINOR' }
function humanStateFor(world: GameWorld, actorId: string) { return Object.values(world.staffHumanStatesByContextId).find((item) => item.staffId === actorId) }
function triggerGroupingKey(trigger: StaffConflictTrigger): string { return staffConflictGroupingKey({ scopeKey: trigger.scopeKey, type: trigger.type, participants: [{ actorId: trigger.subjectActorId, role: 'PRIMARY', state: neutralParticipantState(), joinedOn: trigger.occurredOn }, { actorId: trigger.counterpartActorId, role: 'SECONDARY', state: neutralParticipantState(), joinedOn: trigger.occurredOn }] }) }
function escalationMilestone(before: StaffConflict, after: StaffConflict): 'escalated' | undefined { return before.stage !== 'ESCALATING' && after.stage === 'ESCALATING' ? 'escalated' : undefined }
function daysBetween(from: string, to: string): number { return Math.floor((Date.UTC(...to.split('-').map((value, index) => Number(value) - (index === 1 ? 1 : 0)) as [number, number, number]) - Date.UTC(...from.split('-').map((value, index) => Number(value) - (index === 1 ? 1 : 0)) as [number, number, number])) / 86400000) }
function isoWeekday(date: string): number { const [year, month, day] = date.split('-').map(Number); const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); return weekday === 0 ? 7 : weekday }
