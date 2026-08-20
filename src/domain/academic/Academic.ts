import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'

export type AcademicStanding = 'good' | 'warning' | 'probation' | 'ineligible'
export type AcademicRisk = 'low' | 'moderate' | 'high' | 'critical'
export type AcademicSupportLevel = 'standard' | 'tutoring' | 'intensive'
export type AcademicReason = 'ACADEMIC_PERFORMANCE_BELOW_MINIMUM' | 'ACADEMIC_PROGRESS_BELOW_MINIMUM' | 'ACADEMIC_PROBATION'
export interface AcademicRules { readonly ecosystemId: EcosystemId; readonly minimumPerformance: number; readonly minimumProgress: number; readonly termsPerSeason: number; readonly supportCapacity: number; readonly supportEffectiveness: Readonly<Record<AcademicSupportLevel, number>> }
export interface AcademicProfile { readonly id: string; readonly playerId: PlayerId; readonly ecosystemId: EcosystemId; readonly programTeamId: TeamId; readonly performance: number; readonly progress: number }
export interface AcademicTermRecord { readonly id: string; readonly playerId: PlayerId; readonly termId: string; readonly performance: number; readonly progressDelta: number; readonly standing: AcademicStanding; readonly academicallyEligible: boolean; readonly supportLevel?: AcademicSupportLevel }
export interface AcademicSupportPlan { readonly id: string; readonly playerId: PlayerId; readonly programTeamId: TeamId; readonly termId: string; readonly level: AcademicSupportLevel; readonly cost: number; readonly startsAt: GameDate }
export const defaultAcademicRules = (ecosystemId: EcosystemId): AcademicRules => ({ ecosystemId, minimumPerformance: 60, minimumProgress: 55, termsPerSeason: 2, supportCapacity: 8, supportEffectiveness: { standard: 3, tutoring: 7, intensive: 12 } })
export const academicStanding = (profile: Pick<AcademicProfile, 'performance' | 'progress'>, rules: AcademicRules): AcademicStanding => profile.performance < rules.minimumPerformance - 12 || profile.progress < rules.minimumProgress - 12 ? 'ineligible' : profile.performance < rules.minimumPerformance || profile.progress < rules.minimumProgress ? 'probation' : profile.performance < rules.minimumPerformance + 8 || profile.progress < rules.minimumProgress + 8 ? 'warning' : 'good'
export const academicRisk = (standing: AcademicStanding): AcademicRisk => ({ good: 'low', warning: 'moderate', probation: 'high', ineligible: 'critical' } as const)[standing]
