/**
 * BT4.5 pass ecology: the three layers of pass risk (selection, execution, interception) and the physics of an interception.
 * Focal tests on synthetic states for the geometry; one replay of a real match for the invariants of the flight.
 */
import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createCourtGeometry, distanceBetween, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createMatchState, type MatchSetup, type MatchState } from './index'
import { ballFlightSeconds, executionQuality, interceptAttemptChance, laneRead, passExecutionError, perceivedLaneRead, receiverDenial } from './actions/PassRisk'
import { passQuality } from './actions/DecisionCore'
import { tuning } from './tuning'

function setupWith(passerSkill: number, defenderSteal: number, passerVision = passerSkill): MatchSetup {
  const homeTeamId = teamIdFromString('pe-home')
  const awayTeamId = teamIdFromString('pe-away')
  const home = Array.from({ length: 5 }, (_, index) => playerIdFromString(`pe-h${index}`))
  const away = Array.from({ length: 5 }, (_, index) => playerIdFromString(`pe-a${index}`))
  const profile = (playerId: typeof home[number], teamId: typeof homeTeamId, isHome: boolean) => ({
    playerId, teamId, primaryPosition: 'PG' as const,
    physical: { heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: { maxSpeedMps: 5.8, accelerationMps2: 3, brakingMps2: 3.8 },
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 60 },
    passing: { accuracy: isHome ? passerSkill : 60, vision: isHome ? passerVision : 60, timing: isHome ? passerSkill : 60 },
    defense: { pointOfAttack: 55, interior: 55, mobility: 60, steal: isHome ? 50 : defenderSteal },
    rebounding: { impact: 50 },
  })
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  const spots: readonly CourtPosition[] = [{ x: 4, y: 3 }, { x: 4, y: 5 }, { x: 4, y: 7 }, { x: 4, y: 9 }, { x: 4, y: 11 }]
  return {
    gameId: gameIdFromString('pe-game'), homeTeamId, awayTeamId, court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24 },
    homeSquad: home, awaySquad: away, initialLineups: { home, away },
    players: [...home.map((id) => profile(id, homeTeamId, true)), ...away.map((id) => profile(id, awayTeamId, false))],
    initialPlayerPositions: [...home.map((playerId, index) => ({ playerId, position: spots[index]! })), ...away.map((playerId, index) => ({ playerId, position: { x: spots[index]!.x + 20, y: spots[index]!.y } }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan },
    defensiveMatchupOverrides: { home: home.map((playerId, index) => ({ playerId, opponentPlayerId: away[index]! })), away: away.map((playerId, index) => ({ playerId, opponentPlayerId: home[index]! })) },
    matchSeed: 4501,
  }
}

/** Passer at (10, 7.5), receiver at (16, 7.5), one defender at `defender` with `velocity`; everybody else far away. */
function stage(options: { passerSkill?: number; passerVision?: number; steal?: number; defender: CourtPosition; velocity?: CourtPosition; receiverVelocity?: CourtPosition; pressure?: CourtPosition }): { state: MatchState; passerId: string; receiverId: string } {
  const setup = setupWith(options.passerSkill ?? 70, options.steal ?? 60, options.passerVision ?? options.passerSkill ?? 70)
  const base = createMatchState(setup)
  const home = setup.initialLineups.home
  const away = setup.initialLineups.away
  const where = new Map<string, { position: CourtPosition; velocity: CourtPosition }>()
  where.set(String(home[0]), { position: { x: 10, y: 7.5 }, velocity: { x: 0, y: 0 } })
  where.set(String(home[1]), { position: { x: 16, y: 7.5 }, velocity: options.receiverVelocity ?? { x: 0, y: 0 } })
  home.slice(2).forEach((id, index) => where.set(String(id), { position: { x: 2 + index, y: 1 + index * 0.5 }, velocity: { x: 0, y: 0 } }))
  where.set(String(away[0]), { position: options.defender, velocity: options.velocity ?? { x: 0, y: 0 } })
  away.slice(1).forEach((id, index) => where.set(String(id), { position: options.pressure !== undefined && index === 0 ? options.pressure : { x: 25 + index, y: 1 + index * 3 }, velocity: { x: 0, y: 0 } }))
  const players = base.players.map((player) => { const entry = where.get(String(player.playerId)); return entry === undefined ? player : { ...player, position: entry.position, velocity: entry.velocity } })
  return { state: { ...base, players }, passerId: String(home[0]), receiverId: String(home[1]) }
}

const from = { x: 10, y: 7.5 }
const to = { x: 16, y: 7.5 }
const flight = ballFlightSeconds(6)

describe('BT4.5 lane in real time (interception layer)', () => {
  it('a defender next to the line who cannot get a hand on it before the ball passes is not a threat, however close', () => {
    // 0.9 m off the line, level with the receiver's side of the passer: the ball has left before he can react.
    const { state, passerId } = stage({ defender: { x: 11.5, y: 8.4 } })
    const passer = state.players.find((player) => String(player.playerId) === passerId)!
    const read = laneRead(state, passer.position, to, passer.teamId, flight)
    expect(read.minPerpendicular).toBeLessThan(1)
    expect(read.slack).toBeLessThan(0)
    expect(interceptAttemptChance(read)).toBe(0)
  })

  it('BT6.8: a defender on the passer with his hands in the line can tip the release, but only as a small gamble', () => {
    // 0.3 m from the line and right beside the passer: before BT6 the first 8% of the flight was out of everybody's reach; a man pressing the
    // passer has his hands there, so the throw that goes through them is at (small) risk and the passer reads it.
    const { state, passerId } = stage({ defender: { x: 10.4, y: 7.8 } })
    const passer = state.players.find((player) => String(player.playerId) === passerId)!
    const read = laneRead(state, passer.position, to, passer.teamId, flight)
    expect(read.slack).toBeGreaterThan(0)
    expect(interceptAttemptChance(read)).toBeGreaterThan(0)
    expect(interceptAttemptChance(read)).toBeLessThan(0.05)
  })

  it('a defender who already stands in the line needs no reaction time: the ball cannot pass through him', () => {
    const { state, passerId } = stage({ defender: { x: 11.8, y: 7.55 } })
    const passer = state.players.find((player) => String(player.playerId) === passerId)!
    const read = laneRead(state, passer.position, to, passer.teamId, flight)
    expect(read.minPerpendicular).toBeLessThan(0.2)
    expect(read.slack).toBeGreaterThan(0)
    // Measured against the calibrated maximum (not a fixed number) and against the same defender 1.2 m off the line, who has to react first.
    const off = stage({ defender: { x: 11.8, y: 8.75 } })
    const offRead = laneRead(off.state, from, to, off.state.players[0]!.teamId, flight)
    expect(interceptAttemptChance(read)).toBeGreaterThan(0.4 * tuning().passInterceptMax)
    expect(interceptAttemptChance(read)).toBeGreaterThan(interceptAttemptChance(offRead))
  })

  it('a defender who can be on the line first is a threat, and a better pair of hands reads and gets there sooner', () => {
    const geometry = { defender: { x: 13.2, y: 8.8 } }
    const poor = stage({ ...geometry, steal: 25 })
    const elite = stage({ ...geometry, steal: 90 })
    const poorRead = laneRead(poor.state, from, to, poor.state.players[0]!.teamId, flight)
    const eliteRead = laneRead(elite.state, from, to, elite.state.players[0]!.teamId, flight)
    expect(eliteRead.slack).toBeGreaterThan(poorRead.slack)
    expect(eliteRead.slack).toBeGreaterThan(0)
    expect(interceptAttemptChance(eliteRead)).toBeGreaterThan(interceptAttemptChance(poorRead))
  })

  it('a defender who is already sliding toward the line is a bigger threat than the same one standing', () => {
    const standing = stage({ defender: { x: 13, y: 10 } })
    const sliding = stage({ defender: { x: 13, y: 10 }, velocity: { x: 0, y: -4 } })
    const a = laneRead(standing.state, from, to, standing.state.players[0]!.teamId, flight)
    const b = laneRead(sliding.state, from, to, sliding.state.players[0]!.teamId, flight)
    expect(b.slack).toBeGreaterThan(a.slack)
  })

  it('an elite reader sees the threat a poor reader underestimates', () => {
    const geometry = { defender: { x: 13, y: 9.6 }, velocity: { x: 0, y: -2.5 } }
    const poor = stage({ ...geometry, passerVision: 15 })
    const elite = stage({ ...geometry, passerVision: 95 })
    const poorPasser = poor.state.players.find((player) => String(player.playerId) === poor.passerId)!
    const elitePasser = elite.state.players.find((player) => String(player.playerId) === elite.passerId)!
    const seenByPoor = perceivedLaneRead(poor.state, poorPasser, from, to, flight)
    const seenByElite = perceivedLaneRead(elite.state, elitePasser, from, to, flight)
    expect(seenByElite.slack).toBeGreaterThan(seenByPoor.slack)
    expect(interceptAttemptChance(seenByElite)).toBeGreaterThanOrEqual(interceptAttemptChance(seenByPoor))
  })
})

describe('BT4.5 execution (the throw) is not the lane', () => {
  it('the quality of a throw does not change when a defender stands on the line', () => {
    const open = stage({ defender: { x: 25, y: 14 } })
    const covered = stage({ defender: { x: 13, y: 7.6 } })
    const quality = (s: ReturnType<typeof stage>): number => passQuality(s.state, s.state.players.find((p) => String(p.playerId) === s.passerId)!, s.state.players.find((p) => String(p.playerId) === s.receiverId)!)
    expect(quality(covered)).toBeCloseTo(quality(open), 10)
  })

  it('a better passer errs less, a defender on the passer, a long throw and a running receiver all make it worse', () => {
    const errorOf = (s: ReturnType<typeof stage>, distance = 6): number => passExecutionError(s.state, s.state.players.find((p) => String(p.playerId) === s.passerId)!, s.state.players.find((p) => String(p.playerId) === s.receiverId)!, distance)
    const base = stage({ defender: { x: 25, y: 14 }, passerSkill: 60 })
    expect(errorOf(stage({ defender: { x: 25, y: 14 }, passerSkill: 90 }))).toBeLessThan(errorOf(base))
    expect(errorOf(stage({ defender: { x: 25, y: 14 }, passerSkill: 30 }))).toBeGreaterThan(errorOf(base))
    expect(errorOf(stage({ defender: { x: 25, y: 14 }, passerSkill: 60, pressure: { x: 10.7, y: 7.5 } }))).toBeGreaterThan(errorOf(base))
    expect(errorOf(base, 14)).toBeGreaterThan(errorOf(base, 5))
    expect(errorOf(stage({ defender: { x: 25, y: 14 }, passerSkill: 60, receiverVelocity: { x: 0, y: 4 } }))).toBeGreaterThan(errorOf(base))
    expect(executionQuality(errorOf(base))).toBeGreaterThan(executionQuality(errorOf(stage({ defender: { x: 25, y: 14 }, passerSkill: 30 }))))
  })
})

describe('BT4.5 receiver availability', () => {
  it('a defender between the passer and the receiver, on top of him, denies the catch; an open receiver is not denied', () => {
    const open = stage({ defender: { x: 25, y: 14 } })
    const denied = stage({ defender: { x: 15.2, y: 7.5 } })
    const behind = stage({ defender: { x: 16.8, y: 7.5 } })
    const denial = (s: ReturnType<typeof stage>): number => receiverDenial(s.state, s.state.players.find((p) => String(p.playerId) === s.passerId)!, s.state.players.find((p) => String(p.playerId) === s.receiverId)!)
    expect(denial(open)).toBe(0)
    expect(denial(denied)).toBeGreaterThan(denial(behind))
    expect(denial(denied)).toBeGreaterThan(0.3)
  })
})

describe('BT4.5 the flight of a pass (physics)', () => {
  const game = createNewGame()
  const scheduled = Object.values(game.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  const live = port.createLiveSession(port.prepare(game, scheduled, 424242))
  const releases: { releaseT: number; arrivalT: number; target: CourtPosition; defenders: CourtPosition[]; contested: boolean; receiverId: string }[] = []
  const interceptions: { t: number; releaseT: number; arrivalT: number }[] = []
  let current: { releaseT: number; arrivalT: number } | null = null
  for (let count = 0; count < 4500 && !live.matchState.isComplete; count += 1) {
    live.advanceOneStep()
    const s = live.matchState
    if (s.ball.kind === 'PASS_IN_FLIGHT' && !s.ball.isInbound) {
      if (current === null || current.releaseT !== s.ball.releaseT) {
        current = { releaseT: s.ball.releaseT, arrivalT: s.ball.arrivalT }
        const passerTeamId = s.ball.passerTeamId
        releases.push({ releaseT: s.ball.releaseT, arrivalT: s.ball.arrivalT, target: { ...s.ball.target }, defenders: s.players.filter((p) => p.active && p.teamId !== passerTeamId).map((p) => ({ ...p.position })), contested: s.ball.contest !== undefined, receiverId: String(s.ball.intendedReceiverPlayerId) })
      }
    }
    if (s.events.some((event) => event.t === s.t && event.type === 'passIntercepted') && current !== null) interceptions.push({ t: s.t, releaseT: current.releaseT, arrivalT: current.arrivalT })
  }

  it('the ball is never thrown to a defender: a contested pass still flies to where the receiver is', () => {
    expect(releases.length).toBeGreaterThan(40)
    for (const pass of releases) {
      const nearestDefenderToTarget = Math.min(...pass.defenders.map((position) => distanceBetween(position, pass.target)))
      // A defender may happen to stand next to the receiver, but the target is never the defender's own spot.
      if (pass.contested) expect(nearestDefenderToTarget).toBeGreaterThan(0.05)
    }
  })

  it('an interception happens along the flight of the ball, never before it is thrown', () => {
    for (const item of interceptions) {
      expect(item.t).toBeGreaterThan(item.releaseT)
      expect(item.t).toBeLessThanOrEqual(item.arrivalT + 1)
    }
  })
})
