import { applyManualSubstitutions, applyTacticalPlanChange, createMatchSession, stepMatchSession, toMatchSimulation, type ManualSubstitution, type MatchSimulation, type MatchTacticalPlan, type MatchSession } from '@/engine/match'
import { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE, type RotationControllerState, type SimulateMatchWithRotationsOptions } from '@/engine/match'

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
  public applyTactics(teamId: MatchSession['state']['homeTeamId'], tacticalPlan: MatchTacticalPlan): MatchSimulation { this.session = applyTacticalPlanChange(this.session, { teamId, tacticalPlan }); return this.snapshot() }
  public applyManualSubstitutions(teamId: MatchSession['state']['homeTeamId'], substitutions: readonly ManualSubstitution[]): MatchSimulation { this.session = applyManualSubstitutions(this.session, { teamId, substitutions }); return this.snapshot() }
  public skipToEnd(): MatchSimulation { while (!this.session.state.isComplete) this.advanceOneStep(); return this.snapshot() }
  public snapshot(): MatchSimulation { const state = this.session.state; return state.isComplete ? toMatchSimulation(this.session) : { gameId: state.gameId, homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.initialLineups, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } } }
  public get isComplete(): boolean { return this.session.state.isComplete }
  public get currentPlans() { return this.session.state.coachingState }
}
