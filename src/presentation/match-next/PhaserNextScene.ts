/**
 * PhaserNextScene — pure presentation of MatchEngine Next (Phaser 4). Circles, lines and text over a METRIC court.
 *
 * It never imports `@/engine/match` (legacy) and never decides anything: it paints the NextRenderFrame it is given.
 * Two views of the same frame:
 *  - normal: team bodies, ball, ball-handler ring.
 *  - Basketball Truth: CANONICAL truth (the latest engine tick) as a hollow square, joined to the RENDERED body by a
 *    yellow line, plus each player's engine movement target (x), facing, defensive assignment, the offense's
 *    canonical 5-out slots, and the canonical ball ring vs the rendered ball.
 */

import Phaser from 'phaser'
import type { PlayerId } from '@/domain/ids'
import { MatchCamera, type CameraMode } from './camera'
import type { NextRenderFrame } from './NextPresentationDirector'
import type { NextCourt, NextPlayer, Pt } from './types'

export const PIXELS_PER_METER = 40

const HOME_COLOR = 0x3b82f6
const AWAY_COLOR = 0xef4444
const BALL_COLOR = 0xf97316
const FLOOR_COLOR = 0x1e2a38
const PAINT_COLOR = 0x26374a
const LINE_COLOR = 0xcbd5e1
const RIM_COLOR = 0xfbbf24
const HANDLER_RING = 0xfacc15
const TRUTH_LINK = 0xfde047
const TARGET_COLOR = 0xa78bfa
const FACING_COLOR = 0x22d3ee
const ASSIGN_COLOR = 0x94a3b8
const SLOT_COLOR = 0x34d399
const SCREEN_COLOR = 0xfacc15
const MOVE_CUT_COLOR = 0xf97316
const MOVE_DRIFT_COLOR = 0x22d3ee

const PLAYER_RADIUS_METERS = 0.45
const BALL_RADIUS_PX = 6.5
const LIFT_PX_PER_METER = 12

export interface NextSceneDebug {
  basketballTruth: boolean
  showAssignments: boolean
  showTargets: boolean
  showFacing: boolean
  showSlots: boolean
  /** BT2 diagnostics: ball screen geometry and off-ball moves. */
  showScreens: boolean
  showMoves: boolean
}

export interface NextSceneIdentification {
  showJersey: boolean
  showLabel: boolean
  showAction: boolean
}

export interface NextRenderedTruth {
  readonly players: ReadonlyMap<PlayerId, Pt>
  readonly ball: Pt
  readonly ballHeightMeters: number
}

interface PlayerVisual {
  readonly body: Phaser.GameObjects.Arc
  readonly jersey: Phaser.GameObjects.Text
  readonly name: Phaser.GameObjects.Text
  readonly action: Phaser.GameObjects.Text
  readonly nose: Phaser.GameObjects.Line
}

export type NextFrameProvider = (deltaMs: number) => NextRenderFrame | undefined

export class PhaserNextScene extends Phaser.Scene {
  private courtGraphics: Phaser.GameObjects.Graphics | undefined
  private courtKey: string | undefined
  private truthGraphics: Phaser.GameObjects.Graphics | undefined
  private ball: Phaser.GameObjects.Arc | undefined
  private ballShadow: Phaser.GameObjects.Ellipse | undefined
  private readonly visuals = new Map<string, PlayerVisual>()
  private readonly cameraModel = new MatchCamera()
  private provider: NextFrameProvider | undefined
  private lastFrame: NextRenderFrame | undefined
  private rendered: NextRenderedTruth | undefined
  private listener: ((frame: NextRenderFrame, rendered: NextRenderedTruth) => void) | undefined

  public readonly debug: NextSceneDebug = { basketballTruth: false, showAssignments: false, showTargets: false, showFacing: false, showSlots: false, showScreens: false, showMoves: false }
  public readonly identification: NextSceneIdentification = { showJersey: true, showLabel: false, showAction: false }

  public constructor() {
    super('PhaserNextScene')
  }

  public setFrameProvider(provider: NextFrameProvider): void {
    this.provider = provider
  }

  public onFrame(listener: (frame: NextRenderFrame, rendered: NextRenderedTruth) => void): void {
    this.listener = listener
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraModel.setMode(mode)
    this.cameraModel.snap()
  }

  public getCameraMode(): CameraMode {
    return this.cameraModel.getMode()
  }

  public snapCamera(): void {
    this.cameraModel.snap()
  }

  public getRenderedTruth(): NextRenderedTruth | undefined {
    return this.rendered
  }

  public getLastFrame(): NextRenderFrame | undefined {
    return this.lastFrame
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#0b0f14')
    this.courtGraphics = this.add.graphics().setDepth(0)
    this.truthGraphics = this.add.graphics().setDepth(30)
    this.ballShadow = this.add.ellipse(0, 0, BALL_RADIUS_PX * 2, BALL_RADIUS_PX * 0.9, 0x000000, 0.4).setDepth(19)
    this.ball = this.add.circle(0, 0, BALL_RADIUS_PX, BALL_COLOR).setStrokeStyle(1.5, 0x431407, 1).setDepth(25)
  }

  /** Phaser calls this once per frame: the single place where a frame is pulled and painted. */
  public override update(_time: number, deltaMs: number): void {
    const frame = this.provider?.(deltaMs)
    if (frame === undefined) return
    this.lastFrame = frame
    this.paint(frame, deltaMs)
  }

  private paint(frame: NextRenderFrame, deltaMs: number): void {
    const court = frame.canonical.court
    this.ensureCourt(court)
    const r = frame.rendered
    const attackedX = r.attackingBasket?.x ?? (r.ball.position.x > court.lengthMeters / 2 ? court.lengthMeters : 0)
    const cam = this.cameraModel.step(
      {
        ballXMeters: r.ball.position.x,
        ballYMeters: r.ball.position.y,
        attackedBasketXMeters: attackedX,
        courtLengthMeters: court.lengthMeters,
        courtWidthMeters: court.widthMeters,
        viewportWidthPx: this.scale.width,
        viewportHeightPx: this.scale.height,
        pixelsPerMeter: PIXELS_PER_METER,
      },
      deltaMs / 1000,
    )
    this.cameras.main.setZoom(cam.zoom)
    this.cameras.main.centerOn(cam.centerXMeters * PIXELS_PER_METER, cam.centerYMeters * PIXELS_PER_METER)

    const players = this.paintPlayers(frame)
    this.paintBall(frame)
    this.rendered = { players, ball: { x: r.ball.position.x, y: r.ball.position.y }, ballHeightMeters: r.ball.heightMeters }
    this.paintTruth(frame, this.rendered)
    this.listener?.(frame, this.rendered)
  }

  private ensureCourt(court: NextCourt): void {
    const key = `${court.lengthMeters}x${court.widthMeters}:${court.threePointArcRadiusMeters}:${court.threePointCornerOffsetMeters}`
    if (this.courtKey === key || this.courtGraphics === undefined) return
    this.courtKey = key
    this.drawCourt(this.courtGraphics, court)
  }

  private drawCourt(g: Phaser.GameObjects.Graphics, court: NextCourt): void {
    const ppm = PIXELS_PER_METER
    const L = court.lengthMeters
    const W = court.widthMeters
    g.clear()
    g.fillStyle(0x0f1722, 1)
    g.fillRect(-3 * ppm, -3 * ppm, (L + 6) * ppm, (W + 6) * ppm)
    g.fillStyle(FLOOR_COLOR, 1)
    g.fillRect(0, 0, L * ppm, W * ppm)
    g.lineStyle(2, LINE_COLOR, 1)
    g.strokeRect(0, 0, L * ppm, W * ppm)
    g.lineBetween((L / 2) * ppm, 0, (L / 2) * ppm, W * ppm)
    g.strokeCircle((L / 2) * ppm, (W / 2) * ppm, 1.8 * ppm)
    for (const basket of [court.baskets.left, court.baskets.right]) {
      const attacksRight = basket.x > L / 2
      const dir = attacksRight ? -1 : 1
      const baselineX = attacksRight ? L : 0
      const laneLen = 5.8
      const laneHalf = 2.45
      const laneX0 = Math.min(baselineX, baselineX + dir * laneLen)
      g.fillStyle(PAINT_COLOR, 1)
      g.fillRect(laneX0 * ppm, (W / 2 - laneHalf) * ppm, laneLen * ppm, laneHalf * 2 * ppm)
      g.lineStyle(2, LINE_COLOR, 1)
      g.strokeRect(laneX0 * ppm, (W / 2 - laneHalf) * ppm, laneLen * ppm, laneHalf * 2 * ppm)
      g.strokeCircle((baselineX + dir * laneLen) * ppm, (W / 2) * ppm, 1.8 * ppm)
      const R = court.threePointArcRadiusMeters
      const corner = court.threePointCornerOffsetMeters
      const dy = W / 2 - corner
      if (dy < R) {
        const phi0 = Math.asin(dy / R)
        const dx = Math.sqrt(R * R - dy * dy)
        const arcEndX = basket.x + dir * dx
        g.lineBetween(baselineX * ppm, corner * ppm, arcEndX * ppm, corner * ppm)
        g.lineBetween(baselineX * ppm, (W - corner) * ppm, arcEndX * ppm, (W - corner) * ppm)
        g.beginPath()
        const centre = dir < 0 ? Math.PI : 0
        g.arc(basket.x * ppm, basket.y * ppm, R * ppm, centre - phi0, centre + phi0, false)
        g.strokePath()
      }
      g.beginPath()
      const centre = dir < 0 ? Math.PI : 0
      g.arc(basket.x * ppm, basket.y * ppm, 1.25 * ppm, centre - Math.PI / 2, centre + Math.PI / 2, false)
      g.strokePath()
      const boardX = basket.x - dir * 0.375
      g.lineStyle(3, LINE_COLOR, 1)
      g.lineBetween(boardX * ppm, (basket.y - 0.9) * ppm, boardX * ppm, (basket.y + 0.9) * ppm)
      g.lineStyle(2.5, RIM_COLOR, 1)
      g.strokeCircle(basket.x * ppm, basket.y * ppm, 0.23 * ppm)
    }
  }

  private paintPlayers(frame: NextRenderFrame): Map<PlayerId, Pt> {
    const rendered = new Map<PlayerId, Pt>()
    const seen = new Set<string>()
    for (const player of frame.rendered.players) {
      const key = String(player.playerId)
      seen.add(key)
      rendered.set(player.playerId, player.position)
      const px = player.position.x * PIXELS_PER_METER
      const py = player.position.y * PIXELS_PER_METER
      let v = this.visuals.get(key)
      if (v === undefined) {
        v = this.createVisual(player, px, py)
        this.visuals.set(key, v)
      }
      v.body.setPosition(px, py)
      v.body.setAlpha(this.debug.basketballTruth ? 0.85 : 1)
      v.body.setStrokeStyle(player.hasBall ? 3 : 1.5, player.hasBall ? HANDLER_RING : 0x0b0f14, 1)
      v.jersey.setPosition(px, py).setVisible(this.identification.showJersey)
      v.name.setPosition(px, py + PLAYER_RADIUS_METERS * PIXELS_PER_METER + 9).setVisible(this.identification.showLabel)
      v.action
        .setPosition(px, py - PLAYER_RADIUS_METERS * PIXELS_PER_METER - 9)
        .setText(describe(player))
        .setVisible(this.identification.showAction)
      const r = PLAYER_RADIUS_METERS * PIXELS_PER_METER
      v.nose.setTo(0, 0, player.facing.x * (r + 6), player.facing.y * (r + 6)).setPosition(px, py).setVisible(true)
    }
    for (const [key, v] of this.visuals) {
      if (seen.has(key)) continue
      v.body.destroy()
      v.jersey.destroy()
      v.name.destroy()
      v.action.destroy()
      v.nose.destroy()
      this.visuals.delete(key)
    }
    return rendered
  }

  private createVisual(player: NextPlayer, x: number, y: number): PlayerVisual {
    const color = player.side === 'home' ? HOME_COLOR : AWAY_COLOR
    const body = this.add.circle(x, y, PLAYER_RADIUS_METERS * PIXELS_PER_METER, color).setDepth(10)
    const jersey = this.add.text(x, y, String(player.jersey), { fontFamily: 'monospace', fontSize: '13px', color: '#0b0f14', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11).setResolution(2)
    const name = this.add.text(x, y, player.label, { fontFamily: 'monospace', fontSize: '10px', color: '#e2e8f0' }).setOrigin(0.5).setDepth(12).setVisible(false).setResolution(2)
    const action = this.add.text(x, y, '', { fontFamily: 'monospace', fontSize: '10px', color: '#7dd3fc' }).setOrigin(0.5).setDepth(12).setVisible(false).setResolution(2)
    const nose = this.add.line(x, y, 0, 0, 0, 0, 0xffffff, 0.95).setLineWidth(3).setDepth(12)
    return { body, jersey, name, action, nose }
  }

  private paintBall(frame: NextRenderFrame): void {
    const b = frame.rendered.ball
    const px = b.position.x * PIXELS_PER_METER
    const py = b.position.y * PIXELS_PER_METER
    const lift = b.heightMeters * LIFT_PX_PER_METER
    this.ball?.setPosition(px, py - lift).setScale(1 + Math.min(1, b.heightMeters / 3) * 0.6)
    this.ballShadow?.setPosition(px, py + 1).setScale(Math.max(0.5, 1 - b.heightMeters * 0.12)).setVisible(b.heightMeters > 0.4)
  }

  private paintTruth(frame: NextRenderFrame, rendered: NextRenderedTruth): void {
    const g = this.truthGraphics
    if (g === undefined) return
    g.clear()
    if (!this.debug.basketballTruth) return
    const ppm = PIXELS_PER_METER
    const P = (p: Pt): Pt => ({ x: p.x * ppm, y: p.y * ppm })
    const half = 0.4 * ppm
    for (const canon of frame.canonical.players) {
      const color = canon.side === 'home' ? HOME_COLOR : AWAY_COLOR
      const rp = rendered.players.get(canon.playerId)
      if (rp === undefined) continue
      const c = P(canon.position)
      const r = P(rp)
      g.lineStyle(2.5, color, 1)
      g.lineBetween(c.x - half, c.y - half, c.x + half, c.y - half)
      g.lineBetween(c.x + half, c.y - half, c.x + half, c.y + half)
      g.lineBetween(c.x + half, c.y + half, c.x - half, c.y + half)
      g.lineBetween(c.x - half, c.y + half, c.x - half, c.y - half)
      if (Math.hypot(rp.x - canon.position.x, rp.y - canon.position.y) > 0.05) {
        g.lineStyle(1.5, TRUTH_LINK, 0.9)
        g.lineBetween(r.x, r.y, c.x, c.y)
      }
      if (this.debug.showTargets && canon.intentTarget !== undefined) {
        const t = P(canon.intentTarget)
        g.lineStyle(1.5, TARGET_COLOR, 0.5)
        g.lineBetween(c.x, c.y, t.x, t.y)
        g.lineStyle(2, TARGET_COLOR, 1)
        g.lineBetween(t.x - 5, t.y - 5, t.x + 5, t.y + 5)
        g.lineBetween(t.x - 5, t.y + 5, t.x + 5, t.y - 5)
      }
      if (this.debug.showFacing) {
        g.lineStyle(2, FACING_COLOR, 0.95)
        g.lineBetween(r.x, r.y, r.x + canon.facing.x * 1.8 * ppm, r.y + canon.facing.y * 1.8 * ppm)
      }
      if (this.debug.showAssignments && canon.guarding !== undefined) {
        const man = rendered.players.get(canon.guarding)
        if (man !== undefined) {
          const m = P(man)
          g.lineStyle(1.5, ASSIGN_COLOR, 0.65)
          g.lineBetween(r.x, r.y, m.x, m.y)
        }
      }
    }
    if (this.debug.showSlots) {
      g.lineStyle(2, SLOT_COLOR, 0.9)
      for (const slot of frame.canonical.offenseSlots) {
        const s = P(slot.position)
        g.lineBetween(s.x, s.y - 8, s.x + 8, s.y)
        g.lineBetween(s.x + 8, s.y, s.x, s.y + 8)
        g.lineBetween(s.x, s.y + 8, s.x - 8, s.y)
        g.lineBetween(s.x - 8, s.y, s.x, s.y - 8)
      }
    }
    if (this.debug.showScreens && frame.canonical.screen !== undefined) {
      const sc = frame.canonical.screen
      const at = P(sc.location)
      const way = P(sc.waypoint)
      const handler = rendered.players.get(sc.handlerId)
      const screener = rendered.players.get(sc.screenerId)
      g.lineStyle(3, SCREEN_COLOR, 1)
      g.strokeRect(at.x - 9, at.y - 9, 18, 18)
      g.lineStyle(2, SCREEN_COLOR, 0.8)
      g.lineBetween(at.x, at.y, way.x, way.y)
      g.strokeCircle(way.x, way.y, 4)
      if (handler !== undefined && screener !== undefined) {
        const h = P(handler)
        const s = P(screener)
        g.lineStyle(1.5, SCREEN_COLOR, 0.6)
        g.lineBetween(h.x, h.y, s.x, s.y)
      }
    }
    if (this.debug.showMoves && frame.canonical.flow !== undefined) {
      for (const move of frame.canonical.flow.moves) {
        const from = rendered.players.get(move.playerId)
        if (from === undefined) continue
        const a = P(from)
        const b = P(move.target)
        g.lineStyle(3, move.kind === 'DRIFT' ? MOVE_DRIFT_COLOR : MOVE_CUT_COLOR, 0.95)
        g.lineBetween(a.x, a.y, b.x, b.y)
        g.strokeCircle(b.x, b.y, 6)
      }
    }
    const cb = P(frame.canonical.ball.position)
    g.lineStyle(2.5, BALL_COLOR, 1)
    g.strokeCircle(cb.x, cb.y, BALL_RADIUS_PX + 5)
    const rb = P(rendered.ball)
    if (Math.hypot(rendered.ball.x - frame.canonical.ball.position.x, rendered.ball.y - frame.canonical.ball.position.y) > 0.05) {
      g.lineStyle(1.5, BALL_COLOR, 0.6)
      g.lineBetween(rb.x, rb.y, cb.x, cb.y)
    }
  }
}

function describe(p: NextPlayer): string {
  return [p.slot, p.responsibility, p.intentUrgency].filter((x) => x !== undefined).join(' ')
}
