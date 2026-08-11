import { describe, expect, it } from 'vitest'

import type { LiveMatchStep } from '@/app/game'
import { createNewGame, prepareUserMatch } from '@/app/game'

import { createPresentationSegment, displayClockAtProgress, presentationDurationMs } from './MatchPresentationSegment'

describe('MatchPresentationSegment', () => {
  it('represents every game second between sporting boundaries', () => {
    const step = controlledStep(842, 821)
    const segment = createPresentationSegment(step)

    expect(segment.gameSeconds).toBe(21)
    expect(displayClockAtProgress(segment, 0)).toBe(842)
    expect(displayClockAtProgress(segment, .5)).toBe(832)
    expect(displayClockAtProgress(segment, 1)).toBe(821)
    expect(presentationDurationMs(21, 1)).toBe(21_000)
    expect(presentationDurationMs(21, 2)).toBe(10_500)
    expect(presentationDurationMs(21, 4)).toBe(5_250)
    expect(presentationDurationMs(21, 8)).toBe(2_625)
  })

  it('keeps period transitions and same-clock changes instant', () => {
    expect(createPresentationSegment(controlledStep(0, 600, 1, 2)).gameSeconds).toBe(0)
    expect(createPresentationSegment(controlledStep(500, 500)).gameSeconds).toBe(0)
  })
})

function controlledStep(startClockSeconds: number, endClockSeconds: number, startPeriod = 1, endPeriod = 1): LiveMatchStep {
  const simulation = prepareUserMatch(createNewGame())
  const base = { ...simulation, events: [{ sequence: 1, period: startPeriod, clockSecondsRemaining: startClockSeconds, type: 'periodStart' as const, homeScore: 0, awayScore: 0 }] }
  const after = { ...simulation, events: [{ sequence: 1, period: startPeriod, clockSecondsRemaining: startClockSeconds, type: 'periodStart' as const, homeScore: 0, awayScore: 0 }, { sequence: 2, period: endPeriod, clockSecondsRemaining: endClockSeconds, type: 'periodEnd' as const, homeScore: 0, awayScore: 0 }] }
  return { before: base, after, attackingTeamId: simulation.homeTeamId, endAttackingTeamId: simulation.awayTeamId }
}
