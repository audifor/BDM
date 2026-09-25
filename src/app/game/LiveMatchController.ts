import { applyManualSubstitutions as applyManualSubstitutionsToSession, applyTacticalPlanChange, createMatchSession, stepMatchSession, toMatchSimulation, type ManualSubstitution, type MatchSimulation, type MatchTacticalPlan, type MatchSession, type SpatialState } from '@/engine/match'
import { applyDueRotations, INITIAL_ROTATION_CONTROLLER_STATE, type RotationControllerState, type SimulateMatchWithRotationsOptions } from '@/engine/match'

/** Application owner for a transient live session; UI receives only snapshots. */
export class LiveMatchController {
  private session: MatchSession
  private homeController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE
  private awayController: RotationControllerState = INITIAL_ROTATION_CONTROLLER_STATE
  public constructor(private readonly options: SimulateMatchWithRotationsOptions & { readonly matchSeed: number }) { this.session = createMatchSession(options) }
  /** Seed retained for this live run so it can be recorded or reused for replay/debug. */
  public get matchSeed(): number { return this.options.matchSeed }
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
    const startPeriod = this.session.state.period
    const startClockSeconds = this.session.state.clockSecondsRemaining
    const beforeSpatial = this.session.state.spatial
    const attackingTeamId = this.session.state.attackingTeamId
    const after = this.advanceOneStep()
    return { before, after, startPeriod, startClockSeconds, endPeriod: this.session.state.period, endClockSeconds: this.session.state.clockSecondsRemaining, beforeSpatial, afterSpatial: this.session.state.spatial, attackingTeamId, endAttackingTeamId: this.session.state.attackingTeamId }
  }
  /** Read-only canonical geometry for the visual bridge; the view cannot write it back. */
  public spatialSnapshot(): SpatialState { return this.session.state.spatial }
  public get attackingTeamId(): MatchSession['state']['attackingTeamId'] { return this.session.state.attackingTeamId }
  /** Applies validated tactics to the session state used by the next simulation step. */
  public applyTactics(teamId: MatchSession['state']['homeTeamId'], tacticalPlan: MatchTacticalPlan): MatchSimulation {
    this.session = applyTacticalPlanChange(this.session, { teamId, tacticalPlan })
    return this.snapshot()
  }
  /** Applies a validated substitution batch atomically to the runtime active five. */
  public applyManualSubstitutions(teamId: MatchSession['state']['homeTeamId'], substitutions: readonly ManualSubstitution[]): MatchSimulation {
    this.session = applyManualSubstitutionsToSession(this.session, { teamId, substitutions })
    return this.snapshot()
  }
  public applySubstitution(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number], playerInId: MatchSession['state']['activeLineups']['home'][number]): MatchSimulation { return this.applyManualSubstitutions(teamId, [{ playerOutId, playerInId }]) }
  public replacementCandidates(teamId: MatchSession['state']['homeTeamId'], playerOutId: MatchSession['state']['activeLineups']['home'][number]): readonly MatchSession['state']['activeLineups']['home'][number][] {
    const state = this.session.state
    if (state.isComplete) return []
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
  public snapshot(): MatchSimulation { const state = this.session.state; return state.isComplete ? toMatchSimulation(this.session) : { gameId: state.gameId, matchSeed: state.matchSeed, homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, lineups: state.initialLineups, squads: state.squads, events: state.events, finalScore: { home: state.homeScore, away: state.awayScore } } }
  public get isComplete(): boolean { return this.session.state.isComplete }
  public get gameId() { return this.session.state.gameId }
  public get currentPlans() { return this.session.state.coachingState }
  public get currentMatchups() { return this.session.state.defensiveMatchups }
  public get activeLineups() { return this.session.state.activeLineups }
}

export interface LiveMatchStep {
  readonly before: MatchSimulation
  readonly after: MatchSimulation
  readonly startPeriod: number
  readonly startClockSeconds: number
  readonly endPeriod: number
  readonly endClockSeconds: number
  readonly beforeSpatial: SpatialState
  readonly afterSpatial: SpatialState
  readonly attackingTeamId: MatchSession['state']['attackingTeamId']
  readonly endAttackingTeamId: MatchSession['state']['attackingTeamId']
}
