import { describe, expect, it } from 'vitest'
import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { FIBA_REGULATION } from './CourtGeometry'
import {
  ballScreenPosition,
  clampPlayerVisualScale,
  COURT_PARQUET_REFERENCE,
  courtPercentToMetres,
  createCourtAnimationState,
  createCourtProjection,
  depthScaleFactor,
  depthScaleForCourtY,
  interpolationDurationMs,
  kitContrastRatio,
  kitNeedsCourtOutline,
  lerp,
  playerVisualDiameterPx,
  playerVisualHeightPx,
  resolveMatchKitColors,
  resolvePlayerFloorState,
  retargetPlayerMotion,
  samplePoint,
  sampleProgress,
  setCourtPlayerScalePreset,
  sortPlayersByScreenDepth,
  syncPauseState,
  type CourtDynamicPlayer,
  type CourtKitColors,
} from './index'

const kitStub = (primary: string): CourtKitColors => ({
  primary,
  secondary: '#ffffff',
  shorts: primary,
  trim: '#ffffff',
  number: '#fff',
  numberOutline: '#000',
  bodyOutline: 'rgba(0,0,0,0.5)',
  skinTone: '#c4a07a',
})

describe('resolveMatchKitColors', () => {
  it('keeps distinct home/away kits with usable contrast', () => {
    const kits = resolveMatchKitColors('team-alpha', 'team-beta')
    expect(kits.home.primary).toBeTruthy()
    expect(kits.away.primary).toBeTruthy()
    expect(kits.home.shorts).toBeTruthy()
    expect(kits.home.trim).toBeTruthy()
    expect(kits.home.bodyOutline).toBeTruthy()
    expect(kitContrastRatio(kits.home.primary, kits.away.primary)).toBeGreaterThanOrEqual(1.5)
  })

  it('forces road contrast when brand primaries collide', () => {
    const kits = resolveMatchKitColors('same-club', 'same-club')
    expect(kitContrastRatio(kits.home.primary, kits.away.primary)).toBeGreaterThanOrEqual(2.4)
  })

  it('flags low kit/court contrast for outline', () => {
    expect(kitNeedsCourtOutline('#d2b07a', COURT_PARQUET_REFERENCE)).toBe(true)
    expect(kitNeedsCourtOutline('#0a2a6e', COURT_PARQUET_REFERENCE)).toBe(false)
  })
})

describe('CourtAnimationState', () => {
  it('lerps and eases progress', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
    expect(sampleProgress(0, 100, 50, 0, null)).toBeCloseTo(0.5, 1)
    expect(samplePoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 })
  })

  it('scales interpolation duration with playback speed', () => {
    expect(interpolationDurationMs(280, 1)).toBe(280)
    expect(interpolationDurationMs(280, 2)).toBe(140)
    expect(interpolationDurationMs(280, 4)).toBe(70)
  })

  it('retargets from current sample without teleport', () => {
    const state = createCourtAnimationState()
    const id = playerIdFromString('p1')
    retargetPlayerMotion(state, id, { x: 10, y: 10 }, 0, 1, true)
    retargetPlayerMotion(state, id, { x: 40, y: 10 }, 100, 1, true)
    const motion = state.players.get(id)!
    expect(motion.from).toEqual({ x: 10, y: 10 })
    expect(motion.to).toEqual({ x: 40, y: 10 })
    const mid = samplePoint(
      motion.from,
      motion.to,
      sampleProgress(motion.startedAt, motion.durationMs, 100 + motion.durationMs / 2, 0, null),
    )
    expect(mid.x).toBeGreaterThan(10)
    expect(mid.x).toBeLessThan(40)
  })

  it('freezes progress while paused', () => {
    const state = createCourtAnimationState()
    const id = playerIdFromString('p1')
    retargetPlayerMotion(state, id, { x: 0, y: 0 }, 0, 1, true)
    retargetPlayerMotion(state, id, { x: 100, y: 0 }, 10, 1, true)
    syncPauseState(state, false, 50)
    const motion = state.players.get(id)!
    const atPause = sampleProgress(
      motion.startedAt,
      motion.durationMs,
      50,
      motion.pauseAccumMs,
      motion.pausedAt,
    )
    const later = sampleProgress(
      motion.startedAt,
      motion.durationMs,
      500,
      motion.pauseAccumMs,
      motion.pausedAt,
    )
    expect(later).toBe(atPause)
  })
})

describe('player visual scale CT3.1 tokens', () => {
  it('keeps token diameter in readability band on 1080p', () => {
    setCourtPlayerScalePreset('MEDIUM')
    const projection = createCourtProjection(1920, 1080, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
      courtWidthFill: 0.92,
      courtHeightFill: 0.995,
    })
    const far = courtPercentToMetres(25, 15, projection)
    const near = courtPercentToMetres(50, 88, projection)
    const farD = playerVisualDiameterPx(far, projection)
    const nearD = playerVisualDiameterPx(near, projection)
    expect(farD).toBeGreaterThanOrEqual(33)
    expect(farD).toBeLessThanOrEqual(44)
    expect(nearD).toBeGreaterThanOrEqual(36)
    expect(nearD).toBeLessThanOrEqual(46)
    expect(nearD).toBeGreaterThanOrEqual(farD)
    expect(playerVisualHeightPx(far, projection)).toBe(farD)
  })

  it('clamps extreme scale values', () => {
    expect(clampPlayerVisualScale(0.1)).toBe(0.88)
    expect(clampPlayerVisualScale(4)).toBe(1.22)
    expect(clampPlayerVisualScale(1)).toBe(1)
  })

  it('applies subtle depth scaling far < near', () => {
    expect(depthScaleFactor(0, 15)).toBeLessThan(depthScaleFactor(15, 15))
  })
})

describe('resolvePlayerFloorState', () => {
  it('keeps possession and selection distinct', () => {
    expect(resolvePlayerFloorState(false, false)).toBe('none')
    expect(resolvePlayerFloorState(true, false)).toBe('possession')
    expect(resolvePlayerFloorState(false, true)).toBe('selected')
    expect(resolvePlayerFloorState(true, true)).toBe('both')
  })
})

describe('player projection bridge', () => {
  it('maps court percent through projection.project', () => {
    const projection = createCourtProjection(800, 450, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
      courtWidthFill: 0.92,
      courtHeightFill: 0.995,
    })
    const court = courtPercentToMetres(50, 50, projection)
    expect(court.x).toBeCloseTo(projection.regulation.length / 2, 5)
    expect(court.y).toBeCloseTo(projection.regulation.width / 2, 5)
    const screen = projection.project(court)
    expect(screen.x).toBeGreaterThan(0)
    expect(screen.y).toBeGreaterThan(0)
    expect(depthScaleForCourtY(0, projection)).toBeLessThanOrEqual(
      depthScaleForCourtY(projection.regulation.width, projection),
    )
    expect(depthScaleFactor(0, projection.regulation.width)).toBeLessThan(
      depthScaleFactor(projection.regulation.width, projection.regulation.width),
    )
  })
})

describe('sortPlayersByScreenDepth', () => {
  it('draws nearer (higher screenY) after farther', () => {
    const mk = (
      id: string,
      screenY: number,
    ): {
      screenY: number
      player: CourtDynamicPlayer
      court: { x: number; y: number }
      facing: number
    } => ({
      screenY,
      facing: 0,
      court: { x: 0, y: 0 },
      player: {
        playerId: playerIdFromString(id),
        teamId: teamIdFromString('t'),
        side: 'home',
        xPercent: 0,
        yPercent: 0,
        jersey: 1,
        hasBall: false,
        selected: false,
        kit: kitStub('#123456'),
      },
    })
    const sorted = sortPlayersByScreenDepth([mk('far', 10), mk('near', 90), mk('mid', 40)])
    expect(sorted.map((e) => e.player.playerId)).toEqual([
      playerIdFromString('far'),
      playerIdFromString('mid'),
      playerIdFromString('near'),
    ])
  })
})

describe('ballScreenPosition', () => {
  it('lifts ball by z while shadow stays on court plane', () => {
    const projection = createCourtProjection(800, 450, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
      courtWidthFill: 0.92,
      courtHeightFill: 0.995,
    })
    const court = courtPercentToMetres(40, 50, projection)
    const flat = ballScreenPosition(projection, court, 0)
    const lifted = ballScreenPosition(projection, court, 2)
    expect(lifted.shadowX).toBe(flat.shadowX)
    expect(lifted.shadowY).toBe(flat.shadowY)
    expect(lifted.y).toBeLessThan(flat.y)
  })
})
