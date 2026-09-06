import type { PlayerId } from '@/domain/ids'
import type { CourtPoint2 } from './CourtEntityTypes'

export type PlayerMotionSample = {
  from: CourtPoint2
  to: CourtPoint2
  startedAt: number
  durationMs: number
  facing: number
  /** Wall-clock pause accumulation */
  pausedAt: number | null
  pauseAccumMs: number
}

export type BallMotionSample = {
  from: CourtPoint2 & { readonly z: number }
  to: CourtPoint2 & { readonly z: number }
  startedAt: number
  durationMs: number
  pausedAt: number | null
  pauseAccumMs: number
}

export type CourtAnimationState = {
  readonly players: Map<PlayerId, PlayerMotionSample>
  ball: BallMotionSample | null
}

export function createCourtAnimationState(): CourtAnimationState {
  return { players: new Map(), ball: null }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Smoothstep ease — soft in/out without overshoot. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function interpolationDurationMs(baseMs: number, playbackSpeed: number): number {
  const speed = Math.max(0.25, playbackSpeed)
  return Math.max(40, baseMs / speed)
}

export function sampleProgress(
  startedAt: number,
  durationMs: number,
  now: number,
  pauseAccumMs: number,
  pausedAt: number | null,
): number {
  if (durationMs <= 0) return 1
  const effectiveNow = pausedAt !== null ? pausedAt : now
  const elapsed = Math.max(0, effectiveNow - startedAt - pauseAccumMs)
  return easeInOut(Math.min(1, elapsed / durationMs))
}

export function samplePoint(from: CourtPoint2, to: CourtPoint2, t: number): CourtPoint2 {
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }
}

export function facingFromDelta(dx: number, dy: number, fallback: number): number {
  if (dx * dx + dy * dy < 1e-6) return fallback
  return Math.atan2(dy, dx)
}

/**
 * Retarget player motion when presentation tracking updates.
 * Continuity: current interpolated position becomes the new `from`.
 */
export function retargetPlayerMotion(
  state: CourtAnimationState,
  playerId: PlayerId,
  target: CourtPoint2,
  now: number,
  playbackSpeed: number,
  isPlaying: boolean,
  facingHint?: number,
): void {
  const existing = state.players.get(playerId)
  const baseDuration = 280
  const durationMs = interpolationDurationMs(baseDuration, playbackSpeed)

  if (existing === undefined) {
    state.players.set(playerId, {
      from: target,
      to: target,
      startedAt: now,
      durationMs,
      facing: facingHint ?? 0,
      pausedAt: isPlaying ? null : now,
      pauseAccumMs: 0,
    })
    return
  }

  const t = sampleProgress(
    existing.startedAt,
    existing.durationMs,
    now,
    existing.pauseAccumMs,
    existing.pausedAt,
  )
  const current = samplePoint(existing.from, existing.to, t)
  const dx = target.x - current.x
  const dy = target.y - current.y
  const facing =
    facingHint !== undefined
      ? facingHint
      : facingFromDelta(dx, dy, existing.facing)

  // Ignore tiny target jitter
  if (Math.hypot(target.x - existing.to.x, target.y - existing.to.y) < 0.15) {
    existing.facing = facing
    return
  }

  state.players.set(playerId, {
    from: current,
    to: target,
    startedAt: now,
    durationMs,
    facing,
    pausedAt: isPlaying ? null : now,
    pauseAccumMs: 0,
  })
}

export function retargetBallMotion(
  state: CourtAnimationState,
  target: CourtPoint2 & { readonly z: number },
  now: number,
  playbackSpeed: number,
  isPlaying: boolean,
): void {
  const existing = state.ball
  const durationMs = interpolationDurationMs(220, playbackSpeed)
  if (existing === null) {
    state.ball = {
      from: target,
      to: target,
      startedAt: now,
      durationMs,
      pausedAt: isPlaying ? null : now,
      pauseAccumMs: 0,
    }
    return
  }
  const t = sampleProgress(
    existing.startedAt,
    existing.durationMs,
    now,
    existing.pauseAccumMs,
    existing.pausedAt,
  )
  const current = {
    x: lerp(existing.from.x, existing.to.x, t),
    y: lerp(existing.from.y, existing.to.y, t),
    z: lerp(existing.from.z, existing.to.z, t),
  }
  state.ball = {
    from: current,
    to: target,
    startedAt: now,
    durationMs,
    pausedAt: isPlaying ? null : now,
    pauseAccumMs: 0,
  }
}

export function syncPauseState(state: CourtAnimationState, isPlaying: boolean, now: number): void {
  for (const sample of state.players.values()) {
    if (!isPlaying && sample.pausedAt === null) {
      sample.pausedAt = now
    } else if (isPlaying && sample.pausedAt !== null) {
      sample.pauseAccumMs += now - sample.pausedAt
      sample.pausedAt = null
    }
  }
  if (state.ball !== null) {
    const sample = state.ball
    if (!isPlaying && sample.pausedAt === null) {
      sample.pausedAt = now
    } else if (isPlaying && sample.pausedAt !== null) {
      sample.pauseAccumMs += now - sample.pausedAt
      sample.pausedAt = null
    }
  }
}

export function pruneStalePlayers(state: CourtAnimationState, activeIds: ReadonlySet<PlayerId>): void {
  for (const id of state.players.keys()) {
    if (!activeIds.has(id)) state.players.delete(id)
  }
}
