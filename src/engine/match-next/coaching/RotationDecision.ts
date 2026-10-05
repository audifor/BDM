import type { BasketballPosition } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { MatchState, MatchNextEvent } from '../state'
import { isSubstitutionOpportunity } from '../clockRules'
import { resolveFoulRules } from '../rules/FoulRules'
import { appendEvent } from '../execution/EventLog'

export interface CoachSubstitutionProposal {
  readonly teamId: TeamId
  readonly playerOutId: PlayerId
  readonly playerInId: PlayerId
  readonly reason: string
  readonly expectedMinutes: number
  /** A player who fouled out leaves whether or not a bench player fits his role: the rule outranks the rotation plan. */
  readonly forced?: boolean
}

const BASE_THRESHOLD = 3.1
const MINUTE_PRESSURE_PER_MINUTE = 2.15
/** Minutes past the period target a coach tolerates before the minute plan alone asks for the substitution. */
const MINUTE_TOLERANCE = 0.35

/** Chooses at most one legal substitution per team at a competition-defined dead-ball opportunity. */
export function decideRotationSubstitutions(state: MatchState): readonly CoachSubstitutionProposal[] {
  if (state.ball.kind !== 'DEAD' || state.isComplete) return []
  const proposals: CoachSubstitutionProposal[] = []
  for (const teamId of [state.homeTeamId, state.awayTeamId]) {
    if (!isTeamSubstitutionOpportunity(state, teamId)) continue
    // A player who has fouled out has to leave at the first opportunity, whatever the rotation plan says (BT3G).
    const chosen = forcedFoulOutSubstitution(state, teamId) ?? decideForTeam(state, teamId)
    if (chosen !== undefined) proposals.push(chosen)
  }
  return proposals
}

function forcedFoulOutSubstitution(state: MatchState, teamId: TeamId): CoachSubstitutionProposal | undefined {
  const outgoing = state.players.find((player) => player.active && player.teamId === teamId && state.fouls.fouledOut.includes(player.playerId))
  if (outgoing === undefined) return undefined
  const bench = state.players.filter((player) => !player.active && player.teamId === teamId && !state.fouls.fouledOut.includes(player.playerId))
  if (bench.length === 0) return undefined
  const plan = teamId === state.homeTeamId ? state.coachingPlans?.home : state.coachingPlans?.away
  const role = plan?.roleByPlayerId[outgoing.playerId]
  const ranked = bench
    .map((player) => ({ player, fit: (plan === undefined ? 0 : roleFit(plan, player.playerId, role)) + (player.primaryPosition === outgoing.primaryPosition ? 8 : 0) }))
    .sort((left, right) => right.fit - left.fit || String(left.player.playerId).localeCompare(String(right.player.playerId)))
  return { teamId, playerOutId: outgoing.playerId, playerInId: ranked[0]!.player.playerId, reason: 'fouled out', expectedMinutes: 0, forced: true }
}

/** The engine command is the only mutation boundary for active-lineup changes. */
export function applyCoachSubstitutions(state: MatchState, proposals: readonly CoachSubstitutionProposal[]): MatchState {
  if (proposals.length === 0) return state
  if (state.ball.kind !== 'DEAD' || state.isComplete || proposals.some((proposal) => !isTeamSubstitutionOpportunity(state, proposal.teamId))) throw new Error('Coach substitutions require a legal competition substitution opportunity')
  let next = state
  for (const proposal of proposals) next = applyOne(next, proposal)
  return next
}

function isTeamSubstitutionOpportunity(state: MatchState, teamId: TeamId): boolean {
  return state.ball.kind === 'DEAD' && isSubstitutionOpportunity(
    state.ball.reason, state.period, state.gameClockTenths, state.clockRules, teamId, state.ball.restartTeamId,
  )
}

function decideForTeam(state: MatchState, teamId: TeamId): CoachSubstitutionProposal | undefined {
  const plan = teamId === state.homeTeamId ? state.coachingPlans?.home : state.coachingPlans?.away
  if (plan === undefined) return undefined
  const active = state.players.filter((player) => player.active && player.teamId === teamId)
  const bench = state.players.filter((player) => !player.active && player.teamId === teamId && !state.fouls.fouledOut.includes(player.playerId))
  if (active.length !== 5 || bench.length === 0) return undefined
  const explicit = plan.rotationInstructions.find((instruction) => instruction.period === state.period
    && state.gameClockTenths <= instruction.clockThresholdSeconds * 10
    && active.some((player) => player.playerId === instruction.playerOutId)
    && bench.some((player) => player.playerId === instruction.playerInId))
  if (explicit !== undefined) {
    const outgoing = active.find((player) => player.playerId === explicit.playerOutId)!
    const role = plan.roleByPlayerId[outgoing.playerId]
    const incoming = bench.find((player) => player.playerId === explicit.playerInId)!
    if (roleCompatible(incoming.primaryPosition, incoming.secondaryPositions, role) || roleFit(plan, incoming.playerId, role) >= 46) {
      return { teamId, playerOutId: explicit.playerOutId, playerInId: explicit.playerInId, reason: 'saved rotation instruction at its requested game-clock window', expectedMinutes: plan.minutesByPeriod[explicit.playerOutId]?.[state.period - 1] ?? 0 }
    }
  }
  const periodIndex = state.period - 1
  const closeLateGame = state.period >= state.clockRules.periodCount && state.gameClockTenths <= 1800
    && Math.abs(state.score.home - state.score.away) <= 5
  const lateBlowout = state.period >= state.clockRules.periodCount && state.gameClockTenths <= 600
    && Math.abs(state.score.home - state.score.away) >= 18
  const plannedPeriodCount = Math.max(0, ...Object.values(plan.minutesByPeriod).map((minutes) => minutes.length))
  const expectedMinutes = (playerId: PlayerId) => plan.minutesByPeriod[playerId]?.[periodIndex]
    ?? (state.period > state.clockRules.periodCount && periodIndex >= plannedPeriodCount ? state.clockRules.overtimeSeconds / 60 : 0)
  let best: { readonly proposal: CoachSubstitutionProposal; readonly pressure: number; readonly candidateFit: number } | undefined

  for (const outgoing of active) {
    const playerTargetMinutes = expectedMinutes(outgoing.playerId)
    const playedMinutes = (state.periodCourtTimeTenthsByPlayerId?.[outgoing.playerId] ?? 0) / 600
    // BT7: minute pressure reaches the substitution threshold when the player is MINUTE_TOLERANCE past his period target. It used to
    // start ramping only there and needed ~1.4 more minutes, so an 8-of-10 target fired at 9.8 minutes: the plan's ~32-minute starters
    // played 40 because the trigger came after the quarter was over.
    const overTarget = Math.max(0, playedMinutes - playerTargetMinutes - MINUTE_TOLERANCE + BASE_THRESHOLD / MINUTE_PRESSURE_PER_MINUTE)
    const fatiguePressure = Math.max(0, outgoing.fatigue - 35) * 0.105 / plan.fatigueTolerance
    const minutePressure = overTarget * MINUTE_PRESSURE_PER_MINUTE
    // Foul trouble (BT4): a player one foul from disqualification is taken out before he is lost for the rest of the game.
    const foulLimit = resolveFoulRules(state.clockRules).personalFoulLimit
    const foulTrouble = Math.max(0, (state.fouls.personal[outgoing.playerId] ?? 0) - (foulLimit - 2)) * 3.6
    const contextAdjustment = (closeLateGame ? 1.8 : 0) + (lateBlowout ? -1.35 : 0)
    const pressure = fatiguePressure + minutePressure + foulTrouble
    const role = plan.roleByPlayerId[outgoing.playerId]
    const replacement = bench
      .map((player) => ({
        player,
        target: expectedMinutes(player.playerId),
        fit: roleFit(plan, player.playerId, role),
      }))
      .filter((item) => item.target > (state.periodCourtTimeTenthsByPlayerId?.[item.player.playerId] ?? 0) / 600 + 0.25)
      .filter((item) => roleCompatible(item.player.primaryPosition, item.player.secondaryPositions, role) || item.fit >= 46)
      .sort((left, right) => right.fit - left.fit || right.target - left.target || String(left.player.playerId).localeCompare(String(right.player.playerId)))[0]
    if (replacement === undefined) continue
    const qualityPenalty = Math.max(-1, (roleFit(plan, outgoing.playerId, role) - replacement.fit) * 0.035)
    const threshold = BASE_THRESHOLD + qualityPenalty + contextAdjustment
    if (pressure < threshold) continue
    // The reason names the pressure that actually dominated (the text is part of the presentation contract).
    const reason = foulTrouble >= Math.max(fatiguePressure, minutePressure)
      ? `foul trouble: ${state.fouls.personal[outgoing.playerId] ?? 0} of ${foulLimit} personal fouls`
      : fatiguePressure >= minutePressure
        ? `fatigue ${Math.round(outgoing.fatigue)} with ${playedMinutes.toFixed(1)}/${playerTargetMinutes} target minutes`
        : `${playedMinutes.toFixed(1)} minutes reaches the ${playerTargetMinutes}-minute period target`
    const candidate = { proposal: { teamId, playerOutId: outgoing.playerId, playerInId: replacement.player.playerId, reason, expectedMinutes: playerTargetMinutes }, pressure, candidateFit: replacement.fit }
    if (best === undefined || candidate.pressure > best.pressure || (candidate.pressure === best.pressure && candidate.candidateFit > best.candidateFit)
      || (candidate.pressure === best.pressure && candidate.candidateFit === best.candidateFit && String(candidate.proposal.playerOutId).localeCompare(String(best.proposal.playerOutId)) < 0)) best = candidate
  }
  return best?.proposal
}

function applyOne(state: MatchState, proposal: CoachSubstitutionProposal): MatchState {
  if (proposal.teamId !== state.homeTeamId && proposal.teamId !== state.awayTeamId) throw new Error('Substitution team is not participating in this game')
  if (proposal.playerOutId === proposal.playerInId) throw new Error('Substitution players must differ')
  const outgoing = state.players.find((player) => player.playerId === proposal.playerOutId)
  const incoming = state.players.find((player) => player.playerId === proposal.playerInId)
  if (outgoing === undefined || incoming === undefined || outgoing.teamId !== proposal.teamId || incoming.teamId !== proposal.teamId) throw new Error('Substitution players must belong to the same game team')
  if (!outgoing.active || incoming.active) throw new Error('Substitution requires one active player out and one bench player in')
  const current = state.players.filter((player) => player.active && player.teamId === proposal.teamId)
  if (current.length !== 5 || current.some((player) => player.playerId === proposal.playerInId)) throw new Error('Substitution would create an illegal active lineup')
  const plan = proposal.teamId === state.homeTeamId ? state.coachingPlans?.home : state.coachingPlans?.away
  if (plan === undefined) throw new Error('Substitution requires the team coaching plan')
  const role = plan.roleByPlayerId[proposal.playerOutId]
  if (proposal.forced !== true && !roleCompatible(incoming.primaryPosition, incoming.secondaryPositions, role) && roleFit(plan, incoming.playerId, role) < 46) throw new Error(`Replacement ${incoming.playerId} is not a valid ${role ?? 'basketball'} role fit`)
  const players = state.players.map((player) => {
    if (player.playerId === outgoing.playerId) return { ...player, active: false }
    if (player.playerId === incoming.playerId) return { ...player, active: true, position: { ...outgoing.position }, velocity: { x: 0, y: 0 }, facing: { ...outgoing.facing } }
    return player
  })
  const cleaned: MatchState = {
    ...state,
    players,
    responsibilities: state.responsibilities.filter((item) => item.playerId !== outgoing.playerId),
    decisions: state.decisions.filter((item) => item.playerId !== outgoing.playerId),
    movementIntents: state.movementIntents.filter((item) => item.playerId !== outgoing.playerId),
    // A structure that still names the man who just left would send players after someone who is no longer on the court:
    // it is rebuilt from the new five on the next reconcile (the substitute takes over the same spot and matchups).
    defensiveStructure: state.defensiveStructure?.assignments.some((item) => item.defenderPlayerId === outgoing.playerId || item.attackerPlayerId === outgoing.playerId) ? null : state.defensiveStructure,
    offensiveStructure: state.offensiveStructure?.assignments.some((item) => item.playerId === outgoing.playerId) ? null : state.offensiveStructure,
  }
  return appendSubstitutionEvent(cleaned, proposal)
}

function appendSubstitutionEvent(state: MatchState, proposal: CoachSubstitutionProposal): MatchState {
  const event: MatchNextEvent = {
    sequence: state.nextEventSequence,
    t: state.t,
    period: state.period,
    gameClockTenths: state.gameClockTenths,
    type: 'substitution',
    teamId: proposal.teamId,
    playerId: proposal.playerInId,
    outgoingPlayerId: proposal.playerOutId,
    substitutionReason: proposal.reason,
    expectedMinutes: proposal.expectedMinutes,
  }
  return { ...state, events: appendEvent(state, event), nextEventSequence: state.nextEventSequence + 1 }
}

function roleFit(plan: NonNullable<MatchState['coachingPlans']>['home'], playerId: PlayerId, role: BasketballPosition | undefined): number {
  return role === undefined ? 0 : plan.roleFitByPlayerId[playerId]?.[role] ?? 0
}

function roleCompatible(primary: BasketballPosition, secondary: readonly BasketballPosition[] | undefined, role: BasketballPosition | undefined): boolean {
  return role === undefined || primary === role || secondary?.includes(role) === true
}
