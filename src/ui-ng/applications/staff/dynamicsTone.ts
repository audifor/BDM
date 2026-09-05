import type { StaffHumanStateDimension } from '@/domain/staffHumanState'
import type { StaffCultureFitBand } from '@/ui/staffCulturePresentation'
import type {
  StaffDynamicsInterpretedState,
  StaffDynamicsTrend,
  StaffIntensityBand,
  StaffSatisfactionBand,
} from '@/ui/staffHumanStatePresentation'
import type { StaffUnitCohesionBand } from '@/ui/staffUnitCohesionPresentation'
import type { WorkingRelationshipState } from '@/ui/staffWorkingRelationshipPresentation'

const INTENSITY_DIMENSIONS = new Set<StaffHumanStateDimension>(['frustration', 'stress'])

function toneFromScale(index: number, count: number): number {
  if (count <= 1) return 0.5
  return index / (count - 1)
}

function indexOf<T extends string>(scale: readonly T[], value: string): number {
  const index = scale.indexOf(value as T)
  return index === -1 ? Math.floor((scale.length - 1) / 2) : index
}

const INTERPRETED_STATE_SCALE = [
  'DISENGAGED',
  'STRAINED',
  'FRUSTRATED',
  'CONCERNED',
  'MIXED',
  'SETTLED',
  'CONTENT',
  'THRIVING',
] as const satisfies readonly StaffDynamicsInterpretedState[]

const SATISFACTION_SCALE = [
  'EXTREMELY_DISSATISFIED',
  'VERY_DISSATISFIED',
  'DISSATISFIED',
  'MIXED',
  'SATISFIED',
  'VERY_SATISFIED',
  'EXTREMELY_SATISFIED',
] as const satisfies readonly StaffSatisfactionBand[]

const INTENSITY_SCALE = [
  'EXTREME',
  'VERY_HIGH',
  'HIGH',
  'MODERATE',
  'MILD',
  'LOW',
  'VERY_LOW',
] as const satisfies readonly StaffIntensityBand[]

const COHESION_SCALE = [
  'VERY_WEAK',
  'WEAK',
  'ADEQUATE',
  'STRONG',
  'VERY_STRONG',
] as const satisfies readonly StaffUnitCohesionBand[]

const RELATIONSHIP_SCALE = [
  'POOR',
  'STRAINED',
  'MIXED',
  'PROFESSIONAL',
  'GOOD',
  'STRONG',
  'EXCELLENT',
] as const satisfies readonly WorkingRelationshipState[]

const TREND_SCALE = ['WORSENING', 'STABLE', 'IMPROVING'] as const satisfies readonly StaffDynamicsTrend[]

const CULTURE_FIT_SCALE = [
  'SEVERE_MISMATCH',
  'MISMATCH',
  'MIXED_FIT',
  'GOOD_FIT',
  'STRONG_FIT',
] as const satisfies readonly StaffCultureFitBand[]

const EXPECTATION_GAP_SCALE = ['STRONGLY_BELOW', 'BELOW', 'ABOVE', 'STRONGLY_ABOVE'] as const

const CONFLICT_SEVERITY_SCALE = ['CRITICAL', 'SEVERE', 'SERIOUS', 'MODERATE', 'MINOR'] as const

const CONFLICT_STAGE_SCALE = [
  'ESCALATING',
  'ACTIVE',
  'EMERGING',
  'LATENT',
  'COOLING',
  'RESOLVING',
  'RESOLVED',
] as const

const CAREER_OUTLOOK_SCALE = ['EXIT_MINDED', 'RESTLESS', 'OPEN', 'STABLE', 'COMMITTED'] as const

export function isIntensityDimension(dimension: StaffHumanStateDimension): boolean {
  return INTENSITY_DIMENSIONS.has(dimension)
}

export function toneForInterpretedState(state: StaffDynamicsInterpretedState | string): number {
  return toneFromScale(indexOf(INTERPRETED_STATE_SCALE, state), INTERPRETED_STATE_SCALE.length)
}

export function toneForSatisfactionBand(band: StaffSatisfactionBand | string): number {
  return toneFromScale(indexOf(SATISFACTION_SCALE, band), SATISFACTION_SCALE.length)
}

export function toneForIntensityBand(band: StaffIntensityBand | string): number {
  return toneFromScale(indexOf(INTENSITY_SCALE, band), INTENSITY_SCALE.length)
}

export function toneForHumanStateBand(dimension: StaffHumanStateDimension, band: string): number {
  return isIntensityDimension(dimension) ? toneForIntensityBand(band) : toneForSatisfactionBand(band)
}

export function toneForCohesionBand(band: StaffUnitCohesionBand | string): number {
  return toneFromScale(indexOf(COHESION_SCALE, band), COHESION_SCALE.length)
}

export function toneForRelationshipState(state: WorkingRelationshipState | string): number {
  return toneFromScale(indexOf(RELATIONSHIP_SCALE, state), RELATIONSHIP_SCALE.length)
}

export function toneForTrend(trend: StaffDynamicsTrend | string): number {
  return toneFromScale(indexOf(TREND_SCALE, trend), TREND_SCALE.length)
}

export function toneForCultureFit(band: StaffCultureFitBand | string): number {
  return toneFromScale(indexOf(CULTURE_FIT_SCALE, band), CULTURE_FIT_SCALE.length)
}

export function toneForExpectationGap(band: string): number {
  return toneFromScale(indexOf(EXPECTATION_GAP_SCALE, band), EXPECTATION_GAP_SCALE.length)
}

export function toneForConflictSeverity(severity: string): number {
  return toneFromScale(indexOf(CONFLICT_SEVERITY_SCALE, severity), CONFLICT_SEVERITY_SCALE.length)
}

export function toneForConflictStage(stage: string): number {
  return toneFromScale(indexOf(CONFLICT_STAGE_SCALE, stage), CONFLICT_STAGE_SCALE.length)
}

export function toneForCareerOutlook(outlook: string): number {
  return toneFromScale(indexOf(CAREER_OUTLOOK_SCALE, outlook.replace(/ /g, '_')), CAREER_OUTLOOK_SCALE.length)
}

/** Hue 0 (red) → 120 (green). */
export function dynamicsToneColor(tone: number): string {
  const clamped = Math.min(1, Math.max(0, tone))
  return `hsl(${Math.round(clamped * 120)} 72% 48%)`
}
