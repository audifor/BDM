export {
  MATCH_RULES_V2,
  MINIMUM_MATCH_SQUAD_SIZE,
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
export { applyMatchResult, applyCompletedMatch, createMatchStatLog, MatchResultApplicationError } from './MatchResultApplication'
export { calculateMatchPlayerStats, calculateTeamMatchStats } from './PlayerMatchStats'
export { createMatchPlayerProfile, derivePlayerKinematicProfile, BASELINE_PLAYER_KINEMATIC_PROFILE, PLAYER_KINEMATIC_BOUNDS } from './MatchPlayerProfile'
export type { PlayerKinematicProfile } from './MatchPlayerProfile'
export { applySpatialSubstitution, attackingBasketForTeam, controlBallByPlayer, createInitialSpatialState, defendingBasketForTeam, getSpatialPossessionView, isSpatialStateCoherentWithPossession, isSpatialStateInsideCourt, advancePlayerTowardTarget, PLAYER_ACCELERATION_METERS_PER_SECOND_SQUARED, PLAYER_DECELERATION_METERS_PER_SECOND_SQUARED, PLAYER_MAX_SPEED_METERS_PER_SECOND, releaseSpatialBall } from './SpatialState'
export { assignBaseSpatialTargets, stepPlayersTowardBaseSpacing } from './BaseSpacing'
export type { BaseSpacingInput, BaseSpacingTargets, BaseSpatialTarget } from './BaseSpacing'
export { createOffBallCutIntent, MAX_OFF_BALL_CUT_STEPS, selectOffBallCutter, updateOffBallCutIntent } from './OffBallMovement'
export type { OffBallCutIntent } from './OffBallMovement'
export { advanceScreenIntent, createPostScreenIntent, createPostScreenTarget, createScreenIntent, reduceScreenedDefenderMovement, screenIntersectsDefenderRoute, selectScreenScreener, SCREEN_RULES_V1 } from './ScreenInteractions'
export type { ScreenIntent } from './ScreenInteractions'
export { advanceDriveIntent, createDriveTarget, driveMovementFactor, reduceDriveHandlerMovement, selectDriveIntent, DRIVE_RULES_V1 } from './DribbleDrives'
export type { DriveIntent } from './DribbleDrives'
export { assignTransitionSpatialTargets, stepPlayersTowardTransitionTargets } from './TransitionSpatial'
export type { TransitionSpatialInput, TransitionSpatialTarget, TransitionSpatialTargets } from './TransitionSpatial'
export { calculateDefenseExecution, calculateEffectiveDefense, calculateShotLocation, calculateShotMakeProbability, calculateShotZoneWeights, calculateSpatialContestBonus, pointsForShotZone, SHOT_RESOLUTION_V1, SPATIAL_CONTEST_V1 } from './ShotResolution'
export { calculatePassActionProbability, calculatePassCompletionProbability, calculatePassingLaneContext, distanceFromPointToSegment, PASS_RESOLUTION_V1 } from './PassingResolution'
export { chooseWeighted } from './WeightedChoice'
export { calculateDefensiveAssignments } from './Matchups'
export { coverageForCurrentScreen, DEFENSIVE_COVERAGE_RULES_V1 } from './DefensiveCoverages'
export type { DefensiveCoveragePhase, DefensiveCoverageResolution, DefensiveCoverageState } from './DefensiveCoverages'
export { detectDefensiveThreat, resolveDefensiveReaction, DEFENSIVE_REACTION_RULES_V1 } from './DefensiveReactions'
export type { DefensiveReaction, DefensiveReactionPhase, DefensiveThreat, DefensiveThreatType } from './DefensiveReactions'
export { calculateBlockCreditProbability, calculateStealCreditProbability } from './DefensiveAttribution'
export { createDefaultTacticalPlan, PICK_AND_ROLL_COVERAGE_OPTIONS, TACTICAL_DEFENSE_OPTIONS, validateTacticalPlan } from './tactics/MatchTacticalPlan'
export { applyTacticalPlanChange, calculateTacticalPlanAtEvents } from './coaching/MatchCoachingState'
export { applyManualSubstitutions } from './coaching/ManualSubstitutions'
export { applyPaceToPossessionDuration, applyShotProfile, calculateTacticalDefenseModifier, spatialShotAttemptWeight, tacticalShotFactor, tacticalUsageWeight } from './tactics/TacticalEffects'
export { calculateAssistProbability, selectAssister, ASSIST_RESOLUTION_V1 } from './AssistResolution'
export { calculateOffensiveReboundProbability, selectRebounder, REBOUND_RESOLUTION_V1 } from './ReboundResolution'
export { calculateDefensivePressure, calculateTurnoverProbability, TURNOVER_RESOLUTION_V1 } from './TurnoverResolution'
export { advanceFatigue, calculateFatigueAdjustedTeamStrength, calculateFatigueAtEvents, clampFatigue, createInitialFatigue, FATIGUE_GAIN_PER_SECOND, FATIGUE_RECOVERY_PER_SECOND, MAX_FATIGUE, MAX_FATIGUE_STRENGTH_PENALTY } from './Fatigue'
export { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE } from './rotation/RotationController'
export { simulateMatchWithRotations } from './rotation/MatchRotationRunner'
export { createDefaultRotationPlan, createRotationPlanFromMinutes } from './rotation/RotationPlan'
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
export type { PlayerMatchStats, TeamMatchStats } from './PlayerMatchStats'
export type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
export type { BallSpatialState, SpatialPlayerState, SpatialPossessionView, SpatialState } from './SpatialState'
export type { PlayerMatchup } from './Matchups'
export type { MatchTacticalPlan, PickAndRollCoverage, TacticalLevel } from './tactics/MatchTacticalPlan'
export type { MatchCoachingState, TeamMatchCoachingState, TacticalPlanChange } from './coaching/MatchCoachingState'
export type { ManualSubstitution, ManualSubstitutionBatch } from './coaching/ManualSubstitutions'
export type { AssistContext } from './AssistResolution'
export type { ReboundContext, ReboundSpatialContext } from './ReboundResolution'
export type { TurnoverContext } from './TurnoverResolution'
export type { ShotAttemptContext, ShotLocation, ShotZone } from './ShotResolution'
export type { FatigueByPlayerId } from './Fatigue'
export type { ApplyDueRotationsResult, RotationControllerState } from './rotation/RotationController'
export type { SimulateMatchWithRotationsOptions } from './rotation/MatchRotationRunner'
export type { RotationInstruction, TeamRotationPlan } from './rotation/RotationPlan'
