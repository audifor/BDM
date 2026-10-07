import type { GameDate } from '@/domain/date'
import { isFacilityDevelopmentProjectTerminalStatus, type FacilityDevelopmentProject, type FacilityDevelopmentProjectStatus } from '@/domain/facilities'
import type { FacilityDevelopmentProjectId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  cancelFacilityDevelopmentProject,
  completeFacilityDevelopmentProject,
  pauseFacilityDevelopmentProject,
  resumeFacilityDevelopmentProject,
  startFacilityDevelopmentProject,
  type FacilityDevelopmentOutcome,
} from '@/engine/facilities'
import { executeFundedFacilityProjectStart, type FacilityFinanceIntegrationOutcome } from '@/integration/facilitiesFinance'

import { resolveClubFacilityAuthority } from './ClubFacilitiesReadModel'

/**
 * MX0.6 — the club-scoped application command boundary for canonical Facility Development Projects.
 *
 * Every command here delegates to an existing canonical engine/integration command; this layer adds
 * only (a) club authority (the project must belong to the user club's Organization), (b) the
 * canonical precondition checks those commands would otherwise throw on, and (c) stable reason
 * codes a product surface can translate. No new business rule, cost, duration or outcome is
 * invented: what a project *does* stays entirely in `src/engine/facilities/` and CFI7's integration.
 */

export const CLUB_FACILITY_COMMAND_REASONS = [
  'UNKNOWN_TEAM',
  'PROJECT_NOT_FOUND',
  'NOT_CLUB_PROJECT',
  'PROJECT_ALREADY_TERMINAL',
  'PROJECT_NOT_STARTABLE',
  'PROJECT_NOT_IN_PROGRESS',
  'PROJECT_NOT_PAUSED',
  'COMMITMENT_CURRENCY_REQUIRED',
  'INVALID_COMMITMENT_AMOUNT',
] as const
export type ClubFacilityCommandReason = (typeof CLUB_FACILITY_COMMAND_REASONS)[number]

export interface ClubFacilityCommandResult {
  readonly status: 'APPLIED' | 'BLOCKED'
  readonly world: GameWorld
  readonly reasons: readonly ClubFacilityCommandReason[]
  /** Present for commands that changed physical project state; the exact canonical outcome shape. */
  readonly development?: FacilityDevelopmentOutcome
  /** Present when the command also wrote Financial truth (funded start). */
  readonly finance?: FacilityFinanceIntegrationOutcome
}

export interface ClubFacilityCommitmentInput {
  readonly currencyCode: string
  readonly minorUnits: number
  readonly dueOn?: GameDate
}

export interface StartClubFacilityProjectInput {
  readonly teamId: TeamId
  readonly projectId: FacilityDevelopmentProjectId
  readonly startedAt?: GameDate
  /** When supplied, the start is funded through CFI7 (commitment + financial binding). Omitted means a physical-only start. */
  readonly commitment?: ClubFacilityCommitmentInput
}

export interface ClubFacilityProjectInput {
  readonly teamId: TeamId
  readonly projectId: FacilityDevelopmentProjectId
}

export interface CompleteClubFacilityProjectInput extends ClubFacilityProjectInput {
  readonly completedAt?: GameDate
}

export interface CancelClubFacilityProjectInput extends ClubFacilityProjectInput {
  readonly cancelledAt?: GameDate
}

function blocked(world: GameWorld, ...reasons: readonly ClubFacilityCommandReason[]): ClubFacilityCommandResult {
  return Object.freeze({ status: 'BLOCKED', world, reasons: Object.freeze([...reasons]) })
}

/** Exported so a UI bridge can report "no club authority" without duplicating the reason vocabulary. */
export function blockedClubFacilityCommand(world: GameWorld, reason: ClubFacilityCommandReason): ClubFacilityCommandResult {
  return blocked(world, reason)
}

function applied(world: GameWorld, development: FacilityDevelopmentOutcome, finance?: FacilityFinanceIntegrationOutcome): ClubFacilityCommandResult {
  return Object.freeze({ status: 'APPLIED', world, reasons: Object.freeze([]), development, ...(finance === undefined ? {} : { finance }) })
}

/**
 * Resolves the club's own project. Returns the reason to block with when the caller may not act on
 * it, so no command ever throws for a merely unauthorized or already-finished project.
 */
function resolveClubProject(
  world: GameWorld,
  teamId: TeamId,
  projectId: FacilityDevelopmentProjectId,
): { readonly project: FacilityDevelopmentProject } | { readonly reason: ClubFacilityCommandReason } {
  const team = world.teams[teamId]
  if (team === undefined) return { reason: 'UNKNOWN_TEAM' }
  const project = world.facilityDevelopmentProjectsById[projectId]
  if (project === undefined) return { reason: 'PROJECT_NOT_FOUND' }
  if (project.organizationId !== resolveClubFacilityAuthority(world, teamId).organizationId) return { reason: 'NOT_CLUB_PROJECT' }
  return { project }
}

function statusMismatch(status: FacilityDevelopmentProjectStatus, fallback: ClubFacilityCommandReason): ClubFacilityCommandReason {
  return isFacilityDevelopmentProjectTerminalStatus(status) ? 'PROJECT_ALREADY_TERMINAL' : fallback
}

/** `PLANNED`/`APPROVED`/`SCHEDULED` are the canonical statuses `startFacilityDevelopmentProject` accepts. */
export function startClubFacilityProject(world: GameWorld, input: StartClubFacilityProjectInput): ClubFacilityCommandResult {
  const resolved = resolveClubProject(world, input.teamId, input.projectId)
  if ('reason' in resolved) return blocked(world, resolved.reason)
  const { project } = resolved
  const startable = project.status === 'PLANNED' || project.status === 'APPROVED' || project.status === 'SCHEDULED'
  if (!startable) return blocked(world, statusMismatch(project.status, 'PROJECT_NOT_STARTABLE'))
  const startedAt = input.startedAt ?? world.currentDate
  if (input.commitment === undefined) {
    const started = startFacilityDevelopmentProject(world, project.id, startedAt)
    return applied(started.world, started.outcome)
  }
  const currencyCode = input.commitment.currencyCode.trim()
  if (currencyCode.length === 0) return blocked(world, 'COMMITMENT_CURRENCY_REQUIRED')
  if (!Number.isInteger(input.commitment.minorUnits) || input.commitment.minorUnits <= 0) return blocked(world, 'INVALID_COMMITMENT_AMOUNT')
  // CFI7's funded start commits and binds capital, then performs the same canonical physical start.
  // It returns only the finance outcome, so this command reports `finance` and lets the caller read
  // the resulting physical state from the returned world (never a reconstructed outcome).
  const funded = executeFundedFacilityProjectStart(world, {
    projectId: project.id,
    organizationId: project.organizationId,
    amount: { currencyCode, minorUnits: input.commitment.minorUnits },
    startedAt,
    ...(input.commitment.dueOn === undefined ? {} : { dueOn: input.commitment.dueOn }),
  })
  return Object.freeze({ status: 'APPLIED', world: funded.world, reasons: Object.freeze([]), finance: funded.outcome })
}

export function pauseClubFacilityProject(world: GameWorld, input: ClubFacilityProjectInput): ClubFacilityCommandResult {
  const resolved = resolveClubProject(world, input.teamId, input.projectId)
  if ('reason' in resolved) return blocked(world, resolved.reason)
  if (resolved.project.status !== 'IN_PROGRESS') return blocked(world, statusMismatch(resolved.project.status, 'PROJECT_NOT_IN_PROGRESS'))
  const paused = pauseFacilityDevelopmentProject(world, resolved.project.id)
  return applied(paused.world, paused.outcome)
}

export function resumeClubFacilityProject(world: GameWorld, input: ClubFacilityProjectInput): ClubFacilityCommandResult {
  const resolved = resolveClubProject(world, input.teamId, input.projectId)
  if ('reason' in resolved) return blocked(world, resolved.reason)
  if (resolved.project.status !== 'PAUSED') return blocked(world, statusMismatch(resolved.project.status, 'PROJECT_NOT_PAUSED'))
  const resumed = resumeFacilityDevelopmentProject(world, resolved.project.id)
  return applied(resumed.world, resumed.outcome)
}

export function completeClubFacilityProject(world: GameWorld, input: CompleteClubFacilityProjectInput): ClubFacilityCommandResult {
  const resolved = resolveClubProject(world, input.teamId, input.projectId)
  if ('reason' in resolved) return blocked(world, resolved.reason)
  if (resolved.project.status !== 'IN_PROGRESS') return blocked(world, statusMismatch(resolved.project.status, 'PROJECT_NOT_IN_PROGRESS'))
  const completed = completeFacilityDevelopmentProject(world, resolved.project.id, input.completedAt ?? world.currentDate)
  return applied(completed.world, completed.outcome)
}

export function cancelClubFacilityProject(world: GameWorld, input: CancelClubFacilityProjectInput): ClubFacilityCommandResult {
  const resolved = resolveClubProject(world, input.teamId, input.projectId)
  if ('reason' in resolved) return blocked(world, resolved.reason)
  if (isFacilityDevelopmentProjectTerminalStatus(resolved.project.status)) return blocked(world, 'PROJECT_ALREADY_TERMINAL')
  const cancelled = cancelFacilityDevelopmentProject(world, resolved.project.id, input.cancelledAt ?? world.currentDate)
  return applied(cancelled.world, cancelled.outcome)
}

/** Manager-facing text for each canonical reason code. Presentation only — no rule lives here. */
export const CLUB_FACILITY_COMMAND_REASON_TEXT: Readonly<Record<ClubFacilityCommandReason, string>> = Object.freeze({
  UNKNOWN_TEAM: 'No club is assigned to the user coach.',
  PROJECT_NOT_FOUND: 'That facility development project no longer exists.',
  NOT_CLUB_PROJECT: 'That project belongs to another organization, not to your club.',
  PROJECT_ALREADY_TERMINAL: 'That project is already completed or cancelled.',
  PROJECT_NOT_STARTABLE: 'That project cannot be started from its current status.',
  PROJECT_NOT_IN_PROGRESS: 'That project is not in progress right now.',
  PROJECT_NOT_PAUSED: 'That project is not paused.',
  COMMITMENT_CURRENCY_REQUIRED: 'Enter the currency of the capital commitment.',
  INVALID_COMMITMENT_AMOUNT: 'The capital commitment must be a positive amount.',
})
