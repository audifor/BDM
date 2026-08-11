import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchEvent, MatchSession } from '../MatchEngine'
import { validateTacticalPlan, type MatchTacticalPlan } from '../tactics/MatchTacticalPlan'

export interface TeamMatchCoachingState { readonly currentTacticalPlan: MatchTacticalPlan }
export interface MatchCoachingState { readonly home: TeamMatchCoachingState; readonly away: TeamMatchCoachingState }
export interface TacticalPlanChange { readonly teamId: TeamId; readonly tacticalPlan: MatchTacticalPlan }

export function applyTacticalPlanChange(session: MatchSession, change: TacticalPlanChange): MatchSession {
  const state = session.state
  if (state.isComplete) throw new Error('Cannot change tactics in a completed MatchSession')
  const isHome = change.teamId === state.homeTeamId
  if (!isHome && change.teamId !== state.awayTeamId) throw new Error('Tactical change Team is not in this Game')
  const squad = isHome ? state.squads.home : state.squads.away
  validateTacticalPlan(change.tacticalPlan, squad)
  const previousPlan = isHome ? state.coachingState.home.currentTacticalPlan : state.coachingState.away.currentTacticalPlan
  if (samePlan(previousPlan, change.tacticalPlan)) return session
  const event: MatchEvent = { sequence: state.nextSequence, period: state.period, clockSecondsRemaining: state.clockSecondsRemaining, type: 'tacticalChange', teamId: change.teamId, previousPlan: clonePlan(previousPlan), newPlan: clonePlan(change.tacticalPlan), homeScore: state.homeScore, awayScore: state.awayScore }
  const coachingState: MatchCoachingState = isHome
    ? { home: { currentTacticalPlan: clonePlan(change.tacticalPlan) }, away: state.coachingState.away }
    : { home: state.coachingState.home, away: { currentTacticalPlan: clonePlan(change.tacticalPlan) } }
  return { ...session, state: { ...state, coachingState, nextSequence: state.nextSequence + 1, events: [...state.events, event] } }
}

export function calculateTacticalPlanAtEvents(initialPlan: MatchTacticalPlan, teamId: TeamId, events: readonly MatchEvent[]): MatchTacticalPlan {
  return events.reduce((plan, event) => event.type === 'tacticalChange' && event.teamId === teamId ? event.newPlan : plan, initialPlan)
}

export function clonePlan(plan: MatchTacticalPlan): MatchTacticalPlan { return { pace: plan.pace, shotProfile: { ...plan.shotProfile }, defense: { ...plan.defense }, ...(plan.featuredPlayerId === undefined ? {} : { featuredPlayerId: plan.featuredPlayerId as PlayerId }) } }
function samePlan(left: MatchTacticalPlan, right: MatchTacticalPlan): boolean { return left.pace === right.pace && left.shotProfile.rim === right.shotProfile.rim && left.shotProfile.midRange === right.shotProfile.midRange && left.shotProfile.threePoint === right.shotProfile.threePoint && left.defense.interior === right.defense.interior && left.defense.perimeter === right.defense.perimeter && left.featuredPlayerId === right.featuredPlayerId }
