import { createResponsibility, responsibilityDefinition, responsibilityIdForTeam, validateResponsibilityAssignment, type Responsibility, type ResponsibilityKind } from '@/domain/responsibility'
import type { TrainingResponsibility } from '@/domain/training'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from './GameWorld'
import { getStaffAssignment, getStaffPerson } from './staff'

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
 * The legacy map was never validated against role eligibility or team membership — the old
 * `setTrainingResponsibility` accepted any existing `StaffPersonId` unconditionally. The
 * canonical model validates both strictly (`validateResponsibilityAssignment`,
 * `validateWorld`'s holder-team check). Legacy holders are therefore treated as **untrusted**
 * data with respect to current canonical rules, never migrated blindly:
 *
 * For every legacy `(teamId, TrainingResponsibility, StaffPersonId)` entry:
 * - resolve the canonical Responsibility row for `(teamId, mapped kind)` via the existing stable
 *   `responsibilityIdForTeam` identity (the same row Wave 1's `ensureResponsibilityStructure`
 *   already created as a default `userControlled`/vacant row);
 * - if that canonical row has already been explicitly changed to a non-default state (a different
 *   mode, or an explicit holder), leave it untouched — canonical state always wins over stale
 *   legacy data, migrated or not;
 * - otherwise (still at the Wave 1 default), the legacy holder is migrated ONLY if it is
 *   completely valid under current canonical rules: the `StaffPerson` exists, has a live
 *   `TeamStaffAssignment` on the SAME `teamId`, and `validateResponsibilityAssignment` accepts
 *   that assignment's role for this `ResponsibilityKind` in `mode: 'delegated'`;
 * - an incompatible legacy holder (missing person, wrong team, ineligible role) is silently
 *   dropped — the canonical row is left at its safe default (`userControlled`, vacant). No role
 *   is reassigned, no `RESPONSIBILITY_REGISTRY` entry is widened, no staff is invented: the
 *   holder is simply not carried forward, exactly as if the legacy map had never named one. This
 *   is what makes migration a safe load path for saves that only the pre-Wave-2 (unvalidated)
 *   engine could have produced.
 * - never creates a duplicate `(teamId, kind)` row: it always resolves the one canonical id for
 *   that pair, exactly like `ensureResponsibilityStructure`.
 *
 * After migrating (validated or dropped), `trainingResponsibilitiesByTeamId` is emptied — it must
 * never remain a second runtime source of truth for Training responsibility holders going
 * forward.
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
      const validated = validateLegacyHolder(world, teamId as TeamId, kind, holderStaffId as StaffPersonId)
      if (validated === undefined) continue
      responsibilitiesById[id] = createResponsibility({ id, teamId: teamId as TeamId, kind, mode: 'delegated', holderStaffId: validated })
      changed = true
    }
  }

  if (!changed) return updateGameWorld(world, { trainingResponsibilitiesByTeamId: {} })
  return updateGameWorld(world, { responsibilities: Object.values(responsibilitiesById), trainingResponsibilitiesByTeamId: {} })
}

/**
 * Returns the legacy holder's id only if it is fully valid under current canonical rules for
 * `kind` on `teamId`: the `StaffPerson` exists, has a live `TeamStaffAssignment` on `teamId`, and
 * `validateResponsibilityAssignment` accepts that role for `kind` in `mode: 'delegated'`.
 * Returns `undefined` for any incompatibility — never throws, since an incompatible legacy
 * holder must degrade to a safe default, not break the load.
 */
function validateLegacyHolder(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, holderStaffId: StaffPersonId): StaffPersonId | undefined {
  responsibilityDefinition(kind) // throws only for a programmer error (unknown kind); never for untrusted legacy data
  const staff = getStaffPerson(world, holderStaffId)
  if (staff === undefined) return undefined
  const assignment = getStaffAssignment(world, holderStaffId)
  if (assignment === undefined || assignment.teamId !== teamId) return undefined
  const result = validateResponsibilityAssignment(kind, 'delegated', assignment.role, staff)
  return result.ok ? holderStaffId : undefined
}
