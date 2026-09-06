import type { PlayerId } from '@/domain/ids'
import type { CourtProjection } from './CourtProjection'
import {
  createCourtAnimationState,
  pruneStalePlayers,
  retargetBallMotion,
  retargetPlayerMotion,
  samplePoint,
  sampleProgress,
  syncPauseState,
  type CourtAnimationState,
} from './CourtAnimationState'
import { heldBallOffsetPercent, drawCourtBall } from './CourtBallRenderer'
import {
  courtPercentToMetres,
  drawCourtPlayerToken,
  drawCourtPlayerName,
  drawPlayerFloorIndicators,
  drawPlayerShadow,
  sortPlayersByScreenDepth,
} from './CourtPlayerRenderer'
import { getPlayerVisualScale } from './CourtPlayerScale'
import {
  COURT_PLAYER_VISUAL,
  type CourtDynamicFrame,
  type CourtDynamicPlayer,
  type CourtPoint2,
} from './CourtEntityTypes'

export type CourtDynamicRendererOptions = {
  readonly debug?: boolean
}

/**
 * Per-frame dynamic layer:
 * shadows + floor indicators → bodies (depth-sorted) → ball → debug
 * Static court remains cached in CourtRenderer.
 */
export class CourtDynamicRenderer {
  private readonly animation: CourtAnimationState = createCourtAnimationState()
  private debug: boolean

  public constructor(options: CourtDynamicRendererOptions = {}) {
    this.debug = options.debug ?? false
  }

  public setDebug(debug: boolean): void {
    this.debug = debug
  }

  public syncFrame(frame: CourtDynamicFrame, now: number): void {
    syncPauseState(this.animation, frame.isPlaying, now)
    const active = new Set<PlayerId>()
    for (const player of frame.players) {
      active.add(player.playerId)
      retargetPlayerMotion(
        this.animation,
        player.playerId,
        { x: player.xPercent, y: player.yPercent },
        now,
        frame.playbackSpeed,
        frame.isPlaying,
        player.facingHint,
      )
    }
    pruneStalePlayers(this.animation, active)

    if (frame.ball !== null) {
      retargetBallMotion(
        this.animation,
        { x: frame.ball.xPercent, y: frame.ball.yPercent, z: frame.ball.z },
        now,
        frame.playbackSpeed,
        frame.isPlaying,
      )
    } else {
      this.animation.ball = null
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    projection: CourtProjection,
    frame: CourtDynamicFrame,
    now: number,
  ): void {
    this.syncFrame(frame, now)

    const prepared = frame.players.map((player) => {
      const motion = this.animation.players.get(player.playerId)!
      const t = sampleProgress(
        motion.startedAt,
        motion.durationMs,
        now,
        motion.pauseAccumMs,
        motion.pausedAt,
      )
      const percent = samplePoint(motion.from, motion.to, t)
      const court = courtPercentToMetres(percent.x, percent.y, projection)
      const screen = projection.project(court)
      const scale = getPlayerVisualScale(court, projection)
      return {
        player,
        court,
        facing: motion.facing,
        screenY: screen.y,
        screenX: screen.x,
        scale,
        percent,
      }
    })

    const ordered = sortPlayersByScreenDepth(prepared)

    // Pass 1: contact shadows + floor rings (under all bodies)
    for (const entry of ordered) {
      drawPlayerShadow(ctx, entry.screenX, entry.screenY, entry.scale)
      drawPlayerFloorIndicators(
        ctx,
        entry.screenX,
        entry.screenY,
        entry.scale,
        entry.player.hasBall,
        entry.player.selected,
      )
    }

    // Pass 2: tokens depth-sorted (near covers far)
    for (const entry of ordered) {
      drawCourtPlayerToken(ctx, entry.player, entry.screenX, entry.screenY, entry.scale)
    }

    // Pass 2b: names under tokens (after discs so labels stay legible)
    for (const entry of ordered) {
      drawCourtPlayerName(ctx, entry.player, entry.screenX, entry.screenY, entry.scale)
    }

    // Pass 3: ball
    if (frame.ball !== null && this.animation.ball !== null) {
      const motion = this.animation.ball
      const t = sampleProgress(
        motion.startedAt,
        motion.durationMs,
        now,
        motion.pauseAccumMs,
        motion.pausedAt,
      )
      const owner = frame.ball.ownerPlayerId
      let percent: CourtPoint2 = {
        x: samplePoint(motion.from, motion.to, t).x,
        y: samplePoint(motion.from, motion.to, t).y,
      }
      let z = motion.from.z + (motion.to.z - motion.from.z) * t

      if (owner !== null && (frame.ball.state === 'HELD' || frame.ball.state === 'DRIBBLE')) {
        const holder = prepared.find((p) => p.player.playerId === owner)
        if (holder !== undefined) {
          const offset = heldBallOffsetPercent(holder.facing)
          percent = { x: holder.percent.x + offset.x, y: holder.percent.y + offset.y }
          z = frame.ball.state === 'DRIBBLE' ? 0.35 : 0.55
        }
      }

      const court = courtPercentToMetres(percent.x, percent.y, projection)
      drawCourtBall(ctx, projection, { court, z, state: frame.ball.state })
    }

    if (this.debug || frame.debug) {
      this.drawDebug(ctx, projection, prepared)
    }
  }

  public hitTestPlayer(
    projection: CourtProjection,
    frame: CourtDynamicFrame,
    canvasX: number,
    canvasY: number,
    now: number,
  ): PlayerId | null {
    this.syncFrame(frame, now)
    let bestId: PlayerId | null = null
    let bestDist = 26
    for (const player of frame.players) {
      const motion = this.animation.players.get(player.playerId)
      if (motion === undefined) continue
      const t = sampleProgress(
        motion.startedAt,
        motion.durationMs,
        now,
        motion.pauseAccumMs,
        motion.pausedAt,
      )
      const percent = samplePoint(motion.from, motion.to, t)
      const court = courtPercentToMetres(percent.x, percent.y, projection)
      const screen = projection.project(court)
      const hitR = COURT_PLAYER_VISUAL.RADIUS * getPlayerVisualScale(court, projection)
      const dist = Math.hypot(screen.x - canvasX, screen.y - canvasY)
      if (dist < Math.max(bestDist, hitR)) {
        bestDist = dist
        bestId = player.playerId
      }
    }
    return bestId
  }

  private drawDebug(
    ctx: CanvasRenderingContext2D,
    projection: CourtProjection,
    prepared: readonly {
      readonly player: CourtDynamicPlayer
      readonly court: CourtPoint2
      readonly percent: CourtPoint2
      readonly scale: number
    }[],
  ): void {
    ctx.save()
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(45,216,255,0.85)'
    for (const entry of prepared) {
      const s = projection.project(entry.court)
      ctx.fillText(
        `${entry.player.jersey} s=${entry.scale.toFixed(2)}`,
        s.x + 10,
        s.y - 12,
      )
    }
    const c = projection.courtCorners
    ctx.strokeStyle = 'rgba(45,216,255,0.35)'
    ctx.beginPath()
    ctx.moveTo(c[0]!.x, c[0]!.y)
    for (let i = 1; i < c.length; i += 1) ctx.lineTo(c[i]!.x, c[i]!.y)
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }
}
