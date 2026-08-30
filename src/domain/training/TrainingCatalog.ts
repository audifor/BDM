import type { CanonicalRatingKey } from '@/domain/player'
import type { TrainingIntensity } from './Training'

export type TrainingCategory = 'shooting' | 'finishing' | 'ballHandling' | 'playmaking' | 'defense' | 'rebounding' | 'physical' | 'recovery' | 'tactical'
export type TrainingScope = 'team' | 'individual' | 'both'

/** Bounded, deterministic effect profile for a training definition at normal intensity. Scaled by trainingLoad(intensity). */
export interface TrainingEffectProfile {
  readonly targetRatings: readonly CanonicalRatingKey[]
  readonly developmentWeight: number
  readonly fatigueMultiplier: number
  readonly moraleDelta: number
  readonly cohesionDelta: number
  readonly injuryRiskWeight: number
}

export interface TrainingDefinition {
  readonly id: string
  readonly name: string
  readonly category: TrainingCategory
  readonly scope: TrainingScope
  readonly defaultIntensity: TrainingIntensity
  readonly durationMinutes: number
  readonly effects: TrainingEffectProfile
  readonly eligiblePositions?: readonly import('@/domain/primitives').BasketballPosition[]
}

function definition(
  id: string,
  name: string,
  category: TrainingCategory,
  scope: TrainingScope,
  targetRatings: readonly CanonicalRatingKey[],
  overrides: Partial<TrainingEffectProfile> & { readonly durationMinutes?: number; readonly defaultIntensity?: TrainingIntensity; readonly eligiblePositions?: readonly import('@/domain/primitives').BasketballPosition[] } = {},
): TrainingDefinition {
  return {
    id,
    name,
    category,
    scope,
    defaultIntensity: overrides.defaultIntensity ?? 'normal',
    durationMinutes: overrides.durationMinutes ?? 60,
    ...(overrides.eligiblePositions === undefined ? {} : { eligiblePositions: overrides.eligiblePositions }),
    effects: {
      targetRatings,
      developmentWeight: overrides.developmentWeight ?? 1,
      fatigueMultiplier: overrides.fatigueMultiplier ?? 1,
      moraleDelta: overrides.moraleDelta ?? 0,
      cohesionDelta: overrides.cohesionDelta ?? 0,
      injuryRiskWeight: overrides.injuryRiskWeight ?? 1,
    },
  }
}

/** Canonical built-in training catalog. Every definition targets real Player V2 canonical ratings with bounded effects. */
export const TRAINING_CATALOG: readonly TrainingDefinition[] = Object.freeze([
  // SHOOTING
  definition('catchAndShoot', 'Catch and Shoot', 'shooting', 'both', ['threePointShooting', 'midRangeShooting']),
  definition('pullUpShooting', 'Pull-Up Shooting', 'shooting', 'both', ['midRangeShooting', 'ballHandling']),
  definition('midRange', 'Mid-Range Shooting', 'shooting', 'both', ['midRangeShooting']),
  definition('threePoint', 'Three-Point Shooting', 'shooting', 'both', ['threePointShooting']),
  definition('freeThrows', 'Free Throws', 'shooting', 'both', ['freeThrowShooting'], { fatigueMultiplier: 0.6 }),
  definition('shotCreation', 'Shot Creation', 'shooting', 'both', ['midRangeShooting', 'ballHandling', 'firstStep']),

  // FINISHING
  definition('rimFinishing', 'Rim Finishing', 'finishing', 'both', ['rimFinishing']),
  definition('contactFinishing', 'Contact Finishing', 'finishing', 'both', ['contactFinishing', 'strength'], { injuryRiskWeight: 1.3 }),
  definition('floaters', 'Floaters', 'finishing', 'both', ['floater']),
  definition('postScoring', 'Post Scoring', 'finishing', 'both', ['postScoring', 'strength'], { eligiblePositions: ['PF', 'C'] }),
  definition('finishingTraffic', 'Finishing Through Traffic', 'finishing', 'both', ['contactFinishing', 'rimFinishing'], { injuryRiskWeight: 1.3 }),

  // BALL HANDLING
  definition('ballControl', 'Ball Control', 'ballHandling', 'both', ['ballHandling']),
  definition('ballSecurity', 'Ball Security', 'ballHandling', 'both', ['ballSecurity']),
  definition('firstStep', 'First Step', 'ballHandling', 'both', ['firstStep', 'acceleration']),
  definition('changeOfDirection', 'Change of Direction', 'ballHandling', 'both', ['changeOfDirection', 'lateralAgility']),

  // PLAYMAKING / BRAIN
  definition('passing', 'Passing', 'playmaking', 'both', ['passing']),
  definition('courtVision', 'Court Vision', 'playmaking', 'both', ['courtVision']),
  definition('decisionMaking', 'Decision Making', 'playmaking', 'both', ['decisionMaking']),
  definition('anticipation', 'Anticipation', 'playmaking', 'both', ['anticipation']),
  definition('composure', 'Composure', 'playmaking', 'both', ['composure'], { moraleDelta: 1 }),
  definition('offBallAwareness', 'Off-Ball Awareness', 'playmaking', 'both', ['offBallAwareness']),

  // DEFENSE
  definition('perimeterDefense', 'Perimeter Defense', 'defense', 'both', ['perimeterDefense', 'lateralAgility']),
  definition('interiorDefense', 'Interior Defense', 'defense', 'both', ['interiorDefense', 'strength']),
  definition('screenNavigation', 'Screen Navigation', 'defense', 'both', ['screenNavigation']),
  definition('defensiveAwareness', 'Defensive Awareness', 'defense', 'both', ['defensiveAwareness']),
  definition('steals', 'Steals', 'defense', 'both', ['steal', 'anticipation']),
  definition('rimProtection', 'Rim Protection', 'defense', 'both', ['rimProtection', 'vertical'], { eligiblePositions: ['PF', 'C'] }),
  definition('shotContest', 'Shot Contest', 'defense', 'both', ['shotContest']),

  // REBOUNDING
  definition('offensiveRebounding', 'Offensive Rebounding', 'rebounding', 'both', ['offensiveRebounding', 'boxOut']),
  definition('defensiveRebounding', 'Defensive Rebounding', 'rebounding', 'both', ['defensiveRebounding', 'boxOut']),
  definition('boxOut', 'Box Out', 'rebounding', 'both', ['boxOut', 'strength']),

  // PHYSICAL
  definition('acceleration', 'Acceleration', 'physical', 'both', ['acceleration'], { fatigueMultiplier: 1.2 }),
  definition('speed', 'Speed', 'physical', 'both', ['speed'], { fatigueMultiplier: 1.2 }),
  definition('agility', 'Agility', 'physical', 'both', ['lateralAgility'], { fatigueMultiplier: 1.1 }),
  definition('strength', 'Strength', 'physical', 'both', ['strength'], { fatigueMultiplier: 1.3, injuryRiskWeight: 1.2 }),
  definition('vertical', 'Vertical', 'physical', 'both', ['vertical'], { fatigueMultiplier: 1.2, injuryRiskWeight: 1.2 }),
  definition('stamina', 'Stamina', 'physical', 'both', ['stamina'], { fatigueMultiplier: 0.9 }),
  definition('conditioning', 'Conditioning', 'physical', 'both', ['stamina', 'acceleration'], { fatigueMultiplier: 1.1 }),

  // RECOVERY
  definition('rest', 'Rest', 'recovery', 'both', [], { developmentWeight: 0, fatigueMultiplier: -1, defaultIntensity: 'light', durationMinutes: 30 }),
  definition('activeRecovery', 'Active Recovery', 'recovery', 'both', ['stamina'], { developmentWeight: 0.2, fatigueMultiplier: -0.6, defaultIntensity: 'light', durationMinutes: 45 }),
  definition('mobility', 'Mobility', 'recovery', 'both', ['lateralAgility'], { developmentWeight: 0.3, fatigueMultiplier: -0.4, defaultIntensity: 'light', durationMinutes: 45 }),
  definition('lowLoadRecovery', 'Low-Load Recovery', 'recovery', 'both', [], { developmentWeight: 0, fatigueMultiplier: -0.8, defaultIntensity: 'light', durationMinutes: 30 }),

  // TACTICAL / TEAM (team scope only, cohesion-backed)
  definition('offensiveSystem', 'Offensive System', 'tactical', 'team', ['courtVision', 'decisionMaking'], { cohesionDelta: 2, durationMinutes: 90 }),
  definition('defensiveSystem', 'Defensive System', 'tactical', 'team', ['defensiveAwareness', 'screenNavigation'], { cohesionDelta: 2, durationMinutes: 90 }),
  definition('transition', 'Transition', 'tactical', 'team', ['acceleration', 'courtVision'], { cohesionDelta: 1.5, durationMinutes: 75 }),
  definition('spacing', 'Spacing', 'tactical', 'team', ['offBallAwareness'], { cohesionDelta: 1.5, durationMinutes: 75 }),
  definition('pickAndRollOffense', 'P&R Offense', 'tactical', 'team', ['decisionMaking', 'passing'], { cohesionDelta: 2, durationMinutes: 90 }),
  definition('pickAndRollDefense', 'P&R Defense', 'tactical', 'team', ['screenNavigation', 'defensiveAwareness'], { cohesionDelta: 2, durationMinutes: 90 }),
  definition('teamCohesion', 'Team Cohesion', 'tactical', 'team', [], { developmentWeight: 0, cohesionDelta: 4, moraleDelta: 2, durationMinutes: 60 }),
])

export function trainingDefinitionById(id: string): TrainingDefinition {
  const found = TRAINING_CATALOG.find((entry) => entry.id === id)
  if (!found) throw new RangeError(`Unknown training definition: ${id}`)
  return found
}
