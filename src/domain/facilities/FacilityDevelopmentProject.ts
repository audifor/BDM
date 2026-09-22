import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityDevelopmentProjectIdFromString, facilityIdFromString, organizationIdFromString, type FacilityDevelopmentProjectId, type FacilityId, type OrganizationId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import { createFacilityDevelopmentProjectScope, type CreateFacilityDevelopmentProjectScopeInput, type FacilityDevelopmentProjectScope } from './FacilityDevelopmentProjectScope'

/**
 * The kind of physical change a project makes. Deliberately not exhaustively fine-grained (e.g. no
 * separate `ADD_HYDROTHERAPY_POOL` type) — see `FacilityDevelopmentProjectScope` for the structured
 * data describing exactly what changes; `projectType` is a coarse classification useful for
 * reporting/filtering, never a discriminant the engine branches on (the engine branches on
 * `scope.kind` instead, which is exhaustive by construction).
 */
export const FACILITY_DEVELOPMENT_PROJECT_TYPES = [
  'NEW_FACILITY',
  'FACILITY_EXPANSION',
  'FACILITY_RENOVATION',
  'FACILITY_MODERNIZATION',
  'COMPONENT_ADDITION',
  'COMPONENT_REPLACEMENT',
  'COMPONENT_RENOVATION',
  'COMPONENT_REMOVAL',
  'RECONFIGURATION',
  'TEMPORARY_WORKS',
  'DEMOLITION',
] as const
export type FacilityDevelopmentProjectType = (typeof FACILITY_DEVELOPMENT_PROJECT_TYPES)[number]

export function isFacilityDevelopmentProjectType(value: unknown): value is FacilityDevelopmentProjectType {
  return typeof value === 'string' && (FACILITY_DEVELOPMENT_PROJECT_TYPES as readonly string[]).includes(value)
}

/**
 * Explicit project lifecycle. `APPROVED` records the world truth that approval occurred — CFI6
 * does not model who approved it or why (that is Governance's future concern); a caller who has no
 * real approval concept yet may simply skip straight from `PLANNED` to `SCHEDULED`/`IN_PROGRESS`,
 * since `APPROVED` is optional in the transition graph below, not a mandatory gate.
 */
export const FACILITY_DEVELOPMENT_PROJECT_STATUSES = ['PLANNED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const
export type FacilityDevelopmentProjectStatus = (typeof FACILITY_DEVELOPMENT_PROJECT_STATUSES)[number]

export function isFacilityDevelopmentProjectStatus(value: unknown): value is FacilityDevelopmentProjectStatus {
  return typeof value === 'string' && (FACILITY_DEVELOPMENT_PROJECT_STATUSES as readonly string[]).includes(value)
}

const TERMINAL_PROJECT_STATUSES: readonly FacilityDevelopmentProjectStatus[] = ['COMPLETED', 'CANCELLED']

export function isFacilityDevelopmentProjectTerminalStatus(status: FacilityDevelopmentProjectStatus): boolean {
  return TERMINAL_PROJECT_STATUSES.includes(status)
}

/**
 * Explicit, closed transition graph — the same `allowedTransitions` pattern
 * `OrganizationStructuralChange.ts` established for structural-change lifecycles, reused here
 * rather than reinvented. `COMPLETED`/`CANCELLED` are terminal (never revert); `PAUSED` only ever
 * reached from and returned to `IN_PROGRESS`; cancellation is permitted from every non-terminal
 * status (a project can be abandoned at any stage before completion).
 */
export const FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS: Readonly<Record<FacilityDevelopmentProjectStatus, readonly FacilityDevelopmentProjectStatus[]>> = Object.freeze({
  PLANNED: ['APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
})

export function isValidFacilityDevelopmentProjectTransition(from: FacilityDevelopmentProjectStatus, to: FacilityDevelopmentProjectStatus): boolean {
  return FACILITY_DEVELOPMENT_PROJECT_ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * The canonical entity representing one construction/renovation/development project. Its own
 * identity is independent of the `Facility` it targets — `facilityId` is optional specifically to
 * represent a `NEW_FACILITY` project before the real `Facility` entity exists (see
 * `FacilityDevelopmentEngine.startFacilityDevelopmentProject`, which is what actually creates the
 * `Facility` in `PLANNED`/`UNDER_CONSTRUCTION` lifecycle status once the project starts).
 *
 * `organizationId` is the institutional actor undertaking the project — normally an `Organization`,
 * never a `Team`, per the brief's explicit instruction that a Team is not the right owner of
 * physical infrastructure decisions.
 *
 * No monetary field exists anywhere on this entity — cost/budget/financing is CFI7's exclusive
 * domain; CFI6 only prepares an identity (`id`) stable enough for CFI7 to reference later.
 */
export interface FacilityDevelopmentProject {
  readonly id: FacilityDevelopmentProjectId
  readonly organizationId: OrganizationId
  readonly facilityId: FacilityId | null
  readonly projectType: FacilityDevelopmentProjectType
  readonly status: FacilityDevelopmentProjectStatus
  readonly scope: FacilityDevelopmentProjectScope
  readonly plannedStartDate: GameDate
  readonly actualStartDate: GameDate | null
  readonly plannedCompletionDate: GameDate
  readonly actualCompletionDate: GameDate | null
  readonly createdAt: GameDate
  readonly cancelledAt: GameDate | null
  readonly reason: string | null
  readonly externalReferenceId: string | null
}

export interface CreateFacilityDevelopmentProjectInput {
  readonly id: FacilityDevelopmentProjectId | string
  readonly organizationId: OrganizationId | string
  readonly facilityId?: FacilityId | string | null
  readonly projectType: FacilityDevelopmentProjectType
  readonly status?: FacilityDevelopmentProjectStatus
  readonly scope: CreateFacilityDevelopmentProjectScopeInput | FacilityDevelopmentProjectScope
  readonly plannedStartDate: GameDate | string
  readonly actualStartDate?: GameDate | string | null
  readonly plannedCompletionDate: GameDate | string
  readonly actualCompletionDate?: GameDate | string | null
  readonly createdAt: GameDate | string
  readonly cancelledAt?: GameDate | string | null
  readonly reason?: string | null
  readonly externalReferenceId?: string | null
}

export function createFacilityDevelopmentProject(input: CreateFacilityDevelopmentProjectInput): FacilityDevelopmentProject {
  if (!isFacilityDevelopmentProjectType(input.projectType)) throw new TypeError(`Facility development project projectType is invalid: ${String(input.projectType)}`)
  const status = input.status ?? 'PLANNED'
  if (!isFacilityDevelopmentProjectStatus(status)) throw new TypeError(`Facility development project status is invalid: ${String(status)}`)

  const createdAt = parseGameDate(input.createdAt)
  const plannedStartDate = parseGameDate(input.plannedStartDate)
  const plannedCompletionDate = parseGameDate(input.plannedCompletionDate)
  if (compareGameDates(plannedCompletionDate, plannedStartDate) < 0) throw new RangeError('Facility development project plannedCompletionDate cannot precede plannedStartDate')

  const actualStartDate = input.actualStartDate === undefined || input.actualStartDate === null ? null : parseGameDate(input.actualStartDate)
  const actualCompletionDate = input.actualCompletionDate === undefined || input.actualCompletionDate === null ? null : parseGameDate(input.actualCompletionDate)
  if (actualStartDate !== null && compareGameDates(actualStartDate, createdAt) < 0) throw new RangeError('Facility development project actualStartDate cannot precede createdAt')
  if (actualCompletionDate !== null && actualStartDate === null) throw new RangeError('Facility development project actualCompletionDate requires actualStartDate')
  if (actualCompletionDate !== null && actualStartDate !== null && compareGameDates(actualCompletionDate, actualStartDate) < 0) {
    throw new RangeError('Facility development project actualCompletionDate cannot precede actualStartDate')
  }

  const cancelledAt = input.cancelledAt === undefined || input.cancelledAt === null ? null : parseGameDate(input.cancelledAt)
  if (status === 'CANCELLED' && cancelledAt === null) throw new RangeError('Facility development project status CANCELLED requires a cancelledAt date')
  if (status !== 'CANCELLED' && cancelledAt !== null) throw new RangeError('Facility development project cancelledAt is only valid for status CANCELLED')
  if (status === 'COMPLETED' && actualCompletionDate === null) throw new RangeError('Facility development project status COMPLETED requires an actualCompletionDate')
  if ((status === 'IN_PROGRESS' || status === 'PAUSED') && actualStartDate === null) {
    throw new RangeError(`Facility development project status ${status} requires an actualStartDate`)
  }
  if ((status === 'PLANNED' || status === 'APPROVED' || status === 'SCHEDULED') && actualStartDate !== null) {
    throw new RangeError(`Facility development project status ${status} cannot already have an actualStartDate`)
  }

  const scope = createFacilityDevelopmentProjectScope(input.scope)
  assertScopeMatchesProjectType(input.projectType, scope)
  const hasFacilityId = input.facilityId !== undefined && input.facilityId !== null
  if (scope.kind === 'CREATE_FACILITY' && hasFacilityId && actualStartDate === null) {
    throw new RangeError('Facility development project with scope CREATE_FACILITY cannot already reference an existing facilityId before the project has actually started')
  }
  if (scope.kind !== 'CREATE_FACILITY' && !hasFacilityId) {
    throw new RangeError(`Facility development project with scope ${scope.kind} requires a facilityId`)
  }

  return Object.freeze({
    id: facilityDevelopmentProjectIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    facilityId: input.facilityId === undefined || input.facilityId === null ? null : facilityIdFromString(input.facilityId),
    projectType: input.projectType,
    status,
    scope,
    plannedStartDate,
    actualStartDate,
    plannedCompletionDate,
    actualCompletionDate,
    createdAt,
    cancelledAt,
    reason: input.reason === undefined || input.reason === null ? null : requireNonEmptyString(input.reason, 'Facility development project reason'),
    externalReferenceId: input.externalReferenceId === undefined || input.externalReferenceId === null ? null : requireNonEmptyString(input.externalReferenceId, 'Facility development project externalReferenceId'),
  })
}

/**
 * A loose but real correspondence check: every `projectType` must be paired with a scope kind that
 * can plausibly realize it. Deliberately permissive where multiple types share a scope shape (e.g.
 * `FACILITY_EXPANSION`/`COMPONENT_ADDITION` both pair with `ADD_COMPONENT` or `EXPAND_FACILITY`) —
 * CFI6 does not force a rigid 1:1 mapping, only rejects genuinely incoherent pairings (e.g.
 * `DEMOLITION` paired with `ADD_COMPONENT`).
 */
const PROJECT_TYPE_COMPATIBLE_SCOPE_KINDS: Readonly<Record<FacilityDevelopmentProjectType, readonly FacilityDevelopmentProjectScope['kind'][]>> = Object.freeze({
  NEW_FACILITY: ['CREATE_FACILITY'],
  FACILITY_EXPANSION: ['ADD_COMPONENT', 'EXPAND_FACILITY', 'RECONFIGURE_FACILITY'],
  FACILITY_RENOVATION: ['RENOVATE_COMPONENT', 'RECONFIGURE_FACILITY'],
  FACILITY_MODERNIZATION: ['RENOVATE_COMPONENT', 'RECONFIGURE_FACILITY'],
  COMPONENT_ADDITION: ['ADD_COMPONENT', 'EXPAND_FACILITY'],
  COMPONENT_REPLACEMENT: ['REPLACE_COMPONENT', 'RECONFIGURE_FACILITY'],
  COMPONENT_RENOVATION: ['RENOVATE_COMPONENT', 'RECONFIGURE_FACILITY'],
  COMPONENT_REMOVAL: ['REMOVE_COMPONENT', 'RECONFIGURE_FACILITY'],
  RECONFIGURATION: ['RECONFIGURE_FACILITY', 'ADD_COMPONENT', 'RENOVATE_COMPONENT', 'REPLACE_COMPONENT', 'REMOVE_COMPONENT'],
  TEMPORARY_WORKS: ['RENOVATE_COMPONENT', 'RECONFIGURE_FACILITY'],
  DEMOLITION: ['DEMOLISH_FACILITY', 'REMOVE_COMPONENT'],
})

function assertScopeMatchesProjectType(projectType: FacilityDevelopmentProjectType, scope: FacilityDevelopmentProjectScope): void {
  const compatible = PROJECT_TYPE_COMPATIBLE_SCOPE_KINDS[projectType]
  if (!compatible.includes(scope.kind)) {
    throw new RangeError(`Facility development project type ${projectType} is not compatible with scope kind ${scope.kind}`)
  }
}
