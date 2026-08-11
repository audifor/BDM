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
export { calculateDefenseExecution, calculateEffectiveDefense, calculateShotMakeProbability, calculateShotZoneWeights, pointsForShotZone, SHOT_RESOLUTION_V1 } from './ShotResolution'
export { chooseWeighted } from './WeightedChoice'
export { calculateDefensiveAssignments } from './Matchups'
export { createDefaultTacticalPlan, validateTacticalPlan } from './tactics/MatchTacticalPlan'
export { applyTacticalPlanChange, calculateTacticalPlanAtEvents } from './coaching/MatchCoachingState'
export { applyManualSubstitutions } from './coaching/ManualSubstitutions'
export { applyPaceToPossessionDuration, applyShotProfile, calculateTacticalDefenseModifier, tacticalShotFactor, tacticalUsageWeight } from './tactics/TacticalEffects'
export { calculateAssistProbability, selectAssister, ASSIST_RESOLUTION_V1 } from './AssistResolution'
export { calculateOffensiveReboundProbability, selectRebounder, REBOUND_RESOLUTION_V1 } from './ReboundResolution'
export { calculateDefensivePressure, calculateTurnoverProbability, TURNOVER_RESOLUTION_V1 } from './TurnoverResolution'
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
  SubstitutionSource,
} from './MatchEngine'
export type { PlayerMatchStats } from './PlayerMatchStats'
export type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
export type { PlayerMatchup } from './Matchups'
export type { MatchTacticalPlan, TacticalLevel } from './tactics/MatchTacticalPlan'
export type { MatchCoachingState, TeamMatchCoachingState, TacticalPlanChange } from './coaching/MatchCoachingState'
export type { ManualSubstitution, ManualSubstitutionBatch } from './coaching/ManualSubstitutions'
export type { AssistContext } from './AssistResolution'
export type { ReboundContext } from './ReboundResolution'
export type { TurnoverContext } from './TurnoverResolution'
export type { ShotAttemptContext, ShotZone } from './ShotResolution'
export type { FatigueByPlayerId } from './Fatigue'
export type { ApplyDueRotationsResult, RotationControllerState } from './rotation/RotationController'
export type { SimulateMatchWithRotationsOptions } from './rotation/MatchRotationRunner'
export type { RotationInstruction, TeamRotationPlan } from './rotation/RotationPlan'
