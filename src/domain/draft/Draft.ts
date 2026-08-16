import type { EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'

export type DraftStatus = 'scheduled' | 'inProgress' | 'completed'
export interface DraftRules { readonly rounds: number; readonly orderMethod: 'reverseStandings'; readonly scheduledAfterDays: number }
export interface Draft { readonly id: string; readonly ecosystemId: EcosystemId; readonly sourceSeasonId: SeasonId; readonly rules: DraftRules; readonly scheduledOn: GameDate; readonly status: DraftStatus; readonly prospectPlayerIds: readonly PlayerId[] }
export interface DraftPick { readonly id: string; readonly draftId: string; readonly round: number; readonly order: number; readonly originalTeamId: TeamId; readonly ownerTeamId: TeamId; readonly selection?: { readonly playerId: PlayerId; readonly teamId: TeamId } }
export function createDraftRules(input: DraftRules): DraftRules { if (!Number.isInteger(input.rounds) || input.rounds < 1 || !Number.isInteger(input.scheduledAfterDays) || input.scheduledAfterDays < 0 || input.orderMethod !== 'reverseStandings') throw new RangeError('Draft rules are invalid'); return Object.freeze({ ...input }) }
