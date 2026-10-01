import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCourtGeometry, distanceBetween, isBeyondThreePointLine, isInsideCourt, type CourtPosition } from '@/domain/court'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createMatchState, applyCommand, tick, toFrame, observeFrames, activePossession, stepPlayerKinematics, integrateMatchPlayers, resolveFiveOutTargets, resolveBallSide, slotTargetsAreValid, assignFiveOutSlots, attackingBasketForTeam, advanceTarget, MOVEMENT_DT_SECONDS, TARGET_ARRIVAL_TOLERANCE_METERS, TARGET_ARRIVAL_SPEED_MPS, type MatchPlayerState, type MatchSetup, type MatchState } from './index'

const homeTeamId = teamIdFromString('movement-home')
const awayTeamId = teamIdFromString('movement-away')
const homeIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`movement-home-${index + 1}`))
const awayIds = Array.from({ length: 5 }, (_, index) => playerIdFromString(`movement-away-${index + 1}`))

function setupFor(team: 'home' | 'away' = 'home'): MatchSetup {
  const court = createCourtGeometry('FIBA')
  const profile = (playerId: typeof homeIds[number], teamId: typeof homeTeamId, slot: number) => ({
    playerId,
    teamId,
    primaryPosition: (['PG', 'SG', 'SF', 'PF', 'C'] as const)[slot]!,
    physical: { heightCm: 190 + slot, weightKg: 85, wingspanCm: 195, standingReachCm: 245 },
    kinematics: { maxSpeedMps: 5 + slot * 0.3, accelerationMps2: 2.4 + slot * 0.2, brakingMps2: 3.2 + slot * 0.2 },
    offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 },
    defense: { pointOfAttack: 50, interior: 50, mobility: 50 },
    rebounding: { impact: 50 },
  })
  const center = { x: court.lengthMeters / 2, y: court.widthMeters / 2 }
  const homeSpots: readonly CourtPosition[] = [center, { x: 10, y: center.y }, { x: 8, y: 3 }, { x: 8, y: 12 }, { x: 10, y: 5 }]
  const awaySpots: readonly CourtPosition[] = [center, { x: 18, y: center.y }, { x: 20, y: 3 }, { x: 20, y: 12 }, { x: 18, y: 10 }]
  const emptyPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }
  return {
    gameId: gameIdFromString(`movement-game-${team}`), homeTeamId, awayTeamId, court,
    clockRules: { periodCount: 4, periodSeconds: 600, overtimeSeconds: 300, shotClockSeconds: 24, offensiveReboundShotClockSeconds: null },
    homeSquad: homeIds, awaySquad: awayIds, initialLineups: { home: homeIds, away: awayIds },
    players: [...homeIds.map((id, index) => profile(id, homeTeamId, index)), ...awayIds.map((id, index) => profile(id, awayTeamId, index))],
    initialPlayerPositions: [...homeIds.map((playerId, index) => ({ playerId, position: homeSpots[index]! })), ...awayIds.map((playerId, index) => ({ playerId, position: awaySpots[index]! }))],
    tacticalPlans: { home: emptyPlan, away: emptyPlan }, defensiveMatchupOverrides: { home: [], away: [] }, matchSeed: 90210,
  }
}

function startPossession(setup: MatchSetup, side: 'home' | 'away' = 'home'): MatchState {
  const teamId = side === 'home' ? setup.homeTeamId : setup.awayTeamId
  const lineup = side === 'home' ? setup.initialLineups.home : setup.initialLineups.away
  let state = createMatchState(setup)
  state = applyCommand(state, { type: 'startInbound', teamId, inbounderPlayerId: lineup[0]!, reason: 'periodStart' })
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: lineup[1]!, passKind: 'chest', travelTicks: 10 })
  return ticks(state, 10)
}

function ticks(state: MatchState, count: number): MatchState {
  let current = state
  for (let index = 0; index < count; index += 1) current = tick(current)
  return current
}

function settleInSetup(state: MatchState, maximumTicks = 220): MatchState {
  let current = state
  for (let index = 0; index < maximumTicks && activePossession(current)?.phase !== 'SETUP'; index += 1) current = tick(current)
  expect(activePossession(current)?.phase).toBe('SETUP')
  return current
}

function projectPlayer(state: MatchState, playerId: string, count: number): CourtPosition {
  return ticks(state, count).players.find((player) => player.playerId === playerId)!.position
}

function intent(playerId: MatchPlayerState['playerId'], target: CourtPosition, urgency: 'walk' | 'jog' | 'run' | 'sprint' = 'sprint') {
  return { playerId, target, urgency, facing: { kind: 'TRAVEL' as const }, provenance: { responsibilityId: 'r1', decisionId: 'd1', owner: 'offensiveStructure' as const } }
}

function kineticPlayer(position: CourtPosition, velocity: CourtPosition = { x: 0, y: 0 }): MatchPlayerState {
  return { playerId: homeIds[0]!, teamId: homeTeamId, active: true, preMatchCareerFatigue: 0, initialFatigue: 0, fatigue: 0, position, velocity, facing: { x: 1, y: 0 }, primaryPosition: 'PG', heightCm: 190, weightKg: 85, wingspanCm: 195, standingReachCm: 245, reboundingImpact: 50, defensiveMobility: 50, offense: { usage: 50, rimAttack: 50, shooting: 50, creation: 50, ballSecurity: 50 }, passing: { accuracy: 50, vision: 50, timing: 50 }, defense: { pointOfAttack: 50, interior: 50, mobility: 50 }, kinematics: { maxSpeedMps: 6, accelerationMps2: 3, brakingMps2: 4 } }
}

describe('Match Next movement and 5OUT authority', () => {
  it('creates JSON-safe player profiles and normalized facing in canonical state', () => {
    const setup = setupFor()
    const state = createMatchState(setup)
    expect(state.players).toHaveLength(10)
    for (const player of state.players) expect(Math.hypot(player.facing.x, player.facing.y)).toBeCloseTo(1, 8)
    expect(state.players[2]!.kinematics).toEqual(setup.players.find((profile) => profile.playerId === state.players[2]!.playerId)!.kinematics)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    expect(() => createMatchState({ ...setup, players: setup.players.map((profile, index) => index === 0 ? { ...profile, kinematics: { ...profile.kinematics, maxSpeedMps: 0 } } : profile) })).toThrow('invalid kinematics maxSpeedMps')
  })

  it('leaves an idle player still and accelerates toward a target within urgency speed and acceleration limits', () => {
    const court = createCourtGeometry('FIBA')
    const player = kineticPlayer({ x: 2, y: 7.5 })
    const idle = stepPlayerKinematics(player, player.kinematics, undefined, player.position, { x: 26, y: 7.5 }, [], court)
    expect(idle.position).toEqual(player.position)
    expect(idle.velocity).toEqual(player.velocity)
    let moving = player
    let maxSpeed = 0
    let maxAcceleration = 0
    for (let index = 0; index < 120; index += 1) {
      const next = stepPlayerKinematics(moving, moving.kinematics, intent(moving.playerId, { x: 26, y: 7.5 }, 'jog'), moving.position, { x: 26, y: 7.5 }, [], court)
      const speed = Math.hypot(next.velocity.x, next.velocity.y)
      maxSpeed = Math.max(maxSpeed, speed)
      maxAcceleration = Math.max(maxAcceleration, Math.max(0, Math.hypot(next.velocity.x, next.velocity.y) - Math.hypot(moving.velocity.x, moving.velocity.y)) / MOVEMENT_DT_SECONDS)
      moving = { ...moving, position: next.position, velocity: next.velocity, facing: next.facing }
    }
    expect(maxSpeed).toBeLessThanOrEqual(6 * 0.55 + 1e-6)
    expect(maxSpeed).toBeGreaterThan(2)
    expect(maxAcceleration).toBeLessThanOrEqual(3 + 1e-6)
    expect(moving.position.x).toBeGreaterThan(player.position.x)
  })

  it('brakes under the profile limit, settles without overshooting, and keeps different athletic profiles distinguishable', () => {
    const court = createCourtGeometry('FIBA')
    const runToArrival = (profile: MatchPlayerState['kinematics']) => {
      let player: MatchPlayerState = { ...kineticPlayer({ x: 2, y: 7.5 }), kinematics: profile }
      let brakingSeen = false
      for (let index = 0; index < 500; index += 1) {
        const beforeSpeed = Math.hypot(player.velocity.x, player.velocity.y)
        const result = stepPlayerKinematics(player, profile, intent(player.playerId, { x: 15, y: 7.5 }), player.position, { x: 26, y: 7.5 }, [], court)
        const afterSpeed = Math.hypot(result.velocity.x, result.velocity.y)
        if (afterSpeed < beforeSpeed - 1e-8) brakingSeen = true
        expect(Math.abs(afterSpeed - beforeSpeed) / MOVEMENT_DT_SECONDS).toBeLessThanOrEqual((afterSpeed < beforeSpeed ? profile.brakingMps2 : profile.accelerationMps2) + 1e-6)
        player = { ...player, position: result.position, velocity: result.velocity, facing: result.facing }
        if (distanceBetween(player.position, { x: 15, y: 7.5 }) <= TARGET_ARRIVAL_TOLERANCE_METERS && Math.hypot(player.velocity.x, player.velocity.y) <= TARGET_ARRIVAL_SPEED_MPS) return { ticks: index + 1, player, brakingSeen }
      }
      throw new Error('Player did not settle at its target')
    }
    const slower = runToArrival({ maxSpeedMps: 4.8, accelerationMps2: 2.4, brakingMps2: 3.2 })
    const faster = runToArrival({ maxSpeedMps: 6.4, accelerationMps2: 3.8, brakingMps2: 4.8 })
    expect(slower.player.position.x).toBeLessThanOrEqual(15 + TARGET_ARRIVAL_TOLERANCE_METERS)
    expect(slower.player.position.x).toBeGreaterThanOrEqual(15 - TARGET_ARRIVAL_TOLERANCE_METERS)
    expect(slower.brakingSeen).toBe(true)
    expect(faster.ticks).toBeLessThan(slower.ticks)
  })

  it('uses braking acceleration when a moving player must reverse toward a new target', () => {
    const court = createCourtGeometry('FIBA')
    const player = kineticPlayer({ x: 15, y: 7.5 }, { x: -4, y: 0 })
    const target = { x: 26, y: 7.5 }
    const result = stepPlayerKinematics(player, player.kinematics, intent(player.playerId, target), player.position, target, [], court)

    expect(result.velocity.x).toBeCloseTo(-3.6, 8)
    expect(result.velocity.y).toBeCloseTo(0, 8)
    expect(result.position.x).toBeLessThan(player.position.x)
  })

  it('uses bounded deterministic soft separation for overlapping teammates', () => {
    const court = createCourtGeometry('FIBA')
    let first: MatchPlayerState = kineticPlayer({ x: 10, y: 7.5 })
    let second: MatchPlayerState = { ...kineticPlayer({ x: 10, y: 7.5 }), playerId: homeIds[1]! }
    for (let index = 0; index < 60; index += 1) {
      const beforeFirst = first.position
      const beforeSecond = second.position
      const firstResult = stepPlayerKinematics(first, first.kinematics, intent(first.playerId, { x: 10, y: 7.5 }), { x: 26, y: 7.5 }, { x: 26, y: 7.5 }, [second.position], court)
      const secondResult = stepPlayerKinematics(second, second.kinematics, intent(second.playerId, { x: 10, y: 7.5 }), { x: 26, y: 7.5 }, { x: 26, y: 7.5 }, [first.position], court)
      expect(distanceBetween(beforeFirst, firstResult.position)).toBeLessThanOrEqual(first.kinematics.maxSpeedMps * 0.1 + 0.16)
      expect(distanceBetween(beforeSecond, secondResult.position)).toBeLessThanOrEqual(second.kinematics.maxSpeedMps * 0.1 + 0.16)
      first = { ...first, position: firstResult.position, velocity: firstResult.velocity, facing: firstResult.facing }
      second = { ...second, position: secondResult.position, velocity: secondResult.velocity, facing: secondResult.facing }
    }
    expect(distanceBetween(first.position, second.position)).toBeGreaterThan(0.2)
  })

  it('applies local separation across both teams when players converge on one rebound point', () => {
    const setup = setupFor()
    const center = { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }
    let state = createMatchState(setup)
    state = {
      ...state,
      players: state.players.map((player) => ({ ...player, position: center })),
      movementIntents: state.players.map((player) => intent(player.playerId, center, 'jog')),
    }
    for (let index = 0; index < 60; index += 1) state = { ...state, players: integrateMatchPlayers(state) }
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < state.players.length; left += 1) {
      for (let right = left + 1; right < state.players.length; right += 1) {
        minimumDistance = Math.min(minimumDistance, distanceBetween(state.players[left]!.position, state.players[right]!.position))
      }
    }
    expect(minimumDistance).toBeGreaterThan(0.05)
  })

  it('keeps all four semantic slots inside court, mirrors for the other basket, and applies side hysteresis', () => {
    const court = createCourtGeometry('FIBA')
    const right = resolveFiveOutTargets(court, { x: 21, y: 3 }, court.baskets.right, 'TOP')
    const left = resolveFiveOutTargets(court, { x: 7, y: 3 }, court.baskets.left, 'TOP')
    const oppositeSide = resolveFiveOutTargets(court, { x: 21, y: 12 }, court.baskets.right, 'BOTTOM')
    expect(slotTargetsAreValid(right, court)).toBe(true)
    expect(slotTargetsAreValid(left, court)).toBe(true)
    for (const slot of right) expect(left.find((item) => item.slot === slot.slot)!.position.x + slot.position.x).toBeCloseTo(court.lengthMeters, 8)
    expect(oppositeSide.find((item) => item.slot === 'STRONG_CORNER')!.position.y).toBeGreaterThan(right.find((item) => item.slot === 'STRONG_CORNER')!.position.y)
    const deeperBall = resolveFiveOutTargets(court, { x: 18, y: 3 }, court.baskets.right, 'TOP')
    // BT2C: zones belong to the court, not to the ball: a deeper ball does not drag the wings, and the corners are real
    // corners (on the corner-three strip), not deep wings.
    expect(deeperBall.find((item) => item.slot === 'STRONG_SLOT')!.position).toEqual(right.find((item) => item.slot === 'STRONG_SLOT')!.position)
    for (const slot of right) expect(isBeyondThreePointLine(slot.position, court.baskets.right, court)).toBe(true)
    for (const corner of right.filter((item) => item.slot.endsWith('CORNER'))) {
      expect(Math.min(corner.position.y, court.widthMeters - corner.position.y)).toBeLessThanOrEqual(court.threePointLine.cornerOffsetMeters)
      expect(court.lengthMeters - corner.position.x).toBeLessThan(3)
    }
    expect(resolveBallSide({ x: 22, y: 7.8 }, court, 'TOP')).toBe('TOP')
    expect(resolveBallSide({ x: 22, y: 8.4 }, court, 'TOP')).toBe('BOTTOM')
    expect(resolveBallSide({ x: 7, y: 6.6 }, court, 'BOTTOM')).toBe('TOP')
    expect(attackingBasketForTeam(homeTeamId, homeTeamId, 1, court)).toEqual(court.baskets.right)
    expect(attackingBasketForTeam(homeTeamId, homeTeamId, 3, court)).toEqual(court.baskets.left)
    for (const ruleset of ['NBA', 'WNBA', 'NCAA_M', 'NCAA_W', 'HIGH_SCHOOL'] as const) {
      const otherCourt = createCourtGeometry(ruleset)
      expect(slotTargetsAreValid(resolveFiveOutTargets(otherCourt, { x: otherCourt.lengthMeters * 0.72, y: 3 }, otherCourt.baskets.right, 'TOP'), otherCourt)).toBe(true)
    }
  })

  it('keeps assignments stable for small changes and assigns four unique players to four unique SPACE slots', () => {
    const court = createCourtGeometry('FIBA')
    const ids = homeIds.slice(1)
    const targets = resolveFiveOutTargets(court, { x: 21, y: 11 }, court.baskets.right, 'BOTTOM')
    const positions = ids.map((playerId, index) => ({ playerId, position: { x: 8 + index * 0.2, y: 3 + index * 2.2 } }))
    const first = assignFiveOutSlots(positions, targets)
    const nudged = positions.map((item, index) => ({ ...item, position: { x: item.position.x + index * 0.03, y: item.position.y + 0.02 } }))
    const second = assignFiveOutSlots(nudged, targets, first)
    expect(second).toEqual(first)
    expect(new Set(second.map((item) => item.playerId)).size).toBe(4)
    expect(new Set(second.map((item) => item.slot)).size).toBe(4)
  })

  it('connects each active offensive player through responsibility, structural decision, and intent provenance', () => {
    const setup = setupFor()
    const state = startPossession(setup)
    expect(activePossession(state)?.phase).toBe('ADVANCE')
    expect(state.offensiveStructure?.formation).toBe('5OUT')
    expect(state.offensiveStructure?.assignments).toHaveLength(5)
    expect(state.responsibilities).toHaveLength(10)
    expect(state.decisions).toHaveLength(10)
    expect(state.movementIntents).toHaveLength(10)
    expect(state.responsibilities.filter((item) => item.kind === 'ADVANCE')).toHaveLength(1)
    expect(state.responsibilities.filter((item) => item.kind === 'SPACE')).toHaveLength(4)
    for (const movement of state.movementIntents) {
      const decision = state.decisions.find((item) => item.id === movement.provenance.decisionId)
      const responsibility = state.responsibilities.find((item) => item.id === movement.provenance.responsibilityId)
      expect(decision?.responsibilityId).toBe(responsibility?.id)
      expect(movement.provenance.owner).toBe(responsibility?.owner)
    }
    const ballHandler = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    // The carrier heads for the advance target, going around a defender who stands on his line (BT4.1).
    const carrierTarget = state.movementIntents.find((movement) => movement.playerId === ballHandler)!.target
    const advance = advanceTarget(state, state.offensiveStructure!.attackingBasket)
    expect(Math.hypot(carrierTarget.x - advance.x, carrierTarget.y - advance.y)).toBeLessThanOrEqual(3.5)
    expect(state.movementIntents.filter((movement) => movement.provenance.owner === 'offensiveStructure' && movement.facing.kind === 'BALL')).toHaveLength(4)
    expect(state.movementIntents.filter((movement) => movement.facing.kind === 'BASKET')).toHaveLength(1)
  })

  it('projects an independent MatchFrame without sharing mutable simulation objects', () => {
    const state = startPossession(setupFor())
    const before = JSON.stringify(state)
    const frame = toFrame(state)
    const player = frame.players.find((item) => item.intent !== null)!
    ;(player.position as { x: number; y: number }).x += 1
    if (player.intent) (player.intent.target as { x: number; y: number }).x += 1
    if (player.responsibility) (player.responsibility.endCondition as { kind: string }).kind = 'changed-in-frame'
    if (frame.offensiveStructure) (frame.offensiveStructure.slots[0]!.position as { x: number; y: number }).y += 1
    expect(JSON.stringify(state)).toBe(before)
  })

  it('advances home and away holders physically, preserves possession and shot clock, and synchronizes the HELD ball', () => {
    for (const side of ['home', 'away'] as const) {
      const setup = setupFor(side)
      let state = startPossession(setup, side)
      const possessionId = activePossession(state)!.id
      const shotClockAtAdvance = state.shotClockTenths!
      const frames = [toFrame(state)]
      let previous = state
      for (let count = 0; count < 220 && activePossession(state)?.phase !== 'SETUP'; count += 1) {
        state = tick(state)
        frames.push(toFrame(state))
        if (state.ball.kind === 'HELD') {
          const ownerPlayerId = state.ball.ownerPlayerId
          const owner = state.players.find((player) => player.playerId === ownerPlayerId)!
          expect(distanceBetween(owner.position, state.ball.position)).toBeLessThanOrEqual(0.001)
        }
        for (const player of state.players) expect(distanceBetween(previous.players.find((item) => item.playerId === player.playerId)!.position, player.position)).toBeLessThanOrEqual(player.kinematics.maxSpeedMps * 0.1 + 0.17)
        previous = state
      }
      expect(activePossession(state)).toMatchObject({ id: possessionId, phase: 'SETUP' })
      expect(state.shotClockTenths).toBe(shotClockAtAdvance - (state.t - frames[0]!.t))
      expect(state.events.filter((event) => event.type === 'possessionPhaseChanged' && event.phase === 'SETUP')).toHaveLength(1)
      const report = observeFrames(frames)
      expect(report.movementTeleports).toBe(0)
      expect(report.ballTeleports).toBe(0)
      expect(report.ballStateViolations).toEqual([])
      expect(state.defensiveStructure?.assignments).toHaveLength(5)
      expect(state.defensiveStructure?.onBallDefenderPlayerId).toBeTruthy()
    }
  })

  it('keeps assigned offensive players moving while a pass is in flight', () => {
    let state = startPossession(setupFor())
    const receiver = state.offensiveStructure!.assignments.find((item) => item.slot === 'WEAK_SLOT')!.playerId
    const target = projectPlayer(state, receiver, 4)
    const movingTeammate = state.offensiveStructure!.assignments.find((item) => item.playerId !== receiver && item.slot !== 'BALL')!.playerId
    const before = state.players.find((player) => player.playerId === movingTeammate)!.position
    state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target, passKind: 'chest', travelTicks: 4 } })
    state = tick(state)
    expect(state.ball.kind).toBe('PASS_IN_FLIGHT')
    expect(state.players.find((player) => player.playerId === movingTeammate)!.position).not.toEqual(before)
    expect(state.movementIntents).toHaveLength(10)
  })

  it('keeps a settled 5OUT spaced, follows targets, and reports no continuity or provenance violations', () => {
    let state = settleInSetup(startPossession(setupFor()))
    const ballOwner = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : null
    expect(state.movementIntents.find((movement) => movement.playerId === ballOwner)?.target).toEqual(state.players.find((player) => player.playerId === ballOwner)?.position)
    const frames = [toFrame(state)]
    for (let index = 0; index < 220; index += 1) {
      state = tick(state)
      frames.push(toFrame(state))
    }
    const report = observeFrames(frames)
    process.stderr.write(`Match Next behaviour: settled spacing ${report.settledSpacingPercentage?.toFixed(1)}%, minimum ${report.minimumOffensiveSpacing?.toFixed(2)}m, max target distance ${report.maximumContinuousDistanceFromTargetSeconds.toFixed(1)}s, slot churn ${report.slotChurn}; speed ${report.maxPlayerSpeed.toFixed(2)}m/s, accel ${report.maxAccelerationObserved.toFixed(2)}m/s², braking ${report.maxBrakingObserved.toFixed(2)}m/s²\n`)
    expect(report.movementTeleports).toBe(0)
    expect(report.playerContinuityViolations).toEqual([])
    expect(report.speedBoundViolations).toEqual([])
    expect(report.accelerationBrakingViolations).toEqual([])
    expect(report.outOfBoundsViolations).toEqual([])
    expect(report.movementWithoutIntentViolations).toEqual([])
    expect(report.intentWithoutResponsibilityViolations).toEqual([])
    expect(report.decisionWithoutResponsibilityViolations).toEqual([])
    expect(report.responsibilityCountViolations).toEqual([])
    expect(report.slotAssignmentViolations).toEqual([])
    expect(report.settledSpacingPercentage).toBeGreaterThanOrEqual(90)
    expect(report.maximumContinuousDistanceFromTargetSeconds).toBeLessThanOrEqual(3)
    expect(report.longTargetDistanceViolations).toEqual([])
    expect(report.slotChurn).toBe(0)
    expect(report.possessionViolations).toEqual([])
    expect(report.clockViolations).toEqual([])
  })

  it('changes the BALL assignment after a legal pass without a slot or responsibility duplicate', () => {
    let state = settleInSetup(startPossession(setupFor()))
    const oldOwner = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : homeIds[1]!
    const priorStructure = state.offensiveStructure!
    const receiver = priorStructure.assignments.find((item) => item.slot === 'WEAK_SLOT')!.playerId
    const target = projectPlayer(state, receiver, 4)
    state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target, passKind: 'chest', travelTicks: 4 } })
    state = ticks(state, 4)
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: receiver })
    expect(state.offensiveStructure?.ballSide).not.toBe(priorStructure.ballSide)
    expect(state.offensiveStructure?.assignments.find((item) => item.playerId === receiver)?.slot).toBe('BALL')
    const oldOwnerSlot = state.offensiveStructure?.assignments.find((item) => item.playerId === oldOwner)?.slot
    expect(oldOwnerSlot).not.toBe('BALL')
    const oldOwnerPosition = state.players.find((player) => player.playerId === oldOwner)!.position
    const oldOwnerTarget = state.offensiveStructure!.slots.find((item) => item.slot === oldOwnerSlot)!.position
    expect(distanceBetween(oldOwnerPosition, oldOwnerTarget)).toBeLessThanOrEqual(6)
    const anchor = state.offensiveStructure?.continuityAnchors?.find((item) => item.playerId === oldOwner)
    expect(anchor).toMatchObject({ playerId: oldOwner, slot: oldOwnerSlot })
    expect(distanceBetween(oldOwnerTarget, anchor!.position)).toBe(0)
    expect(Math.abs(distanceBetween(anchor!.position, state.offensiveStructure!.attackingBasket) - state.court.threePointLine.arcRadiusMeters)).toBeLessThanOrEqual(0.5)
    const receiverPriorSlot = priorStructure.assignments.find((item) => item.playerId === receiver)!.slot
    const receiverPriorTarget = priorStructure.slots.find((item) => item.slot === receiverPriorSlot)!.position
    expect(distanceBetween(oldOwnerTarget, receiverPriorTarget)).toBeGreaterThan(2)

    const continuingPlayers = priorStructure.assignments.filter((item) => item.slot !== 'BALL' && item.playerId !== receiver)
    for (const previous of continuingPlayers) {
      const currentSlot = state.offensiveStructure!.assignments.find((item) => item.playerId === previous.playerId)!.slot
      const previousTarget = priorStructure.slots.find((item) => item.slot === previous.slot)!.position
      const currentTarget = state.offensiveStructure!.slots.find((item) => item.slot === currentSlot)!.position
      // The ball-side flip relabels semantic lanes without moving the three
      // continuing spacers; the former handler's anchor occupies the vacancy.
      expect(distanceBetween(previousTarget, currentTarget)).toBeLessThanOrEqual(1.1)
    }
    expect(state.responsibilities.filter((item) => item.kind === 'BALL')).toHaveLength(1)
    expect(state.responsibilities.filter((item) => item.kind === 'SPACE')).toHaveLength(4)
    expect(new Set(state.offensiveStructure?.assignments.map((item) => item.slot)).size).toBe(5)
    expect(state.offensiveStructure?.reassignmentCount).toBeGreaterThan(0)
  })

  it('replays serialized mid-movement, braking, and post-pass reassignment exactly', () => {
    const initial = startPossession(setupFor())
    const midMovement = ticks(initial, 12)
    const resume = (state: MatchState, count: number) => ticks(JSON.parse(JSON.stringify(state)) as MatchState, count)
    expect(resume(midMovement, 75)).toEqual(ticks(midMovement, 75))

    const settled = settleInSetup(initial)
    const oldOwner = settled.ball.kind === 'HELD' ? settled.ball.ownerPlayerId : homeIds[0]!
    const receiver = settled.offensiveStructure!.assignments.find((item) => item.slot === 'WEAK_SLOT')!.playerId
    const target = projectPlayer(settled, receiver, 4)
    const passFlight = ticks(applyCommand(settled, { type: 'releasePass', command: { receiverPlayerId: receiver, target, passKind: 'bounce', travelTicks: 4 } }), 2)
    expect(passFlight.movementIntents).toHaveLength(10)
    expect(resume(passFlight, 40)).toEqual(ticks(passFlight, 40))
    const reassigned = ticks(passFlight, 2)
    expect(reassigned.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: receiver })
    const anchor = reassigned.offensiveStructure?.continuityAnchors?.find((item) => item.playerId === oldOwner)
    expect(anchor).toBeDefined()
    const afterAnchorTick = tick(reassigned)
    expect(afterAnchorTick.offensiveStructure?.continuityAnchors?.find((item) => item.playerId === oldOwner)).toEqual(anchor)
    expect(afterAnchorTick.offensiveStructure?.slots.find((item) => item.slot === anchor!.slot)?.position).toEqual(anchor!.position)
    expect(resume(reassigned, 40)).toEqual(ticks(reassigned, 40))

    const nextReceiver = reassigned.offensiveStructure!.assignments.find((item) => item.slot !== 'BALL' && item.playerId !== oldOwner)!.playerId
    const nextPass = ticks(applyCommand(reassigned, { type: 'releasePass', command: { receiverPlayerId: nextReceiver, target: projectPlayer(reassigned, nextReceiver, 4), passKind: 'chest', travelTicks: 4 } }), 4)
    expect(nextPass.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: nextReceiver })
    expect(nextPass.offensiveStructure?.continuityAnchors?.find((item) => item.playerId === oldOwner)?.position).toEqual(anchor!.position)
  })

  it('replays the full MatchFrame sequence, event stream, and slot assignments deterministically', () => {
    const replay = () => {
      let state = startPossession(setupFor())
      const frames = [toFrame(state)]
      for (let index = 0; index < 120; index += 1) {
        state = tick(state)
        frames.push(toFrame(state))
      }
      return { state, frames }
    }
    const first = replay()
    const second = replay()
    expect(second).toEqual(first)
    expect(first.state.rng).toEqual(startPossession(setupFor()).rng)
  })

  it('shows realistic equal-distance differences in acceleration, top speed, braking, and arrival time', () => {
    const court = createCourtGeometry('FIBA')
    const target = { x: 26, y: 7.5 }
    const measure = (profile: MatchPlayerState['kinematics']) => {
      let player: MatchPlayerState = { ...kineticPlayer({ x: 2, y: 7.5 }), kinematics: profile }
      let peakSpeedMps = 0
      let peakAccelerationMps2 = 0
      let peakBrakingMps2 = 0
      let previousSpeedMps = 0
      for (let index = 1; index <= 500; index += 1) {
        const result = stepPlayerKinematics(player, profile, intent(player.playerId, target, 'sprint'), player.position, { x: 26, y: 7.5 }, [], court)
        player = { ...player, position: result.position, velocity: result.velocity, facing: result.facing }
        const speedMps = Math.hypot(player.velocity.x, player.velocity.y)
        peakSpeedMps = Math.max(peakSpeedMps, speedMps)
        peakAccelerationMps2 = Math.max(peakAccelerationMps2, (speedMps - previousSpeedMps) / MOVEMENT_DT_SECONDS)
        peakBrakingMps2 = Math.max(peakBrakingMps2, (previousSpeedMps - speedMps) / MOVEMENT_DT_SECONDS)
        previousSpeedMps = speedMps
        if (distanceBetween(player.position, target) <= TARGET_ARRIVAL_TOLERANCE_METERS && speedMps <= TARGET_ARRIVAL_SPEED_MPS) {
          return { peakSpeedMps, peakAccelerationMps2, peakBrakingMps2, arrivalTicks: index }
        }
      }
      return { peakSpeedMps, peakAccelerationMps2, peakBrakingMps2, arrivalTicks: 501 }
    }
    const slower = measure({ maxSpeedMps: 4.8, accelerationMps2: 2.3, brakingMps2: 3.0 })
    const faster = measure({ maxSpeedMps: 6.2, accelerationMps2: 4.0, brakingMps2: 5.0 })
    expect(faster.peakSpeedMps).toBeGreaterThan(slower.peakSpeedMps + 1)
    expect(faster.peakAccelerationMps2).toBeGreaterThan(slower.peakAccelerationMps2 + 1)
    expect(faster.peakBrakingMps2).toBeGreaterThan(slower.peakBrakingMps2 + 1)
    expect(faster.arrivalTicks).toBeLessThan(slower.arrivalTicks)
    expect(slower.peakSpeedMps).toBeCloseTo(4.8, 3)
    expect(faster.peakSpeedMps).toBeCloseTo(6.2, 3)
    expect(slower.peakAccelerationMps2).toBeCloseTo(2.3, 3)
    expect(faster.peakAccelerationMps2).toBeCloseTo(4, 3)
    expect(slower.peakBrakingMps2).toBeCloseTo(3, 3)
    expect(faster.peakBrakingMps2).toBeCloseTo(5, 3)
  })

  it('detects duplicate responsibilities and broken movement provenance in observed frames', () => {
    const state = startPossession(setupFor())
    const frame = toFrame(state)
    const first = frame.responsibilities[0]!
    const invalid = {
      ...frame,
      responsibilities: [...frame.responsibilities, { ...first, id: 'duplicate-responsibility' }],
      decisions: frame.decisions.map((decision, index) => index === 0 ? { ...decision, responsibilityId: 'missing-responsibility' } : decision),
      movementIntents: frame.movementIntents.map((movement, index) => index === 0 ? { ...movement, provenance: { ...movement.provenance, decisionId: 'missing-decision' } } : movement),
    }
    const report = observeFrames([invalid])
    expect(report.responsibilityCountViolations.length).toBeGreaterThan(0)
    expect(report.decisionWithoutResponsibilityViolations.length).toBeGreaterThan(0)
    expect(report.intentWithoutResponsibilityViolations.length).toBeGreaterThan(0)
  })

  it('keeps live player-position writes inside kinematics, apart from initial state creation', () => {
    const engine = join(process.cwd(), 'src/engine/match-next')
    const sources = readdirSync(engine, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
      ? readdirSync(join(engine, entry.name), { withFileTypes: true }).flatMap((child) => child.isDirectory()
        ? readdirSync(join(engine, entry.name, child.name)).map((name) => join(engine, entry.name, child.name, name))
        : [join(engine, entry.name, child.name)])
      : [join(engine, entry.name)])
      .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    const unauthorized = sources.filter((path) => !path.endsWith(join('movement', 'PlayerKinematics.ts')) && !path.endsWith('state.ts') && !path.endsWith('frame.ts') && /(?:\.position\s*=|\.\.\.player\s*,\s*position\s*:)/s.test(readFileSync(path, 'utf8')))
    expect(unauthorized).toEqual([])
    expect(readFileSync(join(engine, 'movement', 'PlayerKinematics.ts'), 'utf8')).toMatch(/position:\s*result\.position/)
  })

  it('moves ten profiled players for a regulation workload and measures repeated structure reassignments', () => {
    const court = createCourtGeometry('FIBA')
    let players = Array.from({ length: 10 }, (_, index) => ({
      ...kineticPlayer({ x: 2 + index * 2.5, y: 2 + (index % 2) * 10 }),
      playerId: playerIdFromString(`perf-player-${index}`),
      position: { x: 2 + index * 2.5, y: 2 + (index % 2) * 10 },
      kinematics: { maxSpeedMps: 5 + index * 0.15, accelerationMps2: 2.4 + index * 0.1, brakingMps2: 3.2 + index * 0.1 },
    }))
    const started = performance.now()
    for (let tickIndex = 0; tickIndex < 24_000; tickIndex += 1) {
      const positions = players.map((player) => player.position)
      const targetSide = Math.floor(tickIndex / 1200) % 2
      players = players.map((player, index) => {
        const target = { x: targetSide === index % 2 ? 24 : 3, y: 2 + (index % 2) * 10 }
        const others = positions.filter((_, otherIndex) => otherIndex !== index)
        const next = stepPlayerKinematics(player, player.kinematics, intent(player.playerId, target, 'sprint'), player.position, { x: 26, y: 7.5 }, others, court)
        return { ...player, position: next.position, velocity: next.velocity, facing: next.facing }
      })
    }
    const movementMs = performance.now() - started
    process.stderr.write(`Match Next 10-player movement: 24000 ticks, ${movementMs.toFixed(1)} ms, ${(24_000 / (movementMs / 1000)).toFixed(0)} ticks/s\n`)
    expect(players.every((player) => isInsideCourt(player.position, court))).toBe(true)
    expect(movementMs).toBeLessThan(5000)

    let state = settleInSetup(startPossession(setupFor()))
    const defensiveAssignments = state.defensiveStructure?.assignments
    const workloadStart = performance.now()
    for (let passIndex = 0; passIndex < 32; passIndex += 1) {
      const wantedSlot = passIndex % 2 === 0 ? 'STRONG_SLOT' : 'WEAK_SLOT'
      const receiver = state.offensiveStructure!.assignments.find((item) => item.slot === wantedSlot)!.playerId
      const target = projectPlayer(state, receiver, 4)
      state = ticks(applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target, passKind: 'chest', travelTicks: 4 } }), 4)
      expect(state.defensiveStructure?.assignments).toEqual(defensiveAssignments)
    }
    const structureMs = performance.now() - workloadStart
    const assignmentEvents = state.events.filter((event) => event.type === 'defensiveAssignmentsEstablished').length
    const responsibilityEvents = state.events.filter((event) => event.type === 'defensiveResponsibilityChanged').length
    process.stderr.write(`Match Next pass-heavy MAN workload: 128 flight ticks, ${(128 / (structureMs / 1000)).toFixed(0)} ticks/s, assignments established ${assignmentEvents}, responsibility changes ${responsibilityEvents}, ${structureMs.toFixed(1)} ms\n`)
    expect(state.ball.kind).toBe('HELD')
    expect(assignmentEvents).toBe(1)
    expect(responsibilityEvents).toBeGreaterThan(0)
    expect(state.offensiveStructure?.reassignmentCount).toBeGreaterThan(0)
    expect(structureMs).toBeLessThan(3000)
  })
})
