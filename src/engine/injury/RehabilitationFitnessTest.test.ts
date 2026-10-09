import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury, injuryLifecycleStatus, projectedInjuryReviewDate } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { getCareerFatigueForPlayer, isPlayerAvailable, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { conductFitnessTest, evaluateFitnessTest, hasPassedRequiredFitnessTest, injuryRequiresFitnessTest } from './FitnessTest'
import { progressAiMedicalLifecycle } from './AiMedicalLifecycle'
import { chooseAiRehabilitationMode, rehabilitationSetbackRisk, setRehabilitationPlan, progressRehabilitationSetbacks } from './Rehabilitation'
import { reviewReturnToPlay } from './ReturnToPlayEngine'

function injuryAt(world: ReturnType<typeof createNewGame>, input: { id: string; playerId: string; severity?: 'minor' | 'moderate' | 'serious'; kind?: 'ankleSprain' | 'hamstringStrain' | 'kneeSprain' | 'backStrain' | 'handInjury' | 'shoulderStrain'; injuredOn?: ReturnType<typeof addDays>; expectedReturnDate?: ReturnType<typeof addDays> }) {
  return createInjury({
    id: injuryIdFromString(input.id), playerId: input.playerId as never, kind: input.kind ?? 'ankleSprain', severity: input.severity ?? 'moderate',
    injuredOn: input.injuredOn ?? addDays(world.currentDate, -15), expectedReturnDate: input.expectedReturnDate ?? addDays(world.currentDate, 15),
  })
}

describe('BS12E rehabilitation and fitness testing', () => {
  it('does not start rehabilitation before a future-dated injury', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find(item => item.coachId !== world.userCoachId)!
    const injury = injuryAt(world, { id: 'future-rehab', playerId: team.rosterPlayerIds[0]!, injuredOn: addDays(world.currentDate, 10), expectedReturnDate: addDays(world.currentDate, 15) })
    const future = updateGameWorld(world, { injuries: [injury] })
    expect(setRehabilitationPlan(future, { injuryId: injury.id, mode: 'ACCELERATED_REHAB', actor: { kind: 'AI', teamId: team.id } })).toEqual({ ok: false, reason: 'NOT_RECOVERING' })
    expect(progressAiMedicalLifecycle(future).world).toBe(future)
  })
  it('lets the user change an active rehab plan and applies small elapsed recovery projections without changing fatigue', () => {
    const world = createNewGame()
    const playerId = getUserTeam(world)!.rosterPlayerIds[0]!
    const injury = injuryAt(world, { id: 'bs12e-rehab-choice', playerId })
    const injured = updateGameWorld(world, { injuries: [injury] })
    const fatigueBefore = getCareerFatigueForPlayer(injured, playerId)
    const accelerated = setRehabilitationPlan(injured, { injuryId: injury.id, mode: 'ACCELERATED_REHAB', actor: { kind: 'USER', coachId: world.userCoachId } })

    expect(accelerated.ok).toBe(true)
    if (!accelerated.ok) return
    expect(projectedInjuryReviewDate(accelerated.world.injuriesById[injury.id]!, world.currentDate)).toBe(addDays(injury.expectedReturnDate, -1))
    expect(accelerated.world.injuriesById[injury.id]?.rehabilitation?.history).toHaveLength(1)
    const rested = setRehabilitationPlan(accelerated.world, { injuryId: injury.id, mode: 'REST', actor: { kind: 'USER', coachId: world.userCoachId } })
    expect(rested.ok).toBe(true)
    if (!rested.ok) return
    expect(projectedInjuryReviewDate(rested.world.injuriesById[injury.id]!, world.currentDate)).toBe(addDays(injury.expectedReturnDate, 1))
    expect(getCareerFatigueForPlayer(rested.world, playerId)).toBe(fatigueBefore)
  })

  it('selects AI rehab through the same plan authority and recommendation-aware deterministic policy', () => {
    const world = createNewGame()
    const aiTeam = Object.values(world.teams).find((team) => team.coachId !== world.userCoachId)!
    const injury = injuryAt(world, { id: 'bs12e-ai-rehab', playerId: aiTeam.rosterPlayerIds[0]!, severity: 'serious' })
    const result = progressAiMedicalLifecycle(updateGameWorld(world, { injuries: [injury] }))
    expect(result.world.injuriesById[injury.id]?.rehabilitation?.mode).toBe('REST')
    expect(result.world.injuriesById[injury.id]?.rehabilitation?.history).toMatchObject([{ mode: 'REST', actor: { kind: 'AI', teamId: aiTeam.id } }])
    expect(result.decisions.some((item) => item.action === 'REHABILITATION_SELECTED' && item.injuryId === injury.id)).toBe(true)
    expect(setRehabilitationPlan(result.world, { injuryId: injury.id, mode: 'ACCELERATED_REHAB', actor: { kind: 'USER', coachId: world.userCoachId } })).toMatchObject({ ok: false, reason: 'NOT_AUTHORIZED' })
    const longModerate = injuryAt(world, { id: 'bs12e-ai-long-recovery', playerId: aiTeam.rosterPlayerIds[1]!, severity: 'moderate', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: addDays(world.currentDate, 20) })
    expect(chooseAiRehabilitationMode(updateGameWorld(world, { injuries: [longModerate] }), longModerate.id)).toBe('REST')
  })

  it('keeps setback risk ordered and deterministic, records at most one setback per recovery week, and adds no injury', () => {
    expect(rehabilitationSetbackRisk('REST')).toBeLessThanOrEqual(rehabilitationSetbackRisk('STANDARD_REHAB'))
    expect(rehabilitationSetbackRisk('STANDARD_REHAB')).toBeLessThan(rehabilitationSetbackRisk('ACCELERATED_REHAB'))
    const world = createNewGame()
    const playerId = getUserTeam(world)!.rosterPlayerIds[0]!
    let chosen = injuryAt(world, { id: 'bs12e-setback-0', playerId, injuredOn: addDays(world.currentDate, -7), expectedReturnDate: addDays(world.currentDate, 15) })
    chosen = createInjury({ ...chosen, rehabilitation: { ...chosen.rehabilitation!, mode: 'ACCELERATED_REHAB' } })
    let base = updateGameWorld(world, { injuries: [chosen] })
    for (let index = 1; index < 500 && Object.values(base.injuriesById[chosen.id]!.rehabilitationSetbacks ?? []).length === 0; index++) {
      chosen = injuryAt(world, { id: `bs12e-setback-${index}`, playerId, injuredOn: addDays(world.currentDate, -7), expectedReturnDate: addDays(world.currentDate, 15) })
      chosen = createInjury({ ...chosen, rehabilitation: { ...chosen.rehabilitation!, mode: 'ACCELERATED_REHAB' } })
      base = updateGameWorld(world, { injuries: [chosen] })
      const progressed = progressRehabilitationSetbacks(base)
      if ((progressed.injuriesById[chosen.id]?.rehabilitationSetbacks?.length ?? 0) > 0) base = progressed
    }
    const injury = base.injuriesById[chosen.id]!
    expect(injury.rehabilitationSetbacks).toHaveLength(1)
    expect(projectedInjuryReviewDate(injury, world.currentDate)).toBe(addDays(injury.expectedReturnDate, 3))
    expect(progressRehabilitationSetbacks(base)).toEqual(base)
    expect(Object.values(base.injuriesById).filter((item) => item.playerId === playerId)).toHaveLength(1)
  })

  it('requires a test for serious or related moderate injuries and shares the PASS gate with RTP', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const serious = injuryAt(world, { id: 'bs12e-fitness-pass', playerId, severity: 'serious', injuredOn: addDays(world.currentDate, -30), expectedReturnDate: world.currentDate })
    const due = updateGameWorld(world, { injuries: [serious] })
    expect(injuryRequiresFitnessTest(due, serious)).toBe(true)
    expect(reviewReturnToPlay(due, { injuryId: serious.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: world.userCoachId } })).toEqual({ ok: false, reason: 'FITNESS_TEST_REQUIRED' })

    let passCandidate = serious
    let passRecord = evaluateFitnessTest(due, passCandidate, world.currentDate, { kind: 'USER', coachId: world.userCoachId })
    for (let index = 1; passRecord.result !== 'PASS' && index < 100; index++) {
      passCandidate = injuryAt(world, { id: `bs12e-fitness-pass-${index}`, playerId, severity: 'serious', injuredOn: addDays(world.currentDate, -30), expectedReturnDate: world.currentDate })
      passRecord = evaluateFitnessTest(due, passCandidate, world.currentDate, { kind: 'USER', coachId: world.userCoachId })
    }
    expect(passRecord.result).toBe('PASS')
    const passing = createInjury({ ...passCandidate, fitnessTests: [passRecord] })
    const passingWorld = updateGameWorld(world, { injuries: [passing] })
    expect(passing.fitnessTests?.[0]?.result).toBe('PASS')
    expect(hasPassedRequiredFitnessTest(passingWorld, passing)).toBe(true)
    const cleared = reviewReturnToPlay(passingWorld, { injuryId: passing.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: world.userCoachId } })
    expect(cleared.ok).toBe(true)
    if (cleared.ok) {
      expect(isPlayerAvailable(cleared.world, playerId)).toBe(true)
      expect(getCareerFatigueForPlayer(cleared.world, playerId)).toBe(getCareerFatigueForPlayer(due, playerId))
    }

    const moderate = injuryAt(world, { id: 'bs12e-moderate-no-test', playerId, severity: 'moderate', injuredOn: addDays(world.currentDate, -10), expectedReturnDate: world.currentDate })
    expect(injuryRequiresFitnessTest(world, moderate)).toBe(false)
    expect(conductFitnessTest(updateGameWorld(world, { injuries: [moderate] }), { injuryId: moderate.id, actor: { kind: 'USER', coachId: world.userCoachId } })).toEqual({ ok: false, reason: 'TEST_NOT_REQUIRED' })
    const relatedPrior = createInjury({
      id: injuryIdFromString('bs12e-related-prior'), playerId, kind: moderate.kind, severity: 'minor',
      injuredOn: addDays(world.currentDate, -35), expectedReturnDate: addDays(world.currentDate, -28),
      returnToPlay: { reviewDueOn: addDays(world.currentDate, -28), clearedOn: addDays(world.currentDate, -27), reviews: [] },
    })
    const withPrior = updateGameWorld(world, { injuries: [relatedPrior, moderate] })
    expect(injuryRequiresFitnessTest(withPrior, moderate)).toBe(true)
  })

  it('records a failed test once, schedules another review, and keeps the player unavailable without creating an injury', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    let injury = injuryAt(world, { id: 'bs12e-fitness-fail-0', playerId, severity: 'serious', injuredOn: addDays(world.currentDate, -30), expectedReturnDate: world.currentDate })
    let result = evaluateFitnessTest(world, injury, world.currentDate, { kind: 'USER', coachId: world.userCoachId })
    for (let index = 1; result.result === 'PASS' && index < 100; index++) {
      injury = injuryAt(world, { id: `bs12e-fitness-fail-${index}`, playerId, severity: 'serious', injuredOn: addDays(world.currentDate, -30), expectedReturnDate: world.currentDate })
      result = evaluateFitnessTest(world, injury, world.currentDate, { kind: 'USER', coachId: world.userCoachId })
    }
    expect(result.result).not.toBe('PASS')
    const due = updateGameWorld(world, { injuries: [injury] })
    const tested = conductFitnessTest(due, { injuryId: injury.id, actor: { kind: 'USER', coachId: world.userCoachId } })
    expect(tested.ok).toBe(true)
    if (!tested.ok) return
    expect(tested.record.result).toBe(result.result)
    expect(tested.world.injuriesById[injury.id]?.returnToPlay?.reviewDueOn).toBe(addDays(world.currentDate, 7))
    expect(injuryLifecycleStatus(tested.world.injuriesById[injury.id]!, world.currentDate)).toBe('RECOVERING')
    expect(isPlayerAvailable(tested.world, playerId)).toBe(false)
    expect(Object.values(tested.world.injuriesById)).toHaveLength(1)
    expect(conductFitnessTest(tested.world, { injuryId: injury.id, actor: { kind: 'USER', coachId: world.userCoachId } })).toMatchObject({ ok: false, reason: 'TEST_NOT_DUE' })
  })

  it('lets AI run the required fitness test through the same service before its RTP decision', () => {
    const world = createNewGame()
    const aiTeam = Object.values(world.teams).find((team) => team.coachId !== world.userCoachId)!
    const injury = injuryAt(world, { id: 'bs12e-ai-fitness', playerId: aiTeam.rosterPlayerIds[0]!, severity: 'serious', injuredOn: addDays(world.currentDate, -30), expectedReturnDate: world.currentDate })
    const result = progressAiMedicalLifecycle(updateGameWorld(world, { injuries: [injury] }))
    expect(result.world.injuriesById[injury.id]?.fitnessTests).toHaveLength(1)
    expect(['PASS', 'BORDERLINE', 'FAIL']).toContain(result.world.injuriesById[injury.id]?.fitnessTests?.[0]?.result)
    if (result.world.injuriesById[injury.id]?.fitnessTests?.[0]?.result === 'PASS') expect(injuryLifecycleStatus(result.world.injuriesById[injury.id]!, world.currentDate)).toBe('CLEARED')
    else expect(isPlayerAvailable(result.world, injury.playerId)).toBe(false)
  })
})
