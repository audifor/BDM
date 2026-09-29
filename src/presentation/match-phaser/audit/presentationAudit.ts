/**
 * Basketball Truth (BT1F / BT1G / BT1H) — headless PRESENTATION audit.
 *
 * Drives a real seeded MatchEngine session through a presentation pipeline at a fixed 60 fps
 * frame step and measures what the viewer would actually see, in metres and seconds:
 *
 *  - how fast bodies and the ball move on screen (teleports, > sprint speed),
 *  - whether the ball is connected to the action (held ball at its owner, flights reach the rim),
 *  - whether events are shown in order and none is dropped,
 *  - whether the score changes when the ball actually arrives.
 *
 * The same metrics are computed for the pipeline that shipped in match-presentation-v1
 * ("legacy": engine ticks on a wall-clock timer, 650 ms blend between snapshots, exponential
 * locomotion smoothing) and for the BT1 director, so the before/after numbers are comparable.
 */

import type { MatchEvent, MatchSessionState } from '@/engine/match'
import { createMatchDemo } from '../dev/matchDemoBootstrap'
import { toMatchPresentationSegment, toMatchPresentationState, toMatchPresentationEvents } from '../MatchPresentationBridge'
import { PresentationDirector } from '../PresentationDirector'
import { toMeters } from '../segmentPlan'
import type { MatchPresentationEvent, MatchPresentationState } from '../visualTypes'
import { PresentationPlayback } from '../legacy/interpolation'
import { LocomotionSystem } from '../legacy/locomotion'

export interface PipelineMetrics {
  readonly pipeline: 'legacy' | 'director'
  readonly seed: number
  readonly engineSteps: number
  readonly simSeconds: number
  readonly wallSeconds: number
  readonly simToWallRatio: number
  readonly maxPlayerSpeedMps: number
  readonly p99PlayerSpeedMps: number
  readonly framesWithPlayerAbove9Mps: number
  readonly totalFrames: number
  readonly playerTeleportsOver2mPerFrame: number
  readonly maxBallSpeedMps: number
  readonly meanRenderedLagMeters: number
  readonly p95RenderedLagMeters: number
  readonly heldBallDisconnectedFrames: number
  readonly heldBallFrames: number
  readonly shotEvents: number
  readonly shotsWhereBallReachedRim: number
  readonly minBallToRimMetersAtShot: readonly number[]
  readonly eventsEmitted: number
  readonly eventsDisplayed: number
  readonly eventsDisplayedOutOfOrder: number
  readonly madeShotScoreChangeBallToRimMeters: readonly number[]
  /** Times the viewer saw a made-basket event and, within 1.5 s of wall clock, a rebound event (impossible in one possession). */
  readonly madeThenReboundShownWithin1500ms: number
}

interface FrameSample {
  readonly players: ReadonlyMap<string, { x: number; y: number }>
  readonly ball: { x: number; y: number }
  readonly ballOwner: string | undefined
  readonly ballState: string
  readonly canonicalPlayers: ReadonlyMap<string, { x: number; y: number }>
  readonly score: { home: number; away: number }
}

const FRAME_MS = 1000 / 60

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}

function pointsOf(state: MatchPresentationState): Map<string, { x: number; y: number }> {
  return new Map(state.players.map((p) => [String(p.playerId), toMeters(p.position, state.court.lengthMeters, state.court.widthMeters)]))
}

function rimsOf(state: MatchPresentationState): { x: number; y: number }[] {
  return [state.court.baskets.left, state.court.baskets.right].map((b) => toMeters(b, state.court.lengthMeters, state.court.widthMeters))
}

interface Collector {
  readonly frames: FrameSample[]
  readonly displayedScoreChanges: { frame: number; kind: 'made' }[]
}

function finish(
  pipeline: PipelineMetrics['pipeline'],
  seed: number,
  frames: readonly FrameSample[],
  engineSteps: number,
  simSeconds: number,
  rims: { x: number; y: number }[],
  eventLog: { engineEvents: readonly MatchEvent[]; displayed: readonly number[]; displayedKinds: readonly { readonly frame: number; readonly kind: string }[] },
  shotWindows: readonly { startFrame: number; endFrame: number; made: boolean }[],
): PipelineMetrics {
  const speeds: number[] = []
  const lags: number[] = []
  let teleports = 0
  let maxBall = 0
  let above9 = 0
  let held = 0
  let disconnected = 0
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1]!
    const cur = frames[i]!
    let frameAbove = false
    for (const [id, p] of cur.players) {
      const q = prev.players.get(id)
      if (q === undefined) continue
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      const v = d / (FRAME_MS / 1000)
      speeds.push(v)
      if (v > 9) frameAbove = true
      if (d > 2) teleports += 1
      const c = cur.canonicalPlayers.get(id)
      if (c !== undefined) lags.push(Math.hypot(p.x - c.x, p.y - c.y))
    }
    if (frameAbove) above9 += 1
    maxBall = Math.max(maxBall, Math.hypot(cur.ball.x - prev.ball.x, cur.ball.y - prev.ball.y) / (FRAME_MS / 1000))
    if (cur.ballOwner !== undefined && (cur.ballState === 'held' || cur.ballState === 'dribble' || cur.ballState === 'catch')) {
      held += 1
      const owner = cur.players.get(cur.ballOwner)
      if (owner !== undefined && Math.hypot(owner.x - cur.ball.x, owner.y - cur.ball.y) > 1.2) disconnected += 1
    }
  }
  const minRim: number[] = []
  let reached = 0
  for (const window of shotWindows) {
    let best = Infinity
    for (let f = window.startFrame; f <= Math.min(window.endFrame, frames.length - 1); f += 1) {
      for (const rim of rims) best = Math.min(best, Math.hypot(frames[f]!.ball.x - rim.x, frames[f]!.ball.y - rim.y))
    }
    minRim.push(Number(best.toFixed(2)))
    if (best < 0.6) reached += 1
  }
  const madeScoreDistances: number[] = []
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1]!.score
    const b = frames[i]!.score
    if (b.home + b.away > a.home + a.away && b.home + b.away - a.home - a.away >= 2) {
      let best = Infinity
      for (const rim of rims) best = Math.min(best, Math.hypot(frames[i]!.ball.x - rim.x, frames[i]!.ball.y - rim.y))
      madeScoreDistances.push(Number(best.toFixed(2)))
    }
  }
  const displayedSeqs = eventLog.displayed
  let outOfOrder = 0
  for (let i = 1; i < displayedSeqs.length; i += 1) if (displayedSeqs[i]! < displayedSeqs[i - 1]!) outOfOrder += 1
  const wallSeconds = (frames.length * FRAME_MS) / 1000
  return {
    pipeline,
    seed,
    engineSteps,
    simSeconds: Number(simSeconds.toFixed(1)),
    wallSeconds: Number(wallSeconds.toFixed(1)),
    simToWallRatio: Number((simSeconds / Math.max(0.001, wallSeconds)).toFixed(2)),
    maxPlayerSpeedMps: Number(speeds.reduce((a, b) => (b > a ? b : a), 0).toFixed(1)),
    p99PlayerSpeedMps: Number(percentile(speeds, 0.99).toFixed(1)),
    framesWithPlayerAbove9Mps: above9,
    totalFrames: frames.length,
    playerTeleportsOver2mPerFrame: teleports,
    maxBallSpeedMps: Number(maxBall.toFixed(1)),
    meanRenderedLagMeters: Number((lags.reduce((a, b) => a + b, 0) / Math.max(1, lags.length)).toFixed(2)),
    p95RenderedLagMeters: Number(percentile(lags, 0.95).toFixed(2)),
    heldBallDisconnectedFrames: disconnected,
    heldBallFrames: held,
    shotEvents: shotWindows.length,
    shotsWhereBallReachedRim: reached,
    minBallToRimMetersAtShot: minRim,
    eventsEmitted: eventLog.engineEvents.length,
    eventsDisplayed: displayedSeqs.length,
    eventsDisplayedOutOfOrder: outOfOrder,
    madeShotScoreChangeBallToRimMeters: madeScoreDistances,
    madeThenReboundShownWithin1500ms: countMadeThenRebound(eventLog.displayedKinds),
  }
}

function countMadeThenRebound(shown: readonly { readonly frame: number; readonly kind: string }[]): number {
  let count = 0
  for (let i = 0; i < shown.length; i += 1) {
    if (shown[i]!.kind !== 'shotMade') continue
    for (let j = i + 1; j < shown.length && shown[j]!.frame - shown[i]!.frame <= 1500 / FRAME_MS; j += 1) {
      if (shown[j]!.kind === 'rebound') {
        count += 1
        break
      }
    }
  }
  return count
}

/** The match-presentation-v1 pipeline, reproduced exactly (timer-driven engine, 650 ms blend, eased locomotion, double paint per frame). */
export function runLegacyPipeline(seed: number, engineSteps: number): PipelineMetrics {
  const demo = createMatchDemo(seed)
  const collector: Collector = { frames: [], displayedScoreChanges: [] }
  let playback: PresentationPlayback | undefined
  const locomotion = new LocomotionSystem()
  const engineEvents: MatchEvent[] = []
  const displayed: number[] = []
  const displayedKinds: { frame: number; kind: string }[] = []
  const shotWindows: { startFrame: number; endFrame: number; made: boolean }[] = []
  let pending: MatchPresentationEvent[] = []
  let lastRendered = 0
  let simSeconds = 0
  let canonical = toMatchPresentationState(demo.session.state, demo.labels)
  playback = new PresentationPlayback(canonical, 650)
  const rims = rimsOf(canonical)
  const engineIntervalMs = 1000 / 3
  let sinceStep = engineIntervalMs
  let stepsDone = 0
  let prevState: MatchSessionState = demo.session.state
  let openShot: { startFrame: number; made: boolean } | undefined
  while (stepsDone < engineSteps) {
    sinceStep += FRAME_MS
    if (sinceStep >= engineIntervalMs) {
      sinceStep -= engineIntervalMs
      const before = demo.session.state
      const next = demo.step().state
      const newEvents = next.events.slice(before.events.length)
      simSeconds += next.period === before.period ? Math.max(0, before.clockSecondsRemaining - next.clockSecondsRemaining) : 0
      engineEvents.push(...newEvents)
      canonical = toMatchPresentationState(next, demo.labels)
      playback.pushSnapshot(canonical)
      pending = [...pending, ...toMatchPresentationEvents(newEvents)].slice(-20)
      stepsDone += 1
      prevState = next
      if (newEvents.some((e) => e.type === 'shotMade' || e.type === 'shotMissed')) {
        if (openShot !== undefined) shotWindows.push({ startFrame: openShot.startFrame, endFrame: collector.frames.length, made: openShot.made })
        openShot = { startFrame: collector.frames.length, made: newEvents.some((e) => e.type === 'shotMade') }
        // the window closes after the next 650 ms of playback
        shotWindows.push({ startFrame: collector.frames.length, endFrame: collector.frames.length + Math.ceil(650 / FRAME_MS), made: openShot.made })
        openShot = undefined
      }
    }
    playback.advance(FRAME_MS)
    const frame = playback.currentFrame()
    // The scene paints twice per frame (renderFrame from the STEP hook, then Scene.update): locomotion is stepped twice.
    locomotion.step(frame, 16.6 / 1000)
    const samples = locomotion.step(frame, FRAME_MS / 1000)
    const players = new Map(samples.map((s) => [s.playerId, toMeters({ xPercent: s.renderedXPercent, yPercent: s.renderedYPercent }, frame.court.lengthMeters, frame.court.widthMeters)]))
    const ball = toMeters(frame.ball.position, frame.court.lengthMeters, frame.court.widthMeters)
    collector.frames.push({
      players,
      ball,
      ballOwner: frame.ball.ownerPlayerId === undefined ? undefined : String(frame.ball.ownerPlayerId),
      ballState: frame.ball.state,
      canonicalPlayers: pointsOf(canonical),
      score: { home: frame.score.home, away: frame.score.away },
    })
    // Scene.paintEvents: shows only the newest unseen event per frame.
    const newest = [...pending].reverse().find((event) => event.sequence > lastRendered)
    if (newest !== undefined) {
      lastRendered = newest.sequence
      displayed.push(newest.sequence)
      displayedKinds.push({ frame: collector.frames.length, kind: newest.kind })
    }
  }
  void prevState
  return finish('legacy', seed, collector.frames, stepsDone, simSeconds, rims, { engineEvents, displayed, displayedKinds }, shotWindows)
}

/** The BT1 pipeline: pull-based director, segments played in order, ball anchored to bodies/rim. */
export function runDirectorPipeline(seed: number, engineSteps: number, speed = 1): PipelineMetrics {
  const demo = createMatchDemo(seed)
  const collector: Collector = { frames: [], displayedScoreChanges: [] }
  const initial = toMatchPresentationState(demo.session.state, demo.labels)
  const director = new PresentationDirector(initial)
  director.setSpeed(speed)
  const rims = rimsOf(initial)
  const engineEvents: MatchEvent[] = []
  const displayed: number[] = []
  const displayedKinds: { frame: number; kind: string }[] = []
  const shotWindows: { startFrame: number; endFrame: number; made: boolean }[] = []
  let simSeconds = 0
  let stepsDone = 0
  let index = 0
  let previous = demo.session.state
  const openShots: { startFrame: number; made: boolean }[] = []
  let guard = 0
  while ((stepsDone < engineSteps || director.pending > 0) && guard < 2_000_000) {
    guard += 1
    while (director.pending < 2 && stepsDone < engineSteps && !demo.session.state.isComplete) {
      const before = previous
      const next = demo.step().state
      const segment = toMatchPresentationSegment({ index: index++, before, after: next, labels: demo.labels })
      director.enqueue(segment)
      engineEvents.push(...next.events.slice(before.events.length))
      simSeconds += segment.simSeconds
      stepsDone += 1
      previous = next
    }
    if (director.pending === 0) break
    const frame = director.advance(FRAME_MS)
    const state = frame.state
    const players = pointsOf(state)
    const ball = toMeters(state.ball.position, state.court.lengthMeters, state.court.widthMeters)
    collector.frames.push({
      players,
      ball,
      ballOwner: state.ball.ownerPlayerId === undefined ? undefined : String(state.ball.ownerPlayerId),
      ballState: state.ball.state,
      canonicalPlayers: new Map([...frame.canonical.players].map(([id, p]) => [String(id), toMeters(p, state.court.lengthMeters, state.court.widthMeters)])),
      score: { home: state.score.home, away: state.score.away },
    })
    for (const beat of frame.firedBeats) {
      if (beat.event !== undefined) {
        displayed.push(beat.event.sequence)
        displayedKinds.push({ frame: collector.frames.length - 1, kind: beat.event.kind })
      }
      if (beat.kind === 'shotRelease') openShots.push({ startFrame: collector.frames.length - 1, made: false })
      if (beat.kind === 'shotMade' || beat.kind === 'shotMissed') {
        const open = openShots.shift()
        if (open !== undefined) shotWindows.push({ startFrame: open.startFrame, endFrame: collector.frames.length - 1, made: beat.kind === 'shotMade' })
      }
    }
  }
  return finish('director', seed, collector.frames, stepsDone, simSeconds, rims, { engineEvents: engineEvents.filter((e) => e.type !== 'tacticalChange'), displayed, displayedKinds }, shotWindows)
}
