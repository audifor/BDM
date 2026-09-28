/**
 * PhaserMatchScene — pure presentation. Renders whatever MatchPresentationState it is given.
 *
 * This scene never imports from `@/engine/match`. It has no knowledge of possessions, shot
 * probabilities, pass completion, rebounds, or rules — it only draws circles, lines, and text
 * from the contract types in visualTypes.ts. All gameplay facts (score, clock, who has the ball,
 * whether a shot went in) arrive already decided from MatchPresentationState /
 * MatchPresentationEvent; the scene cannot compute or override any of them.
 *
 * Placeholders only: primitive shapes (circles for players/ball, lines for court markings),
 * player-number labels, simple color coding for team/ball-handler/event flashes. No sprites, no
 * art, no lighting, no crowd, no sound — explicitly out of scope for this milestone.
 *
 * V1 additions over the POC: natural locomotion via LocomotionSystem (MP1B), a richer ball
 * presentation with visual height/state (MP1C), off-ball/on-ball/defense intent-driven visuals
 * (MP1D/E/F), action sequencing beats (MP1G), visual-only spacing separation (MP1H), a
 * follow/broadcast/full-court camera (MP1I), player ID + debug overlays (MP1J/K), and a basic HUD
 * (MP1N). None of these additions read MatchEngine directly or alter any authoritative fact.
 */

import Phaser from 'phaser'
import type { MatchPresentationEvent, MatchPresentationState, PresentationPlayer } from './visualTypes'
import { LocomotionSystem, type LocomotionSample, type MovementProfile } from './locomotion'
import { MatchCamera, type CameraMode } from './camera'
import { ActionSequencer } from './sequencing'
import { DEFAULT_PRESENTATION_CONFIG, type PresentationConfig } from './presentationConfig'

const HOME_COLOR = 0x3b82f6
const AWAY_COLOR = 0xef4444
const BALL_COLOR = 0xf97316
const COURT_LINE_COLOR = 0xe2e8f0
const COURT_FILL_COLOR = 0x1f2937
const MADE_FLASH_COLOR = 0x22c55e
const MISSED_FLASH_COLOR = 0x94a3b8
const TURNOVER_FLASH_COLOR = 0xf59e0b
const DEFENDER_RING_COLOR = 0x94a3b8
const HELP_RING_COLOR = 0xfacc15
const SCREEN_LINK_COLOR = 0xa78bfa
const DEBUG_TEXT_COLOR = '#7dd3fc'
const SELECTED_RING_COLOR = 0x38bdf8

const PLAYER_RADIUS = 14
const BALL_RADIUS = 6

export interface PhaserMatchSceneConfig {
  readonly marginPx: number
  readonly presentation?: PresentationConfig
}

/**
 * Everything the scene needs to draw one frame. Supplied by MatchPresentationBridge output plus
 * a queue of presentation events (already fully resolved outcomes) to animate transiently.
 */
export interface PhaserMatchFrame {
  readonly state: MatchPresentationState
  readonly recentEvents: readonly MatchPresentationEvent[]
}

export interface SceneDebugOptions {
  enabled: boolean
  showCanonicalPosition: boolean
  showVelocityVectors: boolean
  showAssignments: boolean
  showTargets: boolean
  showPassLines: boolean
}

export interface SceneIdentificationOptions {
  showJersey: boolean
  showLabel: boolean
  showAction: boolean
}

interface PlayerVisual {
  readonly circle: Phaser.GameObjects.Arc
  readonly jerseyLabel: Phaser.GameObjects.Text
  readonly nameLabel: Phaser.GameObjects.Text
  readonly actionLabel: Phaser.GameObjects.Text
  readonly facingLine: Phaser.GameObjects.Line
  readonly canonicalGhost: Phaser.GameObjects.Arc
}

export class PhaserMatchScene extends Phaser.Scene {
  private courtGraphics: Phaser.GameObjects.Graphics | undefined
  private debugGraphics: Phaser.GameObjects.Graphics | undefined
  private ballSprite: Phaser.GameObjects.Arc | undefined
  private ballShadow: Phaser.GameObjects.Ellipse | undefined
  private playerSprites = new Map<string, PlayerVisual>()
  private clockText: Phaser.GameObjects.Text | undefined
  private scoreText: Phaser.GameObjects.Text | undefined
  private possessionText: Phaser.GameObjects.Text | undefined
  private actionText: Phaser.GameObjects.Text | undefined
  private ballStateText: Phaser.GameObjects.Text | undefined
  private eventFlashText: Phaser.GameObjects.Text | undefined
  private flashTimer: Phaser.Time.TimerEvent | undefined
  private latestFrame: PhaserMatchFrame | undefined
  private lastRenderedEventSequence = 0
  private readonly config: PhaserMatchSceneConfig
  private readonly presentationConfig: PresentationConfig

  private readonly locomotion: LocomotionSystem
  private readonly camera2: MatchCamera
  private readonly sequencer = new ActionSequencer()
  private lastTickTimeMs: number | undefined
  private dribblePhaseByPlayerId = new Map<string, number>()

  public readonly debug: SceneDebugOptions = {
    enabled: false,
    showCanonicalPosition: false,
    showVelocityVectors: false,
    showAssignments: false,
    showTargets: false,
    showPassLines: false,
  }

  public readonly identification: SceneIdentificationOptions = {
    showJersey: true,
    showLabel: false,
    showAction: false,
  }

  public constructor(config: PhaserMatchSceneConfig = { marginPx: 48 }) {
    super('PhaserMatchScene')
    this.config = config
    this.presentationConfig = config.presentation ?? DEFAULT_PRESENTATION_CONFIG
    this.locomotion = new LocomotionSystem(this.presentationConfig)
    this.camera2 = new MatchCamera(this.presentationConfig)
  }

  public setCameraMode(mode: CameraMode): void {
    this.camera2.setMode(mode)
  }

  public getCameraMode(): CameraMode {
    return this.camera2.getMode()
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#0b0f14')
    this.courtGraphics = this.add.graphics()
    this.debugGraphics = this.add.graphics().setDepth(15)
    this.ballShadow = this.add.ellipse(0, 0, BALL_RADIUS * 1.6, BALL_RADIUS * 0.7, 0x000000, 0.35).setDepth(9)
    this.ballSprite = this.add.circle(0, 0, BALL_RADIUS, BALL_COLOR).setDepth(20)

    this.clockText = this.add.text(12, 8, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e2e8f0' }).setDepth(30)
    this.scoreText = this.add.text(12, 30, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e2e8f0' }).setDepth(30)
    this.possessionText = this.add.text(12, 52, '', { fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8' }).setDepth(30)
    this.actionText = this.add.text(12, 70, '', { fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8' }).setDepth(30)
    this.ballStateText = this.add.text(12, 88, '', { fontFamily: 'monospace', fontSize: '12px', color: '#f97316' }).setDepth(30)
    this.eventFlashText = this.add
      .text(this.scale.width / 2, 24, '', { fontFamily: 'monospace', fontSize: '16px', color: '#22c55e', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(40)
  }

  /** The ONLY input this scene accepts. Called once per animation frame by PhaserMatchRenderer. */
  public renderFrame(frame: PhaserMatchFrame): void {
    this.latestFrame = frame
    if (!this.scene.isActive()) return
    this.paint(frame)
  }

  public override update(_time: number, deltaMs: number): void {
    if (this.latestFrame !== undefined) this.paint(this.latestFrame, deltaMs)
  }

  private paint(frame: PhaserMatchFrame, deltaMs = 16.6): void {
    const now = performance.now()
    this.sequencer.ingest(frame.recentEvents, now)
    const locomotionSamples = this.locomotion.step(frame.state, deltaMs / 1000)
    const cameraState = this.camera2.step(frame.state, deltaMs / 1000)

    this.applyCamera(cameraState)
    this.paintCourtGeometry(frame.state)
    this.paintPlayers(frame.state, locomotionSamples, deltaMs)
    this.paintBall(frame.state)
    this.paintHud(frame.state)
    this.paintEvents(frame.recentEvents)
    this.paintDebug(frame.state, locomotionSamples)
  }

  private applyCamera(cameraState: { readonly centerXPercent: number; readonly centerYPercent: number; readonly zoom: number }): void {
    const center = this.courtToScreen(cameraState.centerXPercent, cameraState.centerYPercent)
    this.cameras.main.setZoom(cameraState.zoom)
    this.cameras.main.centerOn(center.x, center.y)
  }

  private courtToScreen(xPercent: number, yPercent: number): { x: number; y: number } {
    const margin = this.config.marginPx
    const width = this.scale.width - margin * 2
    const height = this.scale.height - margin * 2 - 90
    return {
      x: margin + (xPercent / 100) * width,
      y: margin + 90 + (yPercent / 100) * height,
    }
  }

  private paintCourtGeometry(state: MatchPresentationState): void {
    const g = this.courtGraphics
    if (g === undefined) return
    g.clear()

    const topLeft = this.courtToScreen(0, 0)
    const bottomRight = this.courtToScreen(100, 100)
    const width = bottomRight.x - topLeft.x
    const height = bottomRight.y - topLeft.y

    g.fillStyle(COURT_FILL_COLOR, 1)
    g.fillRect(topLeft.x, topLeft.y, width, height)
    g.lineStyle(2, COURT_LINE_COLOR, 1)
    g.strokeRect(topLeft.x, topLeft.y, width, height)

    const midTop = this.courtToScreen(50, 0)
    const midBottom = this.courtToScreen(50, 100)
    g.lineBetween(midTop.x, midTop.y, midBottom.x, midBottom.y)

    const center = this.courtToScreen(50, 50)
    g.strokeCircle(center.x, center.y, Math.min(width, height) * 0.08)

    const leftBasket = this.courtToScreen(state.court.baskets.left.xPercent, state.court.baskets.left.yPercent)
    const rightBasket = this.courtToScreen(state.court.baskets.right.xPercent, state.court.baskets.right.yPercent)
    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(leftBasket.x, leftBasket.y, 8)
    g.fillCircle(rightBasket.x, rightBasket.y, 8)
    g.lineStyle(2, 0xfbbf24, 1)
    g.strokeRect(topLeft.x, leftBasket.y - height * 0.19, width * 0.19, height * 0.38)
    g.strokeRect(bottomRight.x - width * 0.19, rightBasket.y - height * 0.19, width * 0.19, height * 0.38)
  }

  private paintPlayers(state: MatchPresentationState, samples: readonly LocomotionSample[], deltaMs: number): void {
    const seen = new Set<string>()
    const sampleByPlayerId = new Map(samples.map((s) => [s.playerId, s]))

    for (const player of state.players) {
      const key = String(player.playerId)
      seen.add(key)
      const sample = sampleByPlayerId.get(key)
      const renderedXPercent = sample?.renderedXPercent ?? player.position.xPercent
      const renderedYPercent = sample?.renderedYPercent ?? player.position.yPercent
      const { x, y } = this.courtToScreen(renderedXPercent, renderedYPercent)

      let visual = this.playerSprites.get(key)
      if (visual === undefined) {
        visual = this.createPlayerVisual(player, x, y)
        this.playerSprites.set(key, visual)
      }

      visual.circle.setPosition(x, y)
      const dribbleBob = this.dribbleBobOffset(key, player, deltaMs)
      visual.circle.y = y - dribbleBob
      visual.jerseyLabel.setPosition(x, visual.circle.y)
      visual.nameLabel.setPosition(x, y + PLAYER_RADIUS + 10).setVisible(this.identification.showLabel)
      visual.actionLabel
        .setPosition(x, y - PLAYER_RADIUS - 12)
        .setText(this.identification.showAction || this.debug.enabled ? describeIntent(player) : '')
        .setVisible(this.identification.showAction || this.debug.enabled)
      visual.jerseyLabel.setVisible(this.identification.showJersey)

      visual.circle.setStrokeStyle(
        player.hasBall ? 3 : player === selectedPlaceholder() ? 2 : 0,
        player.hasBall ? 0xfacc15 : SELECTED_RING_COLOR,
        1,
      )

      const orientation = sample?.renderedOrientationRadians ?? player.orientationRadians
      if (orientation !== undefined) {
        const lineLength = PLAYER_RADIUS + 6
        visual.facingLine.setTo(0, 0, Math.cos(orientation) * lineLength, Math.sin(orientation) * lineLength)
        visual.facingLine.setPosition(x, visual.circle.y)
        visual.facingLine.setVisible(true)
      } else {
        visual.facingLine.setVisible(false)
      }

      if (this.debug.showCanonicalPosition) {
        const canonical = this.courtToScreen(player.position.xPercent, player.position.yPercent)
        visual.canonicalGhost.setPosition(canonical.x, canonical.y).setVisible(true)
      } else {
        visual.canonicalGhost.setVisible(false)
      }
    }

    for (const [key, visual] of this.playerSprites) {
      if (!seen.has(key)) {
        visual.circle.destroy()
        visual.jerseyLabel.destroy()
        visual.nameLabel.destroy()
        visual.actionLabel.destroy()
        visual.facingLine.destroy()
        visual.canonicalGhost.destroy()
        this.playerSprites.delete(key)
      }
    }
  }

  private createPlayerVisual(player: PresentationPlayer, x: number, y: number): PlayerVisual {
    const color = player.side === 'home' ? HOME_COLOR : AWAY_COLOR
    const circle = this.add.circle(x, y, PLAYER_RADIUS, color).setDepth(10)
    const jerseyLabel = this.add
      .text(x, y, String(player.jersey), { fontFamily: 'monospace', fontSize: '11px', color: '#0b0f14', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(11)
    const nameLabel = this.add
      .text(x, y + PLAYER_RADIUS + 10, player.label, { fontFamily: 'monospace', fontSize: '9px', color: '#cbd5e1' })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false)
    const actionLabel = this.add
      .text(x, y - PLAYER_RADIUS - 12, '', { fontFamily: 'monospace', fontSize: '9px', color: '#7dd3fc' })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false)
    const facingLine = this.add.line(x, y, 0, 0, 0, 0, 0xffffff, 0.85).setLineWidth(2).setDepth(12).setVisible(false)
    const canonicalGhost = this.add.circle(x, y, PLAYER_RADIUS * 0.4, color, 0.35).setDepth(9).setVisible(false)
    return { circle, jerseyLabel, nameLabel, actionLabel, facingLine, canonicalGhost }
  }

  /** Purely cosmetic hand/ground dribble alternation while a player holds and is moving with the ball. */
  private dribbleBobOffset(key: string, player: PresentationPlayer, deltaMs: number): number {
    if (!player.hasBall || player.speedMetersPerSecond < 0.1) {
      this.dribblePhaseByPlayerId.set(key, 0)
      return 0
    }
    const phase = (this.dribblePhaseByPlayerId.get(key) ?? 0) + deltaMs * 0.012
    this.dribblePhaseByPlayerId.set(key, phase)
    return Math.abs(Math.sin(phase)) * 1.5
  }

  private paintBall(state: MatchPresentationState): void {
    if (this.ballSprite === undefined || this.ballShadow === undefined) return
    const { x, y } = this.courtToScreen(state.ball.position.xPercent, state.ball.position.yPercent)
    // Purely visual lift while in flight; never influences the underlying x/y truth.
    const lift = state.ball.visualHeight * (state.ball.isShotFlight ? 26 : 14)
    this.ballSprite.setPosition(x, y - lift)
    this.ballSprite.setScale(1 + state.ball.visualHeight * 0.4)
    this.ballShadow.setPosition(x, y)
    this.ballShadow.setScale(Math.max(0.4, 1 - state.ball.visualHeight * 0.5))
    this.ballShadow.setVisible(state.ball.visualHeight > 0.02)
  }

  private paintHud(state: MatchPresentationState): void {
    this.clockText?.setText(`P${state.clock.period}  ${formatClock(state.clock.clockSecondsRemaining)}`)
    this.scoreText?.setText(`HOME ${state.score.home} — ${state.score.away} AWAY`)
    this.possessionText?.setText(`possession: ${shortId(state.possession.offensiveTeamId)}  ball: ${state.ball.state}`)
    this.actionText?.setText(state.currentActionKind !== undefined ? `action: ${state.currentActionKind}` : '')
    this.ballStateText?.setText(`camera: ${this.camera2.getMode()}`)
  }

  private paintEvents(events: readonly MatchPresentationEvent[]): void {
    const newest = [...events].reverse().find((event) => event.sequence > this.lastRenderedEventSequence)
    if (newest === undefined) return
    this.lastRenderedEventSequence = newest.sequence
    const { text, color } = describeEventFlash(newest)
    if (text === undefined) return
    this.eventFlashText?.setText(text).setColor(color)
    this.flashTimer?.remove()
    this.flashTimer = this.time.delayedCall(1400, () => this.eventFlashText?.setText(''))
  }

  private paintDebug(state: MatchPresentationState, samples: readonly LocomotionSample[]): void {
    const g = this.debugGraphics
    if (g === undefined) return
    g.clear()
    if (!this.debug.enabled) return

    const sampleByPlayerId = new Map(samples.map((s) => [s.playerId, s]))

    if (this.debug.showVelocityVectors) {
      g.lineStyle(2, 0x38bdf8, 0.8)
      for (const player of state.players) {
        const from = this.courtToScreen(player.position.xPercent, player.position.yPercent)
        const speedScale = 6
        const angle = player.orientationRadians ?? 0
        const to = { x: from.x + Math.cos(angle) * player.speedMetersPerSecond * speedScale, y: from.y + Math.sin(angle) * player.speedMetersPerSecond * speedScale }
        g.lineBetween(from.x, from.y, to.x, to.y)
      }
    }

    if (this.debug.showAssignments) {
      g.lineStyle(1, DEFENDER_RING_COLOR, 0.5)
      for (const player of state.players) {
        if (player.defendingPlayerId === undefined) continue
        const offensivePlayer = state.players.find((p) => p.playerId === player.defendingPlayerId)
        if (offensivePlayer === undefined) continue
        const from = this.courtToScreen(player.position.xPercent, player.position.yPercent)
        const to = this.courtToScreen(offensivePlayer.position.xPercent, offensivePlayer.position.yPercent)
        g.lineBetween(from.x, from.y, to.x, to.y)
      }
      g.lineStyle(2, HELP_RING_COLOR, 0.8)
      for (const player of state.players) {
        if (player.defensiveIntent === 'help' || player.defensiveIntent === 'recover') {
          const pos = this.courtToScreen(player.position.xPercent, player.position.yPercent)
          g.strokeCircle(pos.x, pos.y, PLAYER_RADIUS + 6)
        }
      }
    }

    if (this.debug.showTargets) {
      g.lineStyle(2, SCREEN_LINK_COLOR, 0.9)
      if (state.debugTargets.screenTarget !== undefined) {
        const target = this.courtToScreen(state.debugTargets.screenTarget.xPercent, state.debugTargets.screenTarget.yPercent)
        g.strokeCircle(target.x, target.y, 8)
      }
      if (state.debugTargets.driveTarget !== undefined) {
        const target = this.courtToScreen(state.debugTargets.driveTarget.xPercent, state.debugTargets.driveTarget.yPercent)
        g.lineStyle(2, 0xfb7185, 0.9)
        g.strokeCircle(target.x, target.y, 8)
      }
      for (const player of state.players) {
        if (player.screenPartnerId === undefined) continue
        const partner = state.players.find((p) => p.playerId === player.screenPartnerId)
        if (partner === undefined) continue
        const from = this.courtToScreen(player.position.xPercent, player.position.yPercent)
        const to = this.courtToScreen(partner.position.xPercent, partner.position.yPercent)
        g.lineStyle(2, SCREEN_LINK_COLOR, 0.6)
        g.lineBetween(from.x, from.y, to.x, to.y)
      }
    }

    if (this.debug.showPassLines && state.possession.ballHandlerId !== undefined) {
      const handler = state.players.find((p) => p.playerId === state.possession.ballHandlerId)
      if (handler !== undefined) {
        g.lineStyle(1, 0x64748b, 0.35)
        const from = this.courtToScreen(handler.position.xPercent, handler.position.yPercent)
        for (const teammate of state.players.filter((p) => p.isOffense && p.playerId !== handler.playerId)) {
          const to = this.courtToScreen(teammate.position.xPercent, teammate.position.yPercent)
          g.lineBetween(from.x, from.y, to.x, to.y)
        }
      }
    }

    void sampleByPlayerId
  }
}

function selectedPlaceholder(): undefined {
  // No player-selection UI yet in v1 (React owns selection state); reserved for a future toggle.
  return undefined
}

function describeIntent(player: PresentationPlayer): string {
  return player.isOffense ? player.actionIntent : (player.defensiveIntent ?? 'idle')
}

function formatClock(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.round(secondsRemaining))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function shortId(id: unknown): string {
  return String(id).slice(0, 8)
}

function describeEventFlash(event: MatchPresentationEvent): { text: string | undefined; color: string } {
  switch (event.kind) {
    case 'shotMade':
      return { text: `SHOT MADE +${event.points ?? 2}`, color: colorHex(MADE_FLASH_COLOR) }
    case 'shotMissed':
      return { text: 'SHOT MISSED', color: colorHex(MISSED_FLASH_COLOR) }
    case 'turnover':
      return { text: 'TURNOVER', color: colorHex(TURNOVER_FLASH_COLOR) }
    case 'rebound':
      return { text: 'REBOUND', color: colorHex(MISSED_FLASH_COLOR) }
    case 'passCompleted':
      return { text: 'PASS', color: colorHex(COURT_LINE_COLOR) }
    default:
      return { text: undefined, color: colorHex(COURT_LINE_COLOR) }
  }
}

function colorHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

export type { MovementProfile }
