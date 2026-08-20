import type { GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'

export type ViolationCategory = 'recruiting' | 'nil' | 'academic' | 'impermissibleSupport' | 'boosterInterference'
export type EnforcementSeverity = 'minor' | 'major'
export type ViolationStatus = 'reported' | 'investigating' | 'resolved'
export type InvestigationStatus = 'open' | 'active' | 'resolved' | 'closed'
export type FindingLevel = 'none' | 'minor' | 'major'
export type SanctionKind = 'playerIneligibility' | 'recruitingCapacityReduction' | 'nilActivityRestriction' | 'collectiveResourceRestriction'
export interface EnforcementRules { readonly ecosystemId: EcosystemId; readonly enabled: boolean; readonly investigationDurationDays: number; readonly minorFindingThreshold: number; readonly majorFindingThreshold: number; readonly sanctionDurationDays: number; readonly repeatOffenderBonus: number; readonly recruitingCapacityReduction: number }
export interface Violation { readonly id: string; readonly ecosystemId: EcosystemId; readonly programTeamId: TeamId; readonly category: ViolationCategory; readonly severity: EnforcementSeverity; readonly date: GameDate; readonly status: ViolationStatus; readonly source: string; readonly playerId?: PlayerId; readonly boosterId?: string; readonly collectiveId?: string }
export interface Investigation { readonly id: string; readonly ecosystemId: EcosystemId; readonly programTeamId: TeamId; readonly violationIds: readonly string[]; readonly startedAt: GameDate; readonly expectedResolutionAt: GameDate; readonly status: InvestigationStatus }
export interface EnforcementFinding { readonly id: string; readonly investigationId: string; readonly programTeamId: TeamId; readonly issuedAt: GameDate; readonly level: FindingLevel; readonly score: number }
export interface Sanction { readonly id: string; readonly findingId: string; readonly ecosystemId: EcosystemId; readonly programTeamId: TeamId; readonly kind: SanctionKind; readonly startsAt: GameDate; readonly endsAt: GameDate; readonly status: 'active' | 'expired'; readonly playerId?: PlayerId; readonly collectiveId?: string; readonly amount?: number }
export interface ProgramComplianceState { readonly programTeamId: TeamId; readonly ecosystemId: EcosystemId; readonly resolvedFindingCount: number; readonly activeSanctionIds: readonly string[] }
export const defaultEnforcementRules = (ecosystemId: EcosystemId): EnforcementRules => ({ ecosystemId, enabled: true, investigationDurationDays: 7, minorFindingThreshold: 20, majorFindingThreshold: 60, sanctionDurationDays: 14, repeatOffenderBonus: 10, recruitingCapacityReduction: 2 })
