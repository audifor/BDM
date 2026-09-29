import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString, type PlayerId } from '@/domain/ids'
import { PresentationDirector } from './PresentationDirector'
import { buildSegmentPlan, motionFraction, playerPositionAt, resolveBallAt, toMeters, SEGMENT_TIMING } from './segmentPlan'
import type { MatchPresentationEvent, MatchPresentationState, PresentationPlayer, PresentationSegment } from './visualTypes'

const HOME = teamIdFromString('home')
const AWAY = teamIdFromString('away')
const LENGTH = 28
const WIDTH = 15

const pct = (x: number, y: number) => ({ xPercent: (x / LENGTH) * 100, yPercent: (y / WIDTH) * 100 })

function player(id: string, x: number, y: number, side: 'home' | 'away', isOffense: boolean, hasBall = false): PresentationPlayer {
  return {
    playerId: playerIdFromString(id),
    teamId: side === 'home' ? HOME : AWAY,
    side,
    label: id,
    jersey: 1,
    position: pct(x, y),
    speedMetersPerSecond: 0,
    orientationRadians: undefined,
    hasBall,
    isOffense,
    actionIntent: 'idle',
    defensiveIntent: undefined,
    defendingPlayerId: undefined,
    defendedByPlayerId: undefined,
    screenPartnerId: undefined,
  }
}

function state(players: readonly PresentationPlayer[], opts: { owner?: string; ball?: { x: number; y: number }; score?: { home: number; away: number }; clock?: number; offense?: 'home' | 'away' } = {}): MatchPresentationState {
  const owner = opts.owner === undefined ? undefined : playerIdFromString(opts.owner)
  const ownerPlayer = players.find((p) => p.playerId === owner)
  const offense = opts.offense ?? 'home'
  return {
    simulationTick: 1,
    court: { lengthMeters: LENGTH, widthMeters: WIDTH, threePointArcRadiusMeters: 6.75, threePointCornerOffsetMeters: 0.9, baskets: { left: pct(1.575, 7.5), right: pct(26.425, 7.5) } },
    players,
    ball: {
      position: ownerPlayer?.position ?? pct(opts.ball?.x ?? 14, opts.ball?.y ?? 7.5),
      state: owner === undefined ? 'unassigned' : 'held',
      ownerPlayerId: owner,
      ownerTeamId: ownerPlayer?.teamId,
      visualHeight: 0,
      isPassFlight: false,
      isShotFlight: false,
    },
    clock: { period: 1, periodCount: 4, clockSecondsRemaining: opts.clock ?? 600, periodSeconds: 600 },
    score: opts.score ?? { home: 0, away: 0 },
    possession: { offensiveTeamId: offense === 'home' ? HOME : AWAY, defensiveTeamId: offense === 'home' ? AWAY : HOME, ballHandlerId: owner, attackingBasket: pct(26.425, 7.5) },
    isComplete: false,
    currentActionKind: undefined,
    debugTargets: { screenTarget: undefined, driveTarget: undefined, passTargetPlayerId: undefined, shotTargetBasket: undefined },
  }
}

function event(partial: Partial<MatchPresentationEvent> & Pick<MatchPresentationEvent, 'kind' | 'sequence'>): MatchPresentationEvent {
  return { period: 1, clockSecondsRemaining: 590, teamId: HOME, playerId: undefined, secondaryPlayerId: undefined, points: undefined, homeScore: 0, awayScore: 0, ...partial }
}

function segment(from: MatchPresentationState, to: MatchPresentationState, simSeconds: number, events: readonly MatchPresentationEvent[], extra: Partial<PresentationSegment> = {}): PresentationSegment {
  return {
    index: 0,
    from,
    to,
    simSeconds,
    events,
    actorPlayerId: events[0]?.playerId,
    attackedBasket: pct(26.425, 7.5),
    previousEnding: 'none',
    substitutions: [],
    ...extra,
  }
}

const id = (s: string): PlayerId => playerIdFromString(s)

function shotSegment(made: boolean) {
  const shooterFrom = player('shooter', 18, 7.5, 'home', true, true)
  const shooterTo = player('shooter', 20, 7.5, 'home', true)
  const def = player('def', 22, 7.5, 'away', false)
  const from = state([shooterFrom, def], { owner: 'shooter' })
  const to = state([shooterTo, def], { ball: { x: 20, y: 7.5 }, score: made ? { home: 3, away: 0 } : { home: 0, away: 0 }, offense: made ? 'away' : 'home' })
  const events: MatchPresentationEvent[] = [
    event({ kind: made ? 'shotMade' : 'shotMissed', sequence: 5, playerId: id('shooter'), points: made ? 3 : undefined, homeScore: made ? 3 : 0, shotZone: 'threePoint' }),
  ]
  if (!made) events.push(event({ kind: 'rebound', sequence: 6, playerId: id('def'), teamId: AWAY, reboundType: 'defensive' }))
  const toMiss = made ? to : state([shooterTo, { ...def, hasBall: true }], { owner: 'def', offense: 'away' })
  return segment(from, made ? to : toMiss, 4, events)
}

describe('segment choreography (BT1)', () => {
  it('a made shot: the ball reaches the rim BEFORE the score changes, and the score changes with the ball at the rim', () => {
    const seg = shotSegment(true)
    const plan = buildSegmentPlan(seg)
    const beat = plan.beats.find((b) => b.kind === 'shotMade')!
    expect(plan.scoreTimeline).toHaveLength(1)
    const scoreAt = plan.scoreTimeline[0]!
    expect(scoreAt.atMs).toBe(beat.atMs)
    const atRim = resolveBallAt(plan, beat.atMs - 1).position
    expect(Math.hypot(atRim.x - plan.rim.x, atRim.y - plan.rim.y)).toBeLessThan(0.15)
    // Before the ball arrives the displayed score is still the old one.
    const director = new PresentationDirector(seg.from)
    director.enqueue(seg)
    const early = director.advance(beat.atMs - 50)
    expect(early.state.score).toEqual({ home: 0, away: 0 })
    const late = director.advance(120)
    expect(late.state.score).toEqual({ home: 3, away: 0 })
  })

  it('a miss is followed by a rebound flight from the rim to the rebounder, in that order', () => {
    const plan = buildSegmentPlan(shotSegment(false))
    const kinds = plan.legs.map((l) => l.kind)
    expect(kinds.indexOf('shot')).toBeGreaterThanOrEqual(0)
    expect(kinds.indexOf('reboundFlight')).toBeGreaterThan(kinds.indexOf('shot'))
    const beats = plan.beats.map((b) => b.kind)
    expect(beats.indexOf('shotMissed')).toBeLessThan(beats.indexOf('rebound'))
    const missAt = plan.beats.find((b) => b.kind === 'shotMissed')!.atMs
    const reboundAt = plan.beats.find((b) => b.kind === 'rebound')!.atMs
    expect(reboundAt).toBeGreaterThan(missAt)
    // The ball ends up in the rebounder's hands, at the rebounder's canonical position.
    const end = resolveBallAt(plan, plan.durationMs)
    expect(end.owner).toBe(id('def'))
    expect(Math.hypot(end.position.x - 22, end.position.y - 7.5)).toBeLessThan(0.1)
  })

  it('never shows a made shot followed by a rebound: a made basket ends with the ball dead under the rim', () => {
    const plan = buildSegmentPlan(shotSegment(true))
    expect(plan.beats.some((b) => b.kind === 'rebound')).toBe(false)
    const last = plan.legs.filter((l) => l.kind !== 'hold').at(-1)!
    expect(last.kind).toBe('netDrop')
    const resting = plan.restingBall
    expect(Math.hypot(resting.x - plan.floorUnderRim.x, resting.y - plan.floorUnderRim.y)).toBeLessThan(1e-6)
  })

  it('a pass flies between the two bodies at the END of the movement, then the ball belongs to the receiver', () => {
    const passerFrom = player('passer', 15, 4, 'home', true, true)
    const passerTo = player('passer', 17, 4, 'home', true)
    const receiver = player('receiver', 20, 11, 'home', true)
    const from = state([passerFrom, receiver], { owner: 'passer' })
    const to = state([passerTo, { ...receiver, hasBall: true }], { owner: 'receiver' })
    const seg = segment(from, to, 5, [event({ kind: 'passCompleted', sequence: 3, playerId: id('passer'), secondaryPlayerId: id('receiver') })])
    const plan = buildSegmentPlan(seg)
    const pass = plan.legs.find((l) => l.kind === 'pass')!
    expect(pass.startMs).toBeGreaterThanOrEqual(plan.moveMs)
    const mid = resolveBallAt(plan, (pass.startMs + pass.endMs) / 2)
    expect(mid.owner).toBeUndefined()
    expect(mid.state).toBe('passFlight')
    const end = resolveBallAt(plan, plan.durationMs)
    expect(end.owner).toBe(id('receiver'))
  })

  it('bodies never move faster than a sprint, whatever the engine step length (the v1 timer blend ran them at 30+ m/s)', () => {
    for (const simSeconds of [2, 4, 13, 24]) {
      const a = player('a', 4, 3, 'home', true)
      const a2 = player('a', 26, 12, 'home', true) // 26 m in one engine step
      const seg = segment(state([a]), state([a2]), simSeconds, [])
      const plan = buildSegmentPlan(seg)
      const motion = plan.motions.get(id('a'))!
      let maxSpeed = 0
      let previous = playerPositionAt(motion, 0)
      for (let t = 16; t <= plan.durationMs; t += 16) {
        const next = playerPositionAt(motion, t)
        maxSpeed = Math.max(maxSpeed, Math.hypot(next.x - previous.x, next.y - previous.y) / 0.016)
        previous = next
      }
      expect(maxSpeed).toBeLessThan(SEGMENT_TIMING.maxMeanSpeedMps * 1.6)
    }
  })

  it('arrives exactly at the engine end position when the movement phase ends (no drift, no overshoot)', () => {
    const a = player('a', 4, 3, 'home', true)
    const a2 = player('a', 12.5, 9.25, 'home', true)
    const plan = buildSegmentPlan(segment(state([a]), state([a2]), 6, []))
    const end = playerPositionAt(plan.motions.get(id('a'))!, plan.moveMs)
    const target = toMeters(a2.position, LENGTH, WIDTH)
    expect(end.x).toBeCloseTo(target.x, 6)
    expect(end.y).toBeCloseTo(target.y, 6)
    expect(motionFraction(0, 2000)).toBe(0)
    expect(motionFraction(2000, 2000)).toBe(1)
  })

  it('a substitute takes over the ball and the spot of the player he replaces (no flight is drawn)', () => {
    const out = player('out', 14, 7.5, 'home', true, true)
    const inn = player('in', 14, 7.5, 'home', true, true)
    const seg = segment(state([out], { owner: 'out' }), state([inn], { owner: 'in' }), 0, [event({ kind: 'substitution', sequence: 2, playerId: id('in'), secondaryPlayerId: id('out') })], {
      substitutions: [{ playerInId: id('in'), playerOutId: id('out') }],
    })
    const plan = buildSegmentPlan(seg)
    expect(plan.legs.some((l) => l.kind === 'handoff' || l.kind === 'pickup')).toBe(false)
    expect(resolveBallAt(plan, plan.durationMs).owner).toBe(id('in'))
  })
})

describe('PresentationDirector (BT1)', () => {
  it('plays queued segments strictly in order and fires every engine event exactly once, in engine order', () => {
    const director = new PresentationDirector(shotSegment(true).from)
    const segments = [shotSegment(true), shotSegment(false)].map((s, i) => ({ ...s, index: i }))
    for (const s of segments) director.enqueue(s)
    const fired: number[] = []
    let guard = 0
    while (director.pending > 0 && guard < 20000) {
      guard += 1
      for (const beat of director.advance(16).firedBeats) if (beat.event !== undefined) fired.push(beat.event.sequence)
    }
    expect(fired).toEqual([5, 5, 6])
  })

  it('never blends authoritative facts: the clock only moves inside the movement phase and the score only at events', () => {
    const seg = shotSegment(true)
    const director = new PresentationDirector(seg.from)
    director.enqueue(seg)
    const first = director.advance(1)
    expect(first.state.clock.clockSecondsRemaining).toBeLessThanOrEqual(600)
    expect(first.state.score).toEqual({ home: 0, away: 0 })
    const done = director.advance(60000)
    expect(done.state.score).toEqual({ home: 3, away: 0 })
    expect(done.phase).toBe('idle')
  })

  it('the HUD possession flips only when the resolving event has happened on screen', () => {
    const seg = shotSegment(true)
    const director = new PresentationDirector(seg.from)
    director.enqueue(seg)
    const plan = buildSegmentPlan(seg)
    const madeAt = plan.beats.find((b) => b.kind === 'shotMade')!.atMs
    expect(director.advance(madeAt - 100).state.possession.offensiveTeamId).toBe(HOME)
    expect(director.advance(400).state.possession.offensiveTeamId).toBe(AWAY)
  })

  it('pausing (speed 0) freezes playback', () => {
    const seg = shotSegment(true)
    const director = new PresentationDirector(seg.from)
    director.enqueue(seg)
    director.setSpeed(0)
    const a = director.advance(5000)
    const b = director.advance(5000)
    expect(b.segmentTimeMs).toBe(a.segmentTimeMs)
  })
})
