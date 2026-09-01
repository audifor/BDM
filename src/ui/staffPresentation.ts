import { calculateAge } from '@/domain/player/PlayerAge'
import {
  calculateStaffRoleProficiencyByRoleId,
  staffRoleDefinition,
  staffRoleIdsInDepartment,
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
import { calculateStaffWorkload, getStaffAssignment, getStaffPerson, getTeamStaffAssignments, type GameWorld } from '@/domain/world'
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

/**
 * Grid row display order for the three original Wave-1 roles (assistant coach, scout, medical)
 * stays first for continuity with the pre-Wave-1 layout; any other canonical role sorts after, by
 * registry declaration order. This ordering is for the STAFF GRID's ROLE column/sort only — it is
 * NOT the role-evaluation candidate authority (see `getStaffRoleEvaluations`, which is
 * canonical-registry-driven and independent of this list).
 */
const GRID_ROLE_DISPLAY_ORDER: readonly StaffRoleId[] = ['assistantCoach', 'regionalScout', 'physiotherapist']
function roleOrder(role: StaffRoleId): number {
  const reachableIndex = GRID_ROLE_DISPLAY_ORDER.indexOf(role)
  return reachableIndex === -1 ? GRID_ROLE_DISPLAY_ORDER.length + STAFF_ROLE_IDS.indexOf(role) : reachableIndex
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
  readonly contractStatus: StaffContractStatus
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
        contractStatus: getStaffContractStatus(world, person.id),
      }
    })
    .sort((left, right) =>
      departmentOrder(left.department) - departmentOrder(right.department)
      || roleOrder(left.role) - roleOrder(right.role)
      || left.name.localeCompare(right.name)
      || left.staffPersonId.localeCompare(right.staffPersonId),
    )
}

/** Compact ROLE EVALUATION list target size — see `getStaffRoleEvaluations` doc comment. */
const ROLE_EVALUATION_TARGET_COUNT = 6

/**
 * Canonical-registry-driven ROLE EVALUATION candidate set for the Staff Detail panel (Issue #27
 * Wave 4C1 Fix 1). Replaces the old hardcoded 3-legacy-role (`assistantCoach`/`regionalScout`/
 * `physiotherapist`) list, which violated Staff V2's canonical `STAFF_ROLE_REGISTRY` by silently
 * capping every staff member's evaluation to those three roles regardless of their actual
 * assignment or department.
 *
 * Selection rule (deterministic, data-driven — no per-role switch/if-chain):
 * 1. The staff person's current assigned role always appears, first.
 * 2. Remaining candidates are drawn from `staffRoleIdsInDepartment(currentDepartment)` (their own
 *    department/family — the natural "could this person do a closely related role" comparison).
 * 3. If the department alone does not fill `ROLE_EVALUATION_TARGET_COUNT` entries (a small
 *    department, e.g. `recruiting`), the list is padded with additional roles from the full
 *    `STAFF_ROLE_IDS` registry declaration order (skipping roles already included) so the panel
 *    still reads as a useful compact comparison rather than a near-empty list.
 * 4. The list never exceeds `ROLE_EVALUATION_TARGET_COUNT` entries — this stays a compact
 *    "alternatives" panel, never the full ~28-role catalogue.
 * 5. Alternatives (everything after the current role) are ordered by proficiency descending, then
 *    role id ascending — deterministic and stable across repeated calls for the same world/staff.
 *
 * Proficiency is always computed via the canonical `calculateStaffRoleProficiencyByRoleId` —
 * never reimplemented here.
 */
export function getStaffRoleEvaluations(world: GameWorld, staffPersonId: StaffPersonId): readonly { readonly role: StaffRoleId; readonly proficiency: number }[] {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) throw new Error(`Staff person does not exist: ${staffPersonId}`)
  const currentRole = getStaffAssignment(world, staffPersonId)?.role

  const candidateRoles = new Set<StaffRoleId>()
  if (currentRole !== undefined) candidateRoles.add(currentRole)
  const department = currentRole === undefined ? undefined : staffRoleDefinition(currentRole).department
  if (department !== undefined) for (const roleId of staffRoleIdsInDepartment(department)) candidateRoles.add(roleId)
  if (candidateRoles.size < ROLE_EVALUATION_TARGET_COUNT) {
    for (const roleId of STAFF_ROLE_IDS) {
      if (candidateRoles.size >= ROLE_EVALUATION_TARGET_COUNT) break
      candidateRoles.add(roleId)
    }
  }

  const evaluations = [...candidateRoles].map((role) => ({ role, proficiency: calculateStaffRoleProficiencyByRoleId(person, role) }))
  const alternatives = evaluations
    .filter((entry) => entry.role !== currentRole)
    .sort((left, right) => right.proficiency - left.proficiency || left.role.localeCompare(right.role))
    .slice(0, Math.max(0, ROLE_EVALUATION_TARGET_COUNT - (currentRole === undefined ? 0 : 1)))

  const current = currentRole === undefined ? [] : evaluations.filter((entry) => entry.role === currentRole)
  return [...current, ...alternatives]
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

/**
 * Contract Status (Issue #27 Wave 4C1 Fix 2) — an explicit, pure presentation projection over
 * `StaffContract`, deliberately separate from Employment Status (`getStaffEmploymentStatusLabel`,
 * sourced from `staffEmploymentByStaffId`). Employment answers "does this team currently employ
 * this person"; Contract Status answers "what is the state of their contractual paperwork" — the
 * two can and do diverge (e.g. a legacy/partial world could carry an active employment record
 * with no matching contract, or vice versa), so this function never reads or derives from
 * employment state, only from `StaffContract` records.
 *
 * States, derived exclusively from `StaffContract`/`isStaffContractActiveOn` semantics
 * (see `StaffContract.ts` for the canonical activeness rule):
 * - `ACTIVE` — an active contract exists per `isStaffContractActiveOn`.
 * - `TERMINATED` — a contract exists whose `termination.effectiveOn` has already taken effect
 *   on/before `onDate` (an explicit early end, distinguishable from a natural expiry because
 *   `termination` is only ever set by `terminateStaffContract`).
 * - `EXPIRED` — a contract exists whose `term.expiresOn` has passed relative to `onDate` with no
 *   termination record at all (the term simply ran out; the model can reliably tell this apart
 *   from `TERMINATED` because `termination` is a distinct optional field, never inferred).
 * - `NO_CONTRACT` — no `StaffContract` record referencing this staff person exists at all.
 *
 * When multiple non-active contracts exist for the same staff person (e.g. career history with
 * several past contracts), the most recently expired/terminated one (latest `term.expiresOn`) is
 * reported, for a deterministic single-value status.
 */
export type StaffContractStatus = 'ACTIVE' | 'TERMINATED' | 'EXPIRED' | 'NO_CONTRACT'

export function getStaffContractStatus(world: GameWorld, staffId: StaffPersonId, onDate = world.currentDate): StaffContractStatus {
  const contracts = Object.values(world.staffContractsById).filter((contract) => contract.staffId === staffId)
  if (contracts.length === 0) return 'NO_CONTRACT'
  if (contracts.some((contract) => isStaffContractActiveOn(contract, onDate))) return 'ACTIVE'

  const mostRecent = [...contracts].sort((left, right) => right.term.expiresOn.localeCompare(left.term.expiresOn))[0]!
  return mostRecent.termination !== undefined && mostRecent.termination.effectiveOn <= onDate ? 'TERMINATED' : 'EXPIRED'
}

export const STAFF_CONTRACT_STATUS_LABELS: Readonly<Record<StaffContractStatus, string>> = {
  ACTIVE: 'ACTIVE',
  TERMINATED: 'TERMINATED',
  EXPIRED: 'EXPIRED',
  NO_CONTRACT: 'NO CONTRACT',
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

/**
 * Compact salary formatting (Issue #27 Wave 4C1 Fix 3). Rounding to the nearest whole M/K lost
 * meaningful precision (e.g. `$1,500,000` rendered as `$2M`). Both scales now round to at most 2
 * decimal places and trim trailing zeros/decimal point, so exact-scale values still render clean
 * (`$1M`, `$65K`) while fractional values keep their precision (`$1.5M`, `$2.25M`).
 */
export function compactStaffSalary(value: number): string {
  return value >= 1_000_000 ? `$${trimTrailingZeros(value / 1_000_000)}M` : `$${trimTrailingZeros(value / 1_000)}K`
}

function trimTrailingZeros(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

export { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS }
