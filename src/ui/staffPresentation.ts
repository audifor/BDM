import { calculateAge } from '@/domain/player/PlayerAge'
import {
  calculateStaffRoleProficiencyByRoleId,
  staffRoleDefinition,
  STAFF_DEPARTMENTS,
  STAFF_ROLE_IDS,
  type StaffDepartment,
  type StaffProfessionalAttributeKey,
  type StaffRoleId,
} from '@/domain/staff'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { isStaffContractActiveOn, type StaffContract } from '@/domain/staffContract'
import type { StaffAppointmentReason, StaffCareerHistoryEntry, StaffDepartureReason, StaffEmployment } from '@/domain/staffCareer'
import { staffReputationScore, type StaffReputationProfile } from '@/domain/staffReputation'
import { calculateStaffWorkload, getStaffPerson, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
import type { StaffPersonId, TeamId } from '@/domain/ids'

/**
 * Presentation labels for every canonical `StaffRoleId`. Only `assistantCoach`/`regionalScout`/
 * `physiotherapist` are reachable in Wave 1 (the only roles anything currently generates or
 * assigns) — the other entries exist so the map stays total over `StaffRoleId` without a
 * hand-maintained closed switch, per the "no switch/if-chain" extensibility rule. Wording for
 * the three reachable roles is unchanged from the pre-Wave-1 labels.
 */
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRoleId, string>> = Object.fromEntries(
  STAFF_ROLE_IDS.map((id) => [id, id === 'regionalScout' ? 'SCOUT' : id === 'physiotherapist' ? 'MEDICAL' : formatRoleLabel(id)]),
) as Readonly<Record<StaffRoleId, string>>

function formatRoleLabel(id: StaffRoleId): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}

export const STAFF_DEPARTMENT_LABELS: Readonly<Record<StaffDepartment, string>> = {
  coaching: 'COACHING',
  performance: 'PERFORMANCE',
  medical: 'MEDICAL',
  scouting: 'SCOUTING',
  basketballOperations: 'BASKETBALL OPS',
  recruiting: 'RECRUITING',
}

/** Stable display order for departments — declaration order of `STAFF_DEPARTMENTS`. */
function departmentOrder(department: StaffDepartment): number {
  return STAFF_DEPARTMENTS.indexOf(department)
}

export const STAFF_PROFESSIONAL_ATTRIBUTE_LABELS: Readonly<Record<StaffProfessionalAttributeKey, string>> = {
  coaching: 'Coaching',
  tacticalKnowledge: 'Tactical Knowledge',
  playerDevelopment: 'Player Development',
  talentEvaluation: 'Talent Evaluation',
  potentialEvaluation: 'Potential Evaluation',
  medicalKnowledge: 'Medical Knowledge',
  rehabilitation: 'Rehabilitation',
  analysis: 'Analysis',
  leadership: 'Leadership',
  communication: 'Communication',
  motivation: 'Motivation',
  discipline: 'Discipline',
  adaptability: 'Adaptability',
}

/** Wave 1 reachable-role display order (unchanged from pre-Wave-1: assistant coach, scout, medical); any other canonical role sorts after, by registry declaration order. */
const REACHABLE_ROLE_ORDER: readonly StaffRoleId[] = ['assistantCoach', 'regionalScout', 'physiotherapist']
function roleOrder(role: StaffRoleId): number {
  const reachableIndex = REACHABLE_ROLE_ORDER.indexOf(role)
  return reachableIndex === -1 ? REACHABLE_ROLE_ORDER.length + STAFF_ROLE_IDS.indexOf(role) : reachableIndex
}

export type StaffEmploymentStatusLabel = 'EMPLOYED' | 'UNEMPLOYED' | 'UNKNOWN'
export type StaffWorkloadState = 'normal' | 'pressured' | 'overloaded' | 'unassigned'

export interface StaffPresentationItem {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRoleId
  readonly department: StaffDepartment
  readonly roleProficiency: number
  readonly reputationScore: number | undefined
  readonly utilization: number
  readonly workloadState: StaffWorkloadState
  readonly employmentStatus: StaffEmploymentStatusLabel
  readonly activeContract: StaffContract | undefined
  readonly annualSalary: number | undefined
  readonly contractExpiresOn: string | undefined
}

/** Presentation projection only; professional truth and role/workload/contract calculations remain canonical. */
export function getTeamStaffPresentation(world: GameWorld, teamId: TeamId): readonly StaffPresentationItem[] {
  return getTeamStaffAssignments(world, teamId)
    .map((assignment) => {
      const person = getStaffPerson(world, assignment.staffPersonId)
      if (person === undefined) throw new Error(`Staff person does not exist: ${assignment.staffPersonId}`)
      const department = staffRoleDefinition(assignment.role).department
      const workload = calculateStaffWorkload(world, person.id)
      const activeContract = findActiveStaffContractForStaff(world, person.id)
      const reputation = world.staffReputationProfilesByStaffId[person.id]
      return {
        staffPersonId: person.id,
        name: `${person.identity.firstName} ${person.identity.lastName}`,
        role: assignment.role,
        department,
        roleProficiency: calculateStaffRoleProficiencyByRoleId(person, assignment.role),
        reputationScore: reputation === undefined ? undefined : Math.round(staffReputationScore(reputation)),
        utilization: workload.utilization,
        workloadState: classifyWorkloadState(workload),
        employmentStatus: getStaffEmploymentStatusLabel(world, person.id),
        activeContract,
        annualSalary: activeContract?.compensation.annualSalary,
        contractExpiresOn: activeContract?.term.expiresOn,
      }
    })
    .sort((left, right) =>
      departmentOrder(left.department) - departmentOrder(right.department)
      || roleOrder(left.role) - roleOrder(right.role)
      || left.name.localeCompare(right.name)
      || left.staffPersonId.localeCompare(right.staffPersonId),
    )
}

/** Evaluates the person against the three Wave-1-reachable roles, unchanged from pre-Wave-1 behavior (no UI redesign). */
export function getStaffRoleEvaluations(world: GameWorld, staffPersonId: StaffPersonId): readonly { readonly role: StaffRoleId; readonly proficiency: number }[] {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) throw new Error(`Staff person does not exist: ${staffPersonId}`)
  return REACHABLE_ROLE_ORDER.map((role) => ({ role, proficiency: calculateStaffRoleProficiencyByRoleId(person, role) }))
}

/**
 * Pure classification of the canonical `StaffWorkloadSnapshot` into a small semantic state for
 * UI, without inventing a second workload formula. `unassigned` covers a staff member with no
 * active `TeamStaffAssignment` (workload is degenerate/zero-capacity in that case per
 * `calculateStaffWorkload`); `overloaded` mirrors the canonical `overloaded` flag; `pressured` is
 * a UI-only earlier-warning band (utilization >= 0.85 but not yet overloaded) that does not
 * change any engine calculation.
 */
export function classifyWorkloadState(workload: ReturnType<typeof calculateStaffWorkload>): StaffWorkloadState {
  if (workload.capacityLimit === 0) return 'unassigned'
  if (workload.overloaded) return 'overloaded'
  if (workload.utilization >= 0.85) return 'pressured'
  return 'normal'
}

export const WORKLOAD_STATE_LABELS: Readonly<Record<StaffWorkloadState, string>> = {
  normal: 'NORMAL',
  pressured: 'PRESSURED',
  overloaded: 'OVERLOADED',
  unassigned: 'UNASSIGNED',
}

/** THE single canonical "active contract for this staff person on the world's current date" lookup — never re-derived ad hoc. */
export function findActiveStaffContractForStaff(world: GameWorld, staffId: StaffPersonId, onDate = world.currentDate): StaffContract | undefined {
  return Object.values(world.staffContractsById).find((contract) => contract.staffId === staffId && isStaffContractActiveOn(contract, onDate))
}

export function getStaffEmployment(world: GameWorld, staffId: StaffPersonId): StaffEmployment | undefined {
  return world.staffEmploymentByStaffId[staffId]
}

export function getStaffEmploymentStatusLabel(world: GameWorld, staffId: StaffPersonId): StaffEmploymentStatusLabel {
  const employment = getStaffEmployment(world, staffId)
  if (employment === undefined) return 'UNKNOWN'
  return employment.status === 'employed' ? 'EMPLOYED' : 'UNEMPLOYED'
}

export function getStaffCareerHistory(world: GameWorld, staffId: StaffPersonId): readonly StaffCareerHistoryEntry[] {
  return world.staffCareerHistoryByStaffId[staffId] ?? []
}

/** Chronological (most recent first), deterministically tie-broken career history for compact display. */
export function getRecentStaffCareerHistory(world: GameWorld, staffId: StaffPersonId, limit = 5): readonly StaffCareerHistoryEntry[] {
  return [...getStaffCareerHistory(world, staffId)]
    .sort((left, right) => right.date.localeCompare(left.date) || right.kind.localeCompare(left.kind))
    .slice(0, limit)
}

export function getStaffReputationProfile(world: GameWorld, staffId: StaffPersonId): StaffReputationProfile | undefined {
  return world.staffReputationProfilesByStaffId[staffId]
}

export function formatStaffCareerEntry(entry: StaffCareerHistoryEntry): string {
  if (entry.kind === 'appointment') return `${entry.date} · ${formatAppointmentReason(entry.reason)} · ${STAFF_ROLE_LABELS[entry.roleId]}`
  return `${entry.date} · ${formatDepartureReason(entry.reason)}`
}

const APPOINTMENT_REASON_LABELS: Readonly<Record<StaffAppointmentReason, string>> = { initialAppointment: 'Initial appointment', hired: 'Hired', promoted: 'Promoted', reassigned: 'Reassigned' }
const DEPARTURE_REASON_LABELS: Readonly<Record<StaffDepartureReason, string>> = { fired: 'Fired', resigned: 'Resigned', acceptedOtherJob: 'Left for another job', retired: 'Retired' }

function formatAppointmentReason(reason: StaffAppointmentReason): string {
  return APPOINTMENT_REASON_LABELS[reason]
}

function formatDepartureReason(reason: StaffDepartureReason): string {
  return DEPARTURE_REASON_LABELS[reason]
}

export function getStaffAge(world: GameWorld, staffId: StaffPersonId): number | undefined {
  const person = getStaffPerson(world, staffId)
  if (person?.identity.dateOfBirth === undefined) return undefined
  return calculateAge(person.identity.dateOfBirth, world.currentDate)
}

export function compactStaffSalary(value: number): string {
  return value >= 1_000_000 ? `$${Math.round(value / 1_000_000)}M` : `$${Math.round(value / 1_000)}K`
}

export { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS }
