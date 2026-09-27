import { describe, expect, it } from 'vitest'
import { createCourtGeometry, distanceBetween, isInsideCourt, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { activePossession, applyCommand, createMatchState, guardPosition, observeFrames, reconcileManDefense, tick, toFrame, type MatchSetup, type MatchState } from './index'

const homeTeamId = teamIdFromString('defense-home')
const awayTeamId = teamIdFromString('defense-away')
const homeIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`defense-home-${index + 1}`))
const awayIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`defense-away-${index + 1}`))
const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const

function setupFor(overrides = { home: [], away: [] } as MatchSetup['defensiveMatchupOverrides']): MatchSetup {
  const court = createCourtGeometry('FIBA')
  const profile = (playerId: typeof homeIds[number], teamId: typeof homeTeamId, slot: number) => ({
    playerId,
    teamId,
    primaryPosition: positions[slot]!,
    physical: { heightCm: 185 + slot * 5, weightKg: 82 + slot * 2, wingspanCm: 190 + slot * 4, standingReachCm: 240 + slot * 5 },
    kinematics: { maxSpeedMps: 5.1 + slot * 0.2, accelerationMps2: 2.4 + slot * 0.2, brakingMps2: 3.2 + slot * 0.2 },
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 40 + slot * 5 },
    rebounding: { impact: 50 },
  })
  const center = { x: court.lengthMeters / 2, y: court.widthMeters / 2 }
  const homeSpots: readonly CourtPosition[] = [center, { x: 10, y: center.y }, { x: 8, y: 3 }, { x: 8, y: 12 }, { x: 10, y: 5 }]
  const awaySpots: readonly CourtPosition[] = [{ x: 15.5, y: 7.6 }, { x: 12, y: 8 }, { x: 10, y: 3.5 }, { x: 10, y: 12 }, { x: 12, y: 5.5 }]
  const plan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  return {
    gameId: gameIdFromString('defense-game'), homeTeamId, awayTeamId, court,
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id, index) => profile(id, homeTeamId, index)), ...awayIds.map((id, index) => profile(id, awayTeamId, index))],
    initialPlayerPositions: [...homeIds.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...awayIds.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: plan, away: plan }, defensiveMatchupOverrides: overrides, matchSeed: 71,
  }
}

function liveHome(setup: MatchSetup, period = 1): MatchState {
  let state = createMatchState(setup)
  if (period !== 1) state = { ...state, period, events: state.events.map((event) => ({ ...event, period })) }
  state = applyCommand(state, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: homeIds[0]!, reason: 'periodStart' })
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: homeIds[1]!, passKind: 'chest', travelTicks: 4 })
  for (let count = 0; count < 320 && activePossession(state)?.phase !== 'SETUP'; count += 1) state = tick(state)
  expect(activePossession(state)?.phase).toBe('SETUP')
  return state
}

function settle(state: MatchState, count = 70): MatchState {
  for (let index = 0; index < count; index += 1) state = tick(state)
  return state
}

function passTo(state: MatchState, receiverPlayerId: typeof homeIds[number]): MatchState {
  let projected = state
  for (let index = 0; index < 4; index += 1) projected = tick(projected)
  const target = projected.players.find((player) => player.playerId === receiverPlayerId)!.position
  state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId, target, passKind: 'chest', travelTicks: 4 } })
  for (let index = 0; index < 4; index += 1) state = tick(state)
  return state
}

describe('Match Next man-to-man defense', () => {
  it('uses the current defensive interior/perimeter plan in live guard geometry', () => {
    const court = createCourtGeometry('FIBA')
    const attacker = { x: 6, y: 4 }
    const ball = { x: 8, y: 7 }
    const basket = court.baskets.left
    const neutral = guardPosition(attacker, ball, basket, 'GAP', court, { interior: 0, perimeter: 0 })
    const perimeterPressure = guardPosition(attacker, ball, basket, 'GAP', court, { interior: -2, perimeter: 2 })

    expect(distanceBetween(neutral, perimeterPressure)).toBeGreaterThan(0.1)
  })

  it('builds five stable 1:1 assignments from position, height, and mobility matching', () => {
    const setup = setupFor()
    const state = liveHome(setup)
    const structure = state.defensiveStructure!
    expect(structure.scheme).toBe('MAN')
    expect(structure.teamId).toBe(awayTeamId)
    expect(structure.assignments).toHaveLength(5)
    expect(new Set(structure.assignments.map((item) => item.defenderPlayerId)).size).toBe(5)
    expect(new Set(structure.assignments.map((item) => item.attackerPlayerId)).size).toBe(5)
    for (let index = 0; index < 5; index += 1) {
      expect(structure.assignments.find((item) => item.defenderPlayerId === awayIds[index])?.attackerPlayerId).toBe(homeIds[index])
      expect(structure.assignments.find((item) => item.defenderPlayerId === awayIds[index])?.source).toBe('INITIAL')
    }
    expect(state.events.filter((event) => event.type === 'defensiveAssignmentsEstablished')).toHaveLength(1)
    expect(state.responsibilities.filter((item) => item.owner === 'defensiveStructure')).toHaveLength(5)
    expect(state.decisions.filter((item) => item.owner === 'defensiveStructure')).toHaveLength(5)
    expect(state.movementIntents.filter((item) => item.provenance.owner === 'defensiveStructure')).toHaveLength(5)
  })

  it('keeps off-ball defenders with their assignments and sends only one defender to the drive', () => {
    const state = liveHome(setupFor())
    const holder = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    expect(holder).not.toBeNull()
    expect(state.responsibilities.filter((item) => item.owner === 'defensiveStructure' && item.kind === 'HELP')).toHaveLength(0)
    expect(state.responsibilities.filter((item) => item.owner === 'defensiveStructure' && item.kind === 'GAP')).toHaveLength(4)

    const driveTarget = { x: 6, y: state.court.widthMeters / 2 }
    const driving = reconcileManDefense({
      ...state,
      actions: [...state.actions.filter((item) => item.kind !== 'DRIVE'), {
        id: 'test-drive', kind: 'DRIVE', playerId: holder!, teamId: homeTeamId, startedT: state.t,
        status: 'ACTIVE', phase: 'DRIVING', target: driveTarget,
      }],
    })
    const helpers = driving.responsibilities.filter((item) => item.owner === 'defensiveStructure' && item.kind === 'HELP')
    expect(helpers).toHaveLength(1)
    expect(driving.responsibilities.filter((item) => item.owner === 'defensiveStructure' && item.kind === 'GAP')).toHaveLength(3)
    const expectedHelper = driving.defensiveStructure!.assignments
      .filter((assignment) => assignment.attackerPlayerId !== holder)
      .map((assignment) => ({ assignment, defender: driving.players.find((player) => player.playerId === assignment.defenderPlayerId)! }))
      .sort((left, right) => distanceBetween(left.defender.position, driveTarget) - distanceBetween(right.defender.position, driveTarget)
        || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]!.assignment.defenderPlayerId
    expect(helpers[0]!.playerId).toBe(expectedHelper)
  })

  it('applies matchup overrides first and rejects invalid or duplicate overrides', () => {
    const overrides = { home: [], away: [{ playerId: awayIds[0]!, opponentPlayerId: homeIds[4]! }] }
    const state = liveHome(setupFor(overrides))
    expect(state.defensiveStructure?.assignments.find((item) => item.defenderPlayerId === awayIds[0])).toMatchObject({ attackerPlayerId: homeIds[4], source: 'OVERRIDE' })
    expect(state.defensiveStructure?.assignments.find((item) => item.defenderPlayerId === awayIds[4])?.source).toBe('INITIAL')

    expect(() => createMatchState(setupFor({ home: [], away: [
      { playerId: awayIds[0]!, opponentPlayerId: homeIds[1]! },
      { playerId: awayIds[1]!, opponentPlayerId: homeIds[1]! },
    ] }))).toThrow('assign attacker')
    expect(() => createMatchState(setupFor({ home: [], away: [
      { playerId: awayIds[0]!, opponentPlayerId: homeIds[1]! },
      { playerId: awayIds[0]!, opponentPlayerId: homeIds[2]! },
    ] }))).toThrow('assign defender')
    expect(() => createMatchState(setupFor({ home: [], away: [{ playerId: homeIds[0]!, opponentPlayerId: awayIds[0]! }] }))).toThrow('not on the defending team')

    const benchDefender = playerIdFromString('defense-away-bench')
    const withBench = setupFor()
    const benchSetup: MatchSetup = {
      ...withBench,
      awaySquad: [...withBench.awaySquad, benchDefender],
      players: [...withBench.players, { ...withBench.players.find((profile) => profile.playerId === awayIds[0])!, playerId: benchDefender }],
    }
    const benchOverride = { playerId: benchDefender, opponentPlayerId: homeIds[0]! }
    expect(createMatchState({ ...benchSetup, defensiveMatchupOverrides: { home: [], away: [benchOverride] } }).defensiveStructure).toBeNull()
    expect(() => createMatchState({ ...benchSetup, defensiveMatchupOverrides: { home: [], away: [benchOverride, { ...benchOverride, opponentPlayerId: homeIds[1]! }] } })).toThrow('assign defender')
  })

  it('keeps assignment IDs fixed through legal passes and changes ON_BALL only on receipt', () => {
    let state = settle(liveHome(setupFor()))
    const assignments = state.defensiveStructure!.assignments
    const owner = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : homeIds[1]!
    const oldOnBall = assignments.find((item) => item.attackerPlayerId === owner)!.defenderPlayerId
    const receiver = state.offensiveStructure!.assignments.find((item) => item.slot === 'WEAK_SLOT')!.playerId as typeof homeIds[number]
    const receiverDefender = assignments.find((item) => item.attackerPlayerId === receiver)!.defenderPlayerId
    const flight = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target: state.players.find((item) => item.playerId === receiver)!.position, passKind: 'chest', travelTicks: 4 } })
    expect(flight.defensiveStructure?.onBallDefenderPlayerId).toBe(oldOnBall)
    expect(flight.defensiveStructure?.assignments).toEqual(assignments)
    state = tick(flight)
    expect(state.defensiveStructure?.onBallDefenderPlayerId).toBe(oldOnBall)
    for (let index = 1; index < 4; index += 1) state = tick(state)
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: receiver })
    expect(state.defensiveStructure?.onBallDefenderPlayerId).toBe(receiverDefender)
    expect(state.defensiveStructure?.assignments).toEqual(assignments)
    const report = observeFrames([toFrame(flight), toFrame(state)])
    expect(report.defensiveAssignmentChurn).toBe(0)
    expect(report.movementTeleports).toBe(0)
    expect(report.speedBoundViolations).toEqual([])
    expect(report.accelerationBrakingViolations).toEqual([])
    expect(report.outOfBoundsViolations).toEqual([])
    expect(report.movementWithoutIntentViolations).toEqual([])
    expect(report.intentWithoutResponsibilityViolations).toEqual([])
    expect(report.decisionWithoutResponsibilityViolations).toEqual([])
    expect(report.ballStateViolations).toEqual([])
    expect(report.playerContinuityViolations).toEqual([])
    expect(state.events.filter((event) => event.type === 'defensiveAssignmentsEstablished')).toHaveLength(1)
  })

  it('derives on-ball, gap, and help positions from man, ball, and basket in either direction', () => {
    const court = createCourtGeometry('FIBA')
    const attacker = { x: 15, y: 4 }
    const ball = { x: 20, y: 9 }
    for (const basket of [court.baskets.left, court.baskets.right]) {
      const onBall = guardPosition(attacker, ball, basket, 'ON_BALL', court)
      const gap = guardPosition(attacker, ball, basket, 'GAP', court)
      const help = guardPosition(attacker, ball, basket, 'HELP', court)
      const fromMan = { x: onBall.x - attacker.x, y: onBall.y - attacker.y }
      const toBasket = { x: basket.x - attacker.x, y: basket.y - attacker.y }
      expect(fromMan.x * toBasket.x + fromMan.y * toBasket.y).toBeGreaterThan(0)
      expect(isInsideCourt(onBall, court)).toBe(true)
      expect(isInsideCourt(gap, court)).toBe(true)
      expect(isInsideCourt(help, court)).toBe(true)
      expect(distanceBetween(help, attacker)).toBeGreaterThan(distanceBetween(gap, attacker))
      expect(distanceBetween(help, ball)).toBeLessThan(distanceBetween(gap, ball))
    }
  })

  it('passes the anti-mirror invariant when an offensive slot moves but the man and ball stay put', () => {
    const state = settle(liveHome(setupFor()))
    const assignment = state.defensiveStructure!.assignments[0]!
    const originalTarget = state.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId)!.target
    const offense = state.offensiveStructure!
    const slot = offense.assignments.find((item) => item.playerId === assignment.attackerPlayerId)!.slot
    const changedStructure = {
      ...offense,
      slots: offense.slots.map((item) => item.slot === slot ? { ...item, position: { x: item.position.x < 14 ? 26 : 2, y: 13 } } : item),
    }
    const changed = reconcileManDefense({ ...state, offensiveStructure: changedStructure })
    const changedTarget = changed.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId)!.target
    expect(changedTarget).toEqual(originalTarget)
    expect(observeFrames([toFrame(state), toFrame(changed)]).defensiveTargetMirrorViolations).toBe(0)
    expect(toFrame(state).players.find((item) => item.playerId === assignment.defenderPlayerId)?.assignment?.attackerPlayerId).toBe(assignment.attackerPlayerId)
  })

  it('uses RECOVER as a temporary physical return to GAP after help geometry changes', () => {
    let state = liveHome(setupFor())
    const initialHolder = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    expect(initialHolder).not.toBeNull()
    state = reconcileManDefense({
      ...state,
      actions: [...state.actions.filter((item) => item.kind !== 'DRIVE'), {
        id: 'test-drive', kind: 'DRIVE', playerId: initialHolder!, teamId: homeTeamId, startedT: state.t,
        status: 'ACTIVE', phase: 'DRIVING', target: { x: 6, y: state.court.widthMeters / 2 },
      }],
    })
    const helper = state.responsibilities.find((item) => item.owner === 'defensiveStructure' && item.kind === 'HELP')
    expect(helper).toBeDefined()
    const assignment = state.defensiveStructure!.assignments.find((item) => item.defenderPlayerId === helper!.playerId)!
    const heldOwnerId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    const receiver = state.offensiveStructure!.assignments
      .filter((item) => item.playerId !== assignment.attackerPlayerId && item.playerId !== heldOwnerId)
      .sort((left, right) => distanceBetween(state.players.find((player) => player.playerId === left.playerId)!.position, state.players.find((player) => player.playerId === assignment.attackerPlayerId)!.position)
        - distanceBetween(state.players.find((player) => player.playerId === right.playerId)!.position, state.players.find((player) => player.playerId === assignment.attackerPlayerId)!.position))[0]!.playerId as typeof homeIds[number]
    const ballHolderId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    const ballHolder = ballHolderId ? state.players.find((player) => player.playerId === ballHolderId) : undefined
    const nextHolder = state.players.find((player) => player.playerId === receiver)!
    const oldBall = state.ball
    state = {
      ...state,
      actions: state.actions.filter((item) => item.kind !== 'DRIVE'),
      players: state.players.map((player) => player.playerId === receiver ? { ...player, position: { x: nextHolder.position.x, y: nextHolder.position.y } } : player),
      ball: ballHolder && oldBall.kind === 'HELD' ? { ...oldBall, ownerPlayerId: receiver, position: { ...nextHolder.position } } : oldBall,
    }
    state = reconcileManDefense(state)
    const recovering = state.responsibilities.find((item) => item.playerId === helper!.playerId && item.owner === 'defensiveStructure')
    expect(recovering?.kind).toBe('RECOVER')
    expect(state.movementIntents.find((item) => item.playerId === helper!.playerId)?.provenance.owner).toBe('defensiveStructure')
    const resumed = JSON.parse(JSON.stringify(state)) as MatchState
    let uninterrupted = state
    let continued = resumed
    for (let index = 0; index < 30; index += 1) {
      uninterrupted = tick(uninterrupted)
      continued = tick(continued)
      expect(continued).toEqual(uninterrupted)
    }
    expect(uninterrupted.responsibilities.find((item) => item.playerId === helper!.playerId && item.owner === 'defensiveStructure')?.kind).toBe('GAP')
  })

  it('defends both baskets and reports settled defensive gates without assignment churn', () => {
    const first = settle(liveHome(setupFor()))
    const reverse = settle(liveHome(setupFor(), 3))
    expect(first.defensiveStructure?.defendedBasket).toEqual(first.court.baskets.right)
    expect(reverse.defensiveStructure?.defendedBasket).toEqual(reverse.court.baskets.left)
    const frames = [toFrame(first)]
    let observedState = first
    for (let index = 0; index < 259; index += 1) {
      observedState = tick(observedState)
      frames.push(toFrame(observedState))
    }
    const report = observeFrames(frames)
    process.stderr.write(`Match Next defense: assignments ${report.defensiveAssignmentCompletenessPercentage?.toFixed(1)}%, duplicates ${report.duplicateDefensiveAssignmentCount}, churn ${report.defensiveAssignmentChurn}; ON_BALL median/p95 ${report.onBallMedianDistanceMeters?.toFixed(2)}/${report.onBallP95DistanceMeters?.toFixed(2)}m, GAP median ${report.gapMedianManDistanceMeters?.toFixed(2)}m, HELP median ${report.helpMedianManDistanceMeters?.toFixed(2)}m, overall ${report.overallDefenderToAssignedManMeanMeters?.toFixed(2)}m, wrong-side ${report.onBallWrongSideViolations}\n`)
    expect(report.defensiveAssignmentCompletenessPercentage).toBe(100)
    expect(report.invalidDefensiveAssignmentCount).toBe(0)
    expect(report.duplicateDefensiveAssignmentCount).toBe(0)
    expect(report.unassignedAttackerCount).toBe(0)
    expect(report.defenderWithoutResponsibilityCount).toBe(0)
    expect(report.defensiveIntentWithoutDecision).toBe(0)
    expect(report.defensiveDecisionWithoutResponsibility).toBe(0)
    expect(report.defensiveResponsibilityWithoutAssignment).toBe(0)
    expect(report.defensiveAssignmentChurn).toBe(0)
    expect(report.onBallMedianDistanceMeters).toBeLessThanOrEqual(2)
    expect(report.gapMedianManDistanceMeters).toBeLessThanOrEqual(4)
    expect(report.overallDefenderToAssignedManMeanMeters).toBeLessThan(5)
    expect(report.onBallWrongSideViolations).toBe(0)
    expect(report.defensiveOutOfBoundsViolations).toEqual([])
    expect(report.movementTeleports).toBe(0)
    expect(report.speedBoundViolations).toEqual([])
    expect(report.accelerationBrakingViolations).toEqual([])
    expect(report.outOfBoundsViolations).toEqual([])
    expect(report.movementWithoutIntentViolations).toEqual([])
    expect(report.intentWithoutResponsibilityViolations).toEqual([])
    expect(report.decisionWithoutResponsibilityViolations).toEqual([])
    expect(report.ballStateViolations).toEqual([])
    expect(report.playerContinuityViolations).toEqual([])
  })

  it('measures full 5v5 MAN simulation for 24,000 live ticks without per-tick rematching', () => {
    const base = setupFor()
    const setup: MatchSetup = { ...base, clockRules: { ...base.clockRules, periodSeconds: 3000, shotClockSeconds: 3000 } }
    let state = settle(liveHome(setup))
    const started = performance.now()
    for (let index = 0; index < 24_000; index += 1) state = tick(state)
    const elapsedMs = performance.now() - started
    const assignmentsEstablished = state.events.filter((event) => event.type === 'defensiveAssignmentsEstablished').length
    const responsibilityChanges = state.events.filter((event) => event.type === 'defensiveResponsibilityChanged').length
    process.stderr.write(`Match Next full 5v5 MAN: 24000 live ticks, ${elapsedMs.toFixed(1)} ms, ${(24_000 / (elapsedMs / 1000)).toFixed(0)} ticks/s, assignment calculations ${assignmentsEstablished}, responsibility changes ${responsibilityChanges}\n`)
    expect(state.t).toBeGreaterThanOrEqual(24_000)
    expect(activePossession(state)?.phase).toBe('SETUP')
    expect(state.defensiveStructure?.assignments).toHaveLength(5)
    expect(assignmentsEstablished).toBe(1)
    expect(elapsedMs).toBeLessThan(5000)
  })
})
