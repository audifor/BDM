import type { TrainingDefinition } from '@/domain/training'
import type { SportingPhysicalRequirement } from '@/domain/facilities/SportingOperationPhysical'

export const TRAINING_PHYSICAL_POLICY_VERSION = 'BS17D-P0-v1'
/** Explicit court operations; non-specialized physical/recovery work gets no invented equipment. */
export const TRAINING_COURT_MODULES: readonly string[] = Object.freeze([
  'catchAndShoot', 'pullUpShooting', 'midRange', 'threePoint', 'freeThrows', 'shotCreation',
  'rimFinishing', 'contactFinishing', 'floaters', 'postScoring', 'finishingTraffic',
  'ballControl', 'ballSecurity', 'firstStep', 'changeOfDirection',
  'passing',
  'perimeterDefense', 'interiorDefense', 'screenNavigation', 'steals', 'rimProtection', 'shotContest',
  'offensiveRebounding', 'defensiveRebounding', 'boxOut',
  'offensiveSystem', 'defensiveSystem', 'transition', 'spacing', 'pickAndRollOffense', 'pickAndRollDefense',
])
export function trainingPhysicalRequirements(definition: TrainingDefinition): readonly SportingPhysicalRequirement[] {
  if (!TRAINING_COURT_MODULES.includes(definition.id)) return []
  return [{ capabilities: ['BASKETBALL_TRAINING', 'BASKETBALL_FULL_COURT'], fullCourt: definition.category === 'tactical' }]
}
