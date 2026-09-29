/**
 * /dev-match-phaser.html entry — Basketball Truth (BT1) demo.
 *
 * Wires a REAL, seeded MatchEngine session (matchDemoBootstrap) through the presentation bridge
 * (toMatchPresentationSegment) into the Phaser renderer. The renderer PULLS engine steps only when
 * its playback queue runs low, so the engine is paced by what the viewer has already watched.
 *
 * This file only builds DOM (HUD, control bar, Basketball Truth table, event log) and forwards
 * calls; it contains no gameplay logic and never decides an outcome. It also exposes
 * `window.__bdmBT` so a headless/real browser run can read the exact canonical-vs-rendered truth
 * frame that was on screen (used by the BT1 capture script).
 */

import { toMatchPresentationSegment, toMatchPresentationState } from '../MatchPresentationBridge'
import { PhaserMatchRenderer } from '../PhaserMatchRenderer'
import type { FiredBeat, PresentationFrame } from '../PresentationDirector'
import type { RenderedTruth } from '../PhaserMatchScene'
import type { CameraMode } from '../camera'
import type { MetrePoint, TruthFrame } from '../audit/basketballTruth'
import { TruthTracker } from '../audit/truthTracker'
import { toMeters } from '../segmentPlan'
import { createMatchDemo, type MatchDemoHandle } from './matchDemoBootstrap'

export interface MatchPhaserDemoOptions {
  readonly seed?: number
  readonly speed?: number
  readonly camera?: CameraMode
  readonly truth?: boolean
}

export interface BasketballTruthApi {
  readonly seed: number
  /** The truth frame for the segment on screen, with the RENDERED positions of this animation frame filled in. */
  getTruthFrame(): TruthFrame | undefined
  getFrameInfo(): {
    readonly phase: string
    readonly segmentIndex: number | undefined
    readonly segmentTimeMs: number
    readonly segmentDurationMs: number
    readonly ballLeg: string
    readonly queued: number
    readonly clock: number
    readonly score: { readonly home: number; readonly away: number }
    readonly period: number
  } | undefined
  getBeatLog(): readonly { readonly wallMs: number; readonly segment: number; readonly tick: number; readonly kind: string; readonly label: string; readonly eventSequence: number | undefined }[]
  setSpeed(multiplier: number): void
  setPaused(paused: boolean): void
  setCamera(mode: CameraMode): void
  setTruthMode(enabled: boolean): void
  setOverlay(name: 'assignments' | 'targets' | 'facing' | 'path' | 'names' | 'action', enabled: boolean): void
  /** Deterministic fast-forward for captures: advance playback by `ms` of wall-clock time, in 16 ms frames. */
  advance(ms: number): void
  /** Fast-forwards playback until segment `index` has started (its first frame is then the current one). */
  seekToSegment(index: number): void
}

export interface MatchPhaserDemoHandle {
  readonly demo: MatchDemoHandle
  stop(): void
}

declare global {
  interface Window {
    __bdmBT?: BasketballTruthApi
  }
}

const SPEEDS = [0.5, 1, 2, 4] as const

export function mountMatchPhaserDemo(root: HTMLElement, options: MatchPhaserDemoOptions = {}): MatchPhaserDemoHandle {
  const seed = options.seed ?? 424242
  root.innerHTML = ''
  root.style.cssText = 'margin:0;width:100vw;height:100vh;background:#0b0f14;overflow:hidden;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,sans-serif'

  const header = el('div', 'padding:6px 14px;color:#94a3b8;font:600 12px/1.3 ui-sans-serif;background:#0f1620;border-bottom:1px solid rgba(80,120,160,0.25);display:flex;gap:16px;flex-wrap:wrap;align-items:center')
  header.innerHTML = `<span style="color:#e2e8f0;letter-spacing:0.05em">BASKETBALL TRUTH · BT1</span><span>real MatchEngine session — canonical vs rendered</span><span style="color:#7dd3fc">seed: ${seed}</span>`
  root.appendChild(header)

  const controls = el('div', 'padding:5px 14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#0c131c;border-bottom:1px solid rgba(80,120,160,0.18);font:11px ui-sans-serif;color:#cbd5e1')
  root.appendChild(controls)

  const body = el('div', 'flex:1;min-height:0;display:flex')
  root.appendChild(body)
  const stage = el('div', 'position:relative;flex:1;min-width:0;min-height:0;overflow:hidden')
  body.appendChild(stage)
  const side = el('div', 'width:0;overflow:hidden;background:#0a1018;border-left:1px solid rgba(80,120,160,0.2);flex:none')
  body.appendChild(side)

  const scoreboard = el('div', 'position:absolute;left:50%;top:8px;transform:translateX(-50%);padding:5px 16px;background:rgba(10,16,24,0.88);color:#e2e8f0;font:600 15px/1.2 ui-monospace,monospace;border-radius:6px;pointer-events:none;text-align:center;white-space:nowrap')
  stage.appendChild(scoreboard)
  const banner = el('div', 'position:absolute;left:50%;top:52px;transform:translateX(-50%);padding:3px 14px;background:rgba(34,197,94,0.18);color:#86efac;font:700 14px ui-monospace,monospace;border-radius:4px;pointer-events:none;display:none')
  stage.appendChild(banner)
  const legLabel = el('div', 'position:absolute;left:10px;bottom:8px;padding:3px 8px;background:rgba(10,16,24,0.85);color:#f97316;font:11px ui-monospace,monospace;border-radius:4px;pointer-events:none')
  stage.appendChild(legLabel)
  const log = el('pre', 'position:absolute;right:8px;bottom:8px;margin:0;padding:6px 8px;background:rgba(10,16,24,0.85);color:#94a3b8;font:10px/1.35 ui-monospace,monospace;border-radius:4px;max-width:420px;pointer-events:none;white-space:pre')
  stage.appendChild(log)

  const truthPanel = el('pre', 'margin:0;padding:8px 10px;color:#cbd5e1;font:10.5px/1.35 ui-monospace,monospace;white-space:pre;overflow:auto;height:100%;box-sizing:border-box')
  side.appendChild(truthPanel)

  const demo = createMatchDemo(seed)
  const initialState = toMatchPresentationState(demo.session.state, demo.labels)
  const tracker = new TruthTracker(demo.session.state)
  let segmentIndex = 0
  const source = () => {
    if (demo.session.state.isComplete) return undefined
    const before = demo.session.state
    const after = demo.step().state
    const truth = tracker.frameFor(before, after)
    return toMatchPresentationSegment({ index: segmentIndex++, before, after, labels: demo.labels, truth })
  }

  const renderer = new PhaserMatchRenderer({
    parent: stage,
    width: stage.clientWidth || 1024,
    height: stage.clientHeight || 640,
    initialState,
    segmentSource: source,
  })
  renderer.setPlaybackSpeed(options.speed ?? 1)
  if (options.camera !== undefined) renderer.setCameraMode(options.camera)
  if (options.truth === true) renderer.debugOptions.basketballTruth = true

  const beatLog: { wallMs: number; segment: number; tick: number; kind: string; label: string; eventSequence: number | undefined }[] = []
  const startedAt = performance.now()
  let bannerTimer: number | undefined
  let frameCounter = 0
  let lastFrame: PresentationFrame | undefined
  let lastRendered: RenderedTruth | undefined
  let lastBeatLabel: string | undefined

  renderer.onBeats((beats: readonly FiredBeat[]) => {
    for (const beat of beats) {
      beatLog.push({ wallMs: Math.round(performance.now() - startedAt), segment: beat.segmentIndex, tick: beat.simulationTick, kind: beat.kind, label: beat.label, eventSequence: beat.event?.sequence })
      lastBeatLabel = beat.label
      if (beat.kind !== 'catch' && beat.kind !== 'passRelease' && beat.kind !== 'shotRelease' && beat.kind !== 'inbound') showBanner(beat.label)
    }
    while (beatLog.length > 400) beatLog.shift()
    log.textContent = beatLog
      .slice(-9)
      .map((b) => `t${String(b.tick).padStart(4)} s${String(b.segment).padStart(3)} ${b.label}${b.eventSequence === undefined ? '' : `  (ev#${b.eventSequence})`}`)
      .join('\n')
  })

  function showBanner(text: string): void {
    banner.textContent = text
    banner.style.display = 'block'
    if (bannerTimer !== undefined) window.clearTimeout(bannerTimer)
    bannerTimer = window.setTimeout(() => (banner.style.display = 'none'), 1300)
  }

  let panelTimer = 0
  renderer.onFrame((frame, rendered) => {
    frameCounter += 1
    lastFrame = frame
    lastRendered = rendered
    const s = frame.state
    const clock = Math.max(0, Math.round(s.clock.clockSecondsRemaining))
    scoreboard.textContent = `HOME ${s.score.home}  —  ${s.score.away} AWAY   ·   P${s.clock.period}  ${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`
    legLabel.textContent = `${frame.phase.toUpperCase()} · ${frame.ballLegLabel} · seg ${frame.segmentIndex ?? '-'} ${Math.round(frame.segmentTimeMs)}/${Math.round(frame.segmentDurationMs)}ms · queue ${frame.queuedSegments}`
    const now = performance.now()
    if (renderer.debugOptions.basketballTruth && now - panelTimer > 250) {
      panelTimer = now
      truthPanel.textContent = renderTruthText(buildTruthWithRendered(), frame, frameCounter, lastBeatLabel)
    }
  })

  function buildTruthWithRendered(): TruthFrame | undefined {
    const truth = lastFrame?.truth
    if (truth === undefined || lastFrame === undefined || lastRendered === undefined) return truth
    const court = lastFrame.state.court
    const renderedPlayers = lastRendered.players
    const players = truth.players.map((row) => {
      const r = renderedPlayers.get(row.playerId)
      const canonical = row.canonical
      const rendered: MetrePoint | undefined = r === undefined ? undefined : { x: r.x, y: r.y }
      return {
        ...row,
        rendered,
        canonicalRenderedDiffMeters: rendered === undefined ? undefined : Math.hypot(rendered.x - canonical.x, rendered.y - canonical.y),
      }
    })
    void court
    return {
      ...truth,
      presentationFrame: frameCounter,
      presentationEvent: lastBeatLabel,
      players,
      ball: { ...truth.ball, rendered: { x: lastRendered.ball.x, y: lastRendered.ball.y }, renderedVisualHeight: lastRendered.ballHeightMeters },
    }
  }

  const handleResize = (): void => renderer.resize(stage.clientWidth, stage.clientHeight)
  window.addEventListener('resize', handleResize)

  mountControls(controls, side, renderer, handleResize)

  const api: BasketballTruthApi = {
    seed,
    getTruthFrame: buildTruthWithRendered,
    getFrameInfo: () =>
      lastFrame === undefined
        ? undefined
        : {
            phase: lastFrame.phase,
            segmentIndex: lastFrame.segmentIndex,
            segmentTimeMs: lastFrame.segmentTimeMs,
            segmentDurationMs: lastFrame.segmentDurationMs,
            ballLeg: lastFrame.ballLegLabel,
            queued: lastFrame.queuedSegments,
            clock: lastFrame.state.clock.clockSecondsRemaining,
            score: lastFrame.state.score,
            period: lastFrame.state.clock.period,
          },
    getBeatLog: () => beatLog,
    setSpeed: (m) => renderer.setPlaybackSpeed(m),
    setPaused: (p) => renderer.setPaused(p),
    setCamera: (m) => renderer.setCameraMode(m),
    setTruthMode: (v) => {
      renderer.debugOptions.basketballTruth = v
      side.style.width = v ? '470px' : '0'
      handleResize()
    },
    setOverlay: (name, enabled) => {
      if (name === 'assignments') renderer.debugOptions.showAssignments = enabled
      else if (name === 'targets') renderer.debugOptions.showTargets = enabled
      else if (name === 'facing') renderer.debugOptions.showFacing = enabled
      else if (name === 'path') renderer.debugOptions.showPath = enabled
      else if (name === 'names') renderer.identificationOptions.showLabel = enabled
      else renderer.identificationOptions.showAction = enabled
    },
    advance: (ms) => {
      let left = ms
      while (left > 0) {
        const step = Math.min(16, left)
        renderer.advanceForTest(step)
        left -= step
      }
    },
    seekToSegment: (index) => {
      let guard = 0
      for (;;) {
        const frame = renderer.advanceForTest(250)
        guard += 1
        if ((frame.segmentIndex !== undefined && frame.segmentIndex >= index) || guard > 200000) break
      }
    },
  }
  window.__bdmBT = api
  if (options.truth === true) api.setTruthMode(true)

  return {
    demo,
    stop(): void {
      window.removeEventListener('resize', handleResize)
      if (bannerTimer !== undefined) window.clearTimeout(bannerTimer)
      renderer.destroy()
      delete window.__bdmBT
    },
  }
}

function renderTruthText(truth: TruthFrame | undefined, frame: PresentationFrame, presentationFrame: number, lastBeat: string | undefined): string {
  if (truth === undefined) return 'no truth frame yet'
  const f = (n: number | undefined, d = 1): string => (n === undefined ? '  -  ' : n.toFixed(d).padStart(5 + (d > 1 ? 1 : 0)))
  const pt = (p: MetrePoint | undefined): string => (p === undefined ? '   -,-    ' : `${p.x.toFixed(1).padStart(5)},${p.y.toFixed(1).padStart(5)}`)
  const lines: string[] = []
  lines.push('BASKETBALL TRUTH  (metres; court 28 x 15)')
  lines.push(`tick ${truth.simulationTick}  presentation frame ${presentationFrame}  seg ${frame.segmentIndex ?? '-'} ${frame.phase}`)
  lines.push(`P${truth.period}  clock ${Math.round(truth.clockSecondsRemaining)}s  score ${truth.score.home}-${truth.score.away}`)
  lines.push(`offense ${String(truth.offenseTeamId).slice(-6)}  defense ${String(truth.defenseTeamId).slice(-6)}  basket x=${truth.attackingBasket.x.toFixed(1)}`)
  lines.push(`phase ${truth.phase}  [${truth.phaseTags.join(', ')}]`)
  lines.push(`engine events: ${truth.matchEngineEvents.join(' | ') || '-'}`)
  lines.push(`presentation event: ${truth.presentationEvent ?? lastBeat ?? '-'}   ball leg: ${frame.ballLegLabel}`)
  lines.push('')
  lines.push('id     tm  role  canonical    rendered      d    spd  target(src)         action')
  for (const p of truth.players) {
    const id = String(p.playerId).slice(-5)
    const target = p.movementTarget === undefined ? '-' : `${p.movementTarget.x.toFixed(0)},${p.movementTarget.y.toFixed(0)}(${(p.movementTargetSource ?? '').slice(0, 5)})`
    lines.push(`${id.padEnd(6)} ${p.side === 'home' ? 'H' : 'A'}${p.isOffense ? 'o' : 'd'}  ${p.possessionRole.padEnd(4)} ${pt(p.canonical)} ${pt(p.rendered)} ${f(p.canonicalRenderedDiffMeters)} ${f(p.speedMps)}  ${target.padEnd(18)} ${p.currentAction}`)
    const bits: string[] = []
    if (p.guarding !== undefined) bits.push(`guards ${String(p.guarding).slice(-5)}`)
    if (p.guardedBy !== undefined) bits.push(`guardedBy ${String(p.guardedBy).slice(-5)}`)
    if (p.offBallCut !== undefined) bits.push(`cut:${p.offBallCut}`)
    if (p.driveIntent) bits.push('drive')
    if (p.screenIntent !== undefined) bits.push(`screen:${p.screenIntent}`)
    if (p.defensiveReaction !== undefined) bits.push(`react:${p.defensiveReaction}`)
    bits.push(`face ${((p.facingRadians * 180) / Math.PI).toFixed(0)}deg`)
    lines.push(`       ${bits.join('  ')}`)
  }
  lines.push('')
  lines.push(`ball  canonical ${pt(truth.ball.canonical)}  rendered ${pt(truth.ball.rendered)}  z ${f(truth.ball.renderedVisualHeight, 2)}m`)
  lines.push(`      owner ${truth.ball.owner === undefined ? '-' : String(truth.ball.owner).slice(-5)}  state ${truth.ball.state}  event ${truth.ball.associatedEvent ?? '-'}`)
  void toMeters
  return lines.join('\n')
}

function mountControls(container: HTMLElement, side: HTMLElement, renderer: PhaserMatchRenderer, onLayout: () => void): void {
  const group = (label: string): HTMLElement => {
    const g = el('div', 'display:flex;gap:4px;align-items:center')
    const l = el('span', 'color:#64748b')
    l.textContent = label
    g.appendChild(l)
    container.appendChild(g)
    return g
  }
  const speed = group('speed:')
  for (const s of SPEEDS) speed.appendChild(button(`${s}x`, () => renderer.setPlaybackSpeed(s)))
  const pause = button('pause', () => {
    renderer.setPaused(!renderer.isPaused())
    pause.textContent = renderer.isPaused() ? 'resume' : 'pause'
  })
  speed.appendChild(pause)

  const camera = group('camera:')
  const modes: readonly CameraMode[] = ['fullCourt', 'halfCourt', 'followBall']
  for (const m of modes) camera.appendChild(button(m, () => renderer.setCameraMode(m)))

  const truth = group('')
  truth.appendChild(
    toggle('BASKETBALL TRUTH', renderer.debugOptions.basketballTruth, (v) => {
      renderer.debugOptions.basketballTruth = v
      side.style.width = v ? '470px' : '0'
      onLayout()
    }),
  )
  const overlays = group('overlays:')
  overlays.appendChild(toggle('assignments', renderer.debugOptions.showAssignments, (v) => (renderer.debugOptions.showAssignments = v)))
  overlays.appendChild(toggle('targets', renderer.debugOptions.showTargets, (v) => (renderer.debugOptions.showTargets = v)))
  overlays.appendChild(toggle('facing', renderer.debugOptions.showFacing, (v) => (renderer.debugOptions.showFacing = v)))
  overlays.appendChild(toggle('path', renderer.debugOptions.showPath, (v) => (renderer.debugOptions.showPath = v)))
  const ids = group('ids:')
  ids.appendChild(toggle('jersey', renderer.identificationOptions.showJersey, (v) => (renderer.identificationOptions.showJersey = v)))
  ids.appendChild(toggle('names', renderer.identificationOptions.showLabel, (v) => (renderer.identificationOptions.showLabel = v)))
  ids.appendChild(toggle('action', renderer.identificationOptions.showAction, (v) => (renderer.identificationOptions.showAction = v)))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.style.cssText = css
  return node
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'padding:2px 8px;background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,0.3);border-radius:3px;cursor:pointer;font:11px ui-monospace,monospace')
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

function toggle(label: string, initial: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const wrapper = el('label', 'display:flex;gap:4px;align-items:center;cursor:pointer')
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
