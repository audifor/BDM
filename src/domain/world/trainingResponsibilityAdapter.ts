import type { Responsibility, ResponsibilityKind } from '@/domain/responsibility'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import type { TrainingResponsibility } from '@/domain/training'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from './GameWorld'

/**
 * TEMPORARY read-only adapter (Wave 1 only). `trainingResponsibilitiesByTeamId`
 * (`GameWorld.trainingResponsibilitiesByTeamId`) is a pre-existing, training-only precursor of
 * the general Responsibility model. It remains the single source of truth for training
 * responsibility holders in Wave 1 — nothing here writes to `responsibilitiesById` for training
 * kinds, and no execution logic reads from this projection yet.
 *
 * Wave 2 performs the real, one-time migration (`migrateTrainingResponsibilities`) that creates
 * `Responsibility` rows from these entries and retires `trainingResponsibilitiesByTeamId` as a
 * second source of truth. Until then, this function exists solely so callers that want a
 * unified read view of "who holds this responsibility" can get one without a second bespoke
 * lookup path — it must NOT be treated as a permanent parallel authority.
 */
const LEGACY_TRAINING_RESPONSIBILITY_TO_KIND: Readonly<Record<TrainingResponsibility, ResponsibilityKind>> = {
  teamTraining: 'createTeamTrainingPlan',
  individualDevelopment: 'assignIndividualDevelopment',
  physicalLoad: 'determineIntensity',
}

export function projectLegacyTrainingResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): Responsibility | undefined {
  const legacyKey = (Object.entries(LEGACY_TRAINING_RESPONSIBILITY_TO_KIND) as [TrainingResponsibility, ResponsibilityKind][]).find(([, mappedKind]) => mappedKind === kind)?.[0]
  if (legacyKey === undefined) return undefined
  const holderStaffId = world.trainingResponsibilitiesByTeamId[teamId]?.[legacyKey]
  if (holderStaffId === undefined) return undefined
  return { id: responsibilityIdForTeam(teamId, kind), teamId, kind, mode: 'delegated', holderStaffId }
}
