/**
 * BT3S: per-game statistics from the canonical event stream only (nothing is read from Phaser or from a side channel), plus
 * the rebound scrum and dead-ball lifecycle checks that need states. Used by the multi-seed soak and the tuning runs.
 */
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { distanceBetween } from '@/domain/court'
import type { MatchNextEvent, MatchState } from '@/engine/match-next'
import { ALLOWED_PLAY_TRANSITIONS } from '@/engine/match-next/rules/PlayState'
import { dist, preparedSetup } from '../bt2/economy'

export interface Bt3Game {
  readonly seed: number
  readonly complete: boolean
  readonly ticks: number
  readonly points: number
  readonly homePoints: number
  readonly awayPoints: number
  readonly possessions: number
  readonly meanPossessionSeconds: number
  readonly fga: number
  readonly fgMade: number
  readonly fta: number
  readonly ftMade: number
  readonly threeShare: number
  readonly rimShare: number
  readonly paintShare: number
  readonly midShare: number
  readonly deepShare: number
  readonly fouls: number
  readonly foulsByType: Readonly<Record<string, number>>
  readonly bonusFouls: number
  readonly andOnes: number
  readonly ftSequences: number
  readonly maxPersonalFouls: number
  readonly foulOuts: number
  readonly blocks: number
  readonly steals: number
  readonly stealKinds: Readonly<Record<string, number>>
  readonly deflections: number
  readonly stealAttempts: number
  readonly turnovers: number
  readonly turnoverTypes: Readonly<Record<string, number>>
  readonly outOfBounds: number
  readonly assists: number
  readonly oreb: number
  readonly dreb: number
  readonly putbacks: number
  readonly putbackMade: number
  readonly putbackMeanProbability: number
  readonly contacts: number
  readonly ppp: number
  readonly screens: number
  readonly drives: number
  readonly passes: number
  readonly meanShotProbability: number
  readonly meanContestScore: number
  readonly shotClockViolations: number
  readonly transitionStarts: number
  readonly transitionShots: number
  readonly ftaPerFga: number
  readonly illegalPlayTransitions: number
  readonly scrumWithin15: number
  readonly scrumSamples: number
  readonly scrumWithin06: number
  readonly playerLines: readonly { readonly playerId: string; readonly teamId: string; readonly points: number; readonly fga: number; readonly fgm: number; readonly fta: number; readonly ftm: number; readonly blocks: number; readonly steals: number; readonly turnovers: number; readonly assists: number; readonly oreb: number; readonly dreb: number; readonly fouls: number; readonly badPasses: number; readonly passes: number; readonly seconds: number }[]
}

const count = (events: readonly MatchNextEvent[], type: MatchNextEvent['type']): number => events.filter((event) => event.type === type).length

export function analyzeBt3(seed: number, state: MatchState, scrum: { readonly within: number; readonly samples: number; readonly tight: number }): Bt3Game {
  const events = state.events
  const shots = events.filter((event) => event.type === 'shotReleased')
  const shotShare = (lo: number, hi: number): number => shots.filter((event) => (event.shotDistanceMeters ?? 0) >= lo && (event.shotDistanceMeters ?? 0) < hi).length / Math.max(1, shots.length)
  const foulEvents = events.filter((event) => event.type === 'foul')
  const foulsByType: Record<string, number> = {}
  for (const event of foulEvents) foulsByType[event.foulType ?? '?'] = (foulsByType[event.foulType ?? '?'] ?? 0) + 1
  const turnoverTypes: Record<string, number> = {}
  for (const event of events) if (event.type === 'turnover') turnoverTypes[event.turnoverType ?? '?'] = (turnoverTypes[event.turnoverType ?? '?'] ?? 0) + 1
  const stealKinds: Record<string, number> = {}
  for (const event of events) if (event.type === 'steal') stealKinds[event.stealKind ?? '?'] = (stealKinds[event.stealKind ?? '?'] ?? 0) + 1
  const starts = events.filter((event) => event.type === 'possessionStart')
  const ends = new Map(events.filter((event) => event.type === 'possessionEnd').map((event) => [event.possessionId, event.t]))
  const durations = starts.flatMap((event) => (ends.has(event.possessionId) ? [(ends.get(event.possessionId)! - event.t) / 10] : []))
  // A putback is a shot within 2.5 s of an offensive rebound in the same possession.
  const orebEvents = events.filter((event) => event.type === 'reboundSecured' && event.reboundType === 'offensive')
  const putbackShots = shots.filter((shot) => orebEvents.some((rebound) => rebound.possessionId === shot.possessionId && String(rebound.playerId) === String(shot.shooterPlayerId) && shot.t >= rebound.t && shot.t - rebound.t <= 25))
  const putbacks = putbackShots.length
  const putbackMade = putbackShots.filter((shot) => events.some((event) => event.type === 'shotMade' && event.t >= shot.t && event.t <= shot.t + 8 && String(event.shooterPlayerId) === String(shot.shooterPlayerId))).length
  let illegal = 0
  for (const event of events) {
    if (event.type !== 'playStateChanged' || event.playPhase === undefined || event.previousPlayPhase === undefined) continue
    if (!ALLOWED_PLAY_TRANSITIONS[event.previousPlayPhase].includes(event.playPhase)) illegal += 1
  }
  const points = state.score.home + state.score.away
  const possessions = starts.length
  const fta = count(events, 'freeThrowMade') + count(events, 'freeThrowMissed')
  const playerIds = state.players.map((player) => String(player.playerId))
  const lines = playerIds.map((playerId) => {
    const mine = (event: MatchNextEvent, key: 'playerId' | 'shooterPlayerId' = 'playerId'): boolean => String(event[key]) === playerId
    const player = state.players.find((candidate) => String(candidate.playerId) === playerId)!
    const passes = events.filter((event) => event.type === 'passReleased' && String(event.passerPlayerId) === playerId).length
    return {
      playerId, teamId: String(player.teamId),
      points: events.filter((event) => (event.type === 'shotMade' || event.type === 'freeThrowMade') && mine(event, 'shooterPlayerId')).reduce((a, event) => a + (event.points ?? 0), 0),
      fga: events.filter((event) => event.type === 'shotReleased' && mine(event, 'shooterPlayerId')).length,
      fgm: events.filter((event) => event.type === 'shotMade' && mine(event, 'shooterPlayerId')).length,
      fta: events.filter((event) => (event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') && mine(event, 'shooterPlayerId')).length,
      ftm: events.filter((event) => event.type === 'freeThrowMade' && mine(event, 'shooterPlayerId')).length,
      blocks: events.filter((event) => event.type === 'shotBlocked' && mine(event)).length,
      steals: events.filter((event) => event.type === 'steal' && mine(event)).length,
      turnovers: events.filter((event) => event.type === 'turnover' && mine(event)).length,
      assists: events.filter((event) => event.type === 'assist' && mine(event)).length,
      oreb: events.filter((event) => event.type === 'reboundSecured' && event.reboundType === 'offensive' && mine(event)).length,
      dreb: events.filter((event) => event.type === 'reboundSecured' && event.reboundType === 'defensive' && mine(event)).length,
      fouls: events.filter((event) => event.type === 'foul' && mine(event)).length,
      badPasses: events.filter((event) => event.type === 'passBecameLoose' && String(event.passerPlayerId) === playerId).length,
      passes, seconds: (state.courtTimeTenthsByPlayerId?.[player.playerId] ?? 0) / 10,
    }
  })
  const withProb = shots.filter((event) => event.shotProbability !== undefined)
  const withContest = shots.filter((event) => event.contestScore !== undefined)
  const mean = (values: readonly number[]): number => values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3))
  const transitionPossessions = new Set(events.filter((event) => event.type === 'transitionStarted').map((event) => event.possessionId))
  return {
    screens: count(events, 'screenSet'), drives: events.filter((event) => event.type === 'actionStarted' && event.actionKind === 'DRIVE').length, passes: count(events, 'passReleased'),
    meanShotProbability: mean(withProb.map((event) => event.shotProbability!)), meanContestScore: mean(withContest.map((event) => event.contestScore!)),
    shotClockViolations: events.filter((event) => event.type === 'turnover' && event.turnoverType === 'SHOT_CLOCK').length,
    transitionStarts: count(events, 'transitionStarted'), transitionShots: shots.filter((event) => transitionPossessions.has(event.possessionId)).length,
    seed, complete: state.isComplete, ticks: state.t, points, homePoints: state.score.home, awayPoints: state.score.away, possessions,
    meanPossessionSeconds: durations.length === 0 ? 0 : Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)),
    fga: shots.length, fgMade: count(events, 'shotMade'), fta, ftMade: count(events, 'freeThrowMade'),
    threeShare: Number((shots.filter((event) => event.points === 3).length / Math.max(1, shots.length)).toFixed(3)),
    rimShare: Number(shotShare(0, 2.2).toFixed(3)), paintShare: Number(shotShare(2.2, 4.5).toFixed(3)), midShare: Number(shotShare(4.5, 6.5).toFixed(3)), deepShare: Number(shotShare(9, 99).toFixed(3)),
    fouls: foulEvents.length, foulsByType, bonusFouls: foulEvents.filter((event) => event.foulResolution === 'BONUS_FREE_THROWS').length,
    andOnes: foulEvents.filter((event) => event.foulResolution === 'AND_ONE').length, ftSequences: count(events, 'freeThrowSequenceStarted'),
    maxPersonalFouls: Math.max(0, ...Object.values(state.fouls.personal)), foulOuts: count(events, 'foulOut'),
    blocks: count(events, 'shotBlocked'), steals: count(events, 'steal'), stealKinds, deflections: count(events, 'deflection'), stealAttempts: count(events, 'stealAttempt'),
    turnovers: events.filter((event) => event.type === 'turnover').length, turnoverTypes, outOfBounds: count(events, 'outOfBounds'), assists: count(events, 'assist'),
    oreb: orebEvents.length, dreb: events.filter((event) => event.type === 'reboundSecured' && event.reboundType === 'defensive').length, putbacks, putbackMade, putbackMeanProbability: putbackShots.length === 0 ? 0 : Number((putbackShots.reduce((a, shot) => a + (shot.shotProbability ?? 0), 0) / putbackShots.length).toFixed(3)),
    contacts: count(events, 'contact'), ppp: Number((points / Math.max(1, possessions)).toFixed(3)), ftaPerFga: Number((fta / Math.max(1, shots.length)).toFixed(3)),
    illegalPlayTransitions: illegal, scrumWithin15: scrum.within, scrumSamples: scrum.samples, scrumWithin06: scrum.tight, playerLines: lines,
  }
}

/** Plays a whole game in 3-tick strides (a shot flight lasts 6 ticks) and samples the players around every live rebound. */
export function runBt3Game(seed: number, options: { readonly maxTicks?: number; readonly setup?: (setup: ReturnType<typeof preparedSetup>) => ReturnType<typeof preparedSetup> } = {}): Bt3Game {
  const base = preparedSetup(seed)
  const live = createMatchEnginePort('match-next').createLiveSession(options.setup === undefined ? base : options.setup(base))
  const seen = new Set<number>()
  let within = 0
  let samples = 0
  let tight = 0
  const maxTicks = options.maxTicks ?? 90000
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) {
    live.advanceTicks(3)
    const st = live.matchState
    if (st.ball.kind === 'REBOUNDABLE' && st.t >= st.ball.availableAtT - 1 && !seen.has(st.ball.landingStartedT)) {
      seen.add(st.ball.landingStartedT)
      const ball = st.ball
      // Players contesting the ball at the moment it can be taken: within 1.5 m of the landing point.
      within += st.players.filter((player) => player.active && distanceBetween(player.position, ball.landingTarget) <= 1.5).length
      tight += st.players.filter((player) => player.active && distanceBetween(player.position, ball.landingTarget) <= 0.6).length
      samples += 1
    }
  }
  return analyzeBt3(seed, live.matchState, { within, samples, tight })
}

export { dist }
