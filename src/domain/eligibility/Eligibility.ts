import type { GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'

export type EligibilityStatus = 'eligible' | 'ineligible' | 'exhausted'
export type EligibilityReason = 'ELIGIBILITY_EXHAUSTED' | 'ACTIVE_ELIGIBILITY_RESTRICTION' | 'NOT_IN_NCAA_PROGRAM' | 'INVALID_SEASON_CONTEXT'
export interface EligibilityRules { readonly ecosystemId: EcosystemId; readonly maximumEligibilitySeasons: number; readonly participationThreshold: number; readonly redshirtPolicy: 'automatic'; readonly temporaryIneligibilitySupport: boolean }
export interface EligibilitySeasonRecord { readonly seasonId: SeasonId; readonly gamesParticipated: number; readonly gameIds: readonly string[]; readonly eligibilityConsumed: boolean; readonly resolved: boolean }
export interface EligibilityProfile { readonly id: string; readonly playerId: PlayerId; readonly ecosystemId: EcosystemId; readonly programTeamId: TeamId; readonly seasonsUsed: number; readonly seasonRecordsBySeasonId: Readonly<Record<SeasonId, EligibilitySeasonRecord>> }
export interface EligibilityRestriction { readonly id: string; readonly playerId: PlayerId; readonly ecosystemId: EcosystemId; readonly reasonCode: string; readonly startsAt: GameDate; readonly endsAt?: GameDate; readonly sourceType?: 'academic' | 'enforcement'; readonly sourceId?: string }
export interface EligibilityResult { readonly eligible: boolean; readonly status: EligibilityStatus; readonly reasons: readonly EligibilityReason[]; readonly seasonsRemaining: number }
export const defaultEligibilityRules = (ecosystemId: EcosystemId): EligibilityRules => ({ ecosystemId, maximumEligibilitySeasons: 4, participationThreshold: 3, redshirtPolicy: 'automatic', temporaryIneligibilitySupport: true })
