export {
  MATCH_RULES_V2,
  MatchSimulationError,
  PROTOTYPE_PERIOD_COUNT,
  PROTOTYPE_PERIOD_SECONDS,
  createMatchSession,
  calculateActiveLineups,
  simulateMatch,
  simulateMatchDetailed,
  stepMatchSession,
  substitutePlayer,
  toMatchSimulation,
} from './MatchEngine'
export { applyMatchResult, MatchResultApplicationError } from './MatchResultApplication'
export { calculateMatchPlayerStats } from './PlayerMatchStats'
export { createMatchPlayerProfile } from './MatchPlayerProfile'
export { calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone, SHOT_RESOLUTION_V1 } from './ShotResolution'
export { chooseWeighted } from './WeightedChoice'
export { advanceFatigue, calculateFatigueAdjustedTeamStrength, calculateFatigueAtEvents, clampFatigue, createInitialFatigue, FATIGUE_GAIN_PER_SECOND, FATIGUE_RECOVERY_PER_SECOND, MAX_FATIGUE, MAX_FATIGUE_STRENGTH_PENALTY } from './Fatigue'
export { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE } from './rotation/RotationController'
export { simulateMatchWithRotations } from './rotation/MatchRotationRunner'
export { createDefaultRotationPlan } from './rotation/RotationPlan'
export type {
  MatchSimulationResult,
  MatchSimulation,
  MatchLineups,
  MatchSquads,
  MatchSession,
  MatchSessionState,
  MatchSessionStepResult,
  MatchEvent,
  SimulateMatchOptions,
  TeamStrength,
  SubstitutePlayerOptions,
} from './MatchEngine'
export type { PlayerMatchStats } from './PlayerMatchStats'
export type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
export type { ShotAttemptContext, ShotZone } from './ShotResolution'
export type { FatigueByPlayerId } from './Fatigue'
export type { ApplyDueRotationsResult, RotationControllerState } from './rotation/RotationController'
export type { SimulateMatchWithRotationsOptions } from './rotation/MatchRotationRunner'
export type { RotationInstruction, TeamRotationPlan } from './rotation/RotationPlan'
