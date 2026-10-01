import type { TrainingIntensity } from '@/domain/training'
import { boundedInjuryProbability, careerLoadRiskMultiplier } from './InjuryRisk'

export function trainingInjuryProbability(input: {
  readonly riskWeight: number
  readonly intensity: TrainingIntensity
  readonly durationMinutes: number
  readonly fatigue: number
  readonly recurrence: number
  readonly participationMultiplier: number
}): number {
  const intensityLoad = input.intensity === 'light' ? .75 : input.intensity === 'normal' ? 1 : 1.25
  const durationLoad = Math.min(1.5, Math.max(.5, input.durationMinutes / 60))
  const base = .0025 * Math.max(0, Math.min(1, input.participationMultiplier))
  return boundedInjuryProbability(base, [input.riskWeight, intensityLoad, durationLoad, careerLoadRiskMultiplier(input.fatigue), input.recurrence])
}
