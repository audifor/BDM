import { describe, expect, it } from 'vitest'

import type { SimulationBreakpoint, SimulationBreakpointResult } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { competitionIdFromString, gameIdFromString, seasonIdFromString } from '@/domain/ids'
import { describeContinueResult, describeContinueStopReason, describeDayAdvanceResult, describeSimulateUntilResult } from './continueOutcomePresentation'

const breakpoint = (over: Partial<SimulationBreakpoint> = {}): SimulationBreakpoint => ({
  level: 'ACTION_REQUIRED', reason: 'returnToPlayReview', sourceKind: 'USER_RTP_REVIEW', sourceId: 'injury-1',
  ownership: { kind: 'USER_TEAM' }, route: 'medical', diagnostic: 'Return-to-Play review for injury injury-1 is due.',
  orderingKey: '1|2032-10-01|9999-12-31|USER_RTP_REVIEW|injury-1', ...over,
})
const breakpointBefore = (over: Partial<SimulationBreakpoint> = {}): SimulationBreakpointResult => ({ mayAdvance: false, level: 'ACTION_REQUIRED', breakpoint: breakpoint(over), candidates: [breakpoint(over)] })
const day = (value: string) => parseGameDate(value)

describe('career loop outcome presentation', () => {
  it('explains a stopped Continue that did not advance the date', () => {
    const presentation = describeContinueResult({ daysAdvanced: 0, finalDate: day('2032-10-01'), stopReason: { type: 'breakpoint', breakpoint: breakpoint() } })
    expect(presentation.tone).toBe('attention')
    expect(presentation.title).toBe('SE REQUIERE TU ATENCIÓN')
    expect(presentation.detail).toContain('No se avanzó la fecha.')
    expect(presentation.detail).toContain('Return-to-Play review for injury injury-1 is due.')
    expect(presentation.route).toBe('medical')
  })

  it('reports how far Continue advanced and why it stopped', () => {
    const presentation = describeContinueResult({ daysAdvanced: 3, finalDate: day('2032-10-04'), stopReason: { type: 'userGame', gameId: gameIdFromString('game-9'), breakpoint: breakpoint({ reason: 'userGame', sourceKind: 'USER_GAME', sourceId: 'game-9', route: 'match', diagnostic: 'User game game-9 is scheduled for today and needs an explicit match action.' }) } })
    expect(presentation.tone).toBe('attention')
    expect(presentation.title).toBe('PARTIDO PENDIENTE')
    expect(presentation.detail).toContain('Simulación detenida tras 3 días · 04 OCT 2032.')
    expect(presentation.route).toBe('match')
  })

  it('turns the loop guard into an explicit failure instead of a silent stop', () => {
    const presentation = describeContinueResult({ daysAdvanced: 0, finalDate: day('2032-10-01'), stopReason: { type: 'noProgress', diagnostic: 'NO_PROGRESS_INVARIANT: the day transition did not advance the world clock.' } })
    expect(presentation.tone).toBe('failure')
    expect(presentation.title).toBe('NO SE PUDO AVANZAR')
    expect(presentation.detail).toContain('NO_PROGRESS_INVARIANT')
  })

  it('names the media and season stops of the canonical breakpoint engine', () => {
    expect(describeContinueStopReason({ type: 'mediaOpportunity', opportunityId: 'media-1', breakpoint: breakpoint({ reason: 'mediaOpportunity', route: 'media' }) }).title).toBe('PRENSA PENDIENTE')
    expect(describeContinueStopReason({ type: 'seasonComplete', breakpoint: breakpoint({ reason: 'seasonComplete', route: 'competition' }) }).title).toBe('TEMPORADA FINALIZADA')
    expect(describeContinueStopReason({ type: 'safetyLimit' }).title).toBe('LÍMITE DE SEGURIDAD')
  })

  it('reports a simulate-until order that reached its target and one that stopped early', () => {
    expect(describeSimulateUntilResult({ daysAdvanced: 4, finalDate: day('2032-10-05'), stopReason: { type: 'arrived' } })).toMatchObject({ tone: 'progress', title: 'SIMULACIÓN COMPLETADA' })
    const early = describeSimulateUntilResult({ daysAdvanced: 1, finalDate: day('2032-10-02'), stopReason: { type: 'mediaOpportunity', opportunityId: 'media-1', breakpoint: breakpoint({ reason: 'mediaOpportunity', route: 'media' }) } })
    expect(early.tone).toBe('attention')
    expect(early.detail).toContain('Simulación detenida tras 1 día · 02 OCT 2032.')
    expect(early.route).toBe('media')
    const unsupported = describeSimulateUntilResult({ daysAdvanced: 2, finalDate: day('2032-10-03'), stopReason: { type: 'unsupportedLifecycle', diagnostic: { competitionId: competitionIdFromString('ncaa-1'), seasonId: seasonIdFromString('season-1'), capabilityMissing: 'futureSeasonGeneration', lastSupportedDate: day('2032-10-02') } } })
    expect(unsupported.title).toBe('COMPETICIÓN SIN LIFECYCLE')
  })

  it('reports a prevented or failed one-day advance, and stays quiet when the day completed', () => {
    const prevented = describeDayAdvanceResult({ status: 'BREAKPOINT_PREVENTED', diagnostics: [], breakpointBefore: breakpointBefore(), failure: undefined })
    expect(prevented).toMatchObject({ tone: 'attention', title: 'NO SE PUDO AVANZAR', route: 'medical' })
    expect(prevented?.detail).toContain('Return-to-Play review')

    const failed = describeDayAdvanceResult({ status: 'FAILED', diagnostics: [], breakpointBefore: { mayAdvance: true, level: 'BACKGROUND', candidates: [] }, failure: { kind: 'TECHNICAL_FAILURE', phaseId: 'SCHEDULE_INTEGRITY', message: 'Scheduled Game g-1 is in the past after the day transition' } })
    expect(failed).toMatchObject({ tone: 'failure', title: 'NO SE PUDO AVANZAR' })
    expect(failed?.detail).toContain('SCHEDULE_INTEGRITY: Scheduled Game g-1 is in the past after the day transition')

    expect(describeDayAdvanceResult({ status: 'COMPLETED', diagnostics: [], breakpointBefore: { mayAdvance: true, level: 'BACKGROUND', candidates: [] }, failure: undefined })).toBeUndefined()
  })
})
