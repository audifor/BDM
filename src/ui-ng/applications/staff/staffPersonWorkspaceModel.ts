import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffDepartment, StaffProfessionalAttributeKey, StaffRoleId } from '@/domain/staff'
import type { StaffWorkloadState } from '@/ui/staffPresentation'

export const STAFF_PERSON_VIEWS = [
  'overview',
  'attributes',
  'responsibilities',
  'contract',
  'dynamics',
  'history',
] as const

export type StaffPersonViewId = (typeof STAFF_PERSON_VIEWS)[number]

export const STAFF_PERSON_VIEW_LABELS: Readonly<Record<StaffPersonViewId, string>> = {
  overview: 'Overview',
  attributes: 'Attributes',
  responsibilities: 'Responsibilities',
  contract: 'Contract',
  dynamics: 'Dynamics',
  history: 'History',
}

export const STAFF_ATTRIBUTE_GROUPS = [
  { id: 'coaching', label: 'Coaching', keys: ['coaching', 'tacticalKnowledge', 'playerDevelopment'] },
  { id: 'evaluation', label: 'Evaluation', keys: ['talentEvaluation', 'potentialEvaluation', 'analysis'] },
  { id: 'medical', label: 'Medical', keys: ['medicalKnowledge', 'rehabilitation'] },
  { id: 'leadership', label: 'Leadership', keys: ['leadership', 'communication', 'motivation', 'discipline', 'adaptability'] },
] as const

export type StaffAttributeGroupId = (typeof STAFF_ATTRIBUTE_GROUPS)[number]['id']

export function parseStaffPersonView(value: string | null): StaffPersonViewId {
  if (value !== null && STAFF_PERSON_VIEWS.includes(value as StaffPersonViewId)) {
    return value as StaffPersonViewId
  }
  return 'overview'
}

export interface StaffPersonMetric {
  readonly label: string
  readonly value: string
}

export interface StaffPersonAttributeRow {
  readonly id: StaffProfessionalAttributeKey
  readonly label: string
  readonly value: number
  readonly groupId: StaffAttributeGroupId
}

export interface StaffPersonAttributeGroup {
  readonly id: StaffAttributeGroupId
  readonly label: string
  readonly profileValue: number
  readonly rows: readonly StaffPersonAttributeRow[]
}

export interface StaffPersonRoleEvaluation {
  readonly role: StaffRoleId
  readonly label: string
  readonly proficiency: number
  readonly current: boolean
}

export interface StaffPersonResponsibilityRow {
  readonly id: string
  readonly kindLabel: string
  readonly domainLabel: string
  readonly modeLabel: string
  readonly capacityCost: number
}

export interface StaffPersonHistoryRow {
  readonly id: string
  readonly label: string
}

export interface StaffPersonIdentityModel {
  readonly staffPersonId: StaffPersonId
  readonly firstName: string
  readonly lastName: string
  readonly teamName: string | null
  readonly teamId: TeamId | null
  readonly teamShort: string
  readonly teamColors: {
    readonly primary: string
    readonly secondary: string
    readonly muted: string
  }
  readonly roleLabel: string
  readonly departmentLabel: string
  readonly department: StaffDepartment | null
  readonly seniorityLabel: string
  readonly age: number | null
  readonly dateOfBirth: string | null
  readonly nationality: string | null
  readonly nationalityCode: string | null
}

export interface StaffPersonStatusModel {
  readonly employmentLabel: string
  readonly workloadState: StaffWorkloadState
  readonly workloadLabel: string
  readonly utilizationLabel: string
  readonly utilization: number
  readonly proficiency: number | null
  readonly reputationScore: number | null
}

export interface StaffPersonContractModel {
  readonly employmentLabel: string
  readonly contractStatusLabel: string
  readonly salaryLabel: string | null
  readonly termLabel: string | null
  readonly expiresOn: string | null
  readonly terminationLabel: string | null
}

export interface StaffPersonReputationRow {
  readonly dimension: string
  readonly value: number
}

export interface StaffPersonDynamicsModel {
  readonly stateLabel: string | null
  readonly stateTone: number | null
  readonly trendLabel: string | null
  readonly trendTone: number | null
  readonly outlook: string | null
  readonly outlookTone: number | null
  readonly intent: string | null
  readonly reasons: readonly string[]
  readonly positives: readonly string[]
  readonly concerns: readonly string[]
  readonly cultureFitLabel: string | null
  readonly cultureFitTone: number | null
  readonly cultureNote: string | null
  readonly relationships: readonly {
    readonly personLabel: string
    readonly stateLabel: string
    readonly stateTone: number
    readonly trend: string
    readonly trendTone: number
  }[]
}

export interface StaffPersonWorkspaceModel {
  readonly identity: StaffPersonIdentityModel
  readonly status: StaffPersonStatusModel
  readonly evaluations: readonly StaffPersonRoleEvaluation[]
  readonly attributes: readonly StaffPersonAttributeRow[]
  readonly attributeGroups: readonly StaffPersonAttributeGroup[]
  readonly responsibilities: readonly StaffPersonResponsibilityRow[]
  readonly contract: StaffPersonContractModel
  readonly reputation: readonly StaffPersonReputationRow[]
  readonly history: readonly StaffPersonHistoryRow[]
  readonly dynamics: StaffPersonDynamicsModel
}
