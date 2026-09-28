import { describe, expect, it } from 'vitest'
import { createCourtGeometry, distanceBetween, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { applyCommand, createMatchState, tick, type MatchSetup, type MatchState } from './index'
import { selectDecision } from './actions/DecisionCore'

function verticalSliceSetup(passFirst = false): MatchSetup {
  const homeTeamId = teamIdFromString('action-slice-home')
  const awayTeamId = teamIdFromString('action-slice-away')
  const home = Array.from({ length: 5 }, (_, index) => playerIdFromString(`action-slice-h${index}`))
  const away = Array.from({ length: 5 }, (_, index) => playerIdFromString(`action-slice-a${index}`))
  const centerY = 7.5
  const homeSpots: readonly CourtPosition[] = [{ x: 14, y: centerY }, { x: 10.5, y: centerY }, { x: 8.5, y: 3.2 }, { x: 8.5, y: 11.8 }, { x: 10, y: 5.2 }]
  const awaySpots = homeSpots.map((spot) => ({ x: spot.x + 1.5, y: spot.y + 0.35 }))
  const profile = (playerId: typeof home[number], teamId: typeof homeTeamId, index: number, isHome: boolean) => ({
    playerId, teamId, primaryPosition: 'PG' as const,
    physical: { heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: { maxSpeedMps: index === 1 && isHome ? 6.5 : 5.8, accelerationMps2: index === 1 && isHome ? 3.8 : 3, brakingMps2: index === 1 && isHome ? 4.8 : 3.8 },
    offense: { usage: 50, rimAttack: isHome && index === 1 ? (passFirst ? 42 : 92) : 50, shooting: isHome && index === 1 && passFirst ? 42 : isHome && index === 2 ? 94 : 50, creation: isHome && index === 1 ? (passFirst ? 40 : 90) : 50, ballSecurity: 65 },
    passing: { accuracy: isHome && index === 1 ? 90 : 60, vision: isHome && index === 1 ? 90 : 60, timing: isHome && index === 1 ? 88 : 60 },
    defense: { pointOfAttack: 52, interior: 52, mobility: 60, steal: 50 },
    rebounding: { impact: 50 },
  })
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  return {
    gameId: gameIdFromString('action-slice-game'), homeTeamId, awayTeamId,
    court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24 },
    homeSquad: home, awaySquad: away, initialLineups: { home, away },
    players: [...home.map((id, index) => profile(id, homeTeamId, index, true)), ...away.map((id, index) => profile(id, awayTeamId, index, false))],
    initialPlayerPositions: [...home.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...away.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan },
    defensiveMatchupOverrides: {
      home: home.map((playerId, index) => ({ playerId, opponentPlayerId: away[index]! })),
      away: away.map((playerId, index) => ({ playerId, opponentPlayerId: home[index]! })),
    },
    matchSeed: 20260926,
  }
}

function readyForAutonomousActions(passFirst = false, period = 1): MatchState {
  const setup = verticalSliceSetup(passFirst)
  let state = createMatchState(setup)
  if (period !== 1) state = { ...state, period, events: state.events.map((event) => ({ ...event, period })) }
  state = tick(state)
  state = applyCommand(state, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: setup.initialLineups.home[0]!, reason: 'periodStart' })
  state = tick(state)
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: setup.initialLineups.home[1]!, passKind: 'chest', travelTicks: 4 })
  for (let count = 0; count < 180 && state.possessions.at(-1)?.phase !== 'SETUP'; count += 1) state = tick(state)
  for (let count = 0; count < 24; count += 1) state = tick(state)
  return { ...state, autonomousActions: true }
}

function runVerticalSlice(period = 1): MatchState {
  let state = readyForAutonomousActions(false, period)
  for (let count = 0; count < 450; count += 1) {
    state = tick(state)
    if (state.actions.some((action) => action.kind === 'CATCH_AND_SHOOT' && action.status === 'COMPLETED')) break
  }
  return state
}

function runOpeningPass(): MatchState {
  let state = readyForAutonomousActions(true)
  for (let count = 0; count < 120; count += 1) {
    state = tick(state)
    if (state.actions.some((action) => action.kind === 'PASS' && action.status === 'COMPLETED')) break
  }
  return state
}

describe('Match Next action vertical slice', () => {
  it('does not repeat a contained drive by the same handler in one possession, including after a return pass', () => {
    const state = readyForAutonomousActions()
    expect(state.ball.kind).toBe('HELD')
    if (state.ball.kind !== 'HELD') return
    const handlerId = state.ball.ownerPlayerId
    const teamId = state.ball.ownerTeamId
    const teammateId = state.players.find((player) => player.active && player.teamId === teamId && player.playerId !== handlerId)!.playerId
    const contained = {
      id: 'contained-drive', kind: 'DRIVE' as const, playerId: handlerId, teamId,
      startedT: state.possessions.at(-1)!.startedT, status: 'COMPLETED' as const, outcome: 'CONTAINED' as const,
    }
    const afterContainment = { ...state, actions: [...state.actions, contained] }
    expect(selectDecision(afterContainment)?.kind).toBe('PASS')
    expect(selectDecision({ ...state, actions: [...state.actions, { ...contained, outcome: 'FINISH' as const }] })?.kind).toBe('SHOOT')

    const afterReturnPass = { ...afterContainment, actions: [...afterContainment.actions, {
      id: 'return-pass', kind: 'PASS' as const, playerId: teammateId, teamId,
      targetPlayerId: handlerId, startedT: state.t, status: 'COMPLETED' as const, outcome: 'CAUGHT' as const,
    }] }
    expect(selectDecision(afterReturnPass)?.kind).toBe('SHOOT')

    let live: MatchState = afterContainment
    for (let step = 0; step < 150 && !live.events.some((event) => event.type === 'shotReleased' || event.type === 'possessionEnd'); step += 1) live = tick(live)
    expect(live.events.some((event) => event.type === 'shotReleased' || event.type === 'possessionEnd')).toBe(true)
    expect(live.actions.filter((action) => action.kind === 'DRIVE' && action.playerId === handlerId
      && action.startedT > contained.startedT)).toHaveLength(0)
  })

  it('executes an ordinary PASS as a live decision with a physical catch', () => {
    const state = runOpeningPass()
    const pass = state.actions.find((action) => action.kind === 'PASS')

    expect(pass).toMatchObject({ status: 'COMPLETED', outcome: 'CAUGHT' })
    expect(state.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === pass?.targetPlayerId)).toBe(true)
  })

  it('runs drive help -> kick-out catch -> physical closeout -> catch-and-shoot resolution deterministically', () => {
    const first = runVerticalSlice()
    const second = runVerticalSlice()
    const oppositeBasket = runVerticalSlice(3)
    const signature = (state: MatchState) => state.actions.map(({ kind, status, outcome, playerId, targetPlayerId }) => ({ kind, status, outcome, playerId, targetPlayerId }))

    expect(signature(first)).toEqual(signature(second))
    expect(signature(oppositeBasket).map((action) => action.kind)).toEqual(signature(first).map((action) => action.kind))
    expect(first.actions.map((action) => action.kind)).toEqual(expect.arrayContaining(['DRIVE', 'KICK_OUT', 'CLOSEOUT', 'CATCH_AND_SHOOT']))
    const drive = first.actions.find((action) => action.kind === 'DRIVE')!
    expect(drive).toMatchObject({ status: 'COMPLETED', outcome: 'ADVANTAGE', helpDefenderPlayerId: expect.any(String) })
    expect(first.events.find((event) => event.type === 'defensiveResponsibilityChanged' && event.responsibilityKind === 'LOW_MAN')?.playerId).toBe(drive.helpDefenderPlayerId)
    expect(first.actions.find((action) => action.kind === 'KICK_OUT')).toMatchObject({ status: 'COMPLETED', outcome: 'CAUGHT' })
    const closeout = first.actions.find((action) => action.kind === 'CLOSEOUT')!
    const closeoutDefender = first.players.find((player) => player.playerId === closeout.playerId)!
    expect(closeout).toMatchObject({ status: 'COMPLETED', contestScore: expect.any(Number) })
    expect(distanceBetween(closeout.startPosition!, closeoutDefender.position)).toBeGreaterThan(0.2)
    expect(closeout.contestScore).toBeGreaterThan(0)
    const shot = first.actions.find((action) => action.kind === 'CATCH_AND_SHOOT')!
    expect(shot).toMatchObject({ status: 'COMPLETED', outcome: expect.stringMatching(/MAKE|MISS/) })
    expect(shot.shotProbability).toBeGreaterThan(0)
    expect(first.events.some((event) => event.type === 'passReceived' && first.actions.find((action) => action.kind === 'KICK_OUT')?.targetPlayerId === event.receiverPlayerId)).toBe(true)
    expect(first.events.some((event) => event.type === 'shotMade' || event.type === 'shotMissed')).toBe(true)
    expect(first.events.filter((event) => event.type === 'actionStarted')).toHaveLength(first.actions.length)
    expect(first.events.find((event) => event.type === 'shotReleased')).toMatchObject({ actionId: shot.id, shotProbability: shot.shotProbability, contestScore: shot.contestScore })
  })
})
