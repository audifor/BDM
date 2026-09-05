import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffPresentationItem } from '@/ui/staffPresentation'

export const STAFF_WORKSPACE_TABS = ['staff', 'responsibilities', 'advisory', 'dynamics'] as const
export type StaffWorkspaceTabId = (typeof STAFF_WORKSPACE_TABS)[number]

export const STAFF_TAB_LABELS: Readonly<Record<StaffWorkspaceTabId, string>> = {
  staff: 'Staff',
  responsibilities: 'Responsibilities',
  advisory: 'Advisory',
  dynamics: 'Dynamics',
}

export const DYNAMICS_SUBVIEWS = ['people', 'units', 'conflicts', 'career'] as const
export type DynamicsSubviewId = (typeof DYNAMICS_SUBVIEWS)[number]

export const DYNAMICS_SUBVIEW_LABELS: Readonly<Record<DynamicsSubviewId, string>> = {
  people: 'People',
  units: 'Units',
  conflicts: 'Conflicts',
  career: 'Career',
}

export type DynamicsFilter =
  | 'ALL'
  | 'NEEDS_ATTENTION'
  | 'FRUSTRATED'
  | 'OVERLOADED'
  | 'UNDERUTILIZED'
  | 'LOW_INFLUENCE'
  | 'LOW_COMMITMENT'
  | 'CONTRACT_CONCERNS'
  | 'DEVELOPMENT_CONCERNS'
  | 'THRIVING'

export const DYNAMICS_FILTERS: readonly DynamicsFilter[] = [
  'ALL',
  'NEEDS_ATTENTION',
  'FRUSTRATED',
  'OVERLOADED',
  'UNDERUTILIZED',
  'LOW_INFLUENCE',
  'LOW_COMMITMENT',
  'CONTRACT_CONCERNS',
  'DEVELOPMENT_CONCERNS',
  'THRIVING',
]

export const DYNAMICS_FILTER_LABELS: Readonly<Record<DynamicsFilter, string>> = {
  ALL: 'All',
  NEEDS_ATTENTION: 'Needs attention',
  FRUSTRATED: 'Frustrated',
  OVERLOADED: 'Overloaded',
  UNDERUTILIZED: 'Underutilized',
  LOW_INFLUENCE: 'Low influence',
  LOW_COMMITMENT: 'Low commitment',
  CONTRACT_CONCERNS: 'Contract concerns',
  DEVELOPMENT_CONCERNS: 'Development concerns',
  THRIVING: 'Thriving',
}

export const DYNAMICS_STATE_LABELS = {
  THRIVING: 'Thriving',
  CONTENT: 'Content',
  SETTLED: 'Settled',
  MIXED: 'Mixed',
  CONCERNED: 'Concerned',
  FRUSTRATED: 'Frustrated',
  STRAINED: 'Strained',
  DISENGAGED: 'Disengaged',
} as const

export const DYNAMICS_TREND_LABELS = {
  IMPROVING: 'Improving',
  STABLE: 'Stable',
  WORSENING: 'Worsening',
} as const

export const WORKING_RELATIONSHIP_STATE_LABELS: Readonly<Record<string, string>> = {
  EXCELLENT: 'Excellent',
  STRONG: 'Strong',
  GOOD: 'Good',
  PROFESSIONAL: 'Professional',
  MIXED: 'Mixed',
  STRAINED: 'Strained',
  POOR: 'Poor',
}

export const TREND_ARROW: Readonly<Record<'IMPROVING' | 'STABLE' | 'WORSENING', string>> = {
  IMPROVING: '↑',
  STABLE: '→',
  WORSENING: '↓',
}

export const HUMAN_STATE_COLUMN_LABEL = {
  roleSatisfaction: 'Role',
  responsibilitySatisfaction: 'Resp',
  autonomySatisfaction: 'Aut',
  influenceSatisfaction: 'Inf',
  contractSatisfaction: 'Ctr',
  workloadSatisfaction: 'Work',
  professionalFulfillment: 'Ful',
  recognitionSatisfaction: 'Rec',
  frustration: 'Fru',
  stress: 'Str',
  organizationalCommitment: 'Com',
} as const

export const UNIT_COHESION_COLUMN_LABEL = {
  communication: 'Comms',
  coordination: 'Coord',
  roleClarity: 'Clarity',
  mutualSupport: 'Support',
  sharedPurpose: 'Purpose',
  trustClimate: 'Trust',
  leadershipAlignment: 'Lead',
  stability: 'Stability',
} as const

export const RECOMMENDATION_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  notFound: 'Recommendation no longer exists.',
  alreadyResolved: 'Recommendation already resolved.',
  notAcceptable: 'This recommendation is informational only.',
  underlyingRejected: 'Recommendation is no longer valid.',
}

export interface StaffWorkspaceModel {
  readonly teamId: TeamId
  readonly teamName: string
  readonly staffCount: number
  readonly openAdvisoryCount: number
  readonly needsAttentionCount: number
  readonly staff: readonly StaffPresentationItem[]
}

export function formatStaffPercent(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '∞'
}

export function staffTabLabel(id: StaffWorkspaceTabId, model: StaffWorkspaceModel): string {
  if (id === 'advisory' && model.openAdvisoryCount > 0) {
    return `${STAFF_TAB_LABELS[id]} · ${model.openAdvisoryCount}`
  }
  if (id === 'dynamics' && model.needsAttentionCount > 0) {
    return `${STAFF_TAB_LABELS[id]} · ${model.needsAttentionCount}`
  }
  return STAFF_TAB_LABELS[id]
}

export function isStaffSelected(staff: StaffPresentationItem, selectedId: StaffPersonId | undefined): boolean {
  return selectedId !== undefined && staff.staffPersonId === selectedId
}
