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
export type { ApplyDueRotationsResult, RotationControllerState } from './rotation/RotationController'
export type { SimulateMatchWithRotationsOptions } from './rotation/MatchRotationRunner'
export type { RotationInstruction, TeamRotationPlan } from './rotation/RotationPlan'
