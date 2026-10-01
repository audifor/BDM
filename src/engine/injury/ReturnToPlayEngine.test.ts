import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createInjury, injuryLifecycleStatus } from '@/domain/injury'
import { injuryIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { getCareerFatigueForPlayer, isPlayerAvailable, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { evaluateSimulationBreakpoints } from '@/app/game/SimulationBreakpoints'
import { advanceDayWithTrace } from '@/engine/calendar'
import { createResponsibility, responsibilityIdForTeam } from '@/domain/responsibility'
import { progressMedicalAdvisories } from './MedicalAdvisory'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { progressAiMedicalLifecycle } from './AiMedicalLifecycle'
import { reviewReturnToPlay } from './ReturnToPlayEngine'

function dueInjury(world: ReturnType<typeof createNewGame>, playerId: string, id: string) {
  return createInjury({
    id: injuryIdFromString(id),
    playerId: playerId as never,
    kind: 'ankleSprain',
    severity: 'moderate',
    injuredOn: addDays(world.currentDate, -10),
    expectedReturnDate: world.currentDate,
  })
}

describe('ReturnToPlayEngine', () => {
  it('creates new injuries in recovery and keeps them unavailable through review due', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({
      id: injuryIdFromString('rtp-recovery'), playerId, kind: 'kneeSprain', severity: 'minor',
      injuredOn: world.currentDate, expectedReturnDate: addDays(world.currentDate, 3),
    })
    const injured = updateGameWorld(world, { injuries: [injury] })

    expect(injury.returnToPlay?.reviewDueOn).toBe(injury.expectedReturnDate)
    expect(injuryLifecycleStatus(injury, world.currentDate)).toBe('RECOVERING')
    expect(isPlayerAvailable(injured, playerId, addDays(world.currentDate, 2))).toBe(false)
    expect(isPlayerAvailable(injured, playerId, injury.expectedReturnDate)).toBe(false)
    expect(injuryLifecycleStatus(injury, injury.expectedReturnDate)).toBe('RTP_REVIEW_DUE')
  })

  it('requires a user-team action at RTP review and CLEAR records evidence without changing fatigue', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = dueInjury(world, playerId, 'rtp-user-clear')
    const due = updateGameWorld(world, { injuries: [injury] })
    const breakpoint = evaluateSimulationBreakpoints(due).candidates.find((item) => item.reason === 'returnToPlayReview')
    const fatigueBefore = getCareerFatigueForPlayer(due, playerId)

    expect(breakpoint).toMatchObject({ level: 'ACTION_REQUIRED', route: 'medical', sourceId: injury.id })
    expect(isPlayerAvailable(due, playerId)).toBe(false)
    const result = reviewReturnToPlay(due, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: due.userCoachId } })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(isPlayerAvailable(result.world, playerId)).toBe(true)
    expect(result.world.injuriesById[injury.id]?.returnToPlay).toMatchObject({ clearedOn: due.currentDate, reviews: [{ decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: due.userCoachId } }] })
    expect(getCareerFatigueForPlayer(result.world, playerId)).toBe(fatigueBefore)
    expect(result.world.injuriesById[injury.id]).toBeDefined()
    expect(reviewReturnToPlay(result.world, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: result.world.userCoachId } })).toEqual({ ok: false, reason: 'ALREADY_CLEARED' })
  })

  it('CONTINUE RECOVERY records the review, keeps the player unavailable, and schedules a next-day review', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = dueInjury(world, playerId, 'rtp-defer')
    const due = updateGameWorld(world, { injuries: [injury] })
    const result = reviewReturnToPlay(due, { injuryId: injury.id, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: due.userCoachId } })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const updated = result.world.injuriesById[injury.id]!
    expect(updated.expectedReturnDate).toBe(injury.expectedReturnDate)
    expect(updated.returnToPlay?.reviewDueOn).toBe(addDays(due.currentDate, 1))
    expect(updated.returnToPlay?.reviews).toHaveLength(1)
    expect(isPlayerAvailable(result.world, playerId)).toBe(false)
    expect(evaluateSimulationBreakpoints(result.world).candidates.some((item) => item.reason === 'returnToPlayReview')).toBe(false)
  })

  it('prevents duplicate decisions and rejects a user action against an AI club', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const aiTeam = Object.values(world.teams).find((team) => team.id !== userTeam.id)!
    const injury = dueInjury(world, aiTeam.rosterPlayerIds[0]!, 'rtp-ai-auth')
    const due = updateGameWorld(world, { injuries: [injury] })

    expect(reviewReturnToPlay(due, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: due.userCoachId } })).toEqual({ ok: false, reason: 'NOT_AUTHORIZED' })
  })

  it('AI clears its due injury through the shared decision service without a user breakpoint', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const aiTeam = Object.values(world.teams).find((team) => team.id !== userTeam.id)!
    const injury = dueInjury(world, aiTeam.rosterPlayerIds[0]!, 'rtp-ai-clear')
    const due = updateGameWorld(world, { injuries: [injury] })
    const result = progressAiMedicalLifecycle(due)

    expect(result.decisions).toContainEqual({ teamId: aiTeam.id, injuryId: injury.id, action: 'CLEARED_FOR_PLAY', sourceId: injury.id })
    expect(injuryLifecycleStatus(result.world.injuriesById[injury.id]!, result.world.currentDate)).toBe('CLEARED')
    expect(isPlayerAvailable(result.world, injury.playerId)).toBe(true)
    expect(evaluateSimulationBreakpoints(result.world).candidates.some((item) => item.reason === 'returnToPlayReview')).toBe(false)
  })

  it('Calendar creates the user review breakpoint after date advance and resolves AI reviews after advisory processing', () => {
    const base = createNewGame()
    const userTeam = getUserTeam(base)!
    const aiTeam = Object.values(base.teams).find((team) => team.id !== userTeam.id)!
    const userInjury = createInjury({
      id: injuryIdFromString('rtp-calendar-user'), playerId: userTeam.rosterPlayerIds[0]!, kind: 'ankleSprain', severity: 'minor',
      injuredOn: base.currentDate, expectedReturnDate: addDays(base.currentDate, 1),
    })
    const aiInjury = createInjury({
      id: injuryIdFromString('rtp-calendar-ai'), playerId: aiTeam.rosterPlayerIds[0]!, kind: 'backStrain', severity: 'moderate',
      injuredOn: addDays(base.currentDate, -10), expectedReturnDate: addDays(base.currentDate, 1),
    })
    const lifecycle = advanceDayWithTrace(updateGameWorld(base, { injuries: [userInjury, aiInjury] }))
    const medicalIndex = lifecycle.phases.findIndex((phase) => phase.phaseId === 'MEDICAL_AND_ROSTER_ADVISORIES')
    const aiIndex = lifecycle.phases.findIndex((phase) => phase.phaseId === 'AI_MEDICAL_DECISIONS')

    expect(lifecycle.world.currentDate).toBe(addDays(base.currentDate, 1))
    expect(aiIndex).toBeGreaterThan(medicalIndex)
    expect(injuryLifecycleStatus(lifecycle.world.injuriesById[userInjury.id]!, lifecycle.world.currentDate)).toBe('RTP_REVIEW_DUE')
    expect(injuryLifecycleStatus(lifecycle.world.injuriesById[aiInjury.id]!, lifecycle.world.currentDate)).toBe('CLEARED')
    expect(evaluateSimulationBreakpoints(lifecycle.world).candidates.some((item) => item.sourceId === userInjury.id && item.reason === 'returnToPlayReview')).toBe(true)
  })

  it('AI accepts pending medical Staff advice through the canonical recommendation acceptance seam', () => {
    const base = createNewGame()
    const userTeam = getUserTeam(base)!
    const team = Object.values(base.teams).find((item) => item.id !== userTeam.id)!
    const staffId = staffPersonIdFromString(`rtp-medical-staff:${team.id}`)
    const staff = {
      id: staffId,
      identity: { firstName: 'Medical', lastName: 'Advisor' },
      professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> },
    }
    const injury = createInjury({
      id: injuryIdFromString('rtp-ai-advice'), playerId: team.rosterPlayerIds[0]!, kind: 'kneeSprain', severity: 'serious',
      injuredOn: base.currentDate, expectedReturnDate: addDays(base.currentDate, 30),
    })
    const withStaff = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), staff],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`rtp-medical-assignment:${team.id}`), staffPersonId: staffId, teamId: team.id, role: 'teamDoctor', assignedOn: base.currentDate }],
    })
    const responsibility = createResponsibility({
      id: responsibilityIdForTeam(team.id, 'returnToPlayRecommendation'), teamId: team.id,
      kind: 'returnToPlayRecommendation', mode: 'advisory', holderStaffId: staffId, assignedOn: base.currentDate,
    })
    const withInjury = updateGameWorld(withStaff, { injuries: [injury], responsibilities: [responsibility] })
    const advised = progressMedicalAdvisories(withInjury)
    const pending = Object.values(advised.delegationOutcomesById).find((outcome) => outcome.kind === 'returnToPlayRecommendation' && outcome.payload.injuryId === injury.id)!
    const result = progressAiMedicalLifecycle(advised)

    expect(result.world.delegationOutcomesById[pending.id]).toMatchObject({ applied: true })
    expect(result.world.delegationOutcomesById[pending.id]?.userDisposition).toBeUndefined()
    expect(result.decisions).toContainEqual({ teamId: team.id, injuryId: injury.id, action: 'RECOMMENDATION_ACCEPTED', sourceId: pending.id })
    expect(result.world.injuriesById[injury.id]?.returnToPlay?.clearedOn).toBeUndefined()
  })
})
