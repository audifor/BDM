import { describe, expect, it } from 'vitest'
import { createCourtGeometry, distanceBetween, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { activePossession, applyCommand, createMatchState, observeFrames, tick, toFrame, type MatchSetup, type MatchState } from './index'
import { REBOUND_ACQUISITION_RADIUS_METERS } from './ball/BallState'

function transitionSetup(): MatchSetup {
  const homeTeamId = teamIdFromString('transition-home')
  const awayTeamId = teamIdFromString('transition-away')
  const home = Array.from({ length: 5 }, (_, index) => playerIdFromString(`transition-h${index}`))
  const away = Array.from({ length: 5 }, (_, index) => playerIdFromString(`transition-a${index}`))
  const spots: readonly CourtPosition[] = [
    { x: 14, y: 7.5 }, { x: 21.5, y: 7.5 }, { x: 18, y: 3.2 }, { x: 18, y: 11.8 }, { x: 20, y: 5.2 },
  ]
  const profile = (playerId: typeof home[number], teamId: typeof homeTeamId, index: number, isHome: boolean) => ({
    playerId, teamId, primaryPosition: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[index]!,
    physical: { heightCm: 190 + index * 2, weightKg: 85, wingspanCm: 195, standingReachCm: 245 + index * 2 },
    kinematics: { maxSpeedMps: 5.2 + index * 0.2, accelerationMps2: 2.8 + index * 0.2, brakingMps2: 3.5 + index * 0.2 },
    offense: { usage: 50, rimAttack: 56, shooting: 55, creation: 55, ballSecurity: 60 },
    passing: { accuracy: 70, vision: 70, timing: 70 },
    defense: { pointOfAttack: 55, interior: 55, mobility: 55, steal: 55 },
    rebounding: { impact: isHome ? [42, 58, 64, 80, 70][index]! : [50, 54, 66, 76, 62][index]! },
  })
  const plan = { pace: 50, shotProfile: { rim: 50, midRange: 50, threePoint: 50 }, defense: { interior: 50, perimeter: 50 } }
  return {
    gameId: gameIdFromString('transition-game'), homeTeamId, awayTeamId, court: createCourtGeometry('FIBA'),
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: home, awaySquad: away, initialLineups: { home, away },
    players: [...home.map((id, index) => profile(id, homeTeamId, index, true)), ...away.map((id, index) => profile(id, awayTeamId, index, false))],
    initialPlayerPositions: [
      ...home.map((playerId, index) => ({ playerId, position: spots[index]! })),
      ...away.map((playerId, index) => ({ playerId, position: { x: spots[index]!.x + 1.2, y: spots[index]!.y + 0.3 } })),
    ],
    tacticalPlans: { home: plan, away: plan },
    defensiveMatchupOverrides: { home: home.map((playerId, i) => ({ playerId, opponentPlayerId: away[i]! })), away: away.map((playerId, i) => ({ playerId, opponentPlayerId: home[i]! })) },
    matchSeed: 3,
  }
}

function readySetup(setup = transitionSetup()): MatchState {
  let state = createMatchState(setup)
  state = tick(state)
  state = applyCommand(state, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: setup.initialLineups.home[0]!, reason: 'periodStart' })
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: setup.initialLineups.home[1]!, passKind: 'chest', travelTicks: 1 })
  return tick(state)
}

function launchMiss(state: MatchState, target: CourtPosition, travelTicks = 6, availabilityDelay = 10): MatchState {
  const possession = activePossession(state)!
  const basket = state.court.baskets.right
  return applyCommand(state, { type: 'releaseShot', command: {
    targetBasket: basket,
    travelTicks,
    plannedOutcome: { kind: 'MISS', reboundTarget: target, reboundAvailableT: state.t + travelTicks + availabilityDelay },
  } })
}

describe('Match Next rebound and transition integration', () => {
  it('moves into a defensive rebound, secures only within range, flips possession, and resumes transition deterministically', () => {
    let state = readySetup()
    const shooterId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : state.homeTeamId
    const assignedDefenderId = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === shooterId)?.defenderPlayerId
    const assignedDefender = state.players.find((player) => player.playerId === assignedDefenderId)!
    // The ball drops just beyond the defender (he is between the shooter and the ball): the outcome is a contest he should win, not a coin toss on the shared RNG stream.
    const shooterPosition = state.players.find((player) => player.playerId === shooterId)!.position
    const outward = { x: assignedDefender.position.x - shooterPosition.x, y: assignedDefender.position.y - shooterPosition.y }
    const outwardLength = Math.hypot(outward.x, outward.y) || 1
    state = launchMiss(state, { x: assignedDefender.position.x + outward.x / outwardLength * 0.5, y: assignedDefender.position.y + outward.y / outwardLength * 0.5 }, 6, 1)
    expect(state.reboundState?.phase).toBe('SHOT_FLIGHT')
    // The two defenders nearest the landing point pursue it from the release (symmetric with the two offensive crashers); the rest box out.
    expect(state.reboundState?.responsibilities.filter((item) => item.teamId !== state.homeTeamId && item.kind === 'BOX_OUT')).toHaveLength(3)
    expect(state.reboundState?.responsibilities.filter((item) => item.teamId !== state.homeTeamId && item.kind === 'PURSUE_REBOUND')).toHaveLength(2)
    const positionsAtRelease = new Map(state.players.map((player) => [player.playerId, player.position]))
    state = tick(state)
    expect(state.players.some((player) => distanceBetween(player.position, positionsAtRelease.get(player.playerId)!) > 0)).toBe(true)
    const initialFrame = toFrame(state)
    const frames = [initialFrame]
    let sawBoxOut = false
    for (let index = 0; index < 12 && state.ball.kind !== 'REBOUNDABLE'; index += 1) state = tick(state)
    expect(state.ball.kind).toBe('REBOUNDABLE')
    sawBoxOut = state.reboundState?.responsibilities.some((item) => item.kind === 'BOX_OUT') ?? false
    expect(state.reboundState?.responsibilities.some((item) => item.kind === 'BOX_OUT' || item.kind === 'CRASH_REBOUND')).toBe(true)
    const reboundResume = JSON.parse(JSON.stringify(state)) as MatchState
    const continuedRebound = tick(state)
    expect(tick(reboundResume)).toEqual(continuedRebound)
    state = continuedRebound
    frames.push(toFrame(state))
    for (let index = 0; index < 180 && !state.events.some((event) => event.type === 'reboundSecured'); index += 1) {
      state = tick(state)
      frames.push(toFrame(state))
      if (state.reboundState?.responsibilities.some((item) => item.kind === 'BOX_OUT')) sawBoxOut = true
    }
    const rebound = state.events.find((event) => event.type === 'reboundSecured')
    expect(sawBoxOut).toBe(true)
    expect(rebound?.teamId).toBe(state.awayTeamId)
    expect(rebound?.acquisitionDistanceMeters).toBeLessThanOrEqual(REBOUND_ACQUISITION_RADIUS_METERS)
    expect(state.possessions[0]).toMatchObject({ endReason: 'defensiveRebound' })
    expect(activePossession(state)).toMatchObject({ teamId: state.awayTeamId, startReason: 'defensiveRebound', phase: 'ADVANCE' })
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerTeamId: state.awayTeamId })
    expect(state.events.filter((event) => event.type === 'reboundSecured')).toHaveLength(1)
    expect(rebound?.playerId).toBe(state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null)
    expect(state.transition).toMatchObject({ teamId: state.awayTeamId, trigger: 'defensiveRebound' })
    expect(state.transition?.roles.map((role) => role.kind)).toEqual(expect.arrayContaining(['BALL_ADVANCE', 'LANE_LEFT', 'LANE_RIGHT', 'RIM_RUN', 'TRAIL', 'STOP_BALL', 'PROTECT_RIM']))
    expect(distanceBetween(initialFrame.players.find((player) => player.teamId === state.awayTeamId)!.position, state.players.find((player) => player.teamId === state.awayTeamId)!.position)).toBeGreaterThan(0)

    const report = observeFrames(frames)
    expect(report.ballTeleports).toBe(0)
    expect(report.movementTeleports).toBe(0)
    expect(report.illegalAcquisitions).toBe(0)
    expect(report.invalidReboundWinnerCount).toBe(0)
    expect(report.reboundResponsibilityViolations).toEqual([])
    const resumed = JSON.parse(JSON.stringify(state)) as MatchState
    expect(tick(resumed)).toEqual(tick(state))

    state = { ...state, autonomousActions: true }
    // The transition may already be over by the tick the outlet is caught (the handler needs a moment to read the floor).
    const transitionStartedT = state.transition!.startedT
    let outletPass: MatchState['actions'][number] | undefined
    for (let index = 0; index < 150 && !outletPass; index += 1) {
      state = tick(state)
      outletPass = state.actions.find((action) => action.startedT >= transitionStartedT
        && action.kind === 'PASS' && action.status === 'COMPLETED' && action.outcome === 'CAUGHT')
    }
    expect(outletPass).toBeDefined()
    expect(state.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === outletPass?.targetPlayerId)).toBe(true)
  })

  it('lets an eligible offensive crash continue the same possession through the existing reset authority', () => {
    const setup = transitionSetup()
    const homeHandler = setup.initialLineups.home[1]!
    const tuned: MatchSetup = { ...setup, players: setup.players.map((player) => player.playerId === homeHandler
      ? { ...player, rebounding: { impact: 100 }, physical: { ...player.physical, standingReachCm: 275 } }
      : player) }
    let state = readySetup(tuned)
    const possessionId = activePossession(state)!.id
    const shooter = state.players.find((player) => player.playerId === homeHandler)!
    state = launchMiss(state, { ...shooter.position })
    for (let index = 0; index < 180 && !state.events.some((event) => event.type === 'reboundSecured'); index += 1) state = tick(state)
    const rebound = state.events.find((event) => event.type === 'reboundSecured')
    expect(rebound?.teamId).toBe(state.homeTeamId)
    expect(rebound?.acquisitionDistanceMeters).toBeLessThanOrEqual(REBOUND_ACQUISITION_RADIUS_METERS)
    expect(activePossession(state)).toMatchObject({ id: possessionId, teamId: state.homeTeamId, phase: 'SETUP', offensiveRebounds: 1 })
    expect(state.transition).toBeNull()
    expect(state.clockRules.offensiveReboundShotClockSeconds).toBeNull()
  })

  it('turns a physical interception into a direction-correct transition without moving players outside kinematics', () => {
    const setup = transitionSetup()
    const receiver = setup.initialLineups.home[1]!
    const defender = setup.initialLineups.away[1]!
    const closeDefenderSetup: MatchSetup = { ...setup, initialPlayerPositions: setup.initialPlayerPositions?.map((item) => item.playerId === defender
      ? { ...item, position: { x: 21.85, y: 7.5 } }
      : item) }
    let state = readySetup(closeDefenderSetup)
    const originalPositions = state.players.map(({ playerId, position }) => ({ playerId, position }))
    state = applyCommand(state, { type: 'releasePass', command: {
      receiverPlayerId: setup.initialLineups.home[2]!, target: state.players.find((player) => player.playerId === setup.initialLineups.home[2])!.position,
      passKind: 'chest', travelTicks: 10,
    } })
    expect(state.ball.kind).toBe('PASS_IN_FLIGHT')
    expect(distanceBetween(state.players.find((player) => player.playerId === defender)!.position, state.ball.position)).toBeLessThanOrEqual(1)
    state = applyCommand(state, { type: 'interceptPass', playerId: defender })
    expect(state.events.some((event) => event.type === 'transitionStarted' && event.transitionTrigger === 'turnover')).toBe(true)
    expect(activePossession(state)).toMatchObject({ teamId: setup.awayTeamId, startReason: 'steal', phase: 'ADVANCE' })
    expect(state.transition).toMatchObject({ teamId: setup.awayTeamId, trigger: 'turnover' })
    const ballAdvance = state.transition!.roles.find((role) => role.kind === 'BALL_ADVANCE')!
    const stopBall = state.transition!.roles.find((role) => role.kind === 'STOP_BALL')!
    expect(stopBall.playerId).toBe(state.defensiveStructure?.onBallDefenderPlayerId)
    expect(state.movementIntents.find((intent) => intent.playerId === ballAdvance.playerId)?.urgency).toBe('run')
    expect(state.movementIntents.find((intent) => intent.playerId === state.transition!.roles.find((role) => role.kind === 'LANE_LEFT')!.playerId)?.urgency).toBe('sprint')
    expect(ballAdvance.target.x).toBeLessThan(state.players.find((player) => player.playerId === ballAdvance.playerId)!.position.x)
    expect(state.players.map(({ playerId, position }) => ({ playerId, position }))).toEqual(originalPositions)

    const continued = tick(state)
    expect(tick(JSON.parse(JSON.stringify(state)) as MatchState)).toEqual(continued)
    const report = observeFrames([toFrame(state), toFrame(continued)])
    expect(report.transitionStructureViolations).toEqual([])
    expect(report.transitionDirectionViolations).toBe(0)
    expect(report.movementTeleports).toBe(0)
  })
})
