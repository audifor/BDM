import { describe, expect, it } from 'vitest'

import { createDefaultTacticalPlan } from '@/engine/match'
import { getUserTeam } from '@/engine/calendar'
import { createLiveUserMatch, createNewGame, prepareUserMatch } from './index'

describe('LiveMatchController', () => {
  it('starts without future sporting events and reaches the batch result through the same steps', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    expect(controller.snapshot().events).toHaveLength(1)
    while (!controller.isComplete) controller.advanceOneStep()
    expect(controller.snapshot()).toEqual(prepareUserMatch(world))
  })

  it('returns presentation snapshots around exactly one live sporting step', () => {
    const controller = createLiveUserMatch(createNewGame())
    const step = controller.advanceOneStepWithSnapshots()

    expect(step.before.events).toHaveLength(1)
    expect(step.after.events.length).toBeGreaterThan(step.before.events.length)
    expect(step.after.events.at(-1)!.clockSecondsRemaining).toBeLessThan(step.before.events.at(-1)!.clockSecondsRemaining)
  })

  it('simulates only the remainder of the current quarter', () => {
    const controller = createLiveUserMatch(createNewGame())
    controller.advanceOneStep()
    const after = controller.skipToEndOfPeriod()

    expect(after.events).toContainEqual(expect.objectContaining({ type: 'periodEnd', period: 1, clockSecondsRemaining: 0 }))
    expect(after.events.at(-1)).toMatchObject({ type: 'periodStart', period: 2, clockSecondsRemaining: 600 })
    expect(after.events.some((event) => event.period > 2)).toBe(false)
    expect(controller.isComplete).toBe(false)
  })

  it('keeps live coaching disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const plan = { ...createDefaultTacticalPlan(), pace: 2 as const }

    expect(controller.applyTactics(userTeam.id, plan)).toEqual(before)
    expect(controller.snapshot()).toEqual(before)
  })

  it('keeps manual substitutions disabled for now', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const before = controller.snapshot()
    const userTeam = getUserTeam(world)!
    const playerOutId = userTeam.rosterPlayerIds[0]!
    const playerInId = userTeam.rosterPlayerIds[1]!

    expect(controller.applyManualSubstitutions(userTeam.id, [{ playerOutId, playerInId }])).toEqual(before)
    expect(controller.replacementCandidates(userTeam.id, playerOutId)).toEqual([])
    expect(controller.snapshot()).toEqual(before)
  })
})
