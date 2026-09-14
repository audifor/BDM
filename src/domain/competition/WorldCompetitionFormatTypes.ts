export const WORLD_COMPETITION_FORMAT_SCHEMA_VERSION = '1.0' as const

export type WorldCompetitionFormatStatus = 'COMPLETE' | 'PARTIAL' | 'RECONCILE' | 'BLOCKED'
export type WorldCompetitionSourceType = 'OFFICIAL' | 'PRIMARY' | 'SECONDARY'
export type WorldCompetitionEntrySelectionMethod = 'DIRECT' | 'QUALIFICATION' | 'RANK_BASED' | 'WILDCARD' | 'LICENSE' | 'HOST' | 'COMMITTEE_SELECTION'
export type WorldCompetitionSeedingSchemeType = 'RANK_BASED' | 'DRAW' | 'POTS' | 'GEOGRAPHIC' | 'COMMITTEE' | 'FIXED'
export type WorldCompetitionStructureNodeType = 'STAGE' | 'GROUP' | 'ROUND' | 'SERIES' | 'BRACKET' | 'SUBDIVISION'
export type WorldCompetitionStructureRole = 'REGULAR_SEASON' | 'GROUP_STAGE' | 'CONFERENCE_STAGE' | 'SPLIT_STAGE' | 'PLAY_IN' | 'PLAYOFF' | 'PLAYOUT' | 'PROMOTION_STAGE' | 'RELEGATION_STAGE' | 'QUALIFIER' | 'FINAL_FOUR' | 'FINAL_EIGHT' | 'FINAL' | 'PLACEMENT'
export type WorldCompetitionPairingType = 'ROUND_ROBIN' | 'FIXED_SCHEDULE' | 'FIXED_BRACKET' | 'SEEDED_BRACKET' | 'CROSS_GROUP' | 'DRAW' | 'RESEED'
export type WorldCompetitionOpponentScopeType = 'ALL_STAGE' | 'SAME_GROUP' | 'SAME_SUBDIVISION' | 'CROSS_SUBDIVISION' | 'SELECTIVE' | 'SCHEDULE_MATRIX'
export type WorldCompetitionContestFormatType = 'SINGLE_GAME' | 'SERIES' | 'AGGREGATE'
export type WorldCompetitionHostingRuleType = 'NEUTRAL' | 'HIGHER_SEED' | 'BALANCED' | 'SERIES_PATTERN' | 'ASSIGNED_HOST' | 'DRAWN_HOST'
export type WorldCompetitionCarryoverRuleType = 'NONE' | 'FULL' | 'SELECTIVE' | 'TRANSFORMED'
export type WorldCompetitionSelectionType = 'RANK_RANGE' | 'TOP_N' | 'BOTTOM_N' | 'WINNER' | 'LOSER' | 'BEST_ACROSS_GROUPS' | 'WILDCARD' | 'AT_LARGE' | 'BYE'
export type WorldCompetitionConsequenceSelector = 'RANK_RANGE' | 'TOP_N' | 'BOTTOM_N' | 'WINNER' | 'LOSER'
export type WorldCompetitionConsequenceType = 'PROMOTION' | 'RELEGATION' | 'EXTERNAL_QUALIFICATION' | 'ELIMINATION'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>
export type JsonObject = Readonly<{ [key: string]: JsonValue }>

export interface WorldCompetitionSource { readonly url: string; readonly type: WorldCompetitionSourceType; readonly scope?: string; readonly notes?: string }
export interface WorldCompetitionEntrySelection { readonly method: WorldCompetitionEntrySelectionMethod; readonly payload: JsonObject }
export interface WorldCompetitionSeeding { readonly schemeType: WorldCompetitionSeedingSchemeType; readonly basis: readonly JsonObject[] }
export interface WorldCompetitionPairing { readonly type: WorldCompetitionPairingType; readonly meetingsPerPair?: number; readonly payload: JsonObject }
export interface WorldCompetitionOpponentScope { readonly type: WorldCompetitionOpponentScopeType; readonly payload: JsonObject }
export interface WorldCompetitionTieResolution { readonly trigger?: string; readonly method?: string; readonly location?: string }
export interface WorldCompetitionContest { readonly formatType: WorldCompetitionContestFormatType; readonly requiresWinner?: boolean; readonly bestOf?: number; readonly winsRequired?: number; readonly legCount?: number; readonly aggregateMetric?: string; readonly tieResolution?: WorldCompetitionTieResolution }
export interface WorldCompetitionHosting { readonly ruleType: WorldCompetitionHostingRuleType; readonly pattern?: string; readonly priorityBasis?: string; readonly payload: JsonObject }
export interface WorldCompetitionCarryover { readonly ruleType: WorldCompetitionCarryoverRuleType; readonly sourceNode?: string; readonly payload: JsonObject }

export interface WorldCompetitionFormatNode {
  readonly key: string
  readonly nodeType: WorldCompetitionStructureNodeType
  readonly role: WorldCompetitionStructureRole
  readonly specializedType?: string
  readonly name?: string
  readonly parent?: string
  readonly teamCount?: number
  readonly pairing?: WorldCompetitionPairing
  readonly opponentScope?: WorldCompetitionOpponentScope
  readonly contest?: WorldCompetitionContest
  readonly hosting?: WorldCompetitionHosting
  readonly carryover?: WorldCompetitionCarryover
}

export interface WorldCompetitionProgressionEdge { readonly from: string; readonly to: string; readonly selector: WorldCompetitionSelectionType; readonly rankFrom?: number; readonly rankTo?: number; readonly count?: number; readonly payload: JsonObject }
export interface WorldCompetitionFormatVariant { readonly key: string; readonly name?: string; readonly scope?: string; readonly isRealVariant: boolean; readonly entrySelection?: WorldCompetitionEntrySelection; readonly seeding?: WorldCompetitionSeeding; readonly nodes: readonly WorldCompetitionFormatNode[]; readonly edges: readonly WorldCompetitionProgressionEdge[] }
export interface WorldCompetitionConsequence { readonly variantKey: string; readonly sourceNode: string; readonly selector: WorldCompetitionConsequenceSelector; readonly type: WorldCompetitionConsequenceType; readonly rankFrom?: number; readonly rankTo?: number; readonly count?: number; readonly targetCompetitionId?: string; readonly targetCompetitionSeasonId?: string; readonly payload: JsonObject }

export interface WorldCompetitionFormatDocument {
  readonly schemaVersion: typeof WORLD_COMPETITION_FORMAT_SCHEMA_VERSION
  readonly competitionId: string
  readonly competitionSeasonId: string
  readonly seasonLabel: string
  readonly status: Exclude<WorldCompetitionFormatStatus, 'BLOCKED'>
  readonly notes?: string
  readonly variants: readonly WorldCompetitionFormatVariant[]
  readonly consequences: readonly WorldCompetitionConsequence[]
  readonly sources: readonly WorldCompetitionSource[]
}
