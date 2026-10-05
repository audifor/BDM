import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { createInjury, injuryLifecycleStatus, projectedInjuryReviewDate } from '@/domain/injury'
import { injuryIdFromString } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { createNewGame } from '@/app/game'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { progressAiMedicalLifecycle } from './AiMedicalLifecycle'
import { conductFitnessTest } from './FitnessTest'
import { setRehabilitationPlan } from './Rehabilitation'
import { reviewReturnToPlay } from './ReturnToPlayEngine'

/**
 * MX0.2 Blocker B regression. An InjuryRecord may exist dated after `currentDate` because a Game can be
 * resolved ahead of the world clock (e.g. resolving a next-season fixture while the clock is still on the
 * previous season). Rehabilitation chronology, which is stamped with `currentDate`, must never be created
 * for such a not-yet-occurred injury; the domain invariant in `createInjury` stays strict.
 */
describe('MX0.2 medical chronology', () => {
  it('refuses a rehabilitation plan for an injury that has not happened yet', { timeout: 60_000 }, () => {
    const world = createNewGame()
    const aiTeam = Object.values(world.teams).find((team) => team.coachId !== world.userCoachId)!
    const futureInjury = createInjury({
      id: injuryIdFromString('mx02-future-injury'),
      playerId: aiTeam.rosterPlayerIds[0]!,
      kind: 'ankleSprain',
      severity: 'moderate',
      injuredOn: addDays(world.currentDate, 30),
      expectedReturnDate: addDays(world.currentDate, 45),
    })
    const withInjury = updateGameWorld(world, { injuries: [futureInjury] })

    expect(setRehabilitationPlan(withInjury, { injuryId: futureInjury.id, mode: 'REST', actor: { kind: 'AI', teamId: aiTeam.id } }))
      .toEqual({ ok: false, reason: 'NOT_RECOVERING' })
    expect(() => progressAiMedicalLifecycle(withInjury)).not.toThrow()
    expect(progressAiMedicalLifecycle(withInjury).world.injuriesById[futureInjury.id]).toEqual(futureInjury)
  })

  it('runs a whole rehabilitation lifecycle, across a save/load, into the Return-to-Play review', { timeout: 60_000 }, () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({
      id: injuryIdFromString('mx02-lifecycle-injury'),
      playerId,
      kind: 'hamstringStrain',
      severity: 'moderate',
      injuredOn: world.currentDate,
      expectedReturnDate: addDays(world.currentDate, 10),
    })
    let current = updateGameWorld(world, { injuries: [injury] })

    // The day after the injury, the medical seam (AI lifecycle uses the same authority) prescribes a plan.
    current = { ...current, currentDate: addDays(current.currentDate, 1) }
    expect(progressAiMedicalLifecycle(current).world).toEqual(current)

    // A user-team injury is planned through the same seam.
    const first = setRehabilitationPlan(current, { injuryId: injury.id, mode: 'ACCELERATED_REHAB', actor: { kind: 'USER', coachId: world.userCoachId } })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    current = first.world
    const planned = current.injuriesById[injury.id]!
    expect(planned.rehabilitation?.history).toHaveLength(1)

    // Save/load must not change the recorded chronology.
    const reloaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(serializeGameWorldV1(current, '2020-01-01T00:00:00.000Z'))))
    expect(reloaded.injuriesById[injury.id]?.rehabilitation).toEqual(planned.rehabilitation)

    // Advance to the projected review date; a due review is reachable without the previous RangeError.
    const reviewDate = projectedInjuryReviewDate(reloaded.injuriesById[injury.id]!, reloaded.currentDate)
    const reviewed = { ...reloaded, currentDate: reviewDate }
    expect(injuryLifecycleStatus(reviewed.injuriesById[injury.id]!, reviewed.currentDate)).toBe('RTP_REVIEW_DUE')
    const test = conductFitnessTest(reviewed, { injuryId: injury.id, actor: { kind: 'USER', coachId: world.userCoachId } })
    if (test.ok && test.record.result === 'PASS') expect(reviewReturnToPlay(test.world, { injuryId: injury.id, decision: 'CLEAR_FOR_PLAY', actor: { kind: 'USER', coachId: world.userCoachId } }).ok).toBe(true)
    else expect(reviewReturnToPlay(reviewed, { injuryId: injury.id, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: world.userCoachId } }).ok).toBe(true)
  })
})
