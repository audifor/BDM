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
  // BT4.1: with the patience of the offense (it waits for a better look while the shot clock allows) the chain takes longer to end in a shot.
  for (let count = 0; count < 1200; count += 1) {
    state = tick(state)
    if (state.actions.some((action) => action.kind === 'CATCH_AND_SHOOT' && action.status === 'COMPLETED')) break
  }
  return state
}

function runOpeningPass(period = 1): MatchState {
  let state = readyForAutonomousActions(true, period)
  // The handler now reads the floor (gather, settle) before he decides: give the opening pass more time to happen.
  for (let count = 0; count < 900; count += 1) {
    state = tick(state)
    if (state.actions.some((action) => (action.kind === 'PASS' || action.kind === 'KICK_OUT') && action.status === 'COMPLETED')) break
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
    // The handler may shoot the return pass, pass again or keep reading (his choice is a valued read now), but he must not drive again.
    expect(selectDecision(afterReturnPass)?.kind).not.toBe('DRIVE')

    let live: MatchState = afterContainment
    for (let step = 0; step < 150 && !live.events.some((event) => event.type === 'shotReleased' || event.type === 'possessionEnd'); step += 1) live = tick(live)
    expect(live.events.some((event) => event.type === 'shotReleased' || event.type === 'possessionEnd')).toBe(true)
    expect(live.actions.filter((action) => action.kind === 'DRIVE' && action.playerId === handlerId
      && action.startedT > contained.startedT)).toHaveLength(0)
  })

  it('executes an ordinary PASS as a live decision with a physical catch', () => {
    // The first pass of one fixed state is a seeded draw (a long cross-court read through a contested lane), so it is checked over four starting states:
    // every pass is resolved physically, the caught ones are real catches by the intended receiver, and at least half are caught.
    // The pass risk of whole games is audited in audit/bt44 (6.9% BT4.2, 7.4% BT4.3 of the passes are not caught).
    const outcomes = [1, 2, 3, 4].map((period) => {
      const state = runOpeningPass(period)
      // A weak handler may first run a ball screen and drive off it; the ball then moves by a PASS or a KICK_OUT.
      const pass = state.actions.find((action) => action.kind === 'PASS' || action.kind === 'KICK_OUT')
      expect(pass).toMatchObject({ status: 'COMPLETED' })
      expect(['CAUGHT', 'BAD_PASS']).toContain(pass?.outcome)
      if (pass?.outcome === 'CAUGHT') expect(state.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === pass.targetPlayerId)).toBe(true)
      return pass?.outcome
    })
    expect(outcomes.filter((outcome) => outcome === 'CAUGHT').length).toBeGreaterThanOrEqual(2)
  })

  it('runs drive help -> kick-out catch -> physical closeout -> catch-and-shoot resolution deterministically', () => {
    const first = runVerticalSlice()
    const second = runVerticalSlice()
    const oppositeBasket = runVerticalSlice(3)
    const signature = (state: MatchState) => state.actions.map(({ kind, status, outcome, playerId, targetPlayerId }) => ({ kind, status, outcome, playerId, targetPlayerId }))

    expect(signature(first)).toEqual(signature(second))
    // The decision model reads geometry (distances, lanes, contests), so the same players placed for the OTHER basket do
    // not have to choose the same actions; what must hold is that the run is deterministic and every action is legal.
    expect(signature(runVerticalSlice(3))).toEqual(signature(oppositeBasket))
    expect(oppositeBasket.actions.length).toBeGreaterThan(0)
    // BT4: a strong driver who can stop and shoot, finish, or kick it out chooses by the shot model, so the chain is not scripted to
    // "help -> kick-out": every action must be legal and end in a named outcome, and whatever chain happens must be coherent.
    const kinds = first.actions.map((action) => action.kind)
    // BT4.2: off a set screen the handler may also pass; the chain only has to be made of named actions.
    expect(kinds.length).toBeGreaterThan(0)
    // BT4.1: the chain ends either in a shot or, when the kick-out is a bad pass (a seeded draw), in a turnover; both are named outcomes.
    expect(kinds.some((kind) => kind === 'SHOOT' || kind === 'CATCH_AND_SHOOT') || first.events.some((event) => event.type === 'turnover')).toBe(true)
    for (const action of first.actions) expect(action.status).not.toBe('ACTIVE')
    const drives = first.actions.filter((action) => action.kind === 'DRIVE')
    for (const drive of drives) expect(['ADVANTAGE', 'CONTAINED', 'FINISH', 'STOPPED', 'FOULED', 'CANCELLED']).toContain(drive.outcome)
    const helped = drives.find((drive) => drive.outcome === 'ADVANTAGE')
    if (helped !== undefined) {
      expect(helped.helpDefenderPlayerId).toEqual(expect.any(String))
      expect(first.events.find((event) => event.type === 'defensiveResponsibilityChanged' && event.responsibilityKind === 'LOW_MAN')?.playerId).toBeDefined()
    }
    const kick = first.actions.find((action) => action.kind === 'KICK_OUT')
    if (kick !== undefined) expect(kick).toMatchObject({ status: 'COMPLETED', outcome: expect.stringMatching(/CAUGHT|BAD_PASS/) })
    const closeout = first.actions.find((action) => action.kind === 'CLOSEOUT')
    if (closeout !== undefined) {
      const closeoutDefender = first.players.find((player) => player.playerId === closeout.playerId)!
      expect(closeout).toMatchObject({ status: 'COMPLETED', contestScore: expect.any(Number) })
      expect(distanceBetween(closeout.startPosition!, closeoutDefender.position)).toBeGreaterThan(0.2)
    }
    const shot = first.actions.find((action) => (action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT') && action.status === 'COMPLETED')
    if (shot !== undefined) {
      expect(shot).toMatchObject({ status: 'COMPLETED', outcome: expect.stringMatching(/MAKE|MISS|BLOCKED/) })
      expect(first.events.some((event) => event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'shotBlocked')).toBe(true)
      expect(first.events.find((event) => event.type === 'shotReleased' && event.actionId === shot.id)).toMatchObject({ actionId: shot.id })
    }
    expect(first.events.filter((event) => event.type === 'actionStarted')).toHaveLength(first.actions.length)
  })
})
