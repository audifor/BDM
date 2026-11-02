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
 * art, no lighting, no crowd, no sound — explicitly out of scope for this POC.
 */

import Phaser from 'phaser'
import type { MatchPresentationEvent, MatchPresentationState, PresentationPlayer } from './visualTypes'

const HOME_COLOR = 0x3b82f6
const AWAY_COLOR = 0xef4444
const BALL_COLOR = 0xf97316
const COURT_LINE_COLOR = 0xe2e8f0
const COURT_FILL_COLOR = 0x1f2937
const MADE_FLASH_COLOR = 0x22c55e
const MISSED_FLASH_COLOR = 0x94a3b8
const TURNOVER_FLASH_COLOR = 0xf59e0b

const PLAYER_RADIUS = 14
const BALL_RADIUS = 6

export interface PhaserMatchSceneConfig {
  readonly marginPx: number
}

/**
 * Everything the scene needs to draw one frame. Supplied by MatchPresentationBridge output plus
 * a queue of presentation events (already fully resolved outcomes) to animate transiently.
 */
export interface PhaserMatchFrame {
  readonly state: MatchPresentationState
  readonly recentEvents: readonly MatchPresentationEvent[]
}

export class PhaserMatchScene extends Phaser.Scene {
  private courtGraphics: Phaser.GameObjects.Graphics | undefined
  private ballSprite: Phaser.GameObjects.Arc | undefined
  private playerSprites = new Map<string, { readonly circle: Phaser.GameObjects.Arc; readonly label: Phaser.GameObjects.Text }>()
  private clockText: Phaser.GameObjects.Text | undefined
  private scoreText: Phaser.GameObjects.Text | undefined
  private possessionText: Phaser.GameObjects.Text | undefined
  private actionText: Phaser.GameObjects.Text | undefined
  private eventFlashText: Phaser.GameObjects.Text | undefined
  private flashTimer: Phaser.Time.TimerEvent | undefined
  private latestFrame: PhaserMatchFrame | undefined
  private lastRenderedEventSequence = 0
  private readonly config: PhaserMatchSceneConfig

  public constructor(config: PhaserMatchSceneConfig = { marginPx: 48 }) {
    super('PhaserMatchScene')
    this.config = config
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#0b0f14')
    this.courtGraphics = this.add.graphics()
    this.ballSprite = this.add.circle(0, 0, BALL_RADIUS, BALL_COLOR).setDepth(20)

    this.clockText = this.add.text(12, 8, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e2e8f0' }).setDepth(30)
    this.scoreText = this.add.text(12, 30, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e2e8f0' }).setDepth(30)
    this.possessionText = this.add.text(12, 52, '', { fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8' }).setDepth(30)
    this.actionText = this.add.text(12, 70, '', { fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8' }).setDepth(30)
    this.eventFlashText = this.add
      .text(this.scale.width / 2, 24, '', { fontFamily: 'monospace', fontSize: '16px', color: '#22c55e', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setDepth(40)

    this.drawCourtOutline()
  }

  /** The ONLY input this scene accepts. Called once per animation frame by PhaserMatchRenderer. */
  public renderFrame(frame: PhaserMatchFrame): void {
    this.latestFrame = frame
    if (!this.scene.isActive()) return
    this.paint(frame)
  }

  public override update(): void {
    if (this.latestFrame !== undefined) this.paint(this.latestFrame)
  }

  private paint(frame: PhaserMatchFrame): void {
    this.paintCourtGeometry(frame.state)
    this.paintPlayers(frame.state.players)
    this.paintBall(frame.state)
    this.paintHud(frame.state)
    this.paintEvents(frame.recentEvents)
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

  private drawCourtOutline(): void {
    // Static markings redrawn each geometry paint; kept separate for clarity/future caching.
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

    // Half-court line
    const midTop = this.courtToScreen(50, 0)
    const midBottom = this.courtToScreen(50, 100)
    g.lineBetween(midTop.x, midTop.y, midBottom.x, midBottom.y)

    // Center circle
    const center = this.courtToScreen(50, 50)
    g.strokeCircle(center.x, center.y, Math.min(width, height) * 0.08)

    // Baskets (from real court geometry, projected the same way as players/ball)
    const leftBasket = this.courtToScreen(state.court.baskets.left.xPercent, state.court.baskets.left.yPercent)
    const rightBasket = this.courtToScreen(state.court.baskets.right.xPercent, state.court.baskets.right.yPercent)
    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(leftBasket.x, leftBasket.y, 8)
    g.fillCircle(rightBasket.x, rightBasket.y, 8)
    g.lineStyle(2, 0xfbbf24, 1)
    g.strokeRect(topLeft.x, leftBasket.y - height * 0.19, width * 0.19, height * 0.38)
    g.strokeRect(bottomRight.x - width * 0.19, rightBasket.y - height * 0.19, width * 0.19, height * 0.38)
  }

  private paintPlayers(players: readonly PresentationPlayer[]): void {
    const seen = new Set<string>()
    for (const player of players) {
      const key = String(player.playerId)
      seen.add(key)
      const { x, y } = this.courtToScreen(player.position.xPercent, player.position.yPercent)
      let sprite = this.playerSprites.get(key)
      if (sprite === undefined) {
        const circle = this.add.circle(x, y, PLAYER_RADIUS, player.side === 'home' ? HOME_COLOR : AWAY_COLOR).setDepth(10)
        const label = this.add
          .text(x, y, String(player.jersey), { fontFamily: 'monospace', fontSize: '11px', color: '#0b0f14', fontStyle: 'bold' })
          .setOrigin(0.5)
          .setDepth(11)
        sprite = { circle, label }
        this.playerSprites.set(key, sprite)
      }
      sprite.circle.setPosition(x, y)
      sprite.label.setPosition(x, y)
      sprite.circle.setStrokeStyle(player.hasBall ? 3 : 0, 0xfacc15, 1)
    }
    for (const [key, sprite] of this.playerSprites) {
      if (!seen.has(key)) {
        sprite.circle.destroy()
        sprite.label.destroy()
        this.playerSprites.delete(key)
      }
    }
  }

  private paintBall(state: MatchPresentationState): void {
    if (this.ballSprite === undefined) return
    const { x, y } = this.courtToScreen(state.ball.position.xPercent, state.ball.position.yPercent)
    // Purely visual lift while in flight; never influences the underlying x/y truth.
    const lift = state.ball.visualHeight * 14
    this.ballSprite.setPosition(x, y - lift)
    this.ballSprite.setScale(1 + state.ball.visualHeight * 0.4)
  }

  private paintHud(state: MatchPresentationState): void {
    this.clockText?.setText(`P${state.clock.period}  ${formatClock(state.clock.clockSecondsRemaining)}`)
    this.scoreText?.setText(`HOME ${state.score.home} — ${state.score.away} AWAY`)
    this.possessionText?.setText(`possession: ${shortId(state.possession.offensiveTeamId)}  ball: ${state.ball.state}`)
    this.actionText?.setText(state.currentActionKind !== undefined ? `action: ${state.currentActionKind}` : '')
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
