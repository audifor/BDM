import { calculateAge } from '@/domain/player/PlayerAge'
import { compareGameDates } from '@/domain/date'
import {
  calculateStaffRoleProficiencyByRoleId,
  staffRoleDefinition,
  staffRoleIdsInDepartment,
  ASSIGNABLE_STAFF_ROLE_IDS,
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
import { calculateStaffWorkload, getStaffAssignment, getStaffPerson, getTeamStaffAssignments, getTeamResponsibilities, getResponsibilitiesHeldByStaff, type GameWorld } from '@/domain/world'
import {
  RESPONSIBILITY_DOMAINS,
  RESPONSIBILITY_KINDS,
  responsibilityDefinition,
  validateResponsibilityAssignment,
  type Responsibility,
  type ResponsibilityDomain,
  type ResponsibilityKind,
  type ResponsibilityMode,
} from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffCareerOutlook } from '@/domain/staffCareerAutonomy'

export interface StaffCareerOutlookPresentation {
  readonly outlook: string
  readonly intent: string
  readonly reasons: readonly string[]
}

/** UI receives only qualitative, already-derived career state; never pressure or intensity numbers. */
export function presentStaffCareerOutlook(world: GameWorld, staffId: StaffPersonId): StaffCareerOutlookPresentation | undefined {
  const context = Object.values(world.staffHumanContextsById).find((item) => item.staffId === staffId && item.endedOn === undefined)
  if (context === undefined) return undefined
  const state = world.staffCareerAutonomyByContextId[context.id]
  if (state === undefined) return undefined
  return { outlook: careerOutlookLabel(state.outlook), intent: state.primaryIntent === 'NONE' ? 'No immediate career concerns' : state.primaryIntent.replace(/_/g, ' '), reasons: state.outlook === 'COMMITTED' ? ['Strongly attached to the organization'] : state.outlook === 'STABLE' ? ['Current professional situation is broadly settled'] : ['Career expectations are not fully being met'] }
}

function careerOutlookLabel(outlook: StaffCareerOutlook): string { return outlook.replace(/_/g, ' ') }

export interface StaffCareerRequestPresentationItem {
  readonly id: string
  readonly staffName: string
  readonly role: string
  readonly request: string
  readonly detail: string
  readonly createdOn: string
}

export function getOpenStaffCareerRequestsPresentation(world: GameWorld, teamId: TeamId): readonly StaffCareerRequestPresentationItem[] {
  return Object.values(world.staffCareerRequestsById)
    .filter((request) => request.teamId === teamId && request.status === 'OPEN')
    .sort((a, b) => a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id))
    .map((request) => {
      const person = world.staffPeopleById[request.staffId]!
      const role = world.staffEmploymentByStaffId[request.staffId]?.roleId
      const target = request.targetRoleId === undefined ? request.targetResponsibilityKind === undefined ? '' : RESPONSIBILITY_KIND_LABELS[request.targetResponsibilityKind] : STAFF_ROLE_LABELS[request.targetRoleId]
      return { id: request.id, staffName: `${person.identity.firstName} ${person.identity.lastName}`, role: role === undefined ? '—' : STAFF_ROLE_LABELS[role], request: request.kind.replace(/_/g, ' '), detail: target === '' ? 'Professional expectations remain unmet.' : `Requested: ${target}`, createdOn: request.createdOn }
    })
}

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
 * 6. `headCoach` never appears as an alternative: every department/padding candidate source is
 *    filtered through the canonical `ASSIGNABLE_STAFF_ROLE_IDS` (Issue #27 Wave 4C1 Fix 1) — the
 *    single authority for "roles a `StaffPerson`/`TeamStaffAssignment` can actually hold". `headCoach`
 *    exists in the shared role catalogue (it shares `department: 'coaching'` with `assistantCoach`
 *    and friends) purely so other shared code can reason about "who coaches this team" uniformly; it
 *    is never a real `StaffPerson` role and must never be suggested as one, even as department-mate
 *    padding for a coaching-department staff member.
 *
 * Proficiency is always computed via the canonical `calculateStaffRoleProficiencyByRoleId` —
 * never reimplemented here.
 */
const ASSIGNABLE_STAFF_ROLE_ID_SET: ReadonlySet<StaffRoleId> = new Set(ASSIGNABLE_STAFF_ROLE_IDS)

export function getStaffRoleEvaluations(world: GameWorld, staffPersonId: StaffPersonId): readonly { readonly role: StaffRoleId; readonly proficiency: number }[] {
  const person = getStaffPerson(world, staffPersonId)
  if (person === undefined) throw new Error(`Staff person does not exist: ${staffPersonId}`)
  const currentRole = getStaffAssignment(world, staffPersonId)?.role

  const candidateRoles = new Set<StaffRoleId>()
  if (currentRole !== undefined) candidateRoles.add(currentRole)
  const department = currentRole === undefined ? undefined : staffRoleDefinition(currentRole).department
  if (department !== undefined) {
    for (const roleId of staffRoleIdsInDepartment(department)) if (ASSIGNABLE_STAFF_ROLE_ID_SET.has(roleId)) candidateRoles.add(roleId)
  }
  if (candidateRoles.size < ROLE_EVALUATION_TARGET_COUNT) {
    for (const roleId of STAFF_ROLE_IDS) {
      if (candidateRoles.size >= ROLE_EVALUATION_TARGET_COUNT) break
      if (ASSIGNABLE_STAFF_ROLE_ID_SET.has(roleId)) candidateRoles.add(roleId)
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
 * - `UPCOMING` — no active contract, but at least one contract exists that has not started yet
 *   (`term.startsOn > onDate`, via `compareGameDates`). `isStaffContractActiveOn` alone cannot
 *   distinguish "not yet started" from "already ended" (both simply return `false`), so this status
 *   must be derived explicitly here rather than falling through to `EXPIRED` (Issue #27 Wave 4C1
 *   Fix 2 — a future contract was previously misreported as `EXPIRED`).
 * - `TERMINATED` — no active or upcoming contract; the most relevant past contract's
 *   `termination.effectiveOn` has already taken effect on/before `onDate` (an explicit early end,
 *   distinguishable from a natural expiry because `termination` is only ever set by
 *   `terminateStaffContract`).
 * - `EXPIRED` — no active or upcoming contract; the most relevant past contract's `term.expiresOn`
 *   has passed relative to `onDate` with no termination record at all (the term simply ran out; the
 *   model can reliably tell this apart from `TERMINATED` because `termination` is a distinct
 *   optional field, never inferred).
 * - `NO_CONTRACT` — no `StaffContract` record referencing this staff person exists at all.
 *
 * Selection is fully deterministic and never depends on `Object.values` iteration order:
 * - Priority is ACTIVE, then UPCOMING, then past (TERMINATED/EXPIRED).
 * - Among multiple UPCOMING candidates, the soonest-to-start wins (`term.startsOn` ascending via
 *   `compareGameDates`), tie-broken by `id` ascending.
 * - Among multiple past candidates, the most recently expired one wins (`term.expiresOn`
 *   descending via `compareGameDates`), tie-broken by `id` ascending.
 */
export type StaffContractStatus = 'ACTIVE' | 'UPCOMING' | 'TERMINATED' | 'EXPIRED' | 'NO_CONTRACT'

export function getStaffContractStatus(world: GameWorld, staffId: StaffPersonId, onDate = world.currentDate): StaffContractStatus {
  const contracts = Object.values(world.staffContractsById).filter((contract) => contract.staffId === staffId)
  if (contracts.length === 0) return 'NO_CONTRACT'
  if (contracts.some((contract) => isStaffContractActiveOn(contract, onDate))) return 'ACTIVE'

  const upcoming = contracts.filter((contract) => compareGameDates(contract.term.startsOn, onDate) > 0)
  if (upcoming.length > 0) return 'UPCOMING'

  const [mostRecent] = [...contracts].sort(
    (left, right) => compareGameDates(right.term.expiresOn, left.term.expiresOn) || left.id.localeCompare(right.id),
  )
  return mostRecent!.termination !== undefined && compareGameDates(mostRecent!.termination.effectiveOn, onDate) <= 0 ? 'TERMINATED' : 'EXPIRED'
}

export const STAFF_CONTRACT_STATUS_LABELS: Readonly<Record<StaffContractStatus, string>> = {
  ACTIVE: 'ACTIVE',
  UPCOMING: 'UPCOMING',
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

// ---------------------------------------------------------------------------
// Wave 4C2 — Responsibilities & Delegation UI presentation
// ---------------------------------------------------------------------------

/** camelCase -> "Camel Case" — the sole label helper for Responsibility kinds. No second registry. */
export function formatCamelCaseLabel(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.replace(/^./, (letter) => letter.toUpperCase())
}

export const RESPONSIBILITY_DOMAIN_LABELS: Readonly<Record<ResponsibilityDomain, string>> = Object.fromEntries(
  RESPONSIBILITY_DOMAINS.map((domain) => [domain, domain.toUpperCase()]),
) as Readonly<Record<ResponsibilityDomain, string>>

export const RESPONSIBILITY_KIND_LABELS: Readonly<Record<ResponsibilityKind, string>> = Object.fromEntries(
  RESPONSIBILITY_KINDS.map((kind) => [kind, formatCamelCaseLabel(kind)]),
) as Readonly<Record<ResponsibilityKind, string>>

export const RESPONSIBILITY_MODE_LABELS: Readonly<Record<ResponsibilityMode, string>> = {
  userControlled: 'USER CONTROLLED',
  delegated: 'DELEGATED',
  advisory: 'ADVISORY',
  organizational: 'ORGANIZATIONAL',
}

/** Deterministic canonical ordering: RESPONSIBILITY_DOMAINS order, then RESPONSIBILITY_KINDS order. Never Object.values()/insertion order. */
function responsibilityDomainOrder(domain: ResponsibilityDomain): number {
  return RESPONSIBILITY_DOMAINS.indexOf(domain)
}
function responsibilityKindOrder(kind: ResponsibilityKind): number {
  return RESPONSIBILITY_KINDS.indexOf(kind)
}

export type StaffResponsibilityHolderLabel = 'YOU' | 'ORGANIZATION' | 'HEAD COACH' | string

export interface StaffResponsibilityPresentationItem {
  readonly id: string
  readonly kind: ResponsibilityKind
  readonly domain: ResponsibilityDomain
  readonly mode: ResponsibilityMode
  readonly capacityCost: number
  readonly eligibleParticipant: 'staff' | 'coach'
  readonly supportedModes: readonly ResponsibilityMode[]
  readonly holderStaffId: StaffPersonId | undefined
  readonly holderName: string | undefined
  readonly holderRole: StaffRoleId | undefined
  readonly holderProficiency: number | undefined
  readonly holderUtilization: number | undefined
  readonly holderWorkloadState: StaffWorkloadState | undefined
  readonly holderLabel: StaffResponsibilityHolderLabel
}

/**
 * Every canonical `RESPONSIBILITY_KIND` row for `teamId`, deterministically ordered by
 * `RESPONSIBILITY_DOMAINS` then `RESPONSIBILITY_KINDS` declaration order. Rows for kinds with no
 * persisted `Responsibility` yet (a legacy/never-enriched world) are still produced at the
 * registry's `defaultMode`, so the grid is never gated on `responsibilitiesById` completeness —
 * only `RESPONSIBILITY_REGISTRY` is the source of the row set.
 */
export function getTeamResponsibilityPresentation(world: GameWorld, teamId: TeamId): readonly StaffResponsibilityPresentationItem[] {
  const existingByKind = new Map<ResponsibilityKind, Responsibility>(getTeamResponsibilities(world, teamId).map((item) => [item.kind, item]))

  return [...RESPONSIBILITY_KINDS]
    .sort((left, right) => {
      const definitionLeft = responsibilityDefinition(left)
      const definitionRight = responsibilityDefinition(right)
      return responsibilityDomainOrder(definitionLeft.domain) - responsibilityDomainOrder(definitionRight.domain)
        || responsibilityKindOrder(left) - responsibilityKindOrder(right)
    })
    .map((kind) => {
      const definition = responsibilityDefinition(kind)
      const existing = existingByKind.get(kind)
      const mode = existing?.mode ?? definition.defaultMode
      const holderStaffId = existing?.holderStaffId
      const holderPerson = holderStaffId === undefined ? undefined : getStaffPerson(world, holderStaffId)
      const holderAssignment = holderStaffId === undefined ? undefined : getStaffAssignment(world, holderStaffId)
      const holderWorkload = holderStaffId === undefined ? undefined : calculateStaffWorkload(world, holderStaffId)

      return {
        id: existing?.id ?? `responsibility:${teamId}:${kind}`,
        kind,
        domain: definition.domain,
        mode,
        capacityCost: definition.capacityCost,
        eligibleParticipant: definition.eligibleParticipant,
        supportedModes: definition.supportedModes,
        holderStaffId,
        holderName: holderPerson === undefined ? undefined : `${holderPerson.identity.firstName} ${holderPerson.identity.lastName}`,
        holderRole: holderAssignment?.role,
        holderProficiency: holderPerson === undefined || holderAssignment === undefined ? undefined : calculateStaffRoleProficiencyByRoleId(holderPerson, holderAssignment.role),
        holderUtilization: holderWorkload?.utilization,
        holderWorkloadState: holderWorkload === undefined ? undefined : classifyWorkloadState(holderWorkload),
        holderLabel: responsibilityHolderLabel(definition.eligibleParticipant, mode, holderPerson === undefined ? undefined : `${holderPerson.identity.firstName} ${holderPerson.identity.lastName}`),
      }
    })
}

function responsibilityHolderLabel(eligibleParticipant: 'staff' | 'coach', mode: ResponsibilityMode, holderName: string | undefined): StaffResponsibilityHolderLabel {
  if (eligibleParticipant === 'coach') return 'HEAD COACH'
  if (mode === 'userControlled') return 'YOU'
  if (mode === 'organizational') return 'ORGANIZATION'
  return holderName ?? 'VACANT'
}

export interface StaffResponsibilityCandidate {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly role: StaffRoleId
  readonly proficiency: number
  readonly currentUtilization: number
  readonly projectedUtilization: number
  readonly projectedWorkloadState: StaffWorkloadState
}

/**
 * Eligible `delegated`/`advisory` candidates for `kind` on `teamId`, evaluated against the given
 * target `mode` (never hardcoded/inferred — many kinds support `advisory` but not `delegated`):
 * only Staff from this Team, currently employed, with a real `TeamStaffAssignment`, whose role is
 * eligible per `validateResponsibilityAssignment` for `mode` — never `marketRole`, free agents,
 * another Team's Staff, or `headCoach`. Ordered by current-role proficiency descending, then
 * StaffPersonId ascending.
 */
export function getEligibleResponsibilityCandidates(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, mode: 'delegated' | 'advisory'): readonly StaffResponsibilityCandidate[] {
  const definition = responsibilityDefinition(kind)
  if (definition.eligibleParticipant !== 'staff') return []

  return getTeamStaffAssignments(world, teamId)
    .filter((assignment) => world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed')
    .map((assignment) => {
      const person = getStaffPerson(world, assignment.staffPersonId)
      if (person === undefined) return undefined
      const validation = validateResponsibilityAssignment(kind, mode, assignment.role, person)
      if (!validation.ok) return undefined
      const currentWorkload = calculateStaffWorkload(world, person.id)
      const projectedWorkload = projectStaffWorkloadForResponsibility(world, teamId, kind, person.id, mode)
      return {
        staffPersonId: person.id,
        name: `${person.identity.firstName} ${person.identity.lastName}`,
        role: assignment.role,
        proficiency: calculateStaffRoleProficiencyByRoleId(person, assignment.role),
        currentUtilization: currentWorkload.utilization,
        projectedUtilization: projectedWorkload.utilization,
        projectedWorkloadState: classifyWorkloadState(projectedWorkload),
      }
    })
    .filter((candidate): candidate is StaffResponsibilityCandidate => candidate !== undefined)
    .sort((left, right) => right.proficiency - left.proficiency || left.staffPersonId.localeCompare(right.staffPersonId))
}

/**
 * Projected workload for `staffId` if `kind` were (re)assigned to them on `teamId` in `mode`,
 * computed by building a transient, non-persisted `Responsibility` collection and calling the
 * canonical `calculateStaffWorkload` again — never a second workload formula. `mode` is passed
 * through explicitly (never hardcoded to `delegated`) so an advisory-only `kind` is projected
 * with a valid `advisory` Responsibility rather than fabricating an invalid `delegated` one.
 * Correctly handles: the Staff member already holding the Responsibility (no double count),
 * moving it from another holder, and simply changing mode while keeping the same holder.
 */
export function projectStaffWorkloadForResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, staffId: StaffPersonId, mode: 'delegated' | 'advisory'): ReturnType<typeof calculateStaffWorkload> {
  const existing = getTeamResponsibilities(world, teamId).find((item) => item.kind === kind)
  const projectedResponsibilitiesById = { ...world.responsibilitiesById }
  const id = existing?.id ?? `responsibility:${teamId}:${kind}`
  projectedResponsibilitiesById[id as keyof typeof projectedResponsibilitiesById] = {
    ...(existing ?? { id, teamId, kind }),
    mode,
    holderStaffId: staffId,
  } as never
  const projectedWorld: GameWorld = { ...world, responsibilitiesById: projectedResponsibilitiesById }
  return calculateStaffWorkload(projectedWorld, staffId)
}

/** Responsibilities currently held by `staffId`, for the compact "RESPONSIBILITIES HELD" Staff detail section. Deterministic domain/kind order. */
export function getResponsibilitiesHeldPresentation(world: GameWorld, staffId: StaffPersonId): readonly { readonly id: string; readonly kind: ResponsibilityKind; readonly domain: ResponsibilityDomain; readonly mode: ResponsibilityMode; readonly capacityCost: number }[] {
  return getResponsibilitiesHeldByStaff(world, staffId)
    .map((responsibility) => {
      const definition = responsibilityDefinition(responsibility.kind)
      return { id: responsibility.id, kind: responsibility.kind, domain: definition.domain, mode: responsibility.mode, capacityCost: definition.capacityCost }
    })
    .sort((left, right) => responsibilityDomainOrder(left.domain) - responsibilityDomainOrder(right.domain) || responsibilityKindOrder(left.kind) - responsibilityKindOrder(right.kind))
}
