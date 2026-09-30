import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import { nearestSidelineSpot } from '../ball/BallGeometry'
import { endPossession } from '../possession'
import { activePossession, type ContactKind, type FoulRecord, type FoulResolution, type FoulType, type MatchState } from '../state'
import { bonusStateFor, resolveFoulRules } from './FoulRules'
import { startFreeThrowSequence } from './FreeThrows'

export interface FoulInput {
  readonly offenderId: PlayerId
  readonly victimId: PlayerId
  readonly type: FoulType
  readonly contact: ContactKind
  readonly severity: number
  /** Committed by the team that has the ball. */
  readonly offensive: boolean
  /** A shooting foul: the shot's value, whether it will go in (AND-ONE) and whether the ball is already in the air. */
  readonly shot?: { readonly points: 2 | 3; readonly goesIn: boolean; readonly inFlight: boolean }
}

export interface FoulOutcome {
  readonly state: MatchState
  readonly record: FoulRecord | null
}

/**
 * Commits a personal foul: counters, team-foul / bonus accounting, the resulting dead-ball state and the event.
 * Everything that follows (a throw-in, a free-throw sequence, a turnover) is decided here from the rules, not by the caller.
 */
export function commitFoul(state: MatchState, input: FoulInput): FoulOutcome {
  if (state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND' || state.isComplete) return { state, record: null }
  const offender = state.players.find((player) => player.playerId === input.offenderId)
  const victim = state.players.find((player) => player.playerId === input.victimId)
  if (!offender || !victim || !offender.active || !victim.active) return { state, record: null }
  const foulRules = resolveFoulRules(state.clockRules)
  const possession = activePossession(state)

  const personalAfter = (state.fouls.personal[offender.playerId] ?? 0) + 1
  const teamAfter = (state.fouls.teamPeriod[offender.teamId] ?? 0) + (input.offensive ? 0 : 1)
  const fouledOut = personalAfter >= foulRules.personalFoulLimit && !state.fouls.fouledOut.includes(offender.playerId)
  const bonus = input.offensive || input.shot !== undefined ? 'NONE' as const : bonusStateFor(foulRules, teamAfter)

  let resolution: FoulResolution
  let freeThrows = 0
  if (input.offensive) resolution = 'OFFENSIVE_TURNOVER'
  else if (input.shot !== undefined) {
    resolution = input.shot.goesIn ? 'AND_ONE' : 'FREE_THROWS'
    freeThrows = input.shot.goesIn ? 1 : input.shot.points
  } else if (bonus === 'PENALTY') { resolution = 'BONUS_FREE_THROWS'; freeThrows = 2 }
  else if (bonus === 'ONE_AND_ONE') { resolution = 'BONUS_FREE_THROWS'; freeThrows = 1 }
  else resolution = 'INBOUND'

  const record: FoulRecord = {
    id: `foul-${state.fouls.nextSequence}`, t: state.t, period: state.period, ...(possession === undefined ? {} : { possessionId: possession.id }),
    offenderId: offender.playerId, victimId: victim.playerId, offenderTeamId: offender.teamId, type: input.type, contact: input.contact,
    severity: Number(input.severity.toFixed(3)), offensive: input.offensive, resolution, freeThrows, bonus, teamFoulsAfter: teamAfter, personalFoulsAfter: personalAfter,
  }
  let next: MatchState = {
    ...state,
    fouls: {
      personal: { ...state.fouls.personal, [offender.playerId]: personalAfter },
      teamPeriod: { ...state.fouls.teamPeriod, [offender.teamId]: teamAfter },
      fouledOut: fouledOut ? [...state.fouls.fouledOut, offender.playerId] : state.fouls.fouledOut,
      nextSequence: state.fouls.nextSequence + 1,
    },
    // The whistle stops both clocks.
    clock: { gameRunning: false, shotRunning: false },
  }
  next = emitEvent(next, 'foul', {
    ...(possession === undefined ? {} : { possessionId: possession.id }), teamId: offender.teamId, playerId: offender.playerId, victimPlayerId: victim.playerId,
    foulType: input.type, contactKind: input.contact, severity: record.severity, foulResolution: resolution, freeThrowsAwarded: freeThrows,
    personalFouls: personalAfter, teamFouls: teamAfter,
  })
  if (fouledOut) next = emitEvent(next, 'foulOut', { teamId: offender.teamId, playerId: offender.playerId, personalFouls: personalAfter })

  // A shooter fouled in the act keeps shooting: the foul is settled when the ball arrives (AND-ONE if it goes in).
  if (input.shot?.inFlight === true) return { state: next, record }

  const position = { ...state.ball.position }
  const restartTeamId = input.offensive ? victim.teamId : victim.teamId
  const spot = nearestSidelineSpot(position, state.court)
  next = { ...next, shotClockTenths: null, ball: { kind: 'DEAD', reason: 'foul', position, heightMeters: 0.9, restartTeamId, restartSpot: spot, foulId: record.id } }
  if (input.offensive) {
    next = emitEvent(next, 'turnover', { ...(possession === undefined ? {} : { possessionId: possession.id }), teamId: offender.teamId, playerId: offender.playerId, turnoverType: 'OFFENSIVE_FOUL' })
    if (possession !== undefined && possession.endReason === undefined) next = endPossession(next, 'turnover')
  }
  next = emitEvent(next, 'ballDead', { teamId: restartTeamId, ballReason: 'foul' })
  if (freeThrows > 0) {
    next = startFreeThrowSequence(next, {
      foulId: record.id, shooterId: victim.playerId, total: freeThrows, oneAndOne: bonus === 'ONE_AND_ONE',
      reason: bonus === 'PENALTY' ? 'PENALTY' : bonus === 'ONE_AND_ONE' ? 'ONE_AND_ONE' : 'SHOOTING',
    })
  }
  return { state: next, record }
}

/** Resets the period team-foul counters when a regulation period begins (overtime continues the last period's count). */
export function resetTeamFoulsForPeriod(state: MatchState, period: number): MatchState {
  if (period > state.clockRules.periodCount) return state
  return { ...state, fouls: { ...state.fouls, teamPeriod: {} } }
}
