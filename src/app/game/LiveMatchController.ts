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
  /** A resolved sporting boundary for the presentation layer; it does not expose MatchSession. */
  public advanceOneStepWithSnapshots(): LiveMatchStep {
    const before = this.snapshot()
    const attackingTeamId = this.session.state.attackingTeamId
    const after = this.advanceOneStep()
    return { before, after, attackingTeamId, endAttackingTeamId: this.session.state.attackingTeamId }
  }
  public applyTactics(teamId: MatchSession['state']['homeTeamId'], tacticalPlan: MatchTacticalPlan): MatchSimulation { this.session = applyTacticalPlanChange(this.session, { teamId, tacticalPlan }); return this.snapshot() }
  public applyManualSubstitutions(teamId: MatchSession['state']['homeTeamId'], substitutions: readonly ManualSubstitution[]): MatchSimulation {
    const state = this.session.state
    if (state.isComplete) return this.snapshot()
    const isHome = teamId === state.homeTeamId
    const isAway = teamId === state.awayTeamId
    if (isHome || isAway) {
      const squad = isHome ? state.squads.home : state.squads.away
      let draft = [...(isHome ? state.activeLineups.home : state.activeLineups.away)]
      for (const substitution of substitutions) {
        if (!draft.includes(substitution.playerOutId) || !squad.includes(substitution.playerInId) || draft.includes(substitution.playerInId)) return this.snapshot()
        draft = draft.map((playerId) => playerId === substitution.playerOutId ? substitution.playerInId : playerId)
      }
    }
    this.session = applyManualSubstitutions(this.session, { teamId, substitutions })
    return this.snapshot()
  }
  public applySubstitution(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number], playerInId: MatchSession['state']['activeLineups']['home'][number]): MatchSimulation { return this.applyManualSubstitutions(teamId, [{ playerOutId, playerInId }]) }
  public replacementCandidates(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number]): readonly MatchSession['state']['activeLineups']['home'][number][] {
    const state = this.session.state
    if (state.isComplete || (teamId !== state.homeTeamId && teamId !== state.awayTeamId)) return []
    const active = teamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
    const squad = teamId === state.homeTeamId ? state.squads.home : state.squads.away
    return active.includes(playerOutId) ? squad.filter((playerId) => !active.includes(playerId)) : []
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
