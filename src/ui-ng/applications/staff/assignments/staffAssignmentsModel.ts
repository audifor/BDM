import { RESPONSIBILITY_DOMAINS, responsibilityDefinition, type ResponsibilityDomain, type ResponsibilityKind, type ResponsibilityMode } from '@/domain/responsibility'
import { calculateStaffRoleProficiencyByRoleId, staffRoleDefinition, type StaffDepartment, type StaffProfessionalAttributeKey, type StaffRoleId } from '@/domain/staff'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import {
  calculateStaffWorkload,
  getRankedResponsibilityCandidates,
  getResponsibilitiesHeldByStaff,
  getStaffAssignment,
  getStaffPerson,
  getTeamStaffAssignments,
  type EligibleResponsibilityCandidate,
  type GameWorld,
} from '@/domain/world'
import { delegationModeForResponsibility } from '@/app/staffAssignments'
import {
  RESPONSIBILITY_DOMAIN_LABELS,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  classifyWorkloadState,
  getTeamResponsibilityPresentation,
  getTeamStaffPresentation,
  type StaffPresentationItem,
  type StaffWorkloadState,
} from '@/ui/staffPresentation'
import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'

/**
 * View model for the Staff Assignments workspace (Staff Assignments · V2 quick assignment).
 *
 * Everything here is a pure projection of canonical world state; nothing is persisted and no
 * simulation rule is invented. Where the design asks for a signal the domain does not own, the
 * projection is explicit and documented:
 *
 * - **LOAD** is the holder's canonical workload utilization (`calculateStaffWorkload`).
 * - **COVERAGE** is the holder's canonical role proficiency (0–100), shown as `—` when the
 *   Responsibility has no Staff holder; it answers "how well is this covered by its holder".
 * - **FIT** is the canonical suitability score (`staffAssignmentSuitability` in `@/domain/world`).
 * - **BACKUP** is the highest-suitability *eligible alternative* — informational only, never an
 *   assigned second holder (a `Responsibility` has at most one holder).
 * - **STATUS** is derived from canonical state only: `OVERLOAD`, `LOW FIT`, `VACANT`, `NO BACKUP`, `OK`.
 * - **DEPARTMENT COVERAGE** is the share of that domain's staff-eligible Responsibilities that
 *   are actually held by Staff.
 */

export type StaffAssignmentsTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info' | 'cyan'

/** Spec: load bar <70% green, 70–84% amber, 85%+ red. */
export const LOAD_WARNING_THRESHOLD = 0.7
export const LOAD_CRITICAL_THRESHOLD = 0.85

/** Spec: coverage 90–100 excellent, 75–89 good, 60–74 weak, below 60 critical. */
export const COVERAGE_EXCELLENT_THRESHOLD = 90
export const COVERAGE_GOOD_THRESHOLD = 75
export const COVERAGE_WEAK_THRESHOLD = 60

/** Spec: status `LOW FIT` below this coverage. */
export const LOW_FIT_THRESHOLD = 60

export function loadTone(utilization: number): StaffAssignmentsTone {
  if (!Number.isFinite(utilization)) return 'negative'
  if (utilization >= LOAD_CRITICAL_THRESHOLD) return 'negative'
  if (utilization >= LOAD_WARNING_THRESHOLD) return 'warning'
  return 'positive'
}

export function coverageTone(proficiency: number): StaffAssignmentsTone {
  if (proficiency >= COVERAGE_EXCELLENT_THRESHOLD) return 'positive'
  if (proficiency >= COVERAGE_GOOD_THRESHOLD) return 'cyan'
  if (proficiency >= COVERAGE_WEAK_THRESHOLD) return 'warning'
  return 'negative'
}

export function workloadTone(state: StaffWorkloadState): StaffAssignmentsTone {
  if (state === 'overloaded') return 'negative'
  if (state === 'pressured') return 'warning'
  if (state === 'unassigned') return 'neutral'
  return 'positive'
}

export type FitBand = 'EXCELLENT' | 'STRONG' | 'GOOD' | 'FAIR' | 'POOR'

export const FIT_BAND_THRESHOLDS: Readonly<Record<Exclude<FitBand, 'POOR'>, number>> = {
  EXCELLENT: 90,
  STRONG: 80,
  GOOD: 70,
  FAIR: 60,
}

export function fitBand(suitability: number): FitBand {
  if (suitability >= FIT_BAND_THRESHOLDS.EXCELLENT) return 'EXCELLENT'
  if (suitability >= FIT_BAND_THRESHOLDS.STRONG) return 'STRONG'
  if (suitability >= FIT_BAND_THRESHOLDS.GOOD) return 'GOOD'
  if (suitability >= FIT_BAND_THRESHOLDS.FAIR) return 'FAIR'
  return 'POOR'
}

export function fitTone(suitability: number): StaffAssignmentsTone {
  const band = fitBand(suitability)
  if (band === 'EXCELLENT' || band === 'STRONG') return 'positive'
  if (band === 'GOOD') return 'cyan'
  if (band === 'FAIR') return 'warning'
  return 'negative'
}

export interface StaffAssignmentsRating {
  readonly label: string
  readonly shortLabel: string
  readonly value: number
}

export interface StaffAssignmentHolder {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly initials: string
  readonly role: StaffRoleId
  readonly roleLabel: string
  readonly proficiency: number
  readonly utilization: number
  readonly utilizationLabel: string
  readonly workloadState: StaffWorkloadState
  readonly workloadLabel: string
  readonly workloadTone: StaffAssignmentsTone
  readonly ratings: readonly StaffAssignmentsRating[]
}

/** One selectable person in a quick-assign popover. */
export interface StaffAssignmentCandidate {
  readonly staffPersonId: StaffPersonId | null
  readonly name: string
  readonly initials: string
  readonly roleLabel: string
  readonly suitability: number
  readonly band: FitBand
  readonly tone: StaffAssignmentsTone
  readonly loadLabel: string
  readonly loadTone: StaffAssignmentsTone
  readonly projectedLabel: string
  readonly projectedTone: StaffAssignmentsTone
  readonly projectedOverloaded: boolean
  readonly attributes: readonly StaffAssignmentsRating[]
  readonly isCurrent: boolean
  /** `YOU` — the Head Coach, only offered while the Responsibility is not already user-controlled. */
  readonly isManager: boolean
}

export interface StaffAssignmentRow {
  readonly kind: ResponsibilityKind
  readonly kindLabel: string
  readonly domain: ResponsibilityDomain
  readonly domainLabel: string
  readonly mode: ResponsibilityMode
  readonly modeLabel: string
  readonly capacityCost: number
  readonly eligibleParticipant: 'staff' | 'coach'
  readonly eligibleRoleLabels: readonly string[]
  readonly holder: StaffAssignmentHolder | undefined
  readonly postureLabel: string
  readonly backup: StaffAssignmentHolder | undefined
  readonly loadLabel: string
  readonly loadRatio: number | undefined
  readonly loadTone: StaffAssignmentsTone
  readonly coverageLabel: string
  readonly coverageTone: StaffAssignmentsTone
  readonly statusLabel: StaffAssignmentStatus
  readonly statusTone: StaffAssignmentsTone
  readonly recommendations: readonly StaffAssignmentCandidate[]
  readonly managerOption: StaffAssignmentCandidate | undefined
  /** True when this Responsibility can be handed to Staff at all (staff-eligible + a delegation mode). */
  readonly assignable: boolean
  /** Delegation posture the quick assign uses: `delegated` when supported, else `advisory`. */
  readonly delegationMode: 'delegated' | 'advisory' | undefined
  /** Every delegation posture this responsibility supports, `delegated` first. */
  readonly supportedDelegationModes: readonly ('delegated' | 'advisory')[]
}

export type StaffAssignmentStatus = 'OK' | 'VACANT' | 'NO BACKUP' | 'OVERLOAD' | 'LOW FIT'

export interface StaffAssignmentGroup {
  readonly domain: ResponsibilityDomain
  readonly label: string
  readonly rows: readonly StaffAssignmentRow[]
  /** Rows in this section that AUTO could still change. */
  readonly openCount: number
}

export interface StaffOverviewRow {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly initials: string
  readonly role: StaffRoleId
  readonly roleLabel: string
  readonly department: StaffDepartment
  readonly departmentLabel: string
  readonly proficiency: number
  readonly utilization: number
  readonly utilizationLabel: string
  readonly workloadState: StaffWorkloadState
  readonly workloadTone: StaffAssignmentsTone
  readonly heldCount: number
  readonly statusLabel: string
  readonly statusTone: StaffAssignmentsTone
}

export type StaffAssignmentKpiId = 'staff' | 'assigned' | 'available' | 'overloaded' | 'vacancies'

export interface StaffAssignmentKpi {
  readonly id: StaffAssignmentKpiId
  readonly label: string
  readonly value: number
  readonly tone: StaffAssignmentsTone
  /** KPIs that filter the matrix act as toggles. */
  readonly filters: boolean
}

export interface StaffAssignmentCoverageBlock {
  readonly domain: ResponsibilityDomain
  readonly label: string
  readonly ratio: number
  readonly percentLabel: string
  readonly tone: StaffAssignmentsTone
  readonly detail: string
}

export interface StaffAssignmentsModel {
  readonly teamId: TeamId
  readonly teamName: string
  readonly kpis: readonly StaffAssignmentKpi[]
  readonly coverage: readonly StaffAssignmentCoverageBlock[]
  readonly staff: readonly StaffOverviewRow[]
  readonly groups: readonly StaffAssignmentGroup[]
  readonly rowsByKind: ReadonlyMap<ResponsibilityKind, StaffAssignmentRow>
}

export type MatrixFilter = 'none' | 'vacant' | 'overloaded' | 'assigned'

export function matrixFilterForKpi(id: StaffAssignmentKpiId): MatrixFilter | undefined {
  if (id === 'vacancies') return 'vacant'
  if (id === 'overloaded') return 'overloaded'
  if (id === 'assigned') return 'assigned'
  return undefined
}

export function matchesMatrixFilter(row: StaffAssignmentRow, filter: MatrixFilter): boolean {
  if (filter === 'none') return true
  if (filter === 'vacant') return row.assignable && row.holder === undefined
  if (filter === 'assigned') return row.holder !== undefined
  return row.holder?.workloadState === 'overloaded'
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('')
}

/** The attributes a role weights most — real role weights, never a hand-kept list. */
function ratingsFor(person: { readonly professional: { readonly attributes: Readonly<Record<StaffProfessionalAttributeKey, number>> } }, role: StaffRoleId, limit: number): readonly StaffAssignmentsRating[] {
  const weights = staffRoleDefinition(role).attributeWeights
  return (Object.keys(weights) as StaffProfessionalAttributeKey[])
    .sort((left, right) => (weights[right] ?? 0) - (weights[left] ?? 0) || left.localeCompare(right))
    .slice(0, limit)
    .map((key) => ({
      label: STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key],
      shortLabel: STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key].split(' ')[0]!,
      value: person.professional.attributes[key],
    }))
}

function toHolder(world: GameWorld, staffPersonId: StaffPersonId): StaffAssignmentHolder | undefined {
  const person = getStaffPerson(world, staffPersonId)
  const assignment = getStaffAssignment(world, staffPersonId)
  if (person === undefined || assignment === undefined) return undefined
  const workload = calculateStaffWorkload(world, staffPersonId)
  const workloadState = classifyWorkloadState(workload)
  const name = `${person.identity.firstName} ${person.identity.lastName}`
  return {
    staffPersonId,
    name,
    initials: initialsOf(name),
    role: assignment.role,
    roleLabel: STAFF_ROLE_LABELS[assignment.role],
    proficiency: calculateStaffRoleProficiencyByRoleId(person, assignment.role),
    utilization: workload.utilization,
    utilizationLabel: formatStaffPercent(workload.utilization),
    workloadState,
    workloadLabel: WORKLOAD_STATE_LABELS[workloadState],
    workloadTone: workloadTone(workloadState),
    ratings: ratingsFor(person, assignment.role, 4),
  }
}

function toCandidate(world: GameWorld, candidate: EligibleResponsibilityCandidate, currentHolderStaffId: StaffPersonId | undefined): StaffAssignmentCandidate {
  const person = getStaffPerson(world, candidate.staffPersonId)
  return {
    staffPersonId: candidate.staffPersonId,
    name: candidate.name,
    initials: initialsOf(candidate.name),
    roleLabel: STAFF_ROLE_LABELS[candidate.role],
    suitability: candidate.suitability,
    band: fitBand(candidate.suitability),
    tone: fitTone(candidate.suitability),
    loadLabel: formatStaffPercent(candidate.currentUtilization),
    loadTone: loadTone(candidate.currentUtilization),
    projectedLabel: formatStaffPercent(candidate.projectedUtilization),
    projectedTone: loadTone(candidate.projectedUtilization),
    projectedOverloaded: candidate.projectedOverloaded,
    attributes: person === undefined ? [] : ratingsFor(person, candidate.role, 2),
    isCurrent: candidate.staffPersonId === currentHolderStaffId,
    isManager: false,
  }
}

/**
 * The Head Coach as an assignment option (`YOU`). Fit is the Head Coach's canonical role
 * proficiency in their own role — the only canonical quality signal that exists for the manager,
 * deliberately not a fabricated per-responsibility score.
 */
function managerOption(world: GameWorld, teamId: TeamId, currentMode: ResponsibilityMode): StaffAssignmentCandidate | undefined {
  const headCoach = getTeamStaffAssignments(world, teamId).find((assignment) => assignment.role === 'headCoach')
  if (headCoach === undefined) return undefined
  const person = getStaffPerson(world, headCoach.staffPersonId)
  if (person === undefined) return undefined
  const suitability = calculateStaffRoleProficiencyByRoleId(person, headCoach.role)
  return {
    staffPersonId: null,
    name: 'YOU',
    initials: 'YOU',
    roleLabel: STAFF_ROLE_LABELS[headCoach.role],
    suitability,
    band: fitBand(suitability),
    tone: fitTone(suitability),
    loadLabel: formatStaffPercent(calculateStaffWorkload(world, headCoach.staffPersonId).utilization),
    loadTone: 'neutral',
    projectedLabel: '—',
    projectedTone: 'neutral',
    projectedOverloaded: false,
    attributes: [],
    isCurrent: currentMode === 'userControlled',
    isManager: true,
  }
}

interface AssignmentStatusResult {
  readonly label: StaffAssignmentStatus
  readonly tone: StaffAssignmentsTone
}

/** Status column: derived only from canonical state. */
function rowStatus(holder: StaffAssignmentHolder | undefined, assignable: boolean, hasBackup: boolean): AssignmentStatusResult {
  if (holder !== undefined) {
    if (holder.workloadState === 'overloaded') return { label: 'OVERLOAD', tone: 'negative' }
    if (holder.proficiency < LOW_FIT_THRESHOLD) return { label: 'LOW FIT', tone: 'warning' }
    if (!hasBackup) return { label: 'NO BACKUP', tone: 'info' }
    return { label: 'OK', tone: 'positive' }
  }
  if (!assignable) return { label: 'OK', tone: 'neutral' }
  return { label: 'VACANT', tone: 'warning' }
}

function staffRow(item: StaffPresentationItem, heldCount: number): StaffOverviewRow {
  const name = item.name
  const statusLabel = item.workloadState === 'overloaded' ? 'OVERLOADED' : item.workloadState === 'pressured' ? 'PRESSURED' : heldCount > 0 ? 'ASSIGNED' : 'AVAILABLE'
  const statusTone: StaffAssignmentsTone =
    item.workloadState === 'overloaded' ? 'negative' : item.workloadState === 'pressured' ? 'warning' : heldCount > 0 ? 'positive' : 'info'
  return {
    staffPersonId: item.staffPersonId,
    name,
    initials: initialsOf(name),
    role: item.role,
    roleLabel: STAFF_ROLE_LABELS[item.role],
    department: item.department,
    departmentLabel: STAFF_DEPARTMENT_LABELS[item.department],
    proficiency: item.roleProficiency,
    utilization: item.utilization,
    utilizationLabel: formatStaffPercent(item.utilization),
    workloadState: item.workloadState,
    workloadTone: workloadTone(item.workloadState),
    heldCount,
    statusLabel,
    statusTone,
  }
}

export function buildStaffAssignmentsModel(world: GameWorld, teamId: TeamId): StaffAssignmentsModel {
  const team = world.teams[teamId]
  const staffItems = getTeamStaffPresentation(world, teamId)
  const staffRows: StaffOverviewRow[] = staffItems.map((item) => staffRow(item, getResponsibilitiesHeldByStaff(world, item.staffPersonId).length))

  const rows: StaffAssignmentRow[] = getTeamResponsibilityPresentation(world, teamId).map((row) => {
    const definition = responsibilityDefinition(row.kind)
    const delegationMode = delegationModeForResponsibility(row.kind)
    const assignable = definition.eligibleParticipant === 'staff' && delegationMode !== undefined
    const supportedDelegationModes = (['delegated', 'advisory'] as const).filter((mode) => definition.supportedModes.includes(mode))
    const holder = row.holderStaffId === undefined ? undefined : toHolder(world, row.holderStaffId)

    const ranked = delegationMode === undefined ? [] : getRankedResponsibilityCandidates(world, teamId, row.kind, delegationMode)
    const recommendations = ranked
      .filter((candidate) => candidate.staffPersonId !== row.holderStaffId)
      .slice(0, RECOMMENDED_CANDIDATE_LIMIT)
      .map((candidate) => toCandidate(world, candidate, row.holderStaffId))
    const backupCandidate = ranked.find((candidate) => candidate.staffPersonId !== row.holderStaffId)
    const backup = backupCandidate === undefined ? undefined : toHolder(world, backupCandidate.staffPersonId)
    const status = rowStatus(holder, assignable, backup !== undefined)

    return {
      kind: row.kind,
      kindLabel: RESPONSIBILITY_KIND_LABELS[row.kind],
      domain: row.domain,
      domainLabel: RESPONSIBILITY_DOMAIN_LABELS[row.domain],
      mode: row.mode,
      modeLabel: RESPONSIBILITY_MODE_LABELS[row.mode],
      capacityCost: row.capacityCost,
      eligibleParticipant: row.eligibleParticipant,
      eligibleRoleLabels: definition.eligibleRoleIds.map((roleId) => STAFF_ROLE_LABELS[roleId]),
      holder,
      postureLabel: row.holderLabel,
      backup,
      loadLabel: holder === undefined ? '—' : holder.utilizationLabel,
      loadRatio: holder === undefined ? undefined : holder.utilization,
      loadTone: holder === undefined ? 'neutral' : loadTone(holder.utilization),
      coverageLabel: holder === undefined ? '—' : `${holder.proficiency}%`,
      coverageTone: holder === undefined ? 'neutral' : coverageTone(holder.proficiency),
      statusLabel: status.label,
      statusTone: status.tone,
      recommendations,
      managerOption: assignable ? managerOption(world, teamId, row.mode) : undefined,
      assignable,
      delegationMode,
      supportedDelegationModes,
    }
  })

  const rowsByKind = new Map<ResponsibilityKind, StaffAssignmentRow>(rows.map((row) => [row.kind, row]))

  const groups: StaffAssignmentGroup[] = RESPONSIBILITY_DOMAINS.map((domain) => {
    const domainRows = rows.filter((row) => row.domain === domain)
    return {
      domain,
      label: RESPONSIBILITY_DOMAIN_LABELS[domain],
      rows: domainRows,
      openCount: domainRows.filter((row) => row.assignable && (row.holder === undefined || row.holder.workloadState === 'overloaded')).length,
    }
  }).filter((group) => group.rows.length > 0)

  const vacancyCount = rows.filter((row) => row.assignable && row.holder === undefined).length
  const assignedStaffCount = staffRows.filter((row) => row.heldCount > 0).length
  const overloadedStaffCount = staffRows.filter((row) => row.workloadState === 'overloaded').length

  return {
    teamId,
    teamName: team?.name ?? 'Unassigned',
    kpis: [
      { id: 'staff', label: 'STAFF', value: staffRows.length, tone: 'cyan', filters: false },
      { id: 'assigned', label: 'ASSIGNED', value: assignedStaffCount, tone: 'positive', filters: true },
      { id: 'available', label: 'AVAILABLE', value: staffRows.length - assignedStaffCount, tone: 'info', filters: false },
      { id: 'overloaded', label: 'OVERLOADED', value: overloadedStaffCount, tone: 'warning', filters: true },
      { id: 'vacancies', label: 'VACANCIES', value: vacancyCount, tone: 'negative', filters: true },
    ],
    coverage: RESPONSIBILITY_DOMAINS.map((domain) => {
      const domainRows = rows.filter((row) => row.domain === domain && row.eligibleParticipant === 'staff')
      const covered = domainRows.filter((row) => row.holder !== undefined).length
      const ratio = domainRows.length === 0 ? 1 : covered / domainRows.length
      return {
        domain,
        label: RESPONSIBILITY_DOMAIN_LABELS[domain],
        ratio,
        percentLabel: `${Math.round(ratio * 100)}%`,
        tone: (ratio >= 0.85 ? 'positive' : ratio >= 0.5 ? 'warning' : 'negative') as StaffAssignmentsTone,
        detail: `${covered} of ${domainRows.length} responsibilities delegated to staff`,
      }
    }).filter((block) => block.detail.split(' of ')[1] !== '0'),
    staff: staffRows,
    groups,
    rowsByKind,
  }
}

/** The quick-assign popover prioritizes a short list; "View all staff" opens the full selector. */
export const RECOMMENDED_CANDIDATE_LIMIT = 5

/** Full candidate list for a row, ordered best fit first — used by the expanded selector. */
export function fullCandidateList(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, currentHolderStaffId: StaffPersonId | undefined): readonly StaffAssignmentCandidate[] {
  const mode = delegationModeForResponsibility(kind)
  if (mode === undefined) return []
  return getRankedResponsibilityCandidates(world, teamId, kind, mode).map((candidate) => toCandidate(world, candidate, currentHolderStaffId))
}
