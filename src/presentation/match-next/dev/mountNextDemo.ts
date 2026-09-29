/**
 * /dev-match-next.html entry — Basketball Truth for MatchEngine Next.
 * Wires a REAL Next live session through the bridge and director into Phaser. DOM only for HUD/controls/tables;
 * no gameplay logic. `window.__bdmNext` exposes the on-screen canonical-vs-rendered truth for capture scripts.
 */

import type { MatchNextEvent } from '@/engine/match-next'
import type { PlayerId } from '@/domain/ids'
import type { CameraMode } from '../camera'
import type { NextRenderFrame } from '../NextPresentationDirector'
import { PhaserNextRenderer } from '../PhaserNextRenderer'
import { buildNextTruthFrame, type NextTruthFrame } from '../truth'
import type { Pt } from '../types'
import { createNextDemoSession, type NextDemoOptions, type NextDemoSession } from './nextDemoBootstrap'

export interface MountNextOptions extends NextDemoOptions {
  readonly seed?: number
  readonly speed?: number
  readonly camera?: CameraMode
  readonly truth?: boolean
}

export interface NextBeat {
  readonly wallMs: number
  readonly tick: number
  readonly sequence: number
  readonly type: string
  readonly detail: string
}

export interface NextTruthApi {
  readonly seed: number
  getTruthFrame(): NextTruthFrame | undefined
  getFrameInfo(): { readonly tick: number; readonly alpha: number; readonly period: number; readonly clock: number; readonly score: { home: number; away: number }; readonly ballKind: string } | undefined
  getBeatLog(): readonly NextBeat[]
  setSpeed(multiplier: number): void
  setPaused(paused: boolean): void
  setCamera(mode: CameraMode): void
  setTruthMode(enabled: boolean): void
  setOverlay(name: 'assignments' | 'targets' | 'facing' | 'slots' | 'names' | 'action', enabled: boolean): void
  advance(ms: number): void
  /** Fast-forwards playback until canonical tick >= t has been played. */
  seekToTick(t: number): void
}

declare global {
  interface Window {
    __bdmNext?: NextTruthApi
  }
}

export interface MountNextHandle {
  readonly session: NextDemoSession
  stop(): void
}

const SPEEDS = [0.5, 1, 2, 4, 8] as const

export function mountNextDemo(root: HTMLElement, options: MountNextOptions = {}): MountNextHandle {
  const seed = options.seed ?? 424242
  root.innerHTML = ''
  root.style.cssText = 'margin:0;width:100vw;height:100vh;background:#0b0f14;overflow:hidden;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,sans-serif'
  const header = el('div', 'padding:6px 14px;color:#94a3b8;font:600 12px/1.3 ui-sans-serif;background:#0f1620;border-bottom:1px solid rgba(80,120,160,0.25);display:flex;gap:16px;flex-wrap:wrap')
  header.innerHTML = `<span style="color:#e2e8f0;letter-spacing:0.05em">BASKETBALL TRUTH · MATCHENGINE NEXT</span><span>real match-next session (10 Hz ticks) — canonical vs rendered</span><span style="color:#7dd3fc">seed ${seed}</span>`
  root.appendChild(header)
  const controls = el('div', 'padding:5px 14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;background:#0c131c;border-bottom:1px solid rgba(80,120,160,0.18);font:11px ui-sans-serif;color:#cbd5e1')
  root.appendChild(controls)
  const body = el('div', 'flex:1;min-height:0;display:flex')
  root.appendChild(body)
  const stage = el('div', 'position:relative;flex:1;min-width:0;min-height:0;overflow:hidden')
  body.appendChild(stage)
  const side = el('div', 'width:0;overflow:hidden;background:#0a1018;border-left:1px solid rgba(80,120,160,0.2);flex:none')
  body.appendChild(side)
  const scoreboard = el('div', 'position:absolute;left:50%;top:8px;transform:translateX(-50%);padding:5px 16px;background:rgba(10,16,24,0.88);color:#e2e8f0;font:600 15px/1.2 ui-monospace,monospace;border-radius:6px;pointer-events:none;white-space:nowrap')
  stage.appendChild(scoreboard)
  const banner = el('div', 'position:absolute;left:50%;top:52px;transform:translateX(-50%);padding:3px 14px;background:rgba(34,197,94,0.18);color:#86efac;font:700 14px ui-monospace,monospace;border-radius:4px;pointer-events:none;display:none')
  stage.appendChild(banner)
  const status = el('div', 'position:absolute;left:10px;bottom:8px;padding:3px 8px;background:rgba(10,16,24,0.85);color:#f97316;font:11px ui-monospace,monospace;border-radius:4px;pointer-events:none')
  stage.appendChild(status)
  const log = el('pre', 'position:absolute;right:8px;bottom:8px;margin:0;padding:6px 8px;background:rgba(10,16,24,0.85);color:#94a3b8;font:10px/1.35 ui-monospace,monospace;border-radius:4px;max-width:440px;pointer-events:none;white-space:pre')
  stage.appendChild(log)
  const panel = el('pre', 'margin:0;padding:8px 10px;color:#cbd5e1;font:10.5px/1.35 ui-monospace,monospace;white-space:pre;overflow:auto;height:100%;box-sizing:border-box')
  side.appendChild(panel)

  const session = createNextDemoSession(seed, options)
  const renderer = new PhaserNextRenderer({ parent: stage, width: stage.clientWidth || 1024, height: stage.clientHeight || 640, first: session.first(), tickSource: () => session.step() })
  renderer.setPlaybackSpeed(options.speed ?? 1)
  if (options.camera !== undefined) renderer.setCameraMode(options.camera)
  if (options.truth === true) renderer.debugOptions.basketballTruth = true

  const beats: NextBeat[] = []
  const startedAt = performance.now()
  let bannerTimer: number | undefined
  let frameCounter = 0
  let lastFrame: NextRenderFrame | undefined
  let lastPresentationEvents: string[] = []
  let panelTimer = 0
  const nameOf = (id: PlayerId | undefined): string => (id === undefined ? '-' : (session.labels.get(id)?.label ?? String(id).slice(-5)))

  renderer.onEvents((events: readonly MatchNextEvent[]) => {
    for (const e of events) {
      const who = e.shooterPlayerId ?? e.playerId ?? e.passerPlayerId
      const detail = [nameOf(who), e.receiverPlayerId === undefined ? '' : `> ${nameOf(e.receiverPlayerId)}`, e.points === undefined ? '' : `+${e.points}`, e.reboundType ?? '', e.actionKind ?? '', e.phase ?? '', e.ballReason ?? '', e.transitionTrigger ?? ''].filter(Boolean).join(' ')
      beats.push({ wallMs: Math.round(performance.now() - startedAt), tick: e.t, sequence: e.sequence, type: e.type, detail })
      if (e.type === 'shotMade' || e.type === 'shotMissed' || e.type === 'reboundSecured' || e.type === 'passIntercepted' || e.type === 'periodEnd' || e.type === 'shotClockViolation' || e.type === 'jumpBallResolved') showBanner(`${e.type}${e.points === undefined ? '' : ` +${e.points}`}`)
    }
    lastPresentationEvents = events.map((e) => e.type)
    while (beats.length > 600) beats.shift()
    log.textContent = beats
      .filter((b) => !['defensiveResponsibilityChanged', 'possessionPhaseChanged', 'transitionAdvantageChanged', 'defensiveAssignmentsEstablished', 'decisionSelected', 'actionStarted', 'actionResolved', 'reboundResponsibilitiesAssigned'].includes(b.type))
      .slice(-9)
      .map((b) => `t${String(b.tick).padStart(5)} #${String(b.sequence).padStart(4)} ${b.type} ${b.detail}`)
      .join('\n')
  })

  function showBanner(text: string): void {
    banner.textContent = text
    banner.style.display = 'block'
    if (bannerTimer !== undefined) window.clearTimeout(bannerTimer)
    bannerTimer = window.setTimeout(() => (banner.style.display = 'none'), 1300)
  }

  function truthNow(): NextTruthFrame | undefined {
    const frame = lastFrame
    if (frame === undefined) return undefined
    return buildNextTruthFrame(frame, renderer.getRenderedTruth(), frameCounter, lastPresentationEvents)
  }

  renderer.onFrame((frame, rendered) => {
    frameCounter += 1
    lastFrame = frame
    const r = frame.rendered
    const clock = Math.max(0, Math.round(r.gameClockSeconds))
    scoreboard.textContent = `HOME ${r.score.home} — ${r.score.away} AWAY · P${r.period} ${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}${r.shotClockSeconds === undefined ? '' : ` · shot ${r.shotClockSeconds.toFixed(1)}`}`
    status.textContent = `tick ${frame.canonical.t} · ${frame.canonical.possessionPhase ?? 'NO POSSESSION'} · ball ${frame.canonical.ball.kind}${frame.canonical.transition ? ` · transition ${frame.canonical.transition.trigger}` : ''}`
    const now = performance.now()
    if (renderer.debugOptions.basketballTruth && now - panelTimer > 250) {
      panelTimer = now
      panel.textContent = renderPanel(buildNextTruthFrame(frame, rendered, frameCounter, lastPresentationEvents), session)
    }
  })

  const handleResize = (): void => renderer.resize(stage.clientWidth, stage.clientHeight)
  window.addEventListener('resize', handleResize)
  buildControls(controls, side, renderer, handleResize)

  const setTruth = (v: boolean): void => {
    renderer.debugOptions.basketballTruth = v
    side.style.width = v ? '520px' : '0'
    handleResize()
  }
  const api: NextTruthApi = {
    seed,
    getTruthFrame: truthNow,
    getFrameInfo: () => (lastFrame === undefined ? undefined : { tick: lastFrame.canonical.t, alpha: lastFrame.alpha, period: lastFrame.canonical.period, clock: lastFrame.rendered.gameClockSeconds, score: lastFrame.rendered.score, ballKind: lastFrame.canonical.ball.kind }),
    getBeatLog: () => beats,
    setSpeed: (m) => renderer.setPlaybackSpeed(m),
    setPaused: (p) => renderer.setPaused(p),
    setCamera: (m) => renderer.setCameraMode(m),
    setTruthMode: setTruth,
    setOverlay: (name, enabled) => {
      if (name === 'assignments') renderer.debugOptions.showAssignments = enabled
      else if (name === 'targets') renderer.debugOptions.showTargets = enabled
      else if (name === 'facing') renderer.debugOptions.showFacing = enabled
      else if (name === 'slots') renderer.debugOptions.showSlots = enabled
      else if (name === 'names') renderer.identificationOptions.showLabel = enabled
      else renderer.identificationOptions.showAction = enabled
    },
    advance: (ms) => {
      let left = ms
      while (left > 0) {
        renderer.advanceForTest(Math.min(16, left))
        left -= 16
      }
    },
    seekToTick: (t) => {
      let guard = 0
      for (;;) {
        const f = renderer.advanceForTest(400)
        guard += 1
        if (f.canonical.t >= t || f.canonical.isComplete || guard > 500000) break
      }
    },
  }
  window.__bdmNext = api
  if (options.truth === true) setTruth(true)
  return {
    session,
    stop(): void {
      window.removeEventListener('resize', handleResize)
      renderer.destroy()
      delete window.__bdmNext
    },
  }
}

function renderPanel(t: NextTruthFrame, session: NextDemoSession): string {
  const nm = (id: PlayerId | undefined): string => (id === undefined ? '-' : String(id).slice(-4))
  const pt = (p: Pt | undefined): string => (p === undefined ? '    -,-    ' : `${p.x.toFixed(1).padStart(5)},${p.y.toFixed(1).padStart(5)}`)
  const f = (n: number | undefined): string => (n === undefined ? '  - ' : n.toFixed(1).padStart(4))
  const lines: string[] = []
  lines.push('BASKETBALL TRUTH · NEXT (metres, court 28x15)')
  lines.push(`tick ${t.simulationTick}  presentation frame ${t.presentationFrame}  P${t.period}  clock ${t.gameClockSeconds.toFixed(1)}s  shot ${t.shotClockSeconds?.toFixed(1) ?? '-'}  score ${t.score.home}-${t.score.away}`)
  lines.push(`possession ${t.possessionTeamId?.slice(-4) ?? '-'} phase ${t.possessionPhase ?? '-'}  transition ${t.transition ?? '-'}`)
  lines.push(`canonical events: ${t.canonicalEvents.join(' | ') || '-'}`)
  lines.push(`presentation events: ${t.presentationEvents.join(' | ') || '-'}`)
  lines.push('')
  lines.push('id   tm slot          canonical   rendered    d   spd target      urg    action')
  for (const p of t.players) {
    lines.push(`${nm(p.playerId).padEnd(4)} ${p.side === 'home' ? 'H' : 'A'}${p.isOffense ? 'o' : 'd'} ${(p.slot ?? '-').padEnd(13)} ${pt(p.canonical)} ${pt(p.rendered)} ${f(p.diffMeters)} ${f(p.speedMps)} ${pt(p.movementTarget)} ${(p.urgency ?? '-').padEnd(6)} ${p.action}`)
    const bits = [p.guarding ? `guards ${nm(p.guarding)}` : '', p.guardedBy ? `guardedBy ${nm(p.guardedBy)}` : '', p.ballRelation ?? '', p.transitionRole ? `trans:${p.transitionRole}` : '', p.reboundRole ? `reb:${p.reboundRole}` : '', `face ${((Math.atan2(p.facing.y, p.facing.x) * 180) / Math.PI).toFixed(0)}deg`].filter(Boolean)
    lines.push(`     ${bits.join('  ')}`)
  }
  lines.push('')
  lines.push(`ball ${t.ball.kind}  canonical ${pt(t.ball.canonical)}  rendered ${pt(t.ball.rendered)}  z ${t.ball.heightMeters.toFixed(2)}m`)
  lines.push(`     owner ${nm(t.ball.owner)}  target ${pt(t.ball.target)}  flight ${t.ball.flight ?? '-'}`)
  void session
  return lines.join('\n')
}

function buildControls(container: HTMLElement, side: HTMLElement, renderer: PhaserNextRenderer, onLayout: () => void): void {
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
  for (const m of ['fullCourt', 'halfCourt', 'followBall'] as const) camera.appendChild(button(m, () => renderer.setCameraMode(m)))
  group('').appendChild(
    toggle('BASKETBALL TRUTH', false, (v) => {
      renderer.debugOptions.basketballTruth = v
      side.style.width = v ? '520px' : '0'
      onLayout()
    }),
  )
  const overlays = group('overlays:')
  overlays.appendChild(toggle('assignments', false, (v) => (renderer.debugOptions.showAssignments = v)))
  overlays.appendChild(toggle('targets', false, (v) => (renderer.debugOptions.showTargets = v)))
  overlays.appendChild(toggle('facing', false, (v) => (renderer.debugOptions.showFacing = v)))
  overlays.appendChild(toggle('slots', false, (v) => (renderer.debugOptions.showSlots = v)))
  const ids = group('ids:')
  ids.appendChild(toggle('jersey', true, (v) => (renderer.identificationOptions.showJersey = v)))
  ids.appendChild(toggle('names', false, (v) => (renderer.identificationOptions.showLabel = v)))
  ids.appendChild(toggle('action', false, (v) => (renderer.identificationOptions.showAction = v)))
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
