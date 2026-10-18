/**
 * /dev/match-phaser demo entry. Wires a REAL MatchEngine Next session (matchDemoBootstrap) through
 * the presentation contract (MatchPresentationBridge) into the Phaser renderer
 * (PhaserMatchRenderer), advancing the engine on a timer so several minutes of real simulated
 * basketball can be observed.
 *
 * This file is the only place that decides *when* to call `stepMatchSession` (via
 * matchDemoBootstrap's `.step()`) versus when to just let the renderer interpolate the existing
 * snapshot. It contains no gameplay logic itself — it only calls the engine's own step function
 * and forwards the result through the presentation bridge.
 */

import { toMatchPresentationEvents, toMatchPresentationState } from '../MatchPresentationBridge'
import { PhaserMatchRenderer } from '../PhaserMatchRenderer'
import { createMatchDemo, type MatchDemoHandle } from './matchDemoBootstrap'

export interface MatchPhaserDemoOptions {
  readonly seed?: number
  /** Real engine steps per second the demo advances at; higher = faster to observe several minutes. */
  readonly enginePace?: number
}

export interface MatchPhaserDemoHandle {
  readonly demo: MatchDemoHandle
  stop(): void
}

export function mountMatchPhaserDemo(root: HTMLElement, options: MatchPhaserDemoOptions = {}): MatchPhaserDemoHandle {
  const enginePace = options.enginePace ?? 3
  root.innerHTML = ''
  root.style.cssText = 'margin:0;width:100vw;height:100vh;background:#0b0f14;overflow:hidden;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,sans-serif'

  const header = document.createElement('div')
  header.style.cssText = 'padding:8px 14px;color:#94a3b8;font:600 12px/1.3 ui-sans-serif;background:#0f1620;border-bottom:1px solid rgba(80,120,160,0.25);display:flex;gap:16px;flex-wrap:wrap'
  header.innerHTML = '<span style="color:#e2e8f0;letter-spacing:0.05em">MATCHENGINE NEXT · PHASER POC</span><span>real MatchEngine session — Phaser renders only</span>'
  root.appendChild(header)

  const stage = document.createElement('div')
  stage.style.cssText = 'position:relative;flex:1;min-height:0'
  root.appendChild(stage)

  const debugPanel = document.createElement('pre')
  debugPanel.style.cssText = 'position:absolute;right:8px;top:8px;margin:0;padding:8px 10px;background:rgba(10,16,24,0.85);color:#7dd3fc;font:11px/1.4 monospace;border-radius:4px;max-width:340px;white-space:pre-wrap;pointer-events:none'
  stage.appendChild(debugPanel)

  const demo = createMatchDemo(options.seed)
  const renderer = new PhaserMatchRenderer({ parent: stage, width: stage.clientWidth || 1024, height: stage.clientHeight || 640 })

  const initialState = toMatchPresentationState(demo.session.state, demo.labels)
  renderer.initialize(initialState)
  updateDebugPanel(debugPanel, demo, 0)

  let frameCount = 0
  let stopped = false
  const intervalMs = Math.max(16, 1000 / enginePace)
  const intervalId = window.setInterval(() => {
    if (stopped || demo.session.state.isComplete) return
    const beforeEvents = demo.session.state.events.length
    const nextSession = demo.step()
    frameCount += 1
    const newEvents = nextSession.state.events.slice(beforeEvents)
    const presentationState = toMatchPresentationState(nextSession.state, demo.labels)
    const presentationEvents = toMatchPresentationEvents(newEvents)
    renderer.pushSnapshot(presentationState, presentationEvents)
    updateDebugPanel(debugPanel, demo, frameCount)
  }, intervalMs)

  const handleResize = () => renderer.resize(stage.clientWidth, stage.clientHeight)
  window.addEventListener('resize', handleResize)

  return {
    demo,
    stop(): void {
      stopped = true
      window.clearInterval(intervalId)
      window.removeEventListener('resize', handleResize)
      renderer.destroy()
    },
  }
}

function updateDebugPanel(panel: HTMLElement, demo: MatchDemoHandle, presentationFrame: number): void {
  const state = demo.session.state
  const ball = state.spatial.ball
  panel.textContent = [
    `simulation tick: ${state.nextSequence}`,
    `presentation frame: ${presentationFrame}`,
    `period: ${state.period}  clock: ${Math.round(state.clockSecondsRemaining)}s`,
    `score: ${state.homeScore} - ${state.awayScore}`,
    `attacking team: ${String(state.attackingTeamId).slice(0, 10)}`,
    `ball: ${ball.kind}${ball.kind === 'playerControlled' ? ` (${String(ball.playerId).slice(0, 8)})` : ''}`,
    `current action: ${state.offensiveAction?.kind ?? '-'}`,
    `events so far: ${state.events.length}`,
    `complete: ${state.isComplete}`,
  ].join('\n')
}
