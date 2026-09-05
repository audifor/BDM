import { describe, expect, it } from 'vitest'

import {
  dynamicsToneColor,
  toneForCareerOutlook,
  toneForConflictSeverity,
  toneForHumanStateBand,
  toneForIntensityBand,
  toneForInterpretedState,
  toneForSatisfactionBand,
} from '@/ui-ng/applications/staff/dynamicsTone'

describe('dynamicsTone', () => {
  it('maps interpreted states from red (disengaged) to green (thriving)', () => {
    expect(toneForInterpretedState('DISENGAGED')).toBe(0)
    expect(toneForInterpretedState('THRIVING')).toBe(1)
    expect(toneForInterpretedState('MIXED')).toBeGreaterThan(toneForInterpretedState('CONCERNED'))
    expect(toneForInterpretedState('CONTENT')).toBeGreaterThan(toneForInterpretedState('SETTLED'))
  })

  it('treats satisfaction as higher-is-better and intensity as higher-is-worse', () => {
    expect(toneForSatisfactionBand('EXTREMELY_DISSATISFIED')).toBe(0)
    expect(toneForSatisfactionBand('EXTREMELY_SATISFIED')).toBe(1)
    expect(toneForIntensityBand('EXTREME')).toBe(0)
    expect(toneForIntensityBand('VERY_LOW')).toBe(1)
    expect(toneForHumanStateBand('stress', 'EXTREME')).toBeLessThan(toneForHumanStateBand('roleSatisfaction', 'SATISFIED'))
    expect(toneForHumanStateBand('roleSatisfaction', 'VERY_SATISFIED')).toBeGreaterThan(
      toneForHumanStateBand('frustration', 'HIGH'),
    )
  })

  it('maps career outlook from exit-minded to committed', () => {
    expect(toneForCareerOutlook('EXIT MINDED')).toBe(0)
    expect(toneForCareerOutlook('COMMITTED')).toBe(1)
    expect(toneForCareerOutlook('STABLE')).toBeGreaterThan(toneForCareerOutlook('OPEN'))
  })

  it('treats critical conflict severity as the worst tone', () => {
    expect(toneForConflictSeverity('CRITICAL')).toBe(0)
    expect(toneForConflictSeverity('MINOR')).toBe(1)
  })

  it('interpolates hue from red to green', () => {
    expect(dynamicsToneColor(0)).toBe('hsl(0 72% 48%)')
    expect(dynamicsToneColor(1)).toBe('hsl(120 72% 48%)')
    expect(dynamicsToneColor(0.5)).toBe('hsl(60 72% 48%)')
  })
})
