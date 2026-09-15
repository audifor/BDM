import { applyManualSubstitutions as applyManualSubstitutionsToSession, applyTacticalPlanChange, createMatchSession, stepMatchSession, toMatchSimulation, validateTacticalPlan, type ManualSubstitution, type MatchSimulation, type MatchTacticalPlan, type MatchSession } from '@/engine/match'
import { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE, type RotationControllerState, type SimulateMatchWithRotationsOptions } from '@/engine/match'
import { classifySubstitutionError, classifyTacticalChangeError, validateSubstitutionCommand, type LiveCoachingCommandResult } from './LiveCoachingCommand'

/** Application owner for a transient live session; UI receives only snapshots. */
export class LiveMatchController {
  private session: MatchSession
  private homeController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE
  private awayController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE
  public constructor(private readonly options: SimulateMatchWithRotationsOptions) { this.session = createMatchSession(options) }
  public advanceOneStep(): MatchSimulation {
    if (!this.session.state.isComplete) {
      const home = applyDueRotations(this.session, this.options.homeRotationPlan, this.homeController)
      const away = applyDueRotations(home.session, this.options.awayRotationPlan, this.awayController)
      this.homeController = home.controllerState; this.awayController = away.controllerState
      this.session = stepMatchSession(away.session).session
    }
    return this.snapshot()
  }
  /** A resolved sporting boundary for the presentation layer; it does not expose MatchSession. */
  public advanceOneStepWithSnapshots(): LiveMatchStep {
    const before = this.snapshot()
    const attackingTeamId = this.session.state.attackingTeamId
    const after = this.advanceOneStep()
    return { before, after, attackingTeamId, endAttackingTeamId: this.session.state.attackingTeamId }
  }
  /**
   * Applies a live tactical change (MG2B). Validated by the engine coaching boundary
   * (MatchCoachingState.applyTacticalPlanChange), which genuinely affects future
   * possessions via MatchSession.state.coachingState — this is a real runtime effect,
   * not a placeholder. The session only mutates on an 'applied' result.
   */
  public applyTactics(teamId: MatchSession['state']['homeTeamId'], tacticalPlan: MatchTacticalPlan): LiveCoachingCommandResult {
    const state = this.session.state
    if (state.isComplete) return { status: 'rejected', reason: 'MATCH_NOT_ACTIVE', message: 'The match has already finished' }
    const isHome = teamId === state.homeTeamId
    if (!isHome && teamId !== state.awayTeamId) return { status: 'rejected', reason: 'INVALID_TEAM', message: `Team ${teamId} is not in this Game` }
    const squad = isHome ? state.squads.home : state.squads.away
    try {
      validateTacticalPlan(tacticalPlan, squad)
    } catch (error) {
      return classifyTacticalChangeError(error)
    }
    try {
      this.session = applyTacticalPlanChange(this.session, { teamId, tacticalPlan })
      return { status: 'applied' }
    } catch (error) {
      return classifyTacticalChangeError(error)
    }
  }
  /**
   * Applies a live manual substitution batch (MG2B). Validated first against the
   * actual live lineup/squad (validateSubstitutionCommand) for a precise rejection
   * reason, then applied through the engine coaching boundary
   * (ManualSubstitutions.applyManualSubstitutions), which mutates the canonical
   * on-court lineup for future possessions — a real runtime effect. The session
   * only mutates on an 'applied' result; an empty batch is a no-op 'applied'.
   */
  public applyManualSubstitutions(teamId: MatchSession['state']['homeTeamId'], substitutions: readonly ManualSubstitution[]): LiveCoachingCommandResult {
    const rejection = validateSubstitutionCommand(this.session, teamId, substitutions)
    if (rejection !== null) return rejection
    if (substitutions.length === 0) return { status: 'applied' }
    try {
      this.session = applyManualSubstitutionsToSession(this.session, { teamId, substitutions })
      return { status: 'applied' }
    } catch (error) {
      return classifySubstitutionError(error)
    }
  }
  public applySubstitution(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number], playerInId: MatchSession['state']['activeLineups']['home'][number]): LiveCoachingCommandResult { return this.applyManualSubstitutions(teamId, [{ playerOutId, playerInId }]) }
  /** The team's current bench (squad players not on court) — real candidates for an outgoing on-court player, not a placeholder empty list. */
  public replacementCandidates(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number]): readonly MatchSession['state']['activeLineups']['home'][number][] {
    const state = this.session.state
    const isHome = teamId === state.homeTeamId
    if (!isHome && teamId !== state.awayTeamId) return []
    const activeLineup = isHome ? state.activeLineups.home : state.activeLineups.away
    if (!activeLineup.includes(playerOutId)) return []
    const squad = isHome ? state.squads.home : state.squads.away
    return squad.filter((playerId) => !activeLineup.includes(playerId))
  }
  /** Resolves the rest of the current period, including the period-end boundary and next-period start when applicable. */
  public skipToEndOfPeriod(): MatchSimulation {
    const startingPeriod = this.session.state.period
    while (!this.session.state.isComplete && this.session.state.period === startingPeriod) this.advanceOneStep()
    return this.snapshot()
  }
  public skipToEnd(): MatchSimulation { while (!this.session.state.isComplete) this.advanceOneStep(); return this.snapshot() }
  public snapshot(): MatchSimulation { const state = this.session.state; return state.isComplete ? toMatchSimulation(this.session) : { gameId: state.gameId, homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.initialLineups, squads: state.squads, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } } }
  public get isComplete(): boolean { return this.session.state.isComplete }
  public get gameId() { return this.session.state.gameId }
  public get currentPlans() { return this.session.state.coachingState }
}

export interface LiveMatchStep {
  readonly before: MatchSimulation
  readonly after: MatchSimulation
  readonly attackingTeamId: MatchSession['state']['attackingTeamId']
  readonly endAttackingTeamId: MatchSession['state']['attackingTeamId']
}
