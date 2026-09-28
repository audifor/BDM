import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { MatchCamera } from './camera'
import type { MatchPresentationState, PresentationPlayer } from './visualTypes'

function makeState(ballXPercent: number, handlerXPercent?: number): MatchPresentationState {
  const players: PresentationPlayer[] =
    handlerXPercent === undefined
      ? []
      : [
          {
            playerId: playerIdFromString('handler'),
            teamId: teamIdFromString('team-1'),
            side: 'home',
            label: 'H',
            jersey: 1,
            position: { xPercent: handlerXPercent, yPercent: 50 },
            speedMetersPerSecond: 0,
            orientationRadians: undefined,
            hasBall: true,
            isOffense: true,
            actionIntent: 'dribble',
            defensiveIntent: undefined,
            defendingPlayerId: undefined,
            defendedByPlayerId: undefined,
            screenPartnerId: undefined,
          },
        ]
  return {
    simulationTick: 1,
    court: { lengthMeters: 28, widthMeters: 15, baskets: { left: { xPercent: 5, yPercent: 50 }, right: { xPercent: 95, yPercent: 50 } } },
    players,
    ball: { position: { xPercent: ballXPercent, yPercent: 50 }, state: 'unassigned', ownerPlayerId: undefined, ownerTeamId: undefined, visualHeight: 0, isPassFlight: false, isShotFlight: false },
    clock: { period: 1, periodCount: 4, clockSecondsRemaining: 600, periodSeconds: 600 },
    score: { home: 0, away: 0 },
    possession: { offensiveTeamId: teamIdFromString('team-1'), defensiveTeamId: teamIdFromString('team-2'), ballHandlerId: undefined },
    isComplete: false,
    currentActionKind: undefined,
    debugTargets: { screenTarget: undefined, driveTarget: undefined, passTargetPlayerId: undefined, shotTargetBasket: undefined },
  }
}

describe('MatchCamera', () => {
  it('fullCourtDebug mode always centers the whole court regardless of ball position', () => {
    const camera = new MatchCamera()
    camera.setMode('fullCourtDebug')
    const result = camera.step(makeState(90), 0.1)
    expect(result).toEqual({ centerXPercent: 50, centerYPercent: 50, zoom: 1 })
  })

  it('followBall mode moves the camera center toward the ball over successive frames', () => {
    const camera = new MatchCamera()
    camera.setMode('followBall')
    let result = camera.step(makeState(20), 0.1)
    const firstCenter = result.centerXPercent
    for (let i = 0; i < 60; i += 1) {
      result = camera.step(makeState(20), 0.1)
    }
    expect(result.centerXPercent).toBeLessThan(firstCenter + 1)
    expect(result.centerXPercent).toBeGreaterThan(20 - 5)
  })

  it('never reports a center outside the 0..100 court-percent range', () => {
    const camera = new MatchCamera()
    camera.setMode('followBall')
    let result = camera.step(makeState(0), 0.1)
    for (let i = 0; i < 100; i += 1) result = camera.step(makeState(0), 0.1)
    expect(result.centerXPercent).toBeGreaterThanOrEqual(0)
    expect(result.centerXPercent).toBeLessThanOrEqual(100)
  })
})
