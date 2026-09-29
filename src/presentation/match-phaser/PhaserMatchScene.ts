/**
 * PhaserMatchScene — pure presentation (BT1). Draws whatever PresentationFrame it is handed.
 *
 * It never imports `@/engine/match` and has no knowledge of possessions, shot probabilities or
 * rules: circles, lines and text over a METRIC court (uniform scale, real FIBA/NBA markings).
 * Placeholders only — no sprites, art, crowd or sound.
 *
 * Two ways of looking at the same frame:
 *  - normal: team-coloured bodies, the ball, the ball-handler ring.
 *  - "Basketball Truth" (debug.basketballTruth): overlays CANONICAL truth (the engine position the
 *    current segment is heading to) as a hollow square, joins it to the RENDERED body with a line,
 *    and draws each player's movement target, facing vector and defensive assignment, plus the
 *    canonical vs rendered ball. If Phaser deformed a correct simulation you can SEE it here; if the
 *    engine itself put someone in a silly place the square is already there.
 */

import Phaser from 'phaser'
import type { PlayerId } from '@/domain/ids'
import type { TruthPlayerRow } from './audit/basketballTruth'
import type { PresentationFrame } from './PresentationDirector'
import { MatchCamera, type CameraMode } from './camera'
import { toMeters } from './segmentPlan'
import type { MatchPresentationState, PresentationCourt, PresentationPlayer } from './visualTypes'

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

const PLAYER_RADIUS_METERS = 0.45
const BALL_RADIUS_PX = 6.5
const LIFT_PX_PER_METER = 12

export interface SceneDebugOptions {
  /** Master switch: canonical vs rendered markers, links, targets, facing, ball truth. */
  basketballTruth: boolean
  showAssignments: boolean
  showTargets: boolean
  showFacing: boolean
  showPath: boolean
}

export interface SceneIdentificationOptions {
  showJersey: boolean
  showLabel: boolean
  showAction: boolean
}

export interface RenderedTruth {
  readonly players: ReadonlyMap<PlayerId, { readonly x: number; readonly y: number }>
  readonly ball: { readonly x: number; readonly y: number }
  readonly ballHeightMeters: number
}

interface PlayerVisual {
  readonly body: Phaser.GameObjects.Arc
  readonly jersey: Phaser.GameObjects.Text
  readonly name: Phaser.GameObjects.Text
  readonly action: Phaser.GameObjects.Text
  readonly nose: Phaser.GameObjects.Line
}

export type FrameProvider = (deltaMs: number) => PresentationFrame | undefined

export interface PhaserMatchSceneConfig {
  readonly marginPx?: number
}

export class PhaserMatchScene extends Phaser.Scene {
  private courtGraphics: Phaser.GameObjects.Graphics | undefined
  private courtKey: string | undefined
  private truthGraphics: Phaser.GameObjects.Graphics | undefined
  private ball: Phaser.GameObjects.Arc | undefined
  private ballShadow: Phaser.GameObjects.Ellipse | undefined
  private readonly playerVisuals = new Map<string, PlayerVisual>()
  private readonly cameraModel = new MatchCamera()
  private frameProvider: FrameProvider | undefined
  private lastFrame: PresentationFrame | undefined
  private rendered: RenderedTruth | undefined
  private frameListener: ((frame: PresentationFrame, rendered: RenderedTruth) => void) | undefined

  public readonly debug: SceneDebugOptions = {
    basketballTruth: false,
    showAssignments: false,
    showTargets: false,
    showFacing: false,
    showPath: false,
  }

  public readonly identification: SceneIdentificationOptions = {
    showJersey: true,
    showLabel: false,
    showAction: false,
  }

  public constructor(_config: PhaserMatchSceneConfig = {}) {
    super('PhaserMatchScene')
  }

  public setFrameProvider(provider: FrameProvider): void {
    this.frameProvider = provider
  }

  public onFrame(listener: (frame: PresentationFrame, rendered: RenderedTruth) => void): void {
    this.frameListener = listener
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraModel.setMode(mode)
    this.cameraModel.snap()
  }

  public getCameraMode(): CameraMode {
    return this.cameraModel.getMode()
  }

  public getRenderedTruth(): RenderedTruth | undefined {
    return this.rendered
  }

  public getLastFrame(): PresentationFrame | undefined {
    return this.lastFrame
  }

  public snapCamera(): void {
    this.cameraModel.snap()
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
    const frame = this.frameProvider?.(deltaMs)
    if (frame === undefined) return
    this.lastFrame = frame
    this.paint(frame, deltaMs)
  }

  private paint(frame: PresentationFrame, deltaMs: number): void {
    const state = frame.state
    this.ensureCourt(state.court)
    this.applyCamera(state, deltaMs / 1000)
    const rendered = this.paintPlayers(state, frame)
    const ballRendered = this.paintBall(state, frame)
    this.rendered = { players: rendered, ball: ballRendered.position, ballHeightMeters: frame.ballHeightMeters }
    this.paintTruth(frame, this.rendered)
    this.frameListener?.(frame, this.rendered)
  }

  private applyCamera(state: MatchPresentationState, deltaSeconds: number): void {
    const court = state.court
    const ball = toMeters(state.ball.position, court.lengthMeters, court.widthMeters)
    const attackingRight = state.possession.attackingBasket.xPercent > 50
    const target = this.cameraModel.step(
      {
        ballXMeters: ball.x,
        ballYMeters: ball.y,
        attackedBasketXMeters: attackingRight ? court.lengthMeters : 0,
        courtLengthMeters: court.lengthMeters,
        courtWidthMeters: court.widthMeters,
        viewportWidthPx: this.scale.width,
        viewportHeightPx: this.scale.height,
        pixelsPerMeter: PIXELS_PER_METER,
      },
      deltaSeconds,
    )
    this.cameras.main.setZoom(target.zoom)
    this.cameras.main.centerOn(target.centerXMeters * PIXELS_PER_METER, target.centerYMeters * PIXELS_PER_METER)
  }

  private ensureCourt(court: PresentationCourt): void {
    const key = `${court.lengthMeters}x${court.widthMeters}:${court.threePointArcRadiusMeters}:${court.threePointCornerOffsetMeters}`
    if (this.courtKey === key || this.courtGraphics === undefined) return
    this.courtKey = key
    this.drawCourt(this.courtGraphics, court)
  }

  private drawCourt(g: Phaser.GameObjects.Graphics, court: PresentationCourt): void {
    const ppm = PIXELS_PER_METER
    const L = court.lengthMeters
    const W = court.widthMeters
    g.clear()
    // Apron + floor.
    g.fillStyle(0x0f1722, 1)
    g.fillRect(-3 * ppm, -3 * ppm, (L + 6) * ppm, (W + 6) * ppm)
    g.fillStyle(FLOOR_COLOR, 1)
    g.fillRect(0, 0, L * ppm, W * ppm)
    g.lineStyle(2, LINE_COLOR, 1)
    g.strokeRect(0, 0, L * ppm, W * ppm)
    // Half-court line and centre circle.
    g.lineBetween((L / 2) * ppm, 0, (L / 2) * ppm, W * ppm)
    g.strokeCircle((L / 2) * ppm, (W / 2) * ppm, 1.8 * ppm)

    const baskets = [court.baskets.left, court.baskets.right].map((b) => toMeters(b, L, W))
    for (const basket of baskets) {
      const attacksRight = basket.x > L / 2
      const dir = attacksRight ? -1 : 1 // direction from the basket toward the court centre
      const baselineX = attacksRight ? L : 0
      // Lane (paint): 5.8 m long, 4.9 m wide.
      const laneLen = 5.8
      const laneHalf = 2.45
      const laneX0 = Math.min(baselineX, baselineX + dir * laneLen)
      g.fillStyle(PAINT_COLOR, 1)
      g.fillRect(laneX0 * ppm, (W / 2 - laneHalf) * ppm, laneLen * ppm, laneHalf * 2 * ppm)
      g.lineStyle(2, LINE_COLOR, 1)
      g.strokeRect(laneX0 * ppm, (W / 2 - laneHalf) * ppm, laneLen * ppm, laneHalf * 2 * ppm)
      // Free-throw circle (top half solid, bottom dashed approximated by a thin arc).
      const ftX = baselineX + dir * laneLen
      g.strokeCircle(ftX * ppm, (W / 2) * ppm, 1.8 * ppm)
      // Three-point line: straight corner sections + arc centred on the basket.
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
        const centreAngle = dir < 0 ? Math.PI : 0
        g.arc(basket.x * ppm, basket.y * ppm, R * ppm, centreAngle - phi0, centreAngle + phi0, false)
        g.strokePath()
      }
      // Restricted area arc, backboard and rim.
      g.beginPath()
      const centreAngle = dir < 0 ? Math.PI : 0
      g.arc(basket.x * ppm, basket.y * ppm, 1.25 * ppm, centreAngle - Math.PI / 2, centreAngle + Math.PI / 2, false)
      g.strokePath()
      const boardX = basket.x - dir * 0.375
      g.lineStyle(3, LINE_COLOR, 1)
      g.lineBetween(boardX * ppm, (basket.y - 0.9) * ppm, boardX * ppm, (basket.y + 0.9) * ppm)
      g.lineStyle(2.5, RIM_COLOR, 1)
      g.strokeCircle(basket.x * ppm, basket.y * ppm, 0.23 * ppm)
    }
  }

  private paintPlayers(state: MatchPresentationState, frame: PresentationFrame): Map<PlayerId, { x: number; y: number }> {
    const court = state.court
    const seen = new Set<string>()
    const rendered = new Map<PlayerId, { x: number; y: number }>()
    const truthRows = new Map<PlayerId, TruthPlayerRow>((frame.truth?.players ?? []).map((row) => [row.playerId, row]))
    for (const player of state.players) {
      const key = String(player.playerId)
      seen.add(key)
      const meters = toMeters(player.position, court.lengthMeters, court.widthMeters)
      rendered.set(player.playerId, meters)
      const px = meters.x * PIXELS_PER_METER
      const py = meters.y * PIXELS_PER_METER
      let visual = this.playerVisuals.get(key)
      if (visual === undefined) {
        visual = this.createPlayerVisual(player, px, py)
        this.playerVisuals.set(key, visual)
      }
      visual.body.setPosition(px, py)
      visual.body.setAlpha(this.debug.basketballTruth ? 0.85 : 1)
      visual.body.setStrokeStyle(player.hasBall ? 3 : 1.5, player.hasBall ? HANDLER_RING : 0x0b0f14, 1)
      visual.jersey.setPosition(px, py).setVisible(this.identification.showJersey)
      visual.name.setPosition(px, py + PLAYER_RADIUS_METERS * PIXELS_PER_METER + 9).setVisible(this.identification.showLabel)
      const row = truthRows.get(player.playerId)
      visual.action
        .setPosition(px, py - PLAYER_RADIUS_METERS * PIXELS_PER_METER - 9)
        .setText(row === undefined ? describeIntent(player) : row.currentAction)
        .setVisible(this.identification.showAction)
      const angle = player.orientationRadians
      if (angle === undefined) {
        visual.nose.setVisible(false)
      } else {
        const r = PLAYER_RADIUS_METERS * PIXELS_PER_METER
        visual.nose.setTo(0, 0, Math.cos(angle) * (r + 6), Math.sin(angle) * (r + 6)).setPosition(px, py).setVisible(true)
      }
    }
    for (const [key, visual] of this.playerVisuals) {
      if (seen.has(key)) continue
      visual.body.destroy()
      visual.jersey.destroy()
      visual.name.destroy()
      visual.action.destroy()
      visual.nose.destroy()
      this.playerVisuals.delete(key)
    }
    return rendered
  }

  private createPlayerVisual(player: PresentationPlayer, x: number, y: number): PlayerVisual {
    const color = player.side === 'home' ? HOME_COLOR : AWAY_COLOR
    const body = this.add.circle(x, y, PLAYER_RADIUS_METERS * PIXELS_PER_METER, color).setDepth(10)
    const jersey = this.add
      .text(x, y, String(player.jersey), { fontFamily: 'monospace', fontSize: '13px', color: '#0b0f14', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(11)
      .setResolution(2)
    const name = this.add
      .text(x, y, player.label, { fontFamily: 'monospace', fontSize: '10px', color: '#e2e8f0' })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false)
      .setResolution(2)
    const action = this.add
      .text(x, y, '', { fontFamily: 'monospace', fontSize: '10px', color: '#7dd3fc' })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false)
      .setResolution(2)
    const nose = this.add.line(x, y, 0, 0, 0, 0, 0xffffff, 0.95).setLineWidth(3).setDepth(12).setVisible(false)
    return { body, jersey, name, action, nose }
  }

  private paintBall(state: MatchPresentationState, frame: PresentationFrame): { position: { x: number; y: number } } {
    const court = state.court
    const meters = toMeters(state.ball.position, court.lengthMeters, court.widthMeters)
    const px = meters.x * PIXELS_PER_METER
    const py = meters.y * PIXELS_PER_METER
    const lift = frame.ballHeightMeters * LIFT_PX_PER_METER
    if (this.ball !== undefined) {
      this.ball.setPosition(px, py - lift)
      this.ball.setScale(1 + Math.min(1, frame.ballHeightMeters / 3) * 0.6)
    }
    if (this.ballShadow !== undefined) {
      this.ballShadow.setPosition(px, py + 1)
      this.ballShadow.setScale(Math.max(0.5, 1 - frame.ballHeightMeters * 0.12))
      this.ballShadow.setVisible(frame.ballHeightMeters > 0.05)
    }
    return { position: meters }
  }

  private paintTruth(frame: PresentationFrame, rendered: RenderedTruth): void {
    const g = this.truthGraphics
    if (g === undefined) return
    g.clear()
    if (!this.debug.basketballTruth) return
    const state = frame.state
    const court = state.court
    const ppm = PIXELS_PER_METER
    const px = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x * ppm, y: p.y * ppm })
    const canonicalOf = (id: PlayerId): { x: number; y: number } | undefined => {
      const c = frame.canonical.players.get(id)
      return c === undefined ? undefined : toMeters(c, court.lengthMeters, court.widthMeters)
    }
    const originOf = (id: PlayerId): { x: number; y: number } | undefined => {
      const c = frame.origin.get(id)
      return c === undefined ? undefined : toMeters(c, court.lengthMeters, court.widthMeters)
    }
    const truthRows = new Map<PlayerId, TruthPlayerRow>((frame.truth?.players ?? []).map((row) => [row.playerId, row]))
    const half = 0.4 * ppm

    for (const player of state.players) {
      const color = player.side === 'home' ? HOME_COLOR : AWAY_COLOR
      const renderedPos = rendered.players.get(player.playerId)
      const canonical = canonicalOf(player.playerId)
      if (renderedPos === undefined || canonical === undefined) continue
      const r = px(renderedPos)
      const c = px(canonical)
      // CANONICAL: hollow square in the team colour.
      g.lineStyle(2.5, color, 1)
      g.lineBetween(c.x - half, c.y - half, c.x + half, c.y - half)
      g.lineBetween(c.x + half, c.y - half, c.x + half, c.y + half)
      g.lineBetween(c.x + half, c.y + half, c.x - half, c.y + half)
      g.lineBetween(c.x - half, c.y + half, c.x - half, c.y - half)
      // RENDERED -> CANONICAL link.
      const gap = Math.hypot(renderedPos.x - canonical.x, renderedPos.y - canonical.y)
      if (gap > 0.15) {
        g.lineStyle(1.5, TRUTH_LINK, 0.9)
        g.lineBetween(r.x, r.y, c.x, c.y)
      }
      if (this.debug.showPath) {
        const origin = originOf(player.playerId)
        if (origin !== undefined) {
          const o = px(origin)
          g.lineStyle(1, 0x64748b, 0.6)
          g.lineBetween(o.x, o.y, c.x, c.y)
          g.fillStyle(0x64748b, 0.8)
          g.fillCircle(o.x, o.y, 3)
        }
      }
      const row = truthRows.get(player.playerId)
      if (this.debug.showTargets && row?.movementTarget !== undefined) {
        const t = px(row.movementTarget)
        g.lineStyle(1.5, TARGET_COLOR, 0.55)
        g.lineBetween(c.x, c.y, t.x, t.y)
        g.lineStyle(2, TARGET_COLOR, 1)
        g.lineBetween(t.x - 5, t.y - 5, t.x + 5, t.y + 5)
        g.lineBetween(t.x - 5, t.y + 5, t.x + 5, t.y - 5)
      }
      if (this.debug.showFacing && player.orientationRadians !== undefined) {
        const len = 1.8 * ppm
        g.lineStyle(2, FACING_COLOR, 0.95)
        g.lineBetween(r.x, r.y, r.x + Math.cos(player.orientationRadians) * len, r.y + Math.sin(player.orientationRadians) * len)
      }
      if (this.debug.showAssignments && player.defendingPlayerId !== undefined) {
        const man = rendered.players.get(player.defendingPlayerId)
        if (man !== undefined) {
          const m = px(man)
          g.lineStyle(1.5, ASSIGN_COLOR, 0.65)
          g.lineBetween(r.x, r.y, m.x, m.y)
        }
      }
    }
    // Ball: canonical ring vs rendered ball.
    const ballCanonical = toMeters(frame.canonical.ball, court.lengthMeters, court.widthMeters)
    const bc = px(ballCanonical)
    g.lineStyle(2.5, BALL_COLOR, 1)
    g.strokeCircle(bc.x, bc.y, BALL_RADIUS_PX + 5)
    const br = px(rendered.ball)
    const ballGap = Math.hypot(rendered.ball.x - ballCanonical.x, rendered.ball.y - ballCanonical.y)
    if (ballGap > 0.15) {
      g.lineStyle(1.5, BALL_COLOR, 0.6)
      g.lineBetween(br.x, br.y, bc.x, bc.y)
    }
  }
}

function describeIntent(player: PresentationPlayer): string {
  return player.isOffense ? player.actionIntent : (player.defensiveIntent ?? 'idle')
}
