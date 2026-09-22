import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityDevelopmentProjectIdFromString, facilityDevelopmentProjectPhaseIdFromString, type FacilityDevelopmentProjectId, type FacilityDevelopmentProjectPhaseId } from '@/domain/ids'

/**
 * A lightweight, linear phase model — deliberately not a DAG. `sequence` is a plain 1-based integer
 * ordering; CFI6 does not model cross-phase dependencies beyond "phase N follows phase N-1", which
 * the brief's own examples (construction → fit-out → commissioning; courts phase → medical wing
 * phase) never require anything richer than. A project with no phases is simply a single-phase
 * project in effect — phases are opt-in, not mandatory scaffolding every project must have.
 */
export const FACILITY_DEVELOPMENT_PROJECT_PHASE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const
export type FacilityDevelopmentProjectPhaseStatus = (typeof FACILITY_DEVELOPMENT_PROJECT_PHASE_STATUSES)[number]

export function isFacilityDevelopmentProjectPhaseStatus(value: unknown): value is FacilityDevelopmentProjectPhaseStatus {
  return typeof value === 'string' && (FACILITY_DEVELOPMENT_PROJECT_PHASE_STATUSES as readonly string[]).includes(value)
}

/**
 * `scopeComponentIndexes` optionally narrows a phase to a subset of its parent project's scope
 * (e.g. an `ADD_COMPONENT` scope with 4 blueprints, where phase 1 covers indexes `[0, 1]` and phase
 * 2 covers `[2, 3]`) — a plain index list into the parent scope's own component array, never a
 * duplicated copy of the blueprint data itself. `null`/omitted means the phase does not subdivide
 * the scope (its own timeline is tracked, but which exact sub-change belongs to which phase is left
 * unspecified) — this is deliberately allowed, since forcing every phase to name its exact slice of
 * scope would be unnecessary ceremony for a two-phase "construction, then commissioning" project
 * that touches the whole scope at once.
 */
export interface FacilityDevelopmentProjectPhase {
  readonly id: FacilityDevelopmentProjectPhaseId
  readonly projectId: FacilityDevelopmentProjectId
  readonly sequence: number
  readonly name: string | null
  readonly status: FacilityDevelopmentProjectPhaseStatus
  readonly plannedStart: GameDate
  readonly plannedCompletion: GameDate
  readonly actualStart: GameDate | null
  readonly actualCompletion: GameDate | null
  readonly scopeComponentIndexes: readonly number[] | null
}

export interface CreateFacilityDevelopmentProjectPhaseInput {
  readonly id: FacilityDevelopmentProjectPhaseId | string
  readonly projectId: FacilityDevelopmentProjectId | string
  readonly sequence: number
  readonly name?: string | null
  readonly status?: FacilityDevelopmentProjectPhaseStatus
  readonly plannedStart: GameDate | string
  readonly plannedCompletion: GameDate | string
  readonly actualStart?: GameDate | string | null
  readonly actualCompletion?: GameDate | string | null
  readonly scopeComponentIndexes?: readonly number[] | null
}

export function createFacilityDevelopmentProjectPhase(input: CreateFacilityDevelopmentProjectPhaseInput): FacilityDevelopmentProjectPhase {
  if (!Number.isInteger(input.sequence) || input.sequence < 1) throw new RangeError('Facility development project phase sequence must be a positive integer')
  const status = input.status ?? 'PLANNED'
  if (!isFacilityDevelopmentProjectPhaseStatus(status)) throw new TypeError(`Facility development project phase status is invalid: ${String(status)}`)

  const plannedStart = parseGameDate(input.plannedStart)
  const plannedCompletion = parseGameDate(input.plannedCompletion)
  if (compareGameDates(plannedCompletion, plannedStart) < 0) throw new RangeError('Facility development project phase plannedCompletion cannot precede plannedStart')

  const actualStart = input.actualStart === undefined || input.actualStart === null ? null : parseGameDate(input.actualStart)
  const actualCompletion = input.actualCompletion === undefined || input.actualCompletion === null ? null : parseGameDate(input.actualCompletion)
  if (actualCompletion !== null && actualStart === null) throw new RangeError('Facility development project phase actualCompletion requires actualStart')
  if (actualCompletion !== null && actualStart !== null && compareGameDates(actualCompletion, actualStart) < 0) {
    throw new RangeError('Facility development project phase actualCompletion cannot precede actualStart')
  }
  if ((status === 'IN_PROGRESS' || status === 'PAUSED') && actualStart === null) {
    throw new RangeError(`Facility development project phase status ${status} requires an actualStart`)
  }
  if (status === 'PLANNED' && actualStart !== null) throw new RangeError('Facility development project phase status PLANNED cannot already have an actualStart')
  if (status === 'COMPLETED' && actualCompletion === null) throw new RangeError('Facility development project phase status COMPLETED requires an actualCompletion')

  const name = input.name === undefined || input.name === null ? null : input.name.trim()
  if (name !== null && name.length === 0) throw new TypeError('Facility development project phase name must be a non-empty string or null')

  const scopeComponentIndexes = input.scopeComponentIndexes === undefined || input.scopeComponentIndexes === null ? null : Object.freeze([...input.scopeComponentIndexes])
  if (scopeComponentIndexes !== null) {
    for (const index of scopeComponentIndexes) if (!Number.isInteger(index) || index < 0) throw new RangeError('Facility development project phase scopeComponentIndexes must be non-negative integers')
  }

  return Object.freeze({
    id: facilityDevelopmentProjectPhaseIdFromString(input.id),
    projectId: facilityDevelopmentProjectIdFromString(input.projectId),
    sequence: input.sequence,
    name,
    status,
    plannedStart,
    plannedCompletion,
    actualStart,
    actualCompletion,
    scopeComponentIndexes,
  })
}
