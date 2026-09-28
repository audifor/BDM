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
 *
 * V1 additions: a small dev control panel (camera mode, debug overlay toggles, player-ID toggles,
 * MP1M playback speed 0.5x/1x/2x/4x, pause) and a short rolling replay buffer (MP1P, best-effort —
 * see mountReplayControls below for its documented limitations). All controls only affect how this
 * demo *displays* an already-real MatchEngine session; none of them call back into the engine
 * differently or change simulation outcomes.
 */

import { toMatchPresentationEvents, toMatchPresentationState } from '../MatchPresentationBridge'
import { PhaserMatchRenderer } from '../PhaserMatchRenderer'
import { PRESENTATION_PLAYBACK_SPEEDS } from '../presentationConfig'
import type { MatchPresentationEvent, MatchPresentationState } from '../visualTypes'
import type { CameraMode } from '../camera'
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

const REPLAY_BUFFER_SECONDS = 8

/** One captured (already presentation-resolved) frame kept only for the short local replay buffer. */
interface ReplayFrame {
  readonly capturedAtMs: number
  readonly state: MatchPresentationState
  readonly events: readonly MatchPresentationEvent[]
}

export function mountMatchPhaserDemo(root: HTMLElement, options: MatchPhaserDemoOptions = {}): MatchPhaserDemoHandle {
  const seed = options.seed ?? 424242
  const enginePace = options.enginePace ?? 3
  root.innerHTML = ''
  root.style.cssText = 'margin:0;width:100vw;height:100vh;background:#0b0f14;overflow:hidden;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,sans-serif'

  const header = document.createElement('div')
  header.style.cssText =
    'padding:8px 14px;color:#94a3b8;font:600 12px/1.3 ui-sans-serif;background:#0f1620;border-bottom:1px solid rgba(80,120,160,0.25);display:flex;gap:16px;flex-wrap:wrap;align-items:center'
  header.innerHTML = `<span style="color:#e2e8f0;letter-spacing:0.05em">MATCHENGINE NEXT · PRESENTATION V1</span><span>real MatchEngine session — Phaser renders only</span><span id="bdm-seed-label" style="color:#7dd3fc">seed: ${seed}</span>`
  root.appendChild(header)

  const controls = document.createElement('div')
  controls.style.cssText =
    'padding:6px 14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#0c131c;border-bottom:1px solid rgba(80,120,160,0.18);font:11px ui-sans-serif;color:#cbd5e1'
  root.appendChild(controls)

  const stage = document.createElement('div')
  stage.style.cssText = 'position:relative;flex:1;min-height:0'
  root.appendChild(stage)

  const debugPanel = document.createElement('pre')
  debugPanel.style.cssText =
    'position:absolute;right:8px;top:8px;margin:0;padding:8px 10px;background:rgba(10,16,24,0.85);color:#7dd3fc;font:11px/1.4 monospace;border-radius:4px;max-width:360px;white-space:pre-wrap;pointer-events:none'
  stage.appendChild(debugPanel)

  const replayBanner = document.createElement('div')
  replayBanner.style.cssText =
    'position:absolute;left:8px;bottom:8px;margin:0;padding:4px 10px;background:rgba(250,204,21,0.15);color:#facc15;font:11px monospace;border-radius:4px;pointer-events:none;display:none'
  replayBanner.textContent = 'REPLAY'
  stage.appendChild(replayBanner)

  const demo = createMatchDemo(seed)
  const renderer = new PhaserMatchRenderer({ parent: stage, width: stage.clientWidth || 1024, height: stage.clientHeight || 640 })

  const initialState = toMatchPresentationState(demo.session.state, demo.labels)
  renderer.initialize(initialState)
  updateDebugPanel(debugPanel, demo, 0, renderer)

  const replayBuffer: ReplayFrame[] = []
  let isReplaying = false

  let frameCount = 0
  let stopped = false
  const intervalMs = Math.max(16, 1000 / enginePace)
  const intervalId = window.setInterval(() => {
    if (stopped || isReplaying || demo.session.state.isComplete) return
    const beforeEvents = demo.session.state.events.length
    const nextSession = demo.step()
    frameCount += 1
    const newEvents = nextSession.state.events.slice(beforeEvents)
    const presentationState = toMatchPresentationState(nextSession.state, demo.labels)
    const presentationEvents = toMatchPresentationEvents(newEvents)
    renderer.pushSnapshot(presentationState, presentationEvents)
    updateDebugPanel(debugPanel, demo, frameCount, renderer)

    // MP1P: keep a short rolling buffer of already-resolved presentation frames for local replay.
    // This is display-only history, never fed back into MatchEngine or re-simulated.
    const now = performance.now()
    replayBuffer.push({ capturedAtMs: now, state: presentationState, events: presentationEvents })
    while (replayBuffer.length > 0 && now - replayBuffer[0]!.capturedAtMs > REPLAY_BUFFER_SECONDS * 1000) {
      replayBuffer.shift()
    }
  }, intervalMs)

  const handleResize = () => renderer.resize(stage.clientWidth, stage.clientHeight)
  window.addEventListener('resize', handleResize)

  mountControlPanel(controls, renderer, {
    onReplayToggle: (replaying) => {
      isReplaying = replaying
      replayBanner.style.display = replaying ? 'block' : 'none'
    },
    getReplayBuffer: () => replayBuffer,
    pushSnapshot: (state, events) => renderer.pushSnapshot(state, events),
  })

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

function updateDebugPanel(panel: HTMLElement, demo: MatchDemoHandle, presentationFrame: number, renderer: PhaserMatchRenderer): void {
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
    `screen: ${state.screenIntent !== undefined ? state.screenIntent.phase : '-'}`,
    `drive: ${state.driveIntent !== undefined ? `${state.driveIntent.stepsRemaining} steps left` : '-'}`,
    `defensive reaction: ${state.defensiveReaction?.phase ?? '-'}`,
    `events so far: ${state.events.length}`,
    `complete: ${state.isComplete}`,
    `playback speed: ${renderer.getPlaybackSpeed()}x  paused: ${renderer.isPaused()}`,
    `camera: ${renderer.getCameraMode()}`,
  ].join('\n')
}

interface ControlPanelCallbacks {
  readonly onReplayToggle: (replaying: boolean) => void
  readonly getReplayBuffer: () => readonly ReplayFrame[]
  readonly pushSnapshot: (state: MatchPresentationState, events: readonly MatchPresentationEvent[]) => void
}

function mountControlPanel(container: HTMLElement, renderer: PhaserMatchRenderer, callbacks: ControlPanelCallbacks): void {
  const speedGroup = document.createElement('div')
  speedGroup.style.cssText = 'display:flex;gap:4px;align-items:center'
  const speedLabel = document.createElement('span')
  speedLabel.textContent = 'speed:'
  speedGroup.appendChild(speedLabel)
  for (const speed of PRESENTATION_PLAYBACK_SPEEDS) {
    const button = makeButton(`${speed}x`, () => renderer.setPlaybackSpeed(speed))
    speedGroup.appendChild(button)
  }
  const pauseButton = makeButton('pause', () => {
    renderer.setPaused(!renderer.isPaused())
    pauseButton.textContent = renderer.isPaused() ? 'resume' : 'pause'
  })
  speedGroup.appendChild(pauseButton)
  container.appendChild(speedGroup)

  const cameraGroup = document.createElement('div')
  cameraGroup.style.cssText = 'display:flex;gap:4px;align-items:center'
  const cameraLabel = document.createElement('span')
  cameraLabel.textContent = 'camera:'
  cameraGroup.appendChild(cameraLabel)
  const cameraModes: readonly CameraMode[] = ['broadcast', 'followBall', 'fullCourtDebug']
  for (const mode of cameraModes) {
    cameraGroup.appendChild(makeButton(mode, () => renderer.setCameraMode(mode)))
  }
  container.appendChild(cameraGroup)

  const idGroup = document.createElement('div')
  idGroup.style.cssText = 'display:flex;gap:4px;align-items:center'
  idGroup.appendChild(makeToggle('jersey', renderer.identificationOptions.showJersey, (v) => (renderer.identificationOptions.showJersey = v)))
  idGroup.appendChild(makeToggle('names', renderer.identificationOptions.showLabel, (v) => (renderer.identificationOptions.showLabel = v)))
  idGroup.appendChild(makeToggle('action', renderer.identificationOptions.showAction, (v) => (renderer.identificationOptions.showAction = v)))
  container.appendChild(idGroup)

  const debugGroup = document.createElement('div')
  debugGroup.style.cssText = 'display:flex;gap:4px;align-items:center'
  debugGroup.appendChild(makeToggle('debug', renderer.debugOptions.enabled, (v) => (renderer.debugOptions.enabled = v)))
  debugGroup.appendChild(makeToggle('canonical', renderer.debugOptions.showCanonicalPosition, (v) => (renderer.debugOptions.showCanonicalPosition = v)))
  debugGroup.appendChild(makeToggle('velocity', renderer.debugOptions.showVelocityVectors, (v) => (renderer.debugOptions.showVelocityVectors = v)))
  debugGroup.appendChild(makeToggle('assignments', renderer.debugOptions.showAssignments, (v) => (renderer.debugOptions.showAssignments = v)))
  debugGroup.appendChild(makeToggle('targets', renderer.debugOptions.showTargets, (v) => (renderer.debugOptions.showTargets = v)))
  debugGroup.appendChild(makeToggle('pass lines', renderer.debugOptions.showPassLines, (v) => (renderer.debugOptions.showPassLines = v)))
  container.appendChild(debugGroup)

  // MP1P best-effort short replay: pause live playback and step through the last ~8s of already
  // resolved presentation frames. This does not re-simulate anything; it only re-displays frames
  // captured from real stepMatchSession output.
  const replayGroup = document.createElement('div')
  replayGroup.style.cssText = 'display:flex;gap:4px;align-items:center'
  let replayIndex = 0
  let replayTimer: number | undefined
  const replayButton = makeButton('replay last 8s', () => {
    const buffer = callbacks.getReplayBuffer()
    if (buffer.length === 0) return
    callbacks.onReplayToggle(true)
    replayIndex = 0
    if (replayTimer !== undefined) window.clearInterval(replayTimer)
    replayTimer = window.setInterval(() => {
      const frame = buffer[replayIndex]
      if (frame === undefined) {
        window.clearInterval(replayTimer)
        callbacks.onReplayToggle(false)
        return
      }
      callbacks.pushSnapshot(frame.state, frame.events)
      replayIndex += 1
    }, 90)
  })
  replayGroup.appendChild(replayButton)
  container.appendChild(replayGroup)
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = label
  button.style.cssText = 'padding:2px 8px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,0.3);border-radius:3px;cursor:pointer;font:11px monospace'
  button.addEventListener('click', onClick)
  return button
}

function makeToggle(label: string, initial: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const wrapper = document.createElement('label')
  wrapper.style.cssText = 'display:flex;gap:4px;align-items:center;cursor:pointer'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initial
  input.addEventListener('change', () => onChange(input.checked))
  const span = document.createElement('span')
  span.textContent = label
  wrapper.appendChild(input)
  wrapper.appendChild(span)
  return wrapper
}
