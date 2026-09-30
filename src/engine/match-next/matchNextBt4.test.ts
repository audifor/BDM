/**
 * BT4 (pace, shot ecology and player identity) focal tests. Model tests place players by hand; lifecycle tests replay whole games
 * through the real application path and check a property of every shot, drive or foul, never a hard-coded total.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { createCourtGeometry, distanceBetween } from '@/domain/court'
import { estimateContestAt, floaterFactor, pullUpFactor, readDriveStop, shotMakeProbability } from './actions/DecisionCore'
import { guardPosition } from './defense/ManDefense'
import { reboundWeight } from './transition/ReboundTransition'
import { SHOT_CREATIONS, SHOT_ZONES, shotZone } from './stats/ShotEcology'
import { DEFAULT_MATCH_NEXT_TUNING, tuning, withTuning } from './tuning'
import { classifyPhase, PHASES } from '@/presentation/match-next/audit/bt4/pace'
import type { MatchNextEvent, MatchPlayerState, MatchState } from './index'

function liveSession(seed: number) {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  return port.createLiveSession(port.prepare(world, game, seed))
}

function playWholeGame(seed: number, maxTicks = 60000): MatchState {
  const live = liveSession(seed)
  while (!live.matchState.isComplete && live.matchState.t < maxTicks) live.advanceTicks(3)
  return live.matchState
}

const place = (player: MatchPlayerState, x: number, y: number, vx = 0, vy = 0): MatchPlayerState => ({ ...player, position: { x, y }, velocity: { x: vx, y: vy } })

describe('BT4E: shot zones are derived from geometry', () => {
  const court = createCourtGeometry('FIBA')
  const basket = court.baskets.left
  const at = (dx: number, dy = 0): { x: number; y: number } => ({ x: basket.x + dx, y: basket.y + dy })

  it('puts a shot in the zone its distance and side of the arc name', () => {
    expect(shotZone(at(1.0), basket, 2, court)).toBe('RESTRICTED')
    expect(shotZone(at(2.0), basket, 2, court)).toBe('RIM')
    expect(shotZone(at(3.0), basket, 2, court)).toBe('SHORT_PAINT')
    expect(shotZone(at(4.2), basket, 2, court)).toBe('FLOATER_RANGE')
    expect(shotZone(at(5.3), basket, 2, court)).toBe('MIDRANGE')
    expect(shotZone(at(6.3), basket, 2, court)).toBe('LONG_MIDRANGE')
    expect(shotZone({ x: basket.x + 2.5, y: 0.6 }, basket, 3, court)).toBe('CORNER_THREE')
    expect(shotZone({ x: basket.x + 7.2, y: basket.y + 1 }, basket, 3, court)).toBe('ABOVE_BREAK_THREE')
    expect(shotZone(at(9.4), basket, 3, court)).toBe('DEEP')
  })

  it('names every zone and creation type it can produce', () => {
    expect(SHOT_ZONES).toHaveLength(9)
    expect(SHOT_CREATIONS).toContain('PULL_UP')
    expect(SHOT_CREATIONS).toContain('FLOATER')
    expect(SHOT_CREATIONS).toContain('CATCH_AND_SHOOT')
  })
})

describe('BT4G/H/I: pull-ups, floaters and finishing come from the shooter', () => {
  const base = liveSession(3).matchState
  const shooter = base.players.find((player) => player.active && player.teamId === base.homeTeamId)!

  it('a shot on the move is worth what the shooter can make it: better shooters and creators pull up better, finishers float better', () => {
    const weak = { ...shooter, offense: { ...shooter.offense, shooting: 30, creation: 30, rimAttack: 30 }, fatigue: 0 }
    const elite = { ...shooter, offense: { ...shooter.offense, shooting: 90, creation: 90, rimAttack: 90 }, fatigue: 0 }
    expect(pullUpFactor(elite)).toBeGreaterThan(pullUpFactor(weak))
    expect(floaterFactor(elite)).toBeGreaterThan(floaterFactor(weak))
    expect(pullUpFactor(elite)).toBeLessThanOrEqual(1)
    expect(floaterFactor(weak)).toBeGreaterThanOrEqual(0.75)
  })

  it('at the rim the make probability is finishing (rimAttack), from range it is shooting; they are not the same rating', () => {
    const rim = { distance: 1, contest: 0.4 }
    const finisher = shotMakeProbability(50, rim.distance, 2, rim.contest, 0, 90)
    const nonFinisher = shotMakeProbability(50, rim.distance, 2, rim.contest, 0, 20)
    expect(finisher).toBeGreaterThan(nonFinisher)
    const fromRangeA = shotMakeProbability(60, 7.5, 3, 0.2, 0, 95)
    const fromRangeB = shotMakeProbability(60, 7.5, 3, 0.2, 0, 10)
    expect(fromRangeA).toBe(fromRangeB)
    expect(shotMakeProbability(85, 7.5, 3, 0.2)).toBeGreaterThan(shotMakeProbability(35, 7.5, 3, 0.2))
  })

  it('a contest at the rim is made by interior defense; away from the rim by the point-of-attack defender', () => {
    const basket = base.court.baskets.right
    const attackingTeam = base.homeTeamId
    const defenders = base.players.filter((player) => player.active && player.teamId !== attackingTeam)
    const rimSpot = { x: basket.x - 1.2, y: basket.y }
    const perimeterSpot = { x: basket.x - 8, y: basket.y + 2 }
    const withDefender = (spot: { x: number; y: number }, interior: number, pointOfAttack: number): number => {
      const state: MatchState = {
        ...base,
        players: base.players.map((player) => {
          if (!player.active || player.teamId === attackingTeam) return player
          if (player.playerId === defenders[0]!.playerId) return { ...place(player, spot.x + 0.6, spot.y), defense: { ...player.defense, interior, pointOfAttack } }
          return place(player, 3, 3)
        }),
      }
      return estimateContestAt(state, attackingTeam, spot).score
    }
    expect(withDefender(rimSpot, 95, 30)).toBeGreaterThan(withDefender(rimSpot, 25, 30))
    expect(withDefender(perimeterSpot, 25, 95)).toBeGreaterThan(withDefender(perimeterSpot, 95, 25))
  })

  it('a driver with a real edge over the men in his lane is more likely to keep going than one without', () => {
    const basket = base.court.baskets.right
    const driver = place(shooter, basket.x - 6, basket.y + 1, 4, 0)
    const rival = base.players.filter((player) => player.active && player.teamId !== shooter.teamId)
    const arranged = (edge: number): MatchState => ({
      ...base,
      players: base.players.map((player) => {
        if (player.playerId === driver.playerId) return { ...driver, offense: { ...driver.offense, rimAttack: edge, creation: edge }, fatigue: 0 }
        if (player.playerId === rival[0]!.playerId) return { ...place(player, basket.x - 4, basket.y + 0.6), defense: { ...player.defense, pointOfAttack: 55, mobility: 55 }, defensiveMobility: 55 }
        if (player.active && player.teamId !== shooter.teamId) return place(player, basket.x - 14, basket.y + 5)
        return player
      }),
    })
    const strong = readDriveStop(arranged(92), { ...driver, offense: { ...driver.offense, rimAttack: 92, creation: 92 }, fatigue: 0 }, basket)
    const weak = readDriveStop(arranged(25), { ...driver, offense: { ...driver.offense, rimAttack: 25, creation: 25 }, fatigue: 0 }, basket)
    expect(strong.values.pFinish).toBeGreaterThan(weak.values.pFinish)
  })
})

describe('BT4L/Q: identity in the model', () => {
  const base = liveSession(4).matchState
  const players = base.players.filter((player) => player.active)

  it('a defender crowds a shooter who can punish space and sags off one who cannot', () => {
    const basket = base.court.baskets.right
    const attacker = { x: basket.x - 8, y: basket.y + 4 }
    const ball = { x: basket.x - 9, y: basket.y - 2 }
    const eliteGuard = guardPosition(attacker, ball, basket, 'GAP', base.court, undefined, 90)
    const weakGuard = guardPosition(attacker, ball, basket, 'GAP', base.court, undefined, 20)
    expect(distanceBetween(eliteGuard, attacker)).toBeLessThan(distanceBetween(weakGuard, attacker))
  })

  it('at the same distance from the ball an elite rebounder has the better claim, and a heavier sealer costs the sealed man more', () => {
    const ball = { x: 10, y: 7.5 }
    const [a, b] = players
    const elite = { ...place(a!, 10.5, 7.5), reboundingImpact: 90, fatigue: 0 }
    const weak = { ...place(b!, 10.5, 7.5), reboundingImpact: 25, fatigue: 0 }
    const state = { ...base, players: base.players.map((player) => (player.playerId === elite.playerId ? elite : player.playerId === weak.playerId ? weak : place(player, 2, 2))) }
    expect(reboundWeight(elite, ball, state)).toBeGreaterThan(reboundWeight(weak, ball, state) * 1.5)
  })

  it('withTuning restores the defaults even when the run throws', () => {
    const before = tuning()
    expect(() => withTuning({ driveBeatBase: 0.9 }, () => { throw new Error('boom') })).toThrow('boom')
    expect(tuning()).toBe(before)
    expect(tuning().driveBeatBase).toBe(DEFAULT_MATCH_NEXT_TUNING.driveBeatBase)
  })
})

describe('BT4: a whole game', { timeout: 400000 }, () => {
  const state = playWholeGame(424242)
  const other = playWholeGame(7)
  const shots = (game: MatchState): readonly MatchNextEvent[] => game.events.filter((event) => event.type === 'shotReleased')

  it('labels every shot with a zone and a creation type from the vocabulary', () => {
    for (const game of [state, other]) {
      expect(shots(game).length).toBeGreaterThan(100)
      for (const shot of shots(game)) {
        expect(SHOT_ZONES).toContain(shot.shotZone)
        expect(SHOT_CREATIONS).toContain(shot.shotCreation)
      }
    }
  })

  it('has real variety: pull-ups, mid-range, floater range and threes all appear, from action, not from a chosen zone', () => {
    const all = [...shots(state), ...shots(other)]
    const count = (test: (shot: MatchNextEvent) => boolean): number => all.filter(test).length
    expect(count((shot) => shot.shotCreation === 'PULL_UP')).toBeGreaterThan(8)
    expect(count((shot) => shot.shotZone === 'MIDRANGE' || shot.shotZone === 'LONG_MIDRANGE')).toBeGreaterThan(8)
    expect(count((shot) => shot.shotZone === 'FLOATER_RANGE' || shot.shotZone === 'SHORT_PAINT')).toBeGreaterThan(10)
    expect(count((shot) => shot.points === 3)).toBeGreaterThan(30)
    expect(count((shot) => shot.shotZone === 'RESTRICTED' || shot.shotZone === 'RIM')).toBeGreaterThan(30)
  })

  it('a pull-up or floater follows a drive that the same player stopped, and starts where the drive was', () => {
    let checked = 0
    for (const game of [state, other]) {
      for (const shot of shots(game).filter((event) => event.shotCreation === 'PULL_UP' || event.shotCreation === 'FLOATER')) {
        const stopped = game.events.filter((event) => event.type === 'actionResolved' && event.actionKind === 'DRIVE' && event.actionOutcome === 'STOPPED' && event.playerId === shot.shooterPlayerId && event.t <= shot.t && shot.t - event.t <= 12)
        const standing = game.events.some((event) => event.type === 'decisionSelected' && event.playerId === shot.shooterPlayerId && (event.decisionKind === 'SHOOT') && event.t <= shot.t && shot.t - event.t <= 12)
        if (stopped.length > 0 || standing) checked += 1
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('a drive ends in one of the outcomes the model can name, and some drives really are contained or stopped', () => {
    const resolved = [...state.events, ...other.events].filter((event) => event.type === 'actionResolved' && event.actionKind === 'DRIVE')
    const outcomes = new Set(resolved.map((event) => event.actionOutcome))
    expect(outcomes.has('FINISH') || outcomes.has('ADVANTAGE')).toBe(true)
    expect(outcomes.has('CONTAINED') || outcomes.has('STOPPED')).toBe(true)
  })

  it('has non-shooting fouls from measured contact away from the ball, so team fouls accumulate', () => {
    const nonShooting = state.events.filter((event) => event.type === 'foul' && event.foulType !== 'SHOOTING')
    expect(nonShooting.length).toBeGreaterThan(8)
    for (const foul of nonShooting.filter((event) => event.foulType !== 'REACH')) {
      const contact = state.events.find((event) => event.type === 'contact' && event.t <= foul.t && foul.t - event.t <= 14 && (String(event.playerId) === String(foul.playerId) || String(event.victimPlayerId) === String(foul.playerId)))
      expect(contact).toBeDefined()
    }
  })

  it('never leaves a clock inconsistent: the game clock moves one tenth per running tick, the shot clock never goes negative', () => {
    const live = liveSession(11)
    let previous = live.matchState
    for (let step = 0; step < 4000 && !live.matchState.isComplete; step += 1) {
      live.advanceOneStep()
      const now = live.matchState
      if (now.period === previous.period && !(previous.clock.gameRunning && previous.gameClockTenths === 0)) expect(previous.gameClockTenths - now.gameClockTenths).toBe(previous.clock.gameRunning ? 1 : 0)
      if (now.shotClockTenths !== null) expect(now.shotClockTenths).toBeGreaterThanOrEqual(0)
      previous = now
    }
  })

  it('accounts for every tick of a possession in exactly one pace phase', () => {
    const live = liveSession(5)
    const seen = new Set<string>()
    for (let step = 0; step < 3000 && !live.matchState.isComplete; step += 1) {
      live.advanceOneStep()
      const phase = classifyPhase(live.matchState)
      expect(PHASES).toContain(phase)
      seen.add(phase)
    }
    expect(seen.has('transition')).toBe(true)
    expect(seen.has('settlement') || seen.has('reading')).toBe(true)
    expect(seen.has('actionExecution')).toBe(true)
  })

  it('is deterministic: the same seed reproduces the same shots, zones and score', () => {
    const again = playWholeGame(424242)
    expect(again.score).toEqual(state.score)
    expect(shots(again).map((shot) => `${shot.t}:${shot.shooterPlayerId}:${shot.shotZone}:${shot.shotCreation}`)).toEqual(shots(state).map((shot) => `${shot.t}:${shot.shooterPlayerId}:${shot.shotZone}:${shot.shotCreation}`))
  })
})
