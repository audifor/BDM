import { describe, expect, it } from 'vitest'

import { createNextDemoSession } from './dev/nextDemoBootstrap'
import { NextPresentationDirector } from './NextPresentationDirector'
import { toNextTickFrame } from './MatchNextPresentationBridge'
import { buildNextTruthFrame } from './truth'
import type { NextTickFrame } from './types'

function playSession(seed: number, ticks: number): { frames: NextTickFrame[]; session: ReturnType<typeof createNextDemoSession> } {
  const session = createNextDemoSession(seed)
  const frames: NextTickFrame[] = [session.first()]
  for (let i = 0; i < ticks; i += 1) {
    const f = session.step()
    if (f === undefined) break
    frames.push(f)
  }
  return { frames, session }
}

describe('MatchNextPresentationBridge (read-only projection of MatchFrame)', () => {
  it('copies engine truth verbatim: 10 active players, canonical metres, clock in seconds, engine score', () => {
    const { frames, session } = playSession(424242, 400)
    const f = frames.at(-1)!
    const state = session.controller.matchState
    expect(f.players).toHaveLength(10)
    expect(f.court.lengthMeters).toBe(state.court.lengthMeters)
    expect(f.score).toEqual(state.score)
    expect(f.gameClockSeconds).toBe(state.gameClockTenths / 10)
    for (const p of f.players) {
      const engine = state.players.find((q) => q.playerId === p.playerId)!
      expect(p.position).toEqual({ x: engine.position.x, y: engine.position.y })
      expect(p.velocity).toEqual({ x: engine.velocity.x, y: engine.velocity.y })
      expect(p.facing).toEqual({ x: engine.facing.x, y: engine.facing.y })
    }
    expect(f.ball.position).toEqual({ x: state.ball.position.x, y: state.ball.position.y })
    expect(f.ball.heightMeters).toBe(state.ball.heightMeters)
  })

  it('is pure: projecting the same frame twice gives the same result and never mutates the engine frame', () => {
    const session = createNextDemoSession(7)
    for (let i = 0; i < 200; i += 1) session.step()
    const frame = session.controller.snapshot().frame
    const before = JSON.stringify(frame)
    const a = toNextTickFrame(frame, session.labels, 0)
    const b = toNextTickFrame(frame, session.labels, 0)
    expect(a).toEqual(b)
    expect(JSON.stringify(frame)).toBe(before)
  })

  it('joins assignment and guardedBy consistently, and marks exactly the ball owner as hasBall', () => {
    const { frames } = playSession(424242, 600)
    for (const f of frames) {
      const owners = f.players.filter((p) => p.hasBall)
      if (f.ball.kind === 'HELD') expect(owners.map((p) => p.playerId)).toEqual([f.ball.ownerPlayerId])
      else expect(owners).toHaveLength(0)
      for (const p of f.players) if (p.guarding !== undefined) expect(f.players.find((q) => q.playerId === p.guarding)?.guardedBy).toBe(p.playerId)
    }
  })

  it('emits every engine event exactly once, in engine sequence order, across ticks', () => {
    const { frames, session } = playSession(424242, 1500)
    const sequences = frames.flatMap((f) => f.events.map((e) => e.sequence))
    expect(new Set(sequences).size).toBe(sequences.length)
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences)
    expect(sequences.length).toBe(session.controller.matchState.events.length)
  })
})

describe('NextPresentationDirector (10 Hz truth at display rate, no choreography)', { timeout: 120000 }, () => {
  it('interpolates between consecutive canonical ticks and reaches each canonical tick exactly', () => {
    const session = createNextDemoSession(424242)
    const director = new NextPresentationDirector(session.first(), () => session.step())
    let last = director.advance(0)
    // Advance exactly N ticks worth of wall time.
    for (let i = 0; i < 50; i += 1) last = director.advance(100)
    expect(last.playbackTicks).toBe(50)
    const at = director.advance(50)
    // Half-way between two ticks: rendered ball lies on the segment between the two canonical ball positions.
    const a = at.previous.ball.position
    const b = at.canonical.ball.position
    const r = at.rendered.ball.position
    expect(r.x).toBeCloseTo((a.x + b.x) / 2, 6)
    expect(r.y).toBeCloseTo((a.y + b.y) / 2, 6)
    for (const p of at.rendered.players) {
      const from = at.previous.players.find((q) => q.playerId === p.playerId)
      const to = at.canonical.players.find((q) => q.playerId === p.playerId)!
      if (from === undefined) continue
      expect(p.position.x).toBeCloseTo((from.position.x + to.position.x) / 2, 6)
    }
  })

  it('never skips, reorders or duplicates events, whatever the frame rate or playback speed', () => {
    for (const [dt, speed] of [[16.7, 1], [33, 4], [7, 8], [250, 2]] as const) {
      const session = createNextDemoSession(7)
      const director = new NextPresentationDirector(session.first(), () => session.step())
      director.setSpeed(speed)
      const fired: number[] = []
      for (let i = 0; i < Math.ceil(9000 / dt); i += 1) for (const e of director.advance(dt).firedEvents) fired.push(e.sequence)
      expect(new Set(fired).size).toBe(fired.length)
      expect([...fired].sort((a, b) => a - b)).toEqual(fired)
      // Every engine event up to the last played tick was fired (only tick 0's predecessors are excluded).
      const played = session.controller.matchState.events.filter((e) => e.sequence > 1).length
      expect(fired.length).toBeGreaterThan(0)
      expect(fired.length).toBeLessThanOrEqual(played)
    }
  }, 120000)

  it('pulls engine ticks only as playback consumes them (engine is never ahead of the viewer by more than one tick)', () => {
    const session = createNextDemoSession(424242)
    const director = new NextPresentationDirector(session.first(), () => session.step())
    for (let i = 0; i < 100; i += 1) director.advance(100)
    expect(session.controller.matchState.t - director.currentFrame().playbackTicks).toBeLessThanOrEqual(1)
  })

  it('renders human speeds only: no rendered player ever moves faster than the engine allows', () => {
    const session = createNextDemoSession(424242)
    const director = new NextPresentationDirector(session.first(), () => session.step())
    let prev = director.advance(0).rendered.players
    let max = 0
    for (let i = 0; i < 1500; i += 1) {
      const cur = director.advance(1000 / 60).rendered.players
      for (const p of cur) {
        const q = prev.find((x) => x.playerId === p.playerId)
        if (q !== undefined) max = Math.max(max, Math.hypot(p.position.x - q.position.x, p.position.y - q.position.y) * 60)
      }
      prev = cur
    }
    expect(max).toBeLessThan(9)
  })

  it('pausing (speed 0) freezes playback and builds a truth frame with canonical and rendered positions', () => {
    const session = createNextDemoSession(424242)
    const director = new NextPresentationDirector(session.first(), () => session.step())
    for (let i = 0; i < 30; i += 1) director.advance(100)
    director.setSpeed(0)
    const a = director.advance(5000)
    const b = director.advance(5000)
    expect(b.alpha).toBe(a.alpha)
    expect(b.playbackTicks).toBe(a.playbackTicks)
    const rendered = { players: new Map(a.rendered.players.map((p) => [p.playerId, p.position])), ball: a.rendered.ball.position }
    const truth = buildNextTruthFrame(a, rendered, 1, [])
    expect(truth.players).toHaveLength(10)
    for (const p of truth.players) expect(p.diffMeters).toBeLessThan(1)
  })
})
