import { createResponsibility, responsibilityIdForTeam, type Responsibility, type ResponsibilityKind } from '@/domain/responsibility'
import type { TrainingResponsibility } from '@/domain/training'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from './GameWorld'

/** §14.1: the legacy TrainingResponsibility -> canonical ResponsibilityKind mapping is canon, not an implementation choice. */
const LEGACY_TRAINING_RESPONSIBILITY_TO_KIND: Readonly<Record<TrainingResponsibility, ResponsibilityKind>> = {
  teamTraining: 'createTeamTrainingPlan',
  individualDevelopment: 'assignIndividualDevelopment',
  physicalLoad: 'determineIntensity',
}

/**
 * One-time, idempotent migration of `trainingResponsibilitiesByTeamId` (the pre-existing,
 * training-only precursor of the canonical Responsibility model) onto `responsibilitiesById`.
 *
 * For every legacy `(teamId, TrainingResponsibility, StaffPersonId)` entry:
 * - resolve the canonical Responsibility row for `(teamId, mapped kind)` via the existing stable
 *   `responsibilityIdForTeam` identity (the same row Wave 1's `ensureResponsibilityStructure`
 *   already created as a default `userControlled`/vacant row),
 * - if that canonical row is still at its Wave 1 default (`userControlled`, no holder), replace
 *   it with `mode: 'delegated'`, `holderStaffId` set to the legacy holder,
 * - if that canonical row has already been explicitly changed to a non-default state (a different
 *   mode, or a different/explicit holder), leave it untouched — canonical state always wins over
 *   stale legacy data,
 * - never creates a duplicate `(teamId, kind)` row: it always resolves the one canonical id for
 *   that pair, exactly like `ensureResponsibilityStructure`.
 *
 * After migrating, `trainingResponsibilitiesByTeamId` is emptied — it must never remain a second
 * runtime source of truth for Training responsibility holders going forward.
 *
 * Pure, deterministic, and safely re-runnable: a world with an already-empty legacy map is
 * returned unchanged (referential no-op).
 */
export function migrateTrainingResponsibilities(world: GameWorld): GameWorld {
  const legacyEntries = Object.entries(world.trainingResponsibilitiesByTeamId) as [string, Partial<Record<TrainingResponsibility, string>>][]
  if (legacyEntries.every(([, responsibilities]) => Object.keys(responsibilities).length === 0)) {
    return Object.keys(world.trainingResponsibilitiesByTeamId).length === 0 ? world : updateGameWorld(world, { trainingResponsibilitiesByTeamId: {} })
  }

  const responsibilitiesById: Record<string, Responsibility> = { ...world.responsibilitiesById }
  let changed = false

  for (const [teamId, responsibilities] of legacyEntries) {
    for (const [legacyKind, holderStaffId] of Object.entries(responsibilities) as [TrainingResponsibility, string | undefined][]) {
      if (holderStaffId === undefined) continue
      const kind = LEGACY_TRAINING_RESPONSIBILITY_TO_KIND[legacyKind]
      const id = responsibilityIdForTeam(teamId as TeamId, kind)
      const existing = responsibilitiesById[id]
      const isDefaultRow = existing === undefined || (existing.mode === 'userControlled' && existing.holderStaffId === undefined)
      if (!isDefaultRow) continue
      responsibilitiesById[id] = createResponsibility({ id, teamId: teamId as TeamId, kind, mode: 'delegated', holderStaffId: holderStaffId as never })
      changed = true
    }
  }

  if (!changed) return updateGameWorld(world, { trainingResponsibilitiesByTeamId: {} })
  return updateGameWorld(world, { responsibilities: Object.values(responsibilitiesById), trainingResponsibilitiesByTeamId: {} })
}
