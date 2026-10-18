import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, createGameDate } from '@/domain/date'
import { EMPTY_HUMAN_SIMULATION, HUMAN_LIMITS, humanKnowledgeId, type HumanSource } from '@/domain/hrpg/HumanSimulation'
import { humanActorPersonId } from '@/domain/hrpg/validateHumanSimulationWorld'
import { createScheduledTrainingSession } from '@/domain/training'
import { createGame } from '@/domain/game'
import { gameIdFromString } from '@/domain/ids'
import { getRelationshipDimensions, relationshipKey } from '@/domain/relationships'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { ensureStaffEmploymentStructure, ensureStaffContractStructure } from '@/engine/world/StaffCareerEnrichment'
import { progressStaffHumanState } from '@/engine/staff/StaffHumanStatePipeline'
import { chooseStaffHumanResponse } from '@/engine/staff/StaffCareerAutonomyEngine'
import { ingestHumanSources, humanKnowledge, inspectHumanContext, observePublicHumanInformation, progressHumanSituations, queryHumanContinuity, queryHumanSituations, queryPublicHumanInformation, resolveHumanAction, shareHumanClaim } from '@/engine/hrpg/HumanSimulationEngine'
import { registerCoachFinanceMovement } from '@/engine/coachFinances'
import { executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession } from '@/engine/training/ScheduledTrainingEngine'
import { decayMemoriesForMonth } from '@/engine/memory'
import { applyUserCoachCreation } from '@/app/game/UserCoachCreator'
import { decideOpeningDebt, progressStaffPromises, queueVerifiedPlayerTrainingFeedback } from '@/app/coachLife'
import { advanceGameDayWithResult } from '@/app/game/advanceGameDay'
import { applyUserCoachForJob } from '@/app/coachCareer/CoachCareerService'
import { createCoachJobOpeningForTeam, fireCoachFromTeam } from '@/app/coachCareer'
import { createMatchEnginePort } from '@/app/matchNext'
import { completeBackgroundMatch } from '@/app/worldSim/BackgroundMatchCompletion'
import { simulateBackgroundMatch } from '@/engine/world-sim/background/BackgroundMatchModel'
import { serializeGameWorldV4, deserializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { HUMAN_RUNTIME, decideUserHumanSituation, getUserHumanContinuity, getUserHumanSituations, initializeHumanSimulation, resolveHumanCompatibility, synchronizeHumanSimulation } from './HumanSimulationService'
import { collectHumanSources, readHumanFact } from './HumanSources'

let base: GameWorld
beforeAll(() => {
  base = progressStaffHumanState(applyUserCoachCreation(ensureStaffContractStructure(ensureStaffEmploymentStructure(generateWorld({ seed: 812, gender: 'female' }))), {
    firstName: 'Sara', lastName: 'Vidal', dateOfBirth: '1990-03-08', gender: 'female',
    background: 'inDebt', disposition: 'loyal', coachingStyle: 'developer',
  }))
})
const user = (world: GameWorld) => world.coaches[world.userCoachId]!.personId
const sourcesOf = (kind: HumanSource['kind'], ids: readonly string[]): readonly HumanSource[] => ids.map(id => ({ kind, id }))
function staffRequest(world = base) {
  const team = Object.values(world.teams).find(t => t.coachId === world.userCoachId)!
  const assignment = Object.values(world.teamStaffAssignmentsById).find(a => a.teamId === team.id && a.role === 'assistantCoach')!
  const context = Object.values(world.staffHumanContextsById).find(c => c.staffId === assignment.staffPersonId)!
  const request = { id: 'hrpg-real-request', staffId: assignment.staffPersonId, teamId: team.id, contextId: context.id,
    kind: 'MORE_RESPONSIBILITY' as const, targetResponsibilityKind: 'createTeamTrainingPlan' as const, status: 'OPEN' as const, createdOn: world.currentDate }
  return { world: updateGameWorld(world, { staffCareerRequests: [...Object.values(world.staffCareerRequestsById), request] }), request, team }
}
function financialEvent(world = base) {
  const movement = { id: `hrpg-income:${world.currentDate}`, date: world.currentDate, type: 'otherIncome' as const, amount: 125, description: 'Recorded personal income' }
  return { world: registerCoachFinanceMovement(world, world.userCoachId, movement),
    source: { kind: 'coachFinance' as const, id: JSON.stringify([world.userCoachId, movement.id]) } }
}
function find(world: GameWorld, rule: string) {
  const situation = Object.values(world.humanSimulation.situationsById).find(s => s.ruleId === rule && s.actor.id === world.userCoachId && s.status === 'open')
  if (!situation) throw new Error(`Missing ${rule} situation`)
  return situation
}

describe('BS19 HRPG integrated human simulation', () => {
  it('adapts P0/P2 through one command, validates resources/actor/input and preserves canonical effects', () => {
    expect(getUserHumanSituations(base).filter(s => s.status === 'open')).toHaveLength(2)
    const debt = find(base, 'openingDebt')
    expect(resolveHumanAction(base, debt.id, 'extraPayment', 'not-the-user', HUMAN_RUNTIME)).toMatchObject({ status: 'BLOCKED', reason: 'NOT_ACTOR', world: base })
    expect(decideUserHumanSituation(base, debt.id, 'inventMoney')).toMatchObject({ status: 'BLOCKED', world: base })
    const applied = decideUserHumanSituation(base, debt.id, 'extraPayment')
    expect(applied.status).toBe('APPLIED')
    const next = applied.world
    expect(next.coachFinancesByCoachId[base.userCoachId]!.cash).toBe(base.coachFinancesByCoachId[base.userCoachId]!.cash - 500)
    expect(next.humanSimulation.situationsById[debt.id]?.status).toBe('resolved')
    expect(decideUserHumanSituation(next, debt.id, 'extraPayment')).toMatchObject({ status: 'BLOCKED', world: next })
    const meeting = find(next, 'firstStaffMeeting')
    const met = decideUserHumanSituation(next, meeting.id, 'seekInput')
    expect(met.status).toBe('APPLIED')
    expect(Object.values(met.world.memoriesById).some(m => m.tags.includes('meeting'))).toBe(true)
    expect(met.world.personalityHistoryByPersonId[base.userCoachId]?.length).toBeGreaterThan(0)
  })

  it('removes unaffordable actions and rejects invented/missing/future sources', () => {
    const profile = base.coachFinancesByCoachId[base.userCoachId]!
    const poor = updateGameWorld(base, { coachFinancesByCoachId: { ...base.coachFinancesByCoachId, [base.userCoachId]: { ...profile, cash: 0 } } })
    const debt = find(poor, 'openingDebt')
    expect(getUserHumanSituations(poor).find(s => s.id === debt.id)!.choices.map(a => a.id)).toEqual(['reduceLifestyle'])
    expect(decideUserHumanSituation(poor, debt.id, 'extraPayment').status).toBe('BLOCKED')
    const hints = sourcesOf('training', ['invented-session'])
    expect(ingestHumanSources(base, hints, HUMAN_RUNTIME)).toMatchObject({ admitted: 0, world: base })
    const { world, source } = financialEvent()
    const earlier = updateGameWorld(world, { humanSimulation: EMPTY_HUMAN_SIMULATION, currentDate: addDays(base.currentDate, -1) })
    expect(ingestHumanSources(earlier, [source], HUMAN_RUNTIME).admitted).toBe(0)
  })

  it('separates private truth, witnessed knowledge, reports and false rumours', () => {
    const { world, source } = financialEvent()
    const known = ingestHumanSources(world, [source], HUMAN_RUNTIME).world
    const team = Object.values(known.teams).find(t => t.coachId === known.userCoachId)!
    const coworker = known.players[team.rosterPlayerIds[0]!]!.personId!
    const outsider = Object.values(known.players).find(p => !team.rosterPlayerIds.includes(p.id))!.personId!
    expect(humanKnowledge(known, source, coworker, HUMAN_RUNTIME)).toBeUndefined()
    expect(queryHumanSituations(known, coworker, HUMAN_RUNTIME).some(s => s.narration.description.includes('finance'))).toBe(false)
    expect(shareHumanClaim(known, source, user(known), outsider, 'rumour', 'The coach is bankrupt', HUMAN_RUNTIME).status).toBe('BLOCKED')
    const heardOn = addDays(known.currentDate, 2)
    const hearingWorld = updateGameWorld(known, { currentDate: heardOn })
    const shared = shareHumanClaim(hearingWorld, source, user(known), coworker, 'rumour', 'The coach is bankrupt', HUMAN_RUNTIME)
    expect(shared.status).toBe('APPLIED')
    expect(humanKnowledge(shared.world, source, coworker, HUMAN_RUNTIME)).toEqual({ basis: 'rumour', description: 'The coach is bankrupt', speakerPersonId: user(known) })
    expect(readHumanFact(shared.world, source)).toEqual(readHumanFact(known, source))
    expect(shared.world.coachFinancesByCoachId).toBe(known.coachFinancesByCoachId)
    expect(shareHumanClaim(shared.world, source, coworker, user(known), 'report', 'The coach is bankrupt', HUMAN_RUNTIME).status).toBe('BLOCKED')
    const reacted = progressHumanSituations(updateGameWorld(shared.world, { currentDate: addDays(heardOn, 1) }), HUMAN_RUNTIME)
    expect(Object.values(reacted.memoriesById).some(m => m.tags.includes('rumour') && m.context.claim === 'The coach is bankrupt')).toBe(true)
    const perceivedHistory = queryHumanContinuity(reacted, { kind: 'player', id: team.rosterPlayerIds[0]! }, HUMAN_RUNTIME)
    expect(perceivedHistory.flatMap(c => c.entries).find(e => e.source.id === source.id)).toMatchObject({ occurredOn: heardOn, stage: 'development' })
    const later = progressHumanSituations(updateGameWorld(reacted, { currentDate: addDays(reacted.currentDate, 100) }), HUMAN_RUNTIME)
    const retired = progressHumanSituations(updateGameWorld(later, { currentDate: addDays(later.currentDate, 100) }), HUMAN_RUNTIME)
    expect(retired.humanSimulation.knowledgeById[humanKnowledgeId(source, coworker)]).toBeUndefined()
    expect(humanKnowledge(retired, source, coworker, HUMAN_RUNTIME)?.basis).toBe('rumour')
    const rememberedHistory = queryHumanContinuity(retired, { kind: 'player', id: team.rosterPlayerIds[0]! }, HUMAN_RUNTIME)
    expect(rememberedHistory.flatMap(c => c.entries).find(e => e.source.id === source.id)?.occurredOn).toBe(heardOn)
    expect(retired.coachFinancesByCoachId).toBe(known.coachFinancesByCoachId)
  })

  it('composes source-backed staff contexts and lets existing Staff AI respond without the user', () => {
    const { world, request } = staffRequest()
    const ingested = ingestHumanSources(world, [{ kind: 'staffRequest', id: request.id }], HUMAN_RUNTIME).world
    const situation = Object.values(ingested.humanSimulation.situationsById).find(s => s.actor.id === request.staffId && s.ruleId === 'professionalContext')!
    const context = inspectHumanContext(ingested, situation)
    expect(context.personality).toBe(ingested.personalitiesByPersonId[request.staffId])
    expect(context.staffHumanState).toBeDefined()
    const progressed = progressHumanSituations(ingested, HUMAN_RUNTIME)
    expect(progressed.humanSimulation.situationsById[situation.id]?.status).toBe('resolved')
    expect(Object.values(progressed.memoriesById).some(m => m.owner.id === request.staffId && m.tags.includes('hrpg'))).toBe(true)
    expect(progressed.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(humanKnowledge(progressed, situation.source, Object.values(progressed.coaches).find(c => c.id !== progressed.userCoachId)!.personId, HUMAN_RUNTIME)).toBeUndefined()
  })

  it('PERSON traits and emotional context change NPC choices through the existing AI authority', () => {
    const { world, request } = staffRequest()
    const ingested = ingestHumanSources(world, [{ kind: 'staffRequest', id: request.id }], HUMAN_RUNTIME).world
    const situation = Object.values(ingested.humanSimulation.situationsById).find(s => s.actor.id === request.staffId && s.ruleId === 'professionalContext')!
    const actions = [{ id: 'talk', label: 'Talk', effect: 'discuss' as const }, { id: 'think', label: 'Think', effect: 'reflect' as const }]
    const personality = ingested.personalitiesByPersonId[request.staffId]!
    const cooperative = updateGameWorld(ingested, { personalitiesByPersonId: { ...ingested.personalitiesByPersonId,
      [request.staffId]: { ...personality, values: { ...personality.values, teamOrientation: 100, loyalty: 100 } } } })
    const isolated = updateGameWorld(ingested, { personalitiesByPersonId: { ...ingested.personalitiesByPersonId,
      [request.staffId]: { ...personality, values: { ...personality.values, teamOrientation: 0, loyalty: 0 } } } })
    expect(chooseStaffHumanResponse(cooperative, situation, actions)).toBe('talk')
    expect(chooseStaffHumanResponse(isolated, situation, actions)).toBe('think')
  })

  it('player actions use canonical directed relationships, morale, memory and PERSON50 without sporting bonuses', () => {
    const { world, request } = staffRequest()
    const ingested = ingestHumanSources(world, [{ kind: 'staffRequest', id: request.id }], HUMAN_RUNTIME).world
    const situation = find(ingested, 'professionalContext')
    const before = getRelationshipDimensions(ingested.relationshipsByKey[relationshipKey(ingested.userCoachId, request.staffId)])
    const result = decideUserHumanSituation(ingested, situation.id, 'discuss')
    expect(result.status).toBe('APPLIED')
    expect(getRelationshipDimensions(result.world.relationshipsByKey[relationshipKey(ingested.userCoachId, request.staffId)]).communicationQuality).toBeGreaterThan(before.communicationQuality)
    expect(result.world.relationshipsByKey[relationshipKey(request.staffId, ingested.userCoachId)]).toBeDefined()
    expect(result.world.personalityHistoryByPersonId[ingested.userCoachId]?.length).toBeGreaterThan(0)
    expect(result.world.players).toBe(ingested.players)
    expect(result.world.staffPeopleById).toBe(ingested.staffPeopleById)
    expect(result.world.developmentStimulusByPlayerId).toBe(ingested.developmentStimulusByPlayerId)
  })

  it('real commitments create later breach facts, memories and Staff career pressure, not automatic promotions', () => {
    const { world, request } = staffRequest()
    const ingested = ingestHumanSources(world, [{ kind: 'staffRequest', id: request.id }], HUMAN_RUNTIME).world
    const decision = find(ingested, 'staffRequestDecision')
    const promised = decideUserHumanSituation(ingested, decision.id, 'promise')
    expect(promised.status).toBe('APPLIED')
    expect(promised.world.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(Object.values(promised.world.memoriesById).some(m => m.sourceId === request.id && m.tags.includes('promise'))).toBe(true)
    expect(Object.values(promised.world.humanSimulation.situationsById).some(s => s.ruleId === 'staffPromise')).toBe(true)
    const due = updateGameWorld(promised.world, { currentDate: addDays(world.currentDate, 15) })
    const breached = progressStaffPromises(due)
    const followUp = synchronizeHumanSimulation(due, breached)
    expect(followUp.staffCareerRequestsById[request.id]?.status).toBe('OPEN')
    expect(getUserHumanContinuity(followUp).find(c => c.id === request.id)?.entries.some(e => e.stage === 'crisis')).toBe(true)
    expect(Object.values(followUp.memoriesById).some(m => m.sourceId === request.id && m.tags.includes('broken'))).toBe(true)
  })

  it('resolves a genuine Career offer through the same action API and existing employment/finance authorities', () => {
    const vacantTeam = Object.values(base.teams).find(t => t.coachId && t.coachId !== base.userCoachId)!
    const fired = fireCoachFromTeam(base, vacantTeam.id)
    const opened = createCoachJobOpeningForTeam(fired, { teamId: vacantTeam.id })
    const applied = applyUserCoachForJob(opened.world, opened.opening.id)
    const offer = Object.values(applied.world.coachJobOffersById).find(o => o.coachId === base.userCoachId && o.status === 'pending')!
    expect(offer).toBeDefined()
    const ingested = ingestHumanSources(applied.world, [{ kind: 'coachOffer', id: offer.id }], HUMAN_RUNTIME).world
    const decision = find(ingested, 'careerOffer')
    const accepted = decideUserHumanSituation(ingested, decision.id, 'acceptOffer')
    expect(accepted.status).toBe('APPLIED')
    expect(accepted.world.coachEmploymentByCoachId[base.userCoachId]?.teamId).toBe(vacantTeam.id)
    expect(accepted.world.coachJobOffersById[offer.id]?.status).toBe('accepted')
    expect(accepted.world.coaches[base.userCoachId]?.personId).toBe(user(base))
    expect(decideUserHumanSituation(accepted.world, decision.id, 'acceptOffer').status).toBe('BLOCKED')
  })

  it('consumes actual Training execution, rejects scheduled sessions and connects P8 to the common API', () => {
    const team = Object.values(base.teams).find(t => t.coachId === base.userCoachId)!
    const date = nextEligibleTrainingDate(base.currentDate)
    const session = createScheduledTrainingSession({ id: 'hrpg-individual', teamId: team.id, playerId: team.rosterPlayerIds[0],
      scope: 'individual', date, startTime: '09:00', durationMinutes: 60, definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = scheduleTrainingSession(base, session)
    const source: HumanSource = { kind: 'training', id: session.id }
    expect(readHumanFact(scheduled, source)).toBeUndefined()
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
    expect(readHumanFact(executed, source)?.participants).toEqual([{ kind: 'player', id: session.playerId }])
    const synced = synchronizeHumanSimulation(scheduled, queueVerifiedPlayerTrainingFeedback(executed))
    expect(Object.values(synced.humanSimulation.situationsById).some(s => s.source.id === session.id)).toBe(true)
    const feedback = find(synced, 'playerTrainingFeedback')
    const discussed = decideUserHumanSituation(synced, feedback.id, 'recognizeWork')
    expect(discussed.status).toBe('APPLIED')
    expect(discussed.world.relationshipsByKey[relationshipKey(session.playerId!, base.userCoachId)]).toBeDefined()
  })

  it('replays deterministically and Save V4 reload preserves exact pending, knowledge, lineage and idempotence', () => {
    const { world, source } = financialEvent()
    const run = () => {
      const ingested = ingestHumanSources(world, [source, source], HUMAN_RUNTIME).world
      return decideUserHumanSituation(ingested, find(ingested, 'personalContext').id, 'reflect').world
    }
    const resolved = run()
    expect(run()).toEqual(resolved)
    const saved = serializeGameWorldV4(resolved, '2032-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(loaded.humanSimulation).toEqual(resolved.humanSimulation)
    expect(loaded.memoriesById).toEqual(resolved.memoriesById)
    expect(ingestHumanSources(loaded, [source], HUMAN_RUNTIME).world).toBe(loaded)
    expect(decideUserHumanSituation(loaded, find(world, 'openingDebt').id, 'extraPayment').status).toBe('APPLIED')
  })

  it('runs delayed aftermath once, retains causal links and preserves long-lived memories across years', () => {
    const { world, source } = financialEvent()
    const queued = ingestHumanSources(world, [source], HUMAN_RUNTIME).world
    const origin = find(queued, 'personalContext')
    const resolved = decideUserHumanSituation(queued, origin.id, 'reflect').world
    const due = updateGameWorld(resolved, { currentDate: addDays(resolved.currentDate, 7) })
    const reviewed = progressHumanSituations(due, HUMAN_RUNTIME)
    expect(reviewed.humanSimulation.situationsById[`${origin.id}:aftermath`]).toMatchObject({ parentId: origin.id, status: 'resolved' })
    expect(progressHumanSituations(reviewed, HUMAN_RUNTIME)).toBe(reviewed)
    const later = progressHumanSituations(updateGameWorld(reviewed, { currentDate: createGameDate(2042, 10, 1) }), HUMAN_RUNTIME)
    expect(later.humanSimulation.situationsById[origin.id]).toBeUndefined()
    expect(humanKnowledge(later, source, user(later), HUMAN_RUNTIME)?.basis).toBe('witnessed')
    expect(getUserHumanContinuity(later).some(c => c.entries.some(e => e.stage === 'aftermath'))).toBe(true)
    expect(Object.values(later.memoriesById).some(m => m.sourceId === source.id && m.tags.includes('hrpg'))).toBe(true)
    const decayed = decayMemoriesForMonth(later)
    expect(Object.keys(decayed.memoriesById)).toHaveLength(Object.keys(later.memoriesById).length)
  })

  it('loads legacy V4 without invented experiences and rejects malformed observers, ancestry and dates', () => {
    const save = JSON.parse(JSON.stringify(serializeGameWorldV4(base, '2032-10-01T00:00:00.000Z')))
    delete save.payload.humanSimulation
    const loaded = deserializeGameWorldV4(save)
    expect(loaded.humanSimulation).toEqual(EMPTY_HUMAN_SIMULATION)
    expect(initializeHumanSimulation(loaded).humanSimulation.situationsById).toEqual(base.humanSimulation.situationsById)
    const oldOpportunity = initializeHumanSimulation(updateGameWorld(loaded, { currentDate: addDays(loaded.currentDate, 100) }))
    expect(getUserHumanSituations(oldOpportunity).some(s => s.choices.some(a => a.id === 'extraPayment'))).toBe(true)
    const bad = JSON.parse(JSON.stringify(serializeGameWorldV4(base, '2032-10-01T00:00:00.000Z')))
    const knowledge = Object.values(bad.payload.humanSimulation.knowledgeById)[0] as { observerPersonId: string }
    knowledge.observerPersonId = 'imaginary-person'
    expect(() => deserializeGameWorldV4(bad)).toThrow(/HRPG/)
    const future = { ...base.humanSimulation, observedThrough: createGameDate(2040, 1, 1) }
    expect(() => updateGameWorld(base, { humanSimulation: future })).toThrow(/future/)
  })

  it('runs through the actual application day boundary and publishes atomically', () => {
    const day = advanceGameDayWithResult(base, () => 812, ['userGame', 'mediaOpportunity'])
    expect(day.status, JSON.stringify(day.failure)).toBe('COMPLETED')
    expect(day.phases.some(p => p.phaseId === 'HUMAN_SIMULATION' && p.ran)).toBe(true)
    expect(day.world.humanSimulation.observedThrough).toBe(day.world.currentDate)
  })

  it('bounds live histories, monthly admission and retained knowledge over repeated seasons', () => {
    let world = updateGameWorld(base, { humanSimulation: EMPTY_HUMAN_SIMULATION })
    for (let year = 2032; year < 2037; year++) for (let month = 1; month <= 12; month++) {
      const date = createGameDate(year, month, 1)
      if (date < base.currentDate) continue
      world = updateGameWorld(world, { currentDate: date })
      const event = financialEvent(world)
      world = ingestHumanSources(event.world, [event.source], HUMAN_RUNTIME).world
      const pending = Object.values(world.humanSimulation.situationsById).find(s => s.actor.id === world.userCoachId && s.status === 'open' && s.phase === 'origin')!
      world = decideUserHumanSituation(world, pending.id, 'reflect').world
      expect(ingestHumanSources(world, [event.source], HUMAN_RUNTIME).admitted).toBe(0)
      world = progressHumanSituations(updateGameWorld(world, { currentDate: addDays(date, 8) }), HUMAN_RUNTIME)
      expect(Object.values(world.humanSimulation.situationsById).filter(s => s.status === 'open').length).toBeLessThanOrEqual(HUMAN_LIMITS.activePerActor)
      expect(Object.keys(world.humanSimulation.situationsById).length).toBeLessThanOrEqual(12)
      expect(Object.keys(world.humanSimulation.knowledgeById).length).toBeLessThanOrEqual(6)
    }
    expect(Object.values(world.memoriesById).filter(m => m.tags.includes('hrpg')).length).toBeGreaterThan(80)
    expect(collectHumanSources(world, world)).toEqual([])
  })

  it('keeps legacy command envelopes while recording a common lifecycle exactly once', () => {
    const result = resolveHumanCompatibility(base, 'openingDebt', 'extraPayment', current => decideOpeningDebt(current, 'extraPayment'))
    expect(result).toMatchObject({ status: 'APPLIED', choice: 'extraPayment' })
    expect(result.world.humanSimulation.situationsById[find(base, 'openingDebt').id]?.resolution?.actionId).toBe('extraPayment')
    const duplicate = resolveHumanCompatibility(result.world, 'openingDebt', 'extraPayment', current => decideOpeningDebt(current, 'extraPayment'))
    expect(duplicate).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING', world: result.world })
  })

  it('adds a data-composed content rule without a new resolver or persistence flow', () => {
    const { world, source } = financialEvent()
    const runtime = { ...HUMAN_RUNTIME, rules: [{ id: 'newContentCategory', topics: ['personalFinance'], actors: 'first' as const, cadence: 'source' as const,
      actions: [{ id: 'consider', label: 'Consider the financial context', effect: 'reflect' as const }], reviewAfterDays: 3 }] }
    const ready = ingestHumanSources(world, [source], runtime).world
    const situation = Object.values(ready.humanSimulation.situationsById).find(s => s.ruleId === 'newContentCategory')!
    const result = resolveHumanAction(ready, situation.id, 'consider', user(ready), runtime)
    expect(result.status).toBe('APPLIED')
    expect(result.world.humanSimulation.situationsById[`${situation.id}:aftermath`]?.parentId).toBe(situation.id)
    expect(result.world.coachFinancesByCoachId).toBe(ready.coachFinancesByCoachId)
  })

  it('does not duplicate knowledge for hundreds of same-month facts rejected by cadence', () => {
    let world = updateGameWorld(base, { humanSimulation: EMPTY_HUMAN_SIMULATION })
    const sources: HumanSource[] = []
    for (let n = 0; n < 200; n++) {
      const movement = { id: `bounded-income:${n}`, date: world.currentDate, type: 'otherIncome' as const, amount: 1, description: 'Recorded income' }
      world = registerCoachFinanceMovement(world, world.userCoachId, movement)
      sources.push({ kind: 'coachFinance', id: JSON.stringify([world.userCoachId, movement.id]) })
    }
    const result = ingestHumanSources(world, sources, HUMAN_RUNTIME)
    expect(result.examined).toBe(200)
    expect(result.admitted).toBe(1)
    expect(Object.keys(result.world.humanSimulation.knowledgeById)).toHaveLength(1)
  })

  it('uses a real completed match and distinguishes a public result from individual awareness', () => {
    const teams = Object.values(base.teams)
    const game = createGame({ id: gameIdFromString('hrpg-played-game'), seasonId: base.currentSeasonId,
      competitionId: Object.values(base.competitions)[0]!.id, date: base.currentDate,
      homeTeamId: teams[0]!.id, awayTeamId: teams[1]!.id, status: 'scheduled', result: null })
    const scheduled = updateGameWorld(base, { games: [game] })
    const setup = createMatchEnginePort('match-next').prepare(scheduled, game, 812)
    const played = completeBackgroundMatch(scheduled, simulateBackgroundMatch(setup))
    const source: HumanSource = { kind: 'match', id: game.id }
    const fact = readHumanFact(played, source)!
    expect(fact.public).toBe(true)
    expect(fact.participants.map(p => p.id)).toEqual(played.matchStatLogsByGameId[game.id]!.playerLines.filter(p => p.stats.secondsPlayed > 0).map(p => p.playerId))
    const ingested = ingestHumanSources(played, [source], HUMAN_RUNTIME).world
    const outsider = played.coaches[teams[2]!.coachId!]!.personId
    expect(queryPublicHumanInformation(ingested, source, HUMAN_RUNTIME)).toContain(String(played.games[game.id]!.result!.homeScore))
    expect(humanKnowledge(ingested, source, outsider, HUMAN_RUNTIME)).toBeUndefined()
    const read = observePublicHumanInformation(ingested, source, outsider, HUMAN_RUNTIME)
    expect(read.status).toBe('APPLIED')
    expect(humanKnowledge(read.world, source, outsider, HUMAN_RUNTIME)?.basis).toBe('public')
    expect(queryHumanSituations(read.world, outsider, HUMAN_RUNTIME)).toEqual([])
  })

  it('keeps one human identity across Coach/Staff roles and never lets NPC AI control the protagonist alias', () => {
    const { world, source } = financialEvent()
    const profileId = world.coaches[world.userCoachId]!.staffProfileId
    const runtime = { ...HUMAN_RUNTIME, readFact(current: GameWorld, ref: HumanSource) {
      const fact = readHumanFact(current, ref)
      return fact && ref.kind === 'coachFinance' ? { ...fact, participants: [{ kind: 'staff' as const, id: profileId }] } : fact
    } }
    const admitted = ingestHumanSources(world, [source], runtime).world
    const situation = Object.values(admitted.humanSimulation.situationsById).find(s => s.actor.id === profileId)!
    expect(situation).toBeDefined()
    const progressed = progressHumanSituations(admitted, runtime)
    expect(progressed.humanSimulation.situationsById[situation.id]?.status).toBe('open')
    const result = resolveHumanAction(progressed, situation.id, 'reflect', user(world), runtime)
    expect(result.status).toBe('APPLIED')
    expect(getUserHumanContinuity(result.world).some(c => c.entries.some(e => e.stage === 'development'))).toBe(true)
    const coachActor = { kind: 'coach' as const, id: world.userCoachId }
    const rememberedAsCoach = inspectHumanContext(result.world, { ...situation, actor: coachActor, participants: [coachActor] })
    expect(rememberedAsCoach.memories.some(memory => memory.owner.id === profileId)).toBe(true)
  })
})
