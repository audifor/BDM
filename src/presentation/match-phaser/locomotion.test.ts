import { describe, expect, it } from 'vitest'

import { playerIdFromString, teamIdFromString } from '@/domain/ids'
import { LocomotionSystem } from './locomotion'
import type { MatchPresentationState, PresentationPlayer } from './visualTypes'

function makePlayer(overrides: Partial<PresentationPlayer> = {}): PresentationPlayer {
  return {
    playerId: playerIdFromString('player-1'),
    teamId: teamIdFromString('team-1'),
    side: 'home',
    label: 'P',
    jersey: 4,
    position: { xPercent: 50, yPercent: 50 },
    speedMetersPerSecond: 0,
    orientationRadians: undefined,
    hasBall: false,
    isOffense: true,
    actionIntent: 'idle',
    defensiveIntent: undefined,
    defendingPlayerId: undefined,
    defendedByPlayerId: undefined,
    screenPartnerId: undefined,
    ...overrides,
  }
}

function makeState(players: readonly PresentationPlayer[], ballPosition = { xPercent: 50, yPercent: 50 }): MatchPresentationState {
  return {
    simulationTick: 1,
    court: { lengthMeters: 28, widthMeters: 15, baskets: { left: { xPercent: 5, yPercent: 50 }, right: { xPercent: 95, yPercent: 50 } } },
    players,
    ball: { position: ballPosition, state: 'unassigned', ownerPlayerId: undefined, ownerTeamId: undefined, visualHeight: 0, isPassFlight: false, isShotFlight: false },
    clock: { period: 1, periodCount: 4, clockSecondsRemaining: 600, periodSeconds: 600 },
    score: { home: 0, away: 0 },
    possession: { offensiveTeamId: teamIdFromString('team-1'), defensiveTeamId: teamIdFromString('team-2'), ballHandlerId: undefined },
    isComplete: false,
    currentActionKind: undefined,
    debugTargets: { screenTarget: undefined, driveTarget: undefined, passTargetPlayerId: undefined, shotTargetBasket: undefined },
  }
}

describe('LocomotionSystem', () => {
  it('never reports a rendered position beyond the canonical target once fully eased (no teleport overshoot)', () => {
    const system = new LocomotionSystem()
    const player = makePlayer({ position: { xPercent: 10, yPercent: 10 } })
    system.step(makeState([player]), 0)

    const moved = makePlayer({ ...player, position: { xPercent: 90, yPercent: 10 } })
    let samples = system.step(makeState([moved]), 0.1)
    expect(samples[0]!.renderedXPercent).toBeGreaterThan(10)
    expect(samples[0]!.renderedXPercent).toBeLessThan(90)

    for (let i = 0; i < 200; i += 1) {
      samples = system.step(makeState([moved]), 0.1)
    }
    expect(samples[0]!.renderedXPercent).toBeCloseTo(90, 0)
  })

  it('separates two players whose smoothed centers would otherwise fully overlap, without moving the canonical facts', () => {
    const system = new LocomotionSystem()
    const a = makePlayer({ playerId: playerIdFromString('a'), position: { xPercent: 50, yPercent: 50 } })
    const b = makePlayer({ playerId: playerIdFromString('b'), position: { xPercent: 50, yPercent: 50 } })
    let samples = system.step(makeState([a, b]), 0)
    for (let i = 0; i < 30; i += 1) {
      samples = system.step(makeState([a, b]), 0.05)
    }
    const distance = Math.hypot(
      samples[0]!.renderedXPercent - samples[1]!.renderedXPercent,
      samples[0]!.renderedYPercent - samples[1]!.renderedYPercent,
    )
    expect(distance).toBeGreaterThan(0)
    // Canonical facts (the input state) are never mutated by the locomotion system.
    expect(a.position).toEqual({ xPercent: 50, yPercent: 50 })
    expect(b.position).toEqual({ xPercent: 50, yPercent: 50 })
  })

  it('drops tracked state for players no longer present in the snapshot (no leak across substitutions)', () => {
    const system = new LocomotionSystem()
    const a = makePlayer({ playerId: playerIdFromString('a') })
    system.step(makeState([a]), 0.1)
    const samples = system.step(makeState([]), 0.1)
    expect(samples).toHaveLength(0)
  })
})
