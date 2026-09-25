import { describe, expect, it } from 'vitest'

import { createGameWorld, type GameWorld } from '@/domain/world'
import { distanceFromBasket } from '@/domain/court'
import { playerIdFromString } from '@/domain/ids'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { MATCH_RULES_V2, MatchSimulationError, attackingBasketForTeam, assignBaseSpatialTargets, assignTransitionSpatialTargets, calculateActiveLineups, calculateDefensiveAssignments, controlBallByPlayer, createMatchPlayerProfile, createMatchSession, createOffBallCutIntent, createOffensiveAction, createPostScreenTarget, createScreenIntent, getSpatialPossessionView, isSpatialStateCoherentWithPossession, isSpatialStateInsideCourt, advancePlayerTowardTarget, BASELINE_PLAYER_KINEMATIC_PROFILE, PLAYER_ACCELERATION_METERS_PER_SECOND_SQUARED, PLAYER_DECELERATION_METERS_PER_SECOND_SQUARED, PLAYER_MAX_SPEED_METERS_PER_SECOND, releaseSpatialBall, simulateMatchDetailed, stepMatchSession, stepPlayersTowardBaseSpacing, stepPlayersTowardTransitionTargets, substitutePlayer, toMatchSimulation, transferHandoffBall, type MatchLineups, type SimulateMatchOptions } from './index'

describe('MatchSession', () => {
  it('selects a valid off-ball cutter, moves through MG6, and uses canonical pass resolution', () => {
    const { world, game } = createScheduledGameWorld()
    const prepared = withOpenOffBallCutContext(createMatchSession({ ...createOptions(world, game.id, 18, 36), random: new OffBallPassRandom(), decisionRandom: new CertainDecisionRandom() }), 1, { passFirstBias: 100 })
    const before = prepared.session.state.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position
    const intent = createOffBallCutIntent({ teamId: prepared.session.state.attackingTeamId, playerId: prepared.cutterId, spatial: prepared.session.state.spatial, attackingBasket: getSpatialPossessionView(prepared.session.state).attackingBasket })
    const result = stepMatchSession(prepared.session)
    const after = result.session.state.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position

    expect(result.newEvents.find((event) => event.type === 'passCompleted')).toMatchObject({ passerPlayerId: prepared.handlerId, receiverPlayerId: prepared.cutterId })
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: prepared.cutterId })
    expect(distanceFromBasket(after, intent.target)).toBeLessThan(distanceFromBasket(before, intent.target))
  })

  it('keeps P&R primary while a nonparticipant makes a secondary cut', () => {
    const { world, game } = createScheduledGameWorld()
    const base = withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 19, 38), random: new MissAndOffensiveReboundRandom(), decisionRandom: new CertainDecisionRandom() }))
    const prepared = withOpenOffBallCutContext(base, 2)
    const session = withScreenerOnAssignedDefenderRoute({ ...prepared.session, state: { ...prepared.session.state, screenIntent: { ...prepared.session.state.screenIntent!, phase: 'approach' as const, stepsRemaining: 5 }, driveIntent: undefined } })
    const intent = createOffBallCutIntent({ teamId: session.state.attackingTeamId, playerId: prepared.cutterId, spatial: session.state.spatial, attackingBasket: getSpatialPossessionView(session.state).attackingBasket })
    const before = session.state.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position
    const result = stepMatchSession(session).session.state
    const screenerId = session.state.offensiveAction!.participantIds.find((playerId) => playerId !== prepared.handlerId)!
    const after = result.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position
    const delta = session.state.clockSecondsRemaining - result.clockSecondsRemaining
    const baseSpacing = stepPlayersTowardBaseSpacing(baseSpacingInput(session.state, prepared.handlerId), delta)
    const baseSpacingPosition = baseSpacing.players.find((player) => player.playerId === prepared.cutterId)!.position

    expect(result.offensiveAction).toMatchObject({ kind: 'PICK_AND_ROLL', initiatorId: prepared.handlerId })
    expect(prepared.cutterId).not.toBe(screenerId)
    expect(distanceFromBasket(after, intent.target)).toBeLessThan(distanceFromBasket(before, intent.target))
    expect(after).not.toEqual(baseSpacingPosition)
  })

  it('leaves BaseSpacing in control when the cut lane is blocked', () => {
    const { world, game } = createScheduledGameWorld()
    const prepared = withOpenOffBallCutContext(createMatchSession({ ...createOptions(world, game.id, 21, 42), random: new MadeBasketRandom(), decisionRandom: new CertainDecisionRandom() }), 1)
    const state = prepared.session.state
    const offense = state.attackingTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
    const defense = state.attackingTeamId === state.homeTeamId ? state.activeLineups.away : state.activeLineups.home
    const profiles = state.attackingTeamId === state.homeTeamId ? state.playerProfiles.home : state.playerProfiles.away
    const defenders = state.attackingTeamId === state.homeTeamId ? state.playerProfiles.away : state.playerProfiles.home
    const assignment = calculateDefensiveAssignments(offense, defense, [...profiles, ...defenders]).find((matchup) => matchup.offensivePlayerId === prepared.cutterId)!
    const target = createOffBallCutIntent({ teamId: state.attackingTeamId, playerId: prepared.cutterId, spatial: state.spatial, attackingBasket: getSpatialPossessionView(state).attackingBasket }).target
    const blockedSpatial = { ...state.spatial, players: state.spatial.players.map((player) => player.playerId === assignment.defensivePlayerId ? { ...player, position: target } : player) }
    const blockedSession = { ...prepared.session, state: { ...state, spatial: blockedSpatial } }
    const result = stepMatchSession(blockedSession).session.state
    const elapsed = state.clockSecondsRemaining - result.clockSecondsRemaining
    const baseSpacing = stepPlayersTowardBaseSpacing(baseSpacingInput(state, prepared.handlerId), elapsed)

    expect(result.offBallCut).toBeUndefined()
    expect(result.spatial.players.find((player) => player.playerId === prepared.cutterId)?.position)
      .toEqual(baseSpacing.players.find((player) => player.playerId === prepared.cutterId)?.position)
  })

  it('represents an offensive action with distinct active participants from its team lineup', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 5, 6)).state
    const teamId = state.attackingTeamId
    const lineup = teamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
    const action = createOffensiveAction({ kind: 'PICK_AND_ROLL', teamId, initiatorId: lineup[0]!, participantIds: [lineup[0]!, lineup[1]!], activeLineup: lineup })

    expect(action).toEqual({ kind: 'PICK_AND_ROLL', teamId, initiatorId: lineup[0], participantIds: [lineup[0], lineup[1]] })
    expect(() => createOffensiveAction({ kind: 'PICK_AND_ROLL', teamId, initiatorId: lineup[0]!, participantIds: [lineup[0]!, state.squads.home.at(-1)!], activeLineup: lineup })).toThrow('Offensive action participants must be distinct active players and include the initiator')
  })

  it('routes a valid post-up back-down through MG6 movement toward the basket', () => {
    const { world, game } = createScheduledGameWorld()
    const backDown = withPostUpContext(createMatchSession({ ...createOptions(world, game.id, 20, 40), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { backDown: 100, shot: 0, pass: 0 })
    const postShot = withPostUpContext(createMatchSession({ ...createOptions(world, game.id, 20, 40), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { backDown: 0, shot: 100, pass: 0 })
    const postPlayerId = backDown.state.offensiveAction!.initiatorId
    const basket = getSpatialPossessionView(backDown.state).attackingBasket
    const beforeDistance = distanceFromBasket(backDown.state.spatial.players.find((player) => player.playerId === postPlayerId)!.position, basket)
    const backDownResult = stepMatchSession(backDown)
    const shotResult = stepMatchSession(postShot)
    const backDownPosition = backDownResult.session.state.spatial.players.find((player) => player.playerId === postPlayerId)!.position
    const shotPosition = shotResult.session.state.spatial.players.find((player) => player.playerId === postPlayerId)!.position

    expect(distanceFromBasket(backDownPosition, basket)).toBeLessThan(beforeDistance)
    expect(backDownPosition).not.toEqual(shotPosition)
  })

  it('routes a post shot into existing shot resolution and clears the action', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withPostUpContext(createMatchSession({ ...createOptions(world, game.id, 22, 44), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { backDown: 0, shot: 100, pass: 0 })
    const result = stepMatchSession(session)

    expect(result.newEvents.some((event) => event.type === 'shotMade' || event.type === 'shotMissed')).toBe(true)
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('routes a post pass-out through canonical pass resolution to an active teammate', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withPostUpContext(createMatchSession({ ...createOptions(world, game.id, 24, 48), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }), { backDown: 0, shot: 0, pass: 100 })
    const postPlayerId = session.state.offensiveAction!.initiatorId
    const offenseKey = session.state.attackingTeamId === session.state.homeTeamId ? 'home' : 'away'
    const teammates = session.state.activeLineups[offenseKey].filter((playerId) => playerId !== postPlayerId)
    const result = stepMatchSession(session)
    const pass = result.newEvents.find((event) => event.type === 'passCompleted')

    expect(pass).toMatchObject({ passerPlayerId: postPlayerId })
    expect(teammates).toContain(pass?.type === 'passCompleted' ? pass.receiverPlayerId : '')
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: pass?.type === 'passCompleted' ? pass.receiverPlayerId : undefined })
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('clears a post-up from an invalid court location and continues ordinary offense', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withPostUpContext(createMatchSession({ ...createOptions(world, game.id, 26, 52), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { backDown: 100, shot: 100, pass: 100 }, false)
    const result = stepMatchSession(session)

    expect(result.session.state.offensiveAction).toBeUndefined()
    expect(result.session.state.clockSecondsRemaining).toBeLessThan(session.state.clockSecondsRemaining)
    expect(result.newEvents.length).toBeGreaterThan(0)
  })

  it('uses a canonical pick-and-roll action to activate the existing screen movement branch', () => {
    const { world, game } = createScheduledGameWorld()
    const createPreparedSession = () => withScreenerOnAssignedDefenderRoute(withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 10, 20), random: new FirstSportingRandom(), decisionRandom: new ZeroDecisionRandom() })))
    const authorized = createPreparedSession()
    const unauthorized = createPreparedSession()
    const action = authorized.state.offensiveAction
    const withoutAction = { ...unauthorized, state: { ...unauthorized.state, offensiveAction: undefined } }

    expect(action).toMatchObject({ kind: 'PICK_AND_ROLL', initiatorId: authorized.state.screenIntent?.ballHandlerId })
    expect(action?.participantIds).toEqual([authorized.state.screenIntent?.ballHandlerId, authorized.state.screenIntent?.screenerId])
    expect(stepMatchSession(authorized).session.state.spatial).not.toEqual(stepMatchSession(withoutAction).session.state.spatial)
  })

  it('routes a canonical isolation action through the shared MG6 drive path', () => {
    const { world, game } = createScheduledGameWorld()
    const driveSession = withIsolationContext(createMatchSession({ ...createOptions(world, game.id, 12, 24), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { drive: 100, shot: 0, pass: 0 })
    const shotSession = withIsolationContext(createMatchSession({ ...createOptions(world, game.id, 12, 24), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { drive: 0, shot: 100, pass: 0 })
    const handlerId = driveSession.state.offensiveAction!.initiatorId
    const driveResult = stepMatchSession(driveSession)
    const shotResult = stepMatchSession(shotSession)
    const drivePosition = driveResult.session.state.spatial.players.find((player) => player.playerId === handlerId)!.position
    const shotPosition = shotResult.session.state.spatial.players.find((player) => player.playerId === handlerId)!.position

    expect(drivePosition).not.toEqual(shotPosition)
    expect(driveResult.newEvents.some((event) => event.type === 'shotMade')).toBe(true)
  })

  it('routes an isolation shot selection into the existing shot resolution and clears the action', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withIsolationContext(createMatchSession({ ...createOptions(world, game.id, 14, 28), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { drive: 0, shot: 100, pass: 0 })
    const result = stepMatchSession(session)

    expect(result.newEvents.some((event) => event.type === 'shotMade' || event.type === 'shotMissed')).toBe(true)
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('routes an isolation pass selection to an active teammate through existing pass resolution', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withIsolationContext(createMatchSession({ ...createOptions(world, game.id, 15, 30), random: new ForcedPassRandom(true), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }), { drive: 0, shot: 0, pass: 100 })
    const handlerId = session.state.offensiveAction!.initiatorId
    const offenseKey = session.state.attackingTeamId === session.state.homeTeamId ? 'home' : 'away'
    const offensiveTeammates = session.state.activeLineups[offenseKey].filter((playerId) => playerId !== handlerId)
    const result = stepMatchSession(session)
    const completedPass = result.newEvents.find((event) => event.type === 'passCompleted')

    expect(completedPass).toMatchObject({ passerPlayerId: handlerId })
    expect(offensiveTeammates).toContain(completedPass?.type === 'passCompleted' ? completedPass.receiverPlayerId : '')
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: completedPass?.type === 'passCompleted' ? completedPass.receiverPlayerId : undefined })
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('approaches through MG6 and transfers canonical ownership only when a handoff is in range', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withHandoffContext(createMatchSession({ ...createOptions(world, game.id, 31, 62), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), true)
    const { giverId, receiverId } = handoffActors(session.state)
    const result = stepMatchSession(session).session.state

    expect(session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: giverId })
    expect(result.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: receiverId, teamId: session.state.attackingTeamId })
    expect(result.offensiveAction).toMatchObject({ kind: 'HANDOFF', initiatorId: giverId, participantIds: [giverId, receiverId] })
  })

  it('leaves canonical ownership unchanged when the receiver is invalid', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withHandoffContext(createMatchSession(createOptions(world, game.id, 35, 70)), true)
    const { giverId, receiverId } = handoffActors(session.state)
    const offense = session.state.attackingTeamId === session.state.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away

    expect(transferHandoffBall({ spatial: session.state.spatial, teamId: session.state.attackingTeamId, giverId, receiverId, activeLineup: offense.filter((playerId) => playerId !== receiverId) })).toBeUndefined()
    expect(session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: giverId })
  })

  it('keeps a distant handoff viable while the receiver approaches under MG6', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withHandoffContext(createMatchSession({ ...createOptions(world, game.id, 32, 64), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), false)
    const { giverId, receiverId } = handoffActors(session.state)
    const before = session.state.spatial.players.find((player) => player.playerId === receiverId)!.position
    const result = stepMatchSession(session).session.state
    const after = result.spatial.players.find((player) => player.playerId === receiverId)!.position

    expect(result.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: giverId })
    expect(result.offensiveAction).toMatchObject({ kind: 'HANDOFF' })
    expect(after).not.toEqual(before)
    expect(result.clockSecondsRemaining).toBeLessThan(session.state.clockSecondsRemaining)
  })

  it('preserves MG7E secondary cuts by a nonparticipant during a handoff', () => {
    const { world, game } = createScheduledGameWorld()
    const base = withHandoffContext(createMatchSession({ ...createOptions(world, game.id, 36, 72), random: new MadeBasketRandom(), decisionRandom: new CertainDecisionRandom() }), true)
    const prepared = withOpenOffBallCutContext(base, 2)
    const cut = createOffBallCutIntent({ teamId: prepared.session.state.attackingTeamId, playerId: prepared.cutterId, spatial: prepared.session.state.spatial, attackingBasket: getSpatialPossessionView(prepared.session.state).attackingBasket })
    const session = { ...prepared.session, state: { ...prepared.session.state, offBallCut: cut } }
    const before = session.state.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position
    const result = stepMatchSession(session).session.state
    const after = result.spatial.players.find((player) => player.playerId === prepared.cutterId)!.position

    expect(prepared.cutterId).not.toBe(handoffActors(session.state).receiverId)
    expect(after).not.toEqual(before)
    expect(result.offensiveAction?.kind).toBe('HANDOFF')
  })

  it('continues a completed handoff into the receiver drive using DriveIntent and MG6', () => {
    const { world, game } = createScheduledGameWorld()
    let session: ReturnType<typeof createMatchSession> = withHandoffContext(createMatchSession({ ...createOptions(world, game.id, 33, 66), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), true, { drive: 100, shot: 0, pass: 0 })
    const receiverId = handoffActors(session.state).receiverId
    session = stepMatchSession(session).session
    const basket = getSpatialPossessionView(session.state).attackingBasket
    const before = session.state.spatial.players.find((player) => player.playerId === receiverId)!.position
    const result = stepMatchSession(session).session.state
    const after = result.spatial.players.find((player) => player.playerId === receiverId)!.position

    expect(session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: receiverId })
    expect(result.offensiveAction).toBeUndefined()
    expect(distanceFromBasket(after, basket)).toBeLessThan(distanceFromBasket(before, basket))
  })

  it('continues a completed handoff into the receiver existing shot resolution', () => {
    const { world, game } = createScheduledGameWorld()
    let session: ReturnType<typeof createMatchSession> = withHandoffContext(createMatchSession({ ...createOptions(world, game.id, 34, 68), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), true, { drive: 0, shot: 100, pass: 0 })
    const receiverId = handoffActors(session.state).receiverId
    session = stepMatchSession(session).session
    const result = stepMatchSession(session)

    expect(result.newEvents.some((event) => event.type === 'shotMade' || event.type === 'shotMissed')).toBe(true)
    expect(result.newEvents.some((event) => (event.type === 'shotMade' || event.type === 'shotMissed') && event.playerId === receiverId)).toBe(true)
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('resets an isolation with no specialized option and resumes ordinary possession behavior', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withIsolationContext(createMatchSession({ ...createOptions(world, game.id, 16, 32), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom() }), { drive: 0, shot: 0, pass: 0 })
    const result = stepMatchSession(session)

    expect(result.session.state.offensiveAction).toBeUndefined()
    expect(result.session.state.clockSecondsRemaining).toBeLessThan(session.state.clockSecondsRemaining)
    expect(result.newEvents.length).toBeGreaterThan(0)
  })

  it('lets a selected handler drive activate MG6 drive movement after the screen', () => {
    const { world, game } = createScheduledGameWorld()
    const createDriveSession = (driveFrequency: number, pullUpFrequency: number) => {
      const base = withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 10, 20), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }))
      const state = base.state
      const offenseKey = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
      const handlerId = state.offensiveAction!.initiatorId
      const screen = state.screenIntent!
      const basket = getSpatialPossessionView(state).attackingBasket
      const postScreenTarget = createPostScreenTarget({ action: 'roll', intent: screen, spatial: state.spatial, attackingBasket: basket })
      const playerProfiles = {
        ...state.playerProfiles,
        [offenseKey]: state.playerProfiles[offenseKey].map((profile) => profile.playerId === handlerId
          ? { ...profile, tendencies: { ...profile.tendencies, DRIVE_FREQUENCY: driveFrequency, PULLUP_FREQUENCY: pullUpFrequency, ADVANTAGE_PASS_FREQUENCY: 0 } }
          : profile),
      }
      return { ...base, state: { ...state, playerProfiles, screenIntent: { ...screen, phase: 'postScreen' as const, stepsRemaining: 4, postScreenAction: 'roll' as const, postScreenTarget } } }
    }
    const driveSession = createDriveSession(100, 0)
    const shotSession = createDriveSession(0, 100)
    const driveHandlerId = driveSession.state.offensiveAction!.initiatorId
    const drivePosition = stepMatchSession(driveSession).session.state.spatial.players.find((player) => player.playerId === driveHandlerId)!.position
    const shotPosition = stepMatchSession(shotSession).session.state.spatial.players.find((player) => player.playerId === driveHandlerId)!.position

    expect(drivePosition).not.toEqual(shotPosition)
  })

  it('routes a selected P&R pass to the active roller through canonical pass resolution', () => {
    const { world, game } = createScheduledGameWorld()
    const base = withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new ForcedPassRandom(true), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }))
    const state = base.state
    const offenseKey = state.attackingTeamId === state.homeTeamId ? 'home' : 'away'
    const handlerId = state.offensiveAction!.initiatorId
    const rollerId = state.offensiveAction!.participantIds.find((playerId) => playerId !== handlerId)!
    const screen = state.screenIntent!
    const basket = getSpatialPossessionView(state).attackingBasket
    const postScreenTarget = createPostScreenTarget({ action: 'roll', intent: screen, spatial: state.spatial, attackingBasket: basket })
    const playerProfiles = {
      ...state.playerProfiles,
      [offenseKey]: state.playerProfiles[offenseKey].map((profile) => profile.playerId === handlerId
        ? { ...profile, tendencies: { ...profile.tendencies, DRIVE_FREQUENCY: 0, PULLUP_FREQUENCY: 0, ADVANTAGE_PASS_FREQUENCY: 100 } }
        : profile),
    }
    const session = { ...base, state: { ...state, playerProfiles, driveIntent: undefined, screenIntent: { ...screen, phase: 'postScreen' as const, stepsRemaining: 4, postScreenAction: 'roll' as const, postScreenTarget } } }
    const result = stepMatchSession(session)

    expect(result.newEvents.find((event) => event.type === 'passCompleted')).toMatchObject({ passerPlayerId: handlerId, receiverPlayerId: rollerId })
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: rollerId, teamId: state.attackingTeamId })
    expect(result.session.state.screenIntent).toBeUndefined()
    expect(result.session.state.offensiveAction).toBeUndefined()
  })

  it('produces the same complete simulation through stepping as through the wrapper', () => {
    const { world, game } = createScheduledGameWorld()
    const whole = simulateMatchDetailed(createOptions(world, game.id, 12345, 67890))
    const stepped = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(stepped).toEqual(whole)
    expect(regressionSummary(whole)).toEqual({ finalScore: { home: 27, away: 69 }, eventCount: 221, homeTurnovers: 13, awayTurnovers: 7, homeRebounds: 22, awayRebounds: 37, homeAssists: 7, awayAssists: 19 })
  })

  it('advances one logical unit without mutating the previous sporting state', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const before = JSON.stringify(session.state)
    const result = stepMatchSession(session)

    expect(JSON.stringify(session.state)).toBe(before)
    expect(result.newEvents.length).toBeGreaterThan(0)
    expect(result.session.state.events.length).toBeGreaterThan(session.state.events.length)
    expect(result.session.state.clockSecondsRemaining).toBeLessThanOrEqual(session.state.clockSecondsRemaining)
  })

  it('bootstraps one deterministic court position for each active player and an unassigned center ball', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 12345, 67890)
    const first = createMatchSession(options).state
    const second = createMatchSession(createOptions(world, game.id, 12345, 67890)).state

    expect(first.spatial).toEqual(second.spatial)
    expect(first.spatial.players.map((player) => player.playerId).sort()).toEqual([...first.activeLineups.home, ...first.activeLineups.away].sort())
    expect(first.spatial.players).toHaveLength(10)
    expect(isSpatialStateInsideCourt(first.spatial)).toBe(true)
    expect(first.spatial.ball).toEqual({ kind: 'unassigned', position: { x: first.spatial.court.lengthMeters / 2, y: first.spatial.court.widthMeters / 2 } })
    expect(attackingBasketForTeam({ teamId: game.homeTeamId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, period: 1, court: first.spatial.court })).toEqual(first.spatial.court.baskets.right)
    expect(attackingBasketForTeam({ teamId: game.homeTeamId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, period: 3, court: first.spatial.court })).toEqual(first.spatial.court.baskets.left)
    expect(attackingBasketForTeam({ teamId: game.awayTeamId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, period: 1, court: first.spatial.court })).toEqual(first.spatial.court.baskets.left)
  })

  it('accelerates toward a legal target, respects maximum speed, and safely arrives without overshoot', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const player = spatial.players[0]!
    const farTarget = { x: spatial.court.lengthMeters * 0.9, y: player.position.y }
    const first = advancePlayerTowardTarget(spatial, player.playerId, farTarget, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE)
    const firstPlayer = first.players.find((candidate) => candidate.playerId === player.playerId)!
    expect(Math.hypot(firstPlayer.velocity.x, firstPlayer.velocity.y)).toBeCloseTo(PLAYER_ACCELERATION_METERS_PER_SECOND_SQUARED * 0.25)
    expect(Math.hypot(firstPlayer.velocity.x, firstPlayer.velocity.y)).toBeLessThan(PLAYER_MAX_SPEED_METERS_PER_SECOND)

    let moving = spatial
    for (let step = 0; step < 8; step += 1) moving = advancePlayerTowardTarget(moving, player.playerId, farTarget, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE)
    const speed = Math.hypot(moving.players.find((candidate) => candidate.playerId === player.playerId)!.velocity.x, moving.players.find((candidate) => candidate.playerId === player.playerId)!.velocity.y)
    expect(speed).toBeLessThanOrEqual(PLAYER_MAX_SPEED_METERS_PER_SECOND)

    const movingPlayer = moving.players.find((candidate) => candidate.playerId === player.playerId)!
    const brakingTarget = { x: movingPlayer.position.x + Math.sign(movingPlayer.velocity.x) * 2, y: movingPlayer.position.y }
    const braking = advancePlayerTowardTarget(moving, player.playerId, brakingTarget, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE).players.find((candidate) => candidate.playerId === player.playerId)!
    const brakingSpeed = Math.hypot(braking.velocity.x, braking.velocity.y)
    expect(brakingSpeed).toBeLessThan(speed)
    expect(speed - brakingSpeed).toBeLessThanOrEqual(PLAYER_DECELERATION_METERS_PER_SECOND_SQUARED * 0.25 + 1e-9)

    const closePlayer = moving.players.find((candidate) => candidate.playerId === player.playerId)!
    const closeTarget = { x: closePlayer.position.x + 0.15, y: closePlayer.position.y }
    const arrived = advancePlayerTowardTarget(moving, player.playerId, closeTarget, 1, BASELINE_PLAYER_KINEMATIC_PROFILE)
    expect(arrived.players.find((candidate) => candidate.playerId === player.playerId)!.position).toEqual(closeTarget)
    expect(arrived.players.find((candidate) => candidate.playerId === player.playerId)!.velocity).toEqual({ x: 0, y: 0 })
    expect(isSpatialStateInsideCourt(arrived)).toBe(true)
  })

  it('limits direction changes by acceleration and keeps a controlled ball with its handler', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const holderId = spatial.players[0]!.playerId
    const held = controlBallByPlayer(spatial, holderId)
    const holder = held.players.find((player) => player.playerId === holderId)!
    const target = { x: 0, y: holder.position.y }
    const withVelocity = { ...held, players: held.players.map((player) => player.playerId === holderId ? { ...player, velocity: { x: 2, y: 0 } } : player) }
    const movedHeld = advancePlayerTowardTarget(withVelocity, holderId, target, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE)
    const movedHolder = movedHeld.players.find((player) => player.playerId === holderId)!

    expect(movedHeld.ball).toMatchObject({ kind: 'playerControlled', playerId: holderId, teamId: holder.teamId, position: movedHolder.position })
    expect(movedHeld.players.filter((player) => player.playerId !== holderId)).toEqual(held.players.filter((player) => player.playerId !== holderId))
    expect(Math.hypot(movedHolder.velocity.x - 2, movedHolder.velocity.y)).toBeLessThanOrEqual(PLAYER_DECELERATION_METERS_PER_SECOND_SQUARED * 0.25 + 1e-9)
    const movedUnassigned = advancePlayerTowardTarget(spatial, holderId, target, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE)
    expect(movedUnassigned.ball).toBe(spatial.ball)
    const loose = { ...spatial, ball: { kind: 'loose' as const, position: spatial.ball.position } }
    expect(advancePlayerTowardTarget(loose, holderId, target, 0.25, BASELINE_PLAYER_KINEMATIC_PROFILE).ball).toBe(loose.ball)
  })

  it('rejects invalid movement distance and off-court targets', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const playerId = spatial.players[0]!.playerId

    expect(() => advancePlayerTowardTarget(spatial, playerId, { x: 0, y: 0 }, -1, BASELINE_PLAYER_KINEMATIC_PROFILE)).toThrow(RangeError)
    expect(() => advancePlayerTowardTarget(spatial, playerId, { x: spatial.court.lengthMeters + 1, y: 0 }, 1, BASELINE_PLAYER_KINEMATIC_PROFILE)).toThrow(RangeError)
    expect(() => advancePlayerTowardTarget(spatial, playerIdFromString('inactive-player'), { x: 0, y: 0 }, 1, BASELINE_PLAYER_KINEMATIC_PROFILE)).toThrow(/not active/)
  })

  it('assigns deterministic, distinct court-valid targets to all five players on each side', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const input = baseSpacingInput(state, openingHandlerId(state))
    const targets = assignBaseSpatialTargets(input)

    expect(assignBaseSpatialTargets(input)).toEqual(targets)
    expect(targets.offensive).toHaveLength(5)
    expect(targets.defensive).toHaveLength(5)
    expect(new Set(targets.offensive.map(({ playerId }) => playerId))).toEqual(new Set(input.activeLineups[state.attackingTeamId === state.homeTeamId ? 'home' : 'away']))
    expect(new Set(targets.defensive.map(({ playerId }) => playerId))).toEqual(new Set(input.activeLineups[state.attackingTeamId === state.homeTeamId ? 'away' : 'home']))
    expect(new Set([...targets.offensive, ...targets.defensive].map(({ position }) => `${position.x},${position.y}`)).size).toBe(10)
    expect([...targets.offensive, ...targets.defensive].every(({ position }) =>
      position.x >= 0 && position.x <= state.spatial.court.lengthMeters && position.y >= 0 && position.y <= state.spatial.court.widthMeters,
    )).toBe(true)
    expect(new Set(targets.offensive.map(({ role }) => role))).toEqual(new Set(['PG', 'SG', 'SF', 'PF', 'C']))
    expect(targets.offensive.find(({ playerId }) => playerId === input.ballHandlerId)?.role).toBe('PG')
    const basket = getSpatialPossessionView(input).attackingBasket
    const attackDirection = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
    expect(targets.offensive.every(({ position }) =>
      attackDirection * (position.x - state.spatial.court.lengthMeters / 2) > 0
      && attackDirection * (basket.x - position.x) > 0,
    )).toBe(true)

    const offenseIsHome = getSpatialPossessionView(input).offensiveTeamId === state.homeTeamId
    const offenseLineup = offenseIsHome ? state.activeLineups.home : state.activeLineups.away
    const offenseProfiles = offenseIsHome ? state.playerProfiles.home : state.playerProfiles.away
    const fallbackProfiles = offenseProfiles.filter((profile) => profile.playerId !== offenseLineup[4]).map((profile) => ({ ...profile, primaryPosition: 'PG' as const }))
    const playerProfiles = offenseIsHome
      ? { ...state.playerProfiles, home: fallbackProfiles }
      : { ...state.playerProfiles, away: fallbackProfiles }
    const fallbackRoles = assignBaseSpatialTargets({ ...input, playerProfiles }).offensive.map(({ role }) => role)
    expect(new Set(fallbackRoles)).toEqual(new Set(['PG', 'SG', 'SF', 'PF', 'C']))

    const nextOffensiveTeamId = state.attackingTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
    const nextOffensiveLineup = nextOffensiveTeamId === state.homeTeamId ? state.activeLineups.home : state.activeLineups.away
    const flipped = assignBaseSpatialTargets({ ...input, attackingTeamId: nextOffensiveTeamId, ballHandlerId: nextOffensiveLineup[0] })
    expect(new Set(flipped.offensive.map(({ teamId }) => teamId))).toEqual(new Set([nextOffensiveTeamId]))
    expect(new Set(flipped.defensive.map(({ teamId }) => teamId))).toEqual(new Set([state.attackingTeamId]))
  })

  it('targets a transition toward the new attacking basket and moves no farther than the shared step', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const nextAttackingTeamId = state.attackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    const nextOffense = nextAttackingTeamId === game.homeTeamId ? state.activeLineups.home : state.activeLineups.away
    const handlerId = nextOffense[0]!
    const input = { homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, attackingTeamId: nextAttackingTeamId, period: state.period, activeLineups: state.activeLineups, playerProfiles: state.playerProfiles, spatial: controlBallByPlayer(state.spatial, handlerId) }
    const targets = assignTransitionSpatialTargets(input)
    const moved = stepPlayersTowardTransitionTargets(input, 0.25)
    const basket = getSpatialPossessionView({ ...input, spatial: moved }).attackingBasket
    const offenseDirection = basket.x > moved.court.lengthMeters / 2 ? 1 : -1

    expect(targets.offense).toHaveLength(5)
    expect(targets.defense).toHaveLength(5)
    const handlerTarget = targets.offense.find((target) => target.playerId === handlerId)!
    const laneTargets = targets.offense.filter((target) => target.role === 'wingLane')
    const stopBallTarget = targets.defense.find((target) => target.role === 'stopBall')!
    const rimTarget = targets.defense.find((target) => target.role === 'protectRim')!
    expect(handlerTarget.role).toBe('ballHandler')
    expect(Math.sign(handlerTarget.position.x - state.spatial.players.find((player) => player.playerId === handlerId)!.position.x)).toBe(offenseDirection)
    expect(laneTargets).toHaveLength(2)
    expect(new Set(laneTargets.map((target) => target.position.y)).size).toBe(2)
    expect(stopBallTarget).toBeDefined()
    expect(rimTarget).toBeDefined()
    expect(targets.defense.filter((target) => target.role === 'retreat')).toHaveLength(3)
    expect(Math.hypot(stopBallTarget.position.x - input.spatial.ball.position.x, stopBallTarget.position.y - input.spatial.ball.position.y)).toBeLessThanOrEqual(1.25)
    const defenseBasket = offenseDirection > 0 ? state.spatial.court.baskets.left : state.spatial.court.baskets.right
    expect(Math.hypot(rimTarget.position.x - defenseBasket.x, rimTarget.position.y - defenseBasket.y)).toBeLessThan(2)
    for (const target of [...targets.offense, ...targets.defense]) {
      const before = input.spatial.players.find((player) => player.playerId === target.playerId)!
      const after = moved.players.find((player) => player.playerId === target.playerId)!
      const movedDistance = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y)
      if (target.role !== 'stopBall' && target.role !== 'protectRim') expect(Math.sign(target.position.x - before.position.x)).toBe(target.teamId === input.attackingTeamId ? offenseDirection : -offenseDirection)
      expect(movedDistance).toBeLessThanOrEqual(PLAYER_MAX_SPEED_METERS_PER_SECOND * 0.25 + 1e-9)
      expect(Math.hypot(after.position.x - target.position.x, after.position.y - target.position.y)).toBeLessThanOrEqual(Math.hypot(before.position.x - target.position.x, before.position.y - target.position.y))
    }
    expect(isSpatialStateInsideCourt(moved)).toBe(true)
  })

  it('mirrors offensive and defensive targets when the attacking basket changes', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const handlerId = openingHandlerId(state)
    const rightTargets = assignBaseSpatialTargets(baseSpacingInput({ ...state, period: 1 }, handlerId))
    const leftTargets = assignBaseSpatialTargets(baseSpacingInput({ ...state, period: 3 }, handlerId))

    for (const side of ['offensive', 'defensive'] as const) {
      const leftByPlayer = new Map(leftTargets[side].map((target) => [target.playerId, target.position]))
      for (const target of rightTargets[side]) {
        const mirrored = leftByPlayer.get(target.playerId)!
        expect(mirrored.x + target.position.x).toBeCloseTo(state.spatial.court.lengthMeters)
        expect(mirrored.y).toBeCloseTo(target.position.y)
      }
    }
  })

  it('places defenders between their paired offensive role and basket', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const input = baseSpacingInput(state, openingHandlerId(state))
    const targets = assignBaseSpatialTargets(input)
    const basket = getSpatialPossessionView(input).attackingBasket
    const offenseByRole = new Map(targets.offensive.map((target) => [target.role, target.position]))

    for (const defender of targets.defensive) {
      const offense = offenseByRole.get(defender.role)!
      const basketToDefender = Math.hypot(defender.position.x - basket.x, defender.position.y - basket.y)
      const basketToOffense = Math.hypot(offense.x - basket.x, offense.y - basket.y)
      expect(basketToDefender).toBeGreaterThan(0)
      expect(basketToDefender).toBeLessThan(basketToOffense)
    }
  })

  it('steps all players toward their base targets within the movement budget', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const handlerId = openingHandlerId(state)
    const input = { ...baseSpacingInput(state, handlerId), spatial: controlBallByPlayer(state.spatial, handlerId) }
    const targets = assignBaseSpatialTargets(input)
    const pgTarget = targets.offensive.find((target) => target.role === 'PG')!
    const before = input.spatial.players.find((player) => player.playerId === pgTarget.playerId)!
    const beforeDistance = Math.hypot(before.position.x - pgTarget.position.x, before.position.y - pgTarget.position.y)
    const stepped = stepPlayersTowardBaseSpacing(input, 0.25)
    const after = stepped.players.find((player) => player.playerId === pgTarget.playerId)!
    const afterDistance = Math.hypot(after.position.x - pgTarget.position.x, after.position.y - pgTarget.position.y)
    const distanceMoved = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y)
    for (const target of [...targets.offensive, ...targets.defensive]) {
      const start = input.spatial.players.find((player) => player.playerId === target.playerId)!.position
      const end = stepped.players.find((player) => player.playerId === target.playerId)!.position
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThanOrEqual(PLAYER_MAX_SPEED_METERS_PER_SECOND * 0.25 + 1e-9)
      expect(Math.hypot(end.x - target.position.x, end.y - target.position.y)).toBeLessThanOrEqual(Math.hypot(start.x - target.position.x, start.y - target.position.y))
    }
    const runtimeStepped = stepMatchSession(createMatchSession(createOptions(world, game.id, 12345, 67890))).session.state

    expect(afterDistance).toBeLessThan(beforeDistance)
    expect(distanceMoved).toBeLessThanOrEqual(PLAYER_MAX_SPEED_METERS_PER_SECOND * 0.25 + 1e-9)
    expect(stepped.ball).toMatchObject({ kind: 'playerControlled', playerId: handlerId, position: stepped.players.find((player) => player.playerId === handlerId)!.position })
    expect(isSpatialStateInsideCourt(stepped)).toBe(true)
    expect(runtimeStepped.spatial.players).not.toEqual(state.spatial.players)
  })

  it('resolves competing movement overrides to one final target per player and step', () => {
    const { world, game } = createScheduledGameWorld()
    const state = createMatchSession(createOptions(world, game.id, 12345, 67890)).state
    const handlerId = openingHandlerId(state)
    const input = { ...baseSpacingInput(state, handlerId), spatial: controlBallByPlayer(state.spatial, handlerId) }
    const current = input.spatial.players.find((player) => player.playerId === handlerId)!
    const firstTarget = { x: Math.min(input.spatial.court.lengthMeters, current.position.x + 2), y: current.position.y }
    const finalTarget = { x: current.position.x, y: Math.min(input.spatial.court.widthMeters, current.position.y + 2) }
    const profile = state.playerProfiles.home.find((candidate) => candidate.playerId === handlerId)
      ?? state.playerProfiles.away.find((candidate) => candidate.playerId === handlerId)!
    const resolved = stepPlayersTowardBaseSpacing(input, 0.25, [
      { playerId: handlerId, position: firstTarget },
      { playerId: handlerId, position: finalTarget },
    ])
    const expected = advancePlayerTowardTarget(input.spatial, handlerId, finalTarget, 0.25, profile.kinematics)

    expect(resolved.players.find((player) => player.playerId === handlerId)).toEqual(expected.players.find((player) => player.playerId === handlerId))
    expect(resolved.ball).toMatchObject({ kind: 'playerControlled', playerId: handlerId, position: expected.ball.position })
  })

  it('synchronizes the active spatial players on substitution and keeps the incoming player in the outgoing position', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 12345, 67890)
    const session = createMatchSession({ ...options, random: new FirstSportingRandom() })
    const playerOutId = session.state.activeLineups.home[0]!
    const playerInId = session.state.squads.home.find((playerId) => !session.state.activeLineups.home.includes(playerId))!
    const heldSpatial = controlBallByPlayer(session.state.spatial, playerOutId)
    const outgoingPosition = heldSpatial.ball.position
    const heldSession = { ...session, state: { ...session.state, spatial: heldSpatial } }

    const substituted = substitutePlayer(heldSession, { teamId: game.homeTeamId, playerOutId, playerInId })
    const spatialIds = substituted.state.spatial.players.map((player) => player.playerId)

    expect(spatialIds).toHaveLength(10)
    expect(spatialIds).not.toContain(playerOutId)
    expect(spatialIds).toContain(playerInId)
    expect(substituted.state.spatial.players.find((player) => player.playerId === playerInId)).toMatchObject({ teamId: game.homeTeamId, position: outgoingPosition })
    expect(substituted.state.spatial.ball).toEqual({ kind: 'playerControlled', playerId: playerInId, teamId: game.homeTeamId, position: outgoingPosition })
    expect(isSpatialStateInsideCourt(substituted.state.spatial)).toBe(true)
    expect(isSpatialStateCoherentWithPossession(substituted.state)).toBe(true)
  })

  it('derives offense, defense and basket from engine possession authority', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const view = getSpatialPossessionView(session.state)

    expect(view.offensiveTeamId).toBe(session.state.attackingTeamId)
    expect(view.defensiveTeamId).toBe(session.state.attackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.attackingBasket).toEqual(attackingBasketForTeam({ teamId: session.state.attackingTeamId, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, period: session.state.period, court: session.state.spatial.court }))
    expect(view.ballHandlerId).toBeUndefined()
    expect(isSpatialStateCoherentWithPossession(session.state)).toBe(true)
  })

  it('synchronizes a turnover possession flip without assigning a handler that gameplay did not resolve', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new TurnoverRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new NoCreditActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const previousLineup = previousAttackingTeamId === game.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away
    const expectedHandlerId = previousLineup[0]!
    const result = stepMatchSession(session)
    const deltaTimeSeconds = session.state.clockSecondsRemaining - result.session.state.clockSecondsRemaining
    const baseSpacing = stepPlayersTowardBaseSpacing({ ...baseSpacingInput(session.state, expectedHandlerId), spatial: controlBallByPlayer(session.state.spatial, expectedHandlerId) }, deltaTimeSeconds)
    const nextTeamId = previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    const expectedSpatial = releaseSpatialBall(baseSpacing)
    const view = getSpatialPossessionView(result.session.state)

    expect(result.newEvents.some((event) => event.type === 'turnover')).toBe(true)
    expect(view.offensiveTeamId).toBe(previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.defensiveTeamId).toBe(previousAttackingTeamId)
    expect(view.attackingBasket).toEqual(result.session.state.spatial.court.baskets.left)
    expect(view.ballHandlerId).toBeUndefined()
    expect(result.session.state.spatial).toEqual(expectedSpatial)
    expect(result.session.state.transitionIntent).toEqual({ attackingTeamId: nextTeamId })
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('clears screen, coverage, drive, cut, and help together when a credited turnover starts transition', () => {
    const { world, game } = createScheduledGameWorld()
    const continuingSession = withActivePickAndRollContext(createMatchSession({ ...withPassProfiles(createOptions(world, game.id, 1, 1)), random: new ForcedPassRandom(true), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }))
    const continued = stepMatchSession(continuingSession)

    expect(continued.newEvents.some((event) => event.type === 'passCompleted')).toBe(true)
    expect(continued.session.state.attackingTeamId).toBe(continuingSession.state.attackingTeamId)
    expect(continued.session.state.screenIntent).toBeUndefined()

    const session = withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new TurnoverRandom(), decisionRandom: new StealTurnoverRandom(), actorRandom: new FirstActorRandom() }))
    const oldAttackingTeamId = session.state.attackingTeamId
    const result = stepMatchSession(session)
    const turnover = result.newEvents.find((event) => event.type === 'turnover')
    const nextTeamId = oldAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    const view = getSpatialPossessionView(result.session.state)

    expect(turnover?.type).toBe('turnover')
    expect(result.session.state.attackingTeamId).toBe(nextTeamId)
    expect(result.session.state.offBallCut).toBeUndefined()
    expect(result.session.state.screenIntent).toBeUndefined()
    expect(result.session.state.driveIntent).toBeUndefined()
    expect(result.session.state.defensiveReaction).toBeUndefined()
    expect(view.offensiveTeamId).toBe(nextTeamId)
    expect(view.ballHandlerId).toBe(turnover?.type === 'turnover' ? turnover.stealPlayerId : undefined)
    expect(result.session.state.spatial.ball.kind).toBe('playerControlled')
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
    expect(assignTransitionSpatialTargets({ ...result.session.state, playerProfiles: result.session.state.playerProfiles }).offense.find((target) => target.playerId === view.ballHandlerId)?.role).toBe('ballHandler')

    const transitionState = result.session.state
    const passProfiles = {
      home: transitionState.playerProfiles.home.map((profile) => ({ ...profile, tendencies: { ...profile.tendencies, PASS_FIRST_BIAS: 100, ON_BALL_SCREENING_FREQUENCY: 0, CUT_FREQUENCY: 0, DRIVE_FREQUENCY: 0 } })),
      away: transitionState.playerProfiles.away.map((profile) => ({ ...profile, tendencies: { ...profile.tendencies, PASS_FIRST_BIAS: 100, ON_BALL_SCREENING_FREQUENCY: 0, CUT_FREQUENCY: 0, DRIVE_FREQUENCY: 0 } })),
    }
    const transitionSession = { ...result.session, random: new ForcedPassRandom(true), decisionRandom: new ZeroDecisionRandom(), state: { ...transitionState, playerProfiles: passProfiles } }
    const transitioned = stepMatchSession(transitionSession)
    const transitionElapsed = transitionState.clockSecondsRemaining - transitioned.session.state.clockSecondsRemaining
    const transitionInput = { homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, attackingTeamId: transitionState.attackingTeamId, period: transitionState.period, activeLineups: transitionState.activeLineups, playerProfiles: passProfiles, spatial: controlBallByPlayer(transitionState.spatial, view.ballHandlerId!) }
    const expectedTransition = stepPlayersTowardTransitionTargets(transitionInput, transitionElapsed)

    expect(transitioned.newEvents.some((event) => event.type === 'passCompleted')).toBe(true)
    expect(transitioned.session.state.spatial.players).toEqual(expectedTransition.players)
    expect(transitioned.session.state.transitionIntent).toBeUndefined()

    const settleSession = { ...transitioned.session, random: new MissAndOffensiveReboundRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }
    const settled = stepMatchSession(settleSession)
    const receiverId = getSpatialPossessionView(transitioned.session.state).ballHandlerId!
    const settleElapsed = transitioned.session.state.clockSecondsRemaining - settled.session.state.clockSecondsRemaining
    const settledBase = stepPlayersTowardBaseSpacing({ ...baseSpacingInput({ ...transitioned.session.state, playerProfiles: passProfiles }, receiverId), spatial: controlBallByPlayer(transitioned.session.state.spatial, receiverId) }, settleElapsed)

    expect(settled.session.state.spatial.players).toEqual(settledBase.players)
    const terminalTransitionEvent = settled.session.state.attackingTeamId !== transitioned.session.state.attackingTeamId
    expect(settled.session.state.transitionIntent !== undefined).toBe(terminalTransitionEvent)
  })

  it('continues a completed pass with the receiver holding the ball and enforces the pass-chain limit', () => {
    const { world, game } = createScheduledGameWorld()
    const options = withPassProfiles(createOptions(world, game.id, 1, 2))
    const session = createMatchSession({ ...options, random: new ForcedPassRandom(true), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const passerId = session.state.activeLineups.home[0]!
    const expectedReceiverId = session.state.activeLineups.home[1]!
    const completed = stepMatchSession(session)
    const pass = completed.newEvents.find((event) => event.type === 'passCompleted')
    const receiverSpatial = completed.session.state.spatial.players.find((player) => player.playerId === expectedReceiverId)!

    expect(pass).toMatchObject({ type: 'passCompleted', passerPlayerId: passerId, receiverPlayerId: expectedReceiverId })
    expect(completed.session.state.attackingTeamId).toBe(session.state.attackingTeamId)
    expect(completed.session.state.passesThisPossession).toBe(1)
    expect(completed.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: expectedReceiverId, position: receiverSpatial.position })
    expect(getSpatialPossessionView(completed.session.state).ballHandlerId).toBe(expectedReceiverId)

    const nextAction = stepMatchSession(completed.session)
    expect(nextAction.newEvents.some((event) => event.type === 'passCompleted')).toBe(false)
    const nextActorEvent = nextAction.newEvents.find((event) => event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover')
    expect(nextActorEvent && 'playerId' in nextActorEvent ? nextActorEvent.playerId : undefined).toBe(expectedReceiverId)
    expect(nextAction.session.state.passesThisPossession).toBe(0)
  })

  it('turns a failed pass into a possession change with coherent ball ownership', () => {
    const { world, game } = createScheduledGameWorld()
    const options = withPassProfiles(createOptions(world, game.id, 1, 2))
    const session = createMatchSession({ ...options, random: new ForcedPassRandom(false), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const offenseLineup = previousAttackingTeamId === game.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away
    const passerId = offenseLineup[0]!
    const receiverId = offenseLineup[1]!
    const result = stepMatchSession(session)
    const turnover = result.newEvents.find((event) => event.type === 'turnover')
    const nextTeamId = previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId

    expect(turnover).toMatchObject({ type: 'turnover', playerId: passerId, turnoverType: 'failedPass', passTargetPlayerId: receiverId })
    expect(result.session.state.attackingTeamId).toBe(nextTeamId)
    expect(result.session.state.passesThisPossession).toBe(0)
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
    if (result.session.state.spatial.ball.kind === 'playerControlled') expect(result.session.state.spatial.ball.teamId).toBe(nextTeamId)
  })

  it('assigns a credited steal to the existing defensive actor', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new TurnoverRandom(), decisionRandom: new StealTurnoverRandom(), actorRandom: new FirstActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const result = stepMatchSession(session)
    const turnover = result.newEvents.find((event) => event.type === 'turnover')
    const view = getSpatialPossessionView(result.session.state)

    expect(turnover?.type).toBe('turnover')
    if (turnover?.type !== 'turnover' || turnover.stealPlayerId === undefined) throw new Error('Expected a credited steal')
    expect(view.offensiveTeamId).toBe(previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.ballHandlerId).toBe(turnover.stealPlayerId)
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: turnover.stealPlayerId, teamId: view.offensiveTeamId })
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('releases the completed handler and follows engine possession after a made basket', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new MadeBasketRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const previousLineup = previousAttackingTeamId === game.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away
    const result = stepMatchSession(session)
    const deltaTimeSeconds = session.state.clockSecondsRemaining - result.session.state.clockSecondsRemaining
    const spatialBeforeShot = stepPlayersTowardBaseSpacing({ ...baseSpacingInput(session.state, previousLineup[0]!), spatial: controlBallByPlayer(session.state.spatial, previousLineup[0]!) }, deltaTimeSeconds)
    const nextTeamId = previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId
    const expectedSpatial = releaseSpatialBall(spatialBeforeShot)
    const view = getSpatialPossessionView(result.session.state)

    expect(result.newEvents.some((event) => event.type === 'shotMade')).toBe(true)
    expect(view.offensiveTeamId).toBe(previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.ballHandlerId).toBeUndefined()
    expect(result.session.state.spatial.ball.kind).toBe('unassigned')
    expect(result.session.state.spatial).toEqual(expectedSpatial)
    expect(result.session.state.transitionIntent).toEqual({ attackingTeamId: nextTeamId })
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('synchronizes rebound control and does not spend RNG for spatial bookkeeping', () => {
    const { world, game } = createScheduledGameWorld()
    const random = new MissAndDefensiveReboundRandom()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random, decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const previousLineup = session.state.attackingTeamId === game.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away
    const result = stepMatchSession(session)
    const deltaTimeSeconds = session.state.clockSecondsRemaining - result.session.state.clockSecondsRemaining
    const spatialBeforeShot = stepPlayersTowardBaseSpacing({ ...baseSpacingInput(session.state, previousLineup[0]!), spatial: controlBallByPlayer(session.state.spatial, previousLineup[0]!) }, deltaTimeSeconds)
    const rebound = result.newEvents.find((event) => event.type === 'rebound')
    const view = getSpatialPossessionView(result.session.state)
    const holder = result.session.state.spatial.players.find((player) => player.playerId === rebound?.playerId)
    const expectedSpatial = rebound?.type === 'rebound' ? controlBallByPlayer(spatialBeforeShot, rebound.playerId) : undefined

    expect(result.newEvents.some((event) => event.type === 'shotMissed')).toBe(true)
    expect(rebound).toBeDefined()
    expect(view.offensiveTeamId).toBe(rebound!.teamId)
    expect(view.ballHandlerId).toBe(rebound!.playerId)
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: rebound!.playerId, teamId: rebound!.teamId, position: holder!.position })
    expect(result.session.state.spatial).toEqual(expectedSpatial)
    expect(result.session.state.transitionIntent).toEqual({ attackingTeamId: rebound!.teamId })
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
    expect(random).toMatchObject({ nextIntCalls: 1, nextCalls: 1, chanceCalls: 3 })
  })

  it('clears old P&R and help state after a defensive rebound and advances the rebounder', () => {
    const { world, game } = createScheduledGameWorld()
    const session = withActivePickAndRollContext(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new MissAndDefensiveReboundRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }))
    const oldAttackingTeamId = session.state.attackingTeamId
    const result = stepMatchSession(session)
    const rebound = result.newEvents.find((event) => event.type === 'rebound')
    const view = getSpatialPossessionView(result.session.state)
    if (rebound?.type !== 'rebound' || rebound.reboundType !== 'defensive') throw new Error('Expected a defensive rebound')

    expect(result.session.state.attackingTeamId).toBe(rebound.teamId)
    expect(rebound.teamId).not.toBe(oldAttackingTeamId)
    expect(view.ballHandlerId).toBe(rebound.playerId)
    expect(result.session.state.offBallCut).toBeUndefined()
    expect(result.session.state.screenIntent).toBeUndefined()
    expect(result.session.state.driveIntent).toBeUndefined()
    expect(result.session.state.defensiveReaction).toBeUndefined()
    expect(assignTransitionSpatialTargets(result.session.state).offense.find((target) => target.playerId === rebound.playerId)?.role).toBe('ballHandler')
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('keeps possession and gives the ball to the rebounder on an offensive rebound', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new MissAndOffensiveReboundRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const offenseLineup = previousAttackingTeamId === game.homeTeamId ? session.state.activeLineups.home : session.state.activeLineups.away
    const result = stepMatchSession(session)
    const deltaTimeSeconds = session.state.clockSecondsRemaining - result.session.state.clockSecondsRemaining
    const spatialBeforeShot = stepPlayersTowardBaseSpacing({ ...baseSpacingInput(session.state, offenseLineup[0]!), spatial: controlBallByPlayer(session.state.spatial, offenseLineup[0]!) }, deltaTimeSeconds)
    const rebound = result.newEvents.find((event) => event.type === 'rebound')
    const rebounder = rebound === undefined ? undefined : result.session.state.spatial.players.find((player) => player.playerId === rebound.playerId)
    const expectedSpatial = rebound?.type === 'rebound' ? controlBallByPlayer(spatialBeforeShot, rebound.playerId) : undefined

    expect(rebound).toMatchObject({ type: 'rebound', teamId: previousAttackingTeamId, reboundType: 'offensive' })
    expect(result.session.state.attackingTeamId).toBe(previousAttackingTeamId)
    expect(rebounder).toBeDefined()
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: rebound!.playerId, teamId: previousAttackingTeamId, position: rebounder!.position })
    expect(result.session.state.spatial).toEqual(expectedSpatial)
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('releases the ball and resolves the switched basket at a period transition', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new FirstSportingRandom() })
    const holderId = session.state.activeLineups.home[0]!
    const atSecondPeriodEnd = {
      ...session,
      state: { ...session.state, period: 2, clockSecondsRemaining: 1, spatial: controlBallByPlayer(session.state.spatial, holderId) },
    }
    const transition = stepMatchSession(atSecondPeriodEnd).session.state
    const view = getSpatialPossessionView(transition)

    expect(transition.period).toBe(3)
    expect(view.offensiveTeamId).toBe(game.homeTeamId)
    expect(view.attackingBasket).toEqual(transition.spatial.court.baskets.left)
    expect(transition.spatial.ball.kind).toBe('unassigned')
    expect(isSpatialStateCoherentWithPossession(transition)).toBe(true)
  })

  it('resumes after five steps with the same final simulation as uninterrupted stepping', () => {
    const { world, game } = createScheduledGameWorld()
    let resumed = createMatchSession(createOptions(world, game.id, 12345, 67890))
    for (let step = 0; step < 5; step += 1) resumed = stepMatchSession(resumed).session
    const resumedSimulation = toMatchSimulation(runToComplete(resumed))
    const uninterruptedSimulation = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(resumedSimulation).toEqual(uninterruptedSimulation)
  })

  it('handles overtime incrementally and rejects a step after completion', () => {
    const { world, game } = createScheduledGameWorld()
    const completeSession = runToComplete(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new OvertimeRandom() }))
    const simulation = toMatchSimulation(completeSession)

    expect(simulation.events.some((event) => event.type === 'periodStart' && event.period === 5)).toBe(true)
    expect(completeSession.state.isComplete).toBe(true)
    expect(simulation.events.at(-1)).toMatchObject({ type: 'gameEnd' })
    expect(() => stepMatchSession(completeSession)).toThrow(MatchSimulationError)
  })

  it('keeps sequences monotonic and clocks valid across multiple steps', () => {
    const { world, game } = createScheduledGameWorld()
    let session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    for (let step = 0; step < 10; step += 1) session = stepMatchSession(session).session

    for (let index = 0; index < session.state.events.length; index += 1) {
      const event = session.state.events[index]!
      expect(event.sequence).toBe(index + 1)
      expect(event.clockSecondsRemaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('resolves game-clock rules from the game\'s actual competition, not a global brand constant (Issue #9)', () => {
    const { world, game } = createScheduledGameWorld()
    const ncaaMenWorld = createGameWorld({ ...worldInputFor(world), competitions: Object.values(world.competitions).map((competition) => ({ ...competition, rules: { ...competition.rules, gameFormat: NCAA_MEN_GAME_FORMAT } })) })
    const session = createMatchSession(createOptions(ncaaMenWorld, game.id, 1, 2))

    expect(session.state.clockRules).toEqual({ periodCount: 2, periodSeconds: 1200, overtimeSeconds: 300 })
    expect(session.state.clockSecondsRemaining).toBe(1200)
    expect(session.state.events[0]).toMatchObject({ clockSecondsRemaining: 1200 })
  })

  it('validates squads and initial lineups against them', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 1, 2)

    expect(() => createMatchSession({ ...options, squads: { ...options.squads, home: options.squads.home.slice(0, 4) } })).toThrow('Home squad must contain at least 5 players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, home: [...options.squads.home.slice(0, 5), options.squads.home[0]!] } })).toThrow('Home squad cannot contain duplicate players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, away: [...options.squads.away.slice(0, 5), options.squads.away[0]!] } })).toThrow('Away squad cannot contain duplicate players')
    expect(() => createMatchSession({ ...options, squads: { ...options.squads, away: [...options.squads.away.slice(0, 4), options.squads.home[0]!] } })).toThrow('Home and away squads cannot share players')
    expect(() => createMatchSession({ ...options, lineups: { ...options.lineups, home: [...options.lineups.home.slice(0, 4), options.squads.home[5]!] }, squads: { ...options.squads, home: options.squads.home.slice(0, 5) } })).toThrow('Home lineup players must belong to the home squad')
    expect(() => createMatchSession({ ...options, playerProfiles: { ...options.playerProfiles, home: options.playerProfiles.home.slice(1) } })).toThrow('Home player profiles must contain exactly one profile per squad player')
    expect(() => createMatchSession({ ...options, playerProfiles: { ...options.playerProfiles, home: [...options.playerProfiles.home.slice(0, -1), options.playerProfiles.home[0]!] } })).toThrow('Home player profiles cannot contain duplicates')
  })

  it('records valid substitutions and permits re-entry without advancing match state', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const playerOutId = session.state.activeLineups.home[0]!
    const playerInId = session.state.squads.home[5]!
    const substituted = substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId, playerInId })
    const event = substituted.state.events.at(-1)!

    expect(substituted.state.initialLineups).toEqual(session.state.activeLineups)
    expect(substituted.state.activeLineups.home).toEqual([playerInId, ...session.state.activeLineups.home.slice(1)])
    expect(event).toMatchObject({ type: 'substitution', teamId: session.state.homeTeamId, playerOutId, playerInId, clockSecondsRemaining: session.state.clockSecondsRemaining, homeScore: session.state.homeScore, awayScore: session.state.awayScore, sequence: session.state.nextSequence })
    const reentered = substitutePlayer(substituted, { teamId: session.state.homeTeamId, playerOutId: playerInId, playerInId: playerOutId })
    expect(reentered.state.activeLineups).toEqual(session.state.activeLineups)
  })

  it('rejects invalid substitutions and substitutions after completion', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const active = session.state.activeLineups.home[0]!
    const bench = session.state.squads.home[5]!
    const rival = session.state.squads.away[5]!
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: bench, playerInId: active })).toThrow('player out must be active')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: active })).toThrow('must differ')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: session.state.activeLineups.home[1]! })).toThrow('already active')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: playerIdFromString('not-in-squad') })).toThrow('must belong to that team squad')
    expect(() => substitutePlayer(session, { teamId: session.state.homeTeamId, playerOutId: active, playerInId: rival })).toThrow('opposing team')
    const complete = runToComplete(session)
    expect(() => substitutePlayer(complete, { teamId: complete.state.homeTeamId, playerOutId: active, playerInId: bench })).toThrow('completed')
  })

  it('does not consume RNG and uses the active lineup for subsequent actors', () => {
    const { world, game } = createScheduledGameWorld()
    const baseline = createMatchSession(createOptions(world, game.id, 12345, 67890))
    const first = stepMatchSession(baseline)
    const outId = baseline.state.activeLineups.home[0]!
    const inId = baseline.state.squads.home[5]!
    const restored = substitutePlayer(substitutePlayer(createMatchSession(createOptions(world, game.id, 12345, 67890)), { teamId: baseline.state.homeTeamId, playerOutId: outId, playerInId: inId }), { teamId: baseline.state.homeTeamId, playerOutId: inId, playerInId: outId })
    const second = stepMatchSession(restored)
    expect(second.newEvents.map(withoutSequence)).toEqual(first.newEvents.map(withoutSequence))

    const subbed = substitutePlayer(createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new FirstSportingRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() }), { teamId: game.homeTeamId, playerOutId: createOptions(world, game.id, 1, 1).lineups.home[0]!, playerInId: world.teams[game.homeTeamId]!.rosterPlayerIds[5]! })
    const afterSub = stepMatchSession(subbed)
    const sporting = afterSub.newEvents.find((event) => event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover')!
    expect(sporting).toMatchObject({ teamId: game.homeTeamId, playerId: subbed.state.activeLineups.home[0] })
    if (sporting.type === 'shotMade' || sporting.type === 'shotMissed') {
      const assignments = calculateDefensiveAssignments(subbed.state.activeLineups.home, subbed.state.activeLineups.away, [...subbed.state.playerProfiles.home, ...subbed.state.playerProfiles.away])
      expect(sporting.defenderPlayerId).toBe(assignments.find((assignment) => assignment.offensivePlayerId === sporting.playerId)?.defensivePlayerId)
      expect(subbed.state.activeLineups.away).toContain(sporting.defenderPlayerId)
    }
  })

  it('projects active lineups from an ordered partial substitution stream', () => {
    const { world, game } = createScheduledGameWorld()
    const initial = lineupsFor(world, game)
    const squad = squadsFor(world, game)
    const first = { sequence: 1, period: 1, clockSecondsRemaining: 500, type: 'substitution' as const, teamId: game.homeTeamId, playerOutId: initial.home[0]!, playerInId: squad.home[5]!, homeScore: 0, awayScore: 0 }
    const second = { ...first, sequence: 2, playerOutId: initial.home[1]!, playerInId: squad.home[6]! }
    const third = { ...first, sequence: 3, playerOutId: squad.home[5]!, playerInId: initial.home[0]! }
    expect(calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first])).toEqual({ home: [squad.home[5]!, ...initial.home.slice(1)], away: initial.away })
    expect(calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first, second, third]).home).toEqual([initial.home[0]!, squad.home[6]!, ...initial.home.slice(2)])
    expect(() => calculateActiveLineups(initial, game.homeTeamId, game.awayTeamId, [first, first])).toThrow('player out must be active')
  })
})

function runToComplete(initialSession: ReturnType<typeof createMatchSession>) {
  let session = initialSession
  while (!session.state.isComplete) session = stepMatchSession(session).session
  return session
}

function withoutSequence(event: { readonly sequence: number }) { const { sequence: _sequence, ...rest } = event; return rest }

function regressionSummary(simulation: ReturnType<typeof simulateMatchDetailed>) {
  const count = (predicate: (event: (typeof simulation.events)[number]) => boolean) => simulation.events.filter(predicate).length
  return {
    finalScore: simulation.finalScore,
    eventCount: simulation.events.length,
    homeTurnovers: count((event) => event.type === 'turnover' && event.teamId === simulation.homeTeamId),
    awayTurnovers: count((event) => event.type === 'turnover' && event.teamId === simulation.awayTeamId),
    homeRebounds: count((event) => event.type === 'rebound' && event.teamId === simulation.homeTeamId),
    awayRebounds: count((event) => event.type === 'rebound' && event.teamId === simulation.awayTeamId),
    homeAssists: count((event) => event.type === 'shotMade' && event.teamId === simulation.homeTeamId && event.assistPlayerId !== undefined),
    awayAssists: count((event) => event.type === 'shotMade' && event.teamId === simulation.awayTeamId && event.assistPlayerId !== undefined),
  }
}

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generated = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generated, seasonId: Object.values(generated.seasons)[0]!.id })
  return { world: createGameWorld({ currentDate: generated.currentDate, userCoachId: generated.userCoachId, countries: Object.values(generated.countries), coaches: Object.values(generated.coaches), players: Object.values(generated.players), teams: Object.values(generated.teams), staffPeople: Object.values(generated.staffPeopleById), teamStaffAssignments: Object.values(generated.teamStaffAssignmentsById), competitions: Object.values(generated.competitions), seasons: Object.values(generated.seasons), games }), game: games[0]! }
}

function worldInputFor(world: GameWorld) {
  return { currentDate: world.currentDate, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), staffPeople: Object.values(world.staffPeopleById), teamStaffAssignments: Object.values(world.teamStaffAssignmentsById), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games) }
}

function createOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], sportingSeed: number, actorSeed: number): SimulateMatchOptions {
  const game = world.games[gameId]!
  return { world, gameId, homeStrength: { teamId: game.homeTeamId, value: 50 }, awayStrength: { teamId: game.awayTeamId, value: 50 }, lineups: lineupsFor(world, game), squads: squadsFor(world, game), playerProfiles: profilesFor(world, game), random: new SeededRandomSource(sportingSeed), decisionRandom: new SeededRandomSource(sportingSeed + 1), actorRandom: new SeededRandomSource(actorSeed) }
}

function withPassProfiles(options: SimulateMatchOptions): SimulateMatchOptions {
  const enhance = (profiles: SimulateMatchOptions['playerProfiles']['home']) => profiles.map((profile) => ({
    ...profile,
    tendencies: { ...profile.tendencies, PASS_FIRST_BIAS: 100 },
    offense: { ...profile.offense, ballSecurity: 100 },
    passing: { accuracy: 100, vision: 100, timing: 100 },
    defense: { ...profile.defense, pointOfAttack: 0, mobility: 0, steal: 100 },
  }))
  return { ...options, playerProfiles: { home: enhance(options.playerProfiles.home), away: enhance(options.playerProfiles.away) } }
}

function baseSpacingInput(state: ReturnType<typeof createMatchSession>['state'], ballHandlerId: ReturnType<typeof createMatchSession>['state']['activeLineups']['home'][number]) {
  return { homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, attackingTeamId: state.attackingTeamId, period: state.period, activeLineups: state.activeLineups, playerProfiles: state.playerProfiles, spatial: state.spatial, ballHandlerId }
}

function openingHandlerId(state: ReturnType<typeof createMatchSession>['state']) {
  return state.attackingTeamId === state.homeTeamId ? state.activeLineups.home[0]! : state.activeLineups.away[0]!
}

function withOpenOffBallCutContext(
  session: ReturnType<typeof createMatchSession>,
  cutterIndex: number,
  options: { readonly passFirstBias?: number } = {},
) {
  const state = session.state
  const offenseIsHome = state.attackingTeamId === state.homeTeamId
  const offenseKey = offenseIsHome ? 'home' : 'away'
  const defenseKey = offenseIsHome ? 'away' : 'home'
  const offense = state.activeLineups[offenseKey]
  const handlerId = offense[0]!
  const cutterId = offense[cutterIndex]!
  const basket = getSpatialPossessionView(state).attackingBasket
  const direction = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
  const playerProfiles = {
    ...state.playerProfiles,
    [offenseKey]: state.playerProfiles[offenseKey].map((profile) => ({
      ...profile,
      tendencies: {
        ...profile.tendencies,
        CUT_FREQUENCY: profile.playerId === cutterId ? 100 : 0,
        ON_BALL_SCREENING_FREQUENCY: 0,
        ...(profile.playerId === handlerId ? { PASS_FIRST_BIAS: options.passFirstBias ?? 0, DRIVE_FREQUENCY: 0, PULLUP_FREQUENCY: 0 } : {}),
      },
    })),
  }
  const spatial = {
    ...state.spatial,
    players: state.spatial.players.map((player) => player.playerId === handlerId
      ? { ...player, position: { x: basket.x - direction * 9, y: basket.y }, velocity: { x: 0, y: 0 } }
      : player.playerId === cutterId
        ? { ...player, position: { x: basket.x - direction * 5.8, y: basket.y }, velocity: { x: 0, y: 0 } }
        : state.activeLineups[defenseKey].includes(player.playerId)
          ? { ...player, position: { x: state.spatial.court.lengthMeters / 2, y: player.position.y < basket.y ? 0.2 : state.spatial.court.widthMeters - 0.2 }, velocity: { x: 0, y: 0 } }
          : player),
  }
  return {
    handlerId,
    cutterId,
    session: {
      ...session,
      state: {
        ...state,
        spatial: controlBallByPlayer(spatial, handlerId),
        playerProfiles,
        offBallCut: undefined,
        screenIntent: state.offensiveAction?.kind === 'PICK_AND_ROLL' ? state.screenIntent : undefined,
        driveIntent: state.offensiveAction?.kind === 'PICK_AND_ROLL' ? state.driveIntent : undefined,
      },
    },
  }
}

function withActivePickAndRollContext(session: ReturnType<typeof createMatchSession>) {
  const state = session.state
  const offenseIsHome = state.attackingTeamId === state.homeTeamId
  const offense = offenseIsHome ? state.activeLineups.home : state.activeLineups.away
  const defense = offenseIsHome ? state.activeLineups.away : state.activeLineups.home
  const offenseProfiles = offenseIsHome ? state.playerProfiles.home : state.playerProfiles.away
  const defenseProfiles = offenseIsHome ? state.playerProfiles.away : state.playerProfiles.home
  const handlerId = offense[0]!
  const screenerId = offense[1]!
  const assignments = calculateDefensiveAssignments(offense, defense, [...offenseProfiles, ...defenseProfiles])
  const handlerDefenderId = assignments.find((assignment) => assignment.offensivePlayerId === handlerId)!.defensivePlayerId
  const screenerDefenderId = assignments.find((assignment) => assignment.offensivePlayerId === screenerId)!.defensivePlayerId
  const spatial = controlBallByPlayer(state.spatial, handlerId)
  const basket = getSpatialPossessionView({ ...state, spatial }).attackingBasket
  const screenIntent = { ...createScreenIntent({ screenerId, ballHandlerId: handlerId, defenderId: handlerDefenderId, screenerDefenderId, spatial, attackingBasket: basket }), phase: 'set' as const, stepsRemaining: 2 }
  const currentPlan = offenseIsHome ? state.coachingState.away.currentTacticalPlan : state.coachingState.home.currentTacticalPlan
  const defensePlan = { ...currentPlan, defense: { ...currentPlan.defense, pickAndRollCoverage: 'drop' as const } }
  const coachingState = offenseIsHome
    ? { ...state.coachingState, away: { currentTacticalPlan: defensePlan } }
    : { ...state.coachingState, home: { currentTacticalPlan: defensePlan } }
  const helperId = defense.find((playerId) => playerId !== handlerDefenderId && playerId !== screenerDefenderId)!
  const protectedPlayerId = assignments.find((assignment) => assignment.defensivePlayerId === helperId)!.offensivePlayerId
  const stateWithContext = {
    ...state,
    spatial,
    coachingState,
    screenIntent,
    offensiveAction: createOffensiveAction({ kind: 'PICK_AND_ROLL', teamId: state.attackingTeamId, initiatorId: handlerId, participantIds: [handlerId, screenerId], activeLineup: offense }),
    driveIntent: { handlerId, defenderId: handlerDefenderId, target: basket, stepsRemaining: 2 },
    offBallCut: { type: 'rimCut' as const, teamId: state.attackingTeamId, playerId: offense[2]!, target: basket, stepsRemaining: 2 },
    defensiveReaction: { defenderId: helperId, protectedPlayerId, threatPlayerId: handlerId, type: 'drive' as const, target: basket, phase: 'HELP' as const },
  }
  return { ...session, state: stateWithContext }
}

function handoffActors(state: ReturnType<typeof createMatchSession>['state']) {
  const action = state.offensiveAction!
  return { giverId: action.initiatorId, receiverId: action.participantIds.find((playerId) => playerId !== action.initiatorId)! }
}

function withHandoffContext(
  session: ReturnType<typeof createMatchSession>,
  receiverNearby: boolean,
  frequency: { readonly drive: number; readonly shot: number; readonly pass: number } = { drive: 0, shot: 0, pass: 0 },
) {
  const state = session.state
  const offenseIsHome = state.attackingTeamId === state.homeTeamId
  const offenseKey = offenseIsHome ? 'home' : 'away'
  const offense = state.activeLineups[offenseKey]
  const giverId = offense[0]!
  const receiverId = offense[1]!
  let spatial = controlBallByPlayer(state.spatial, giverId)
  const giver = spatial.players.find((player) => player.playerId === giverId)!
  spatial = {
    ...spatial,
    players: spatial.players.map((player) => player.playerId !== receiverId ? player : {
      ...player,
      position: receiverNearby
        ? { x: giver.position.x + (giver.position.x + 0.4 < spatial.court.lengthMeters - 0.5 ? 0.4 : -0.4), y: giver.position.y }
        : { x: giver.position.x < spatial.court.lengthMeters / 2 ? spatial.court.lengthMeters - 2 : 2, y: spatial.court.widthMeters - giver.position.y },
      velocity: { x: 0, y: 0 },
    }),
  }
  const playerProfiles = {
    ...state.playerProfiles,
    [offenseKey]: state.playerProfiles[offenseKey].map((profile) => profile.playerId === receiverId
      ? { ...profile, tendencies: { ...profile.tendencies, DRIVE_FREQUENCY: frequency.drive, SHOT_FREQUENCY: frequency.shot, PULLUP_FREQUENCY: frequency.shot, ADVANTAGE_PASS_FREQUENCY: frequency.pass }, ...(receiverNearby ? {} : { kinematics: { maxSpeedMps: 0.05, accelerationMps2: 0.05, brakingMps2: 0.05 } }) }
      : profile),
  }
  return {
    ...session,
    state: {
      ...state,
      spatial,
      playerProfiles,
      offBallCut: undefined,
      screenIntent: undefined,
      driveIntent: undefined,
      offensiveAction: createOffensiveAction({ kind: 'HANDOFF', teamId: state.attackingTeamId, initiatorId: giverId, participantIds: [giverId, receiverId], activeLineup: offense }),
    },
  }
}

function withIsolationContext(
  session: ReturnType<typeof createMatchSession>,
  frequency: { readonly drive: number; readonly shot: number; readonly pass: number },
) {
  const state = session.state
  const offenseIsHome = state.attackingTeamId === state.homeTeamId
  const offense = offenseIsHome ? state.activeLineups.home : state.activeLineups.away
  const handlerId = offense[0]!
  const spatial = controlBallByPlayer(state.spatial, handlerId)
  const playerProfiles = {
    ...state.playerProfiles,
    [offenseIsHome ? 'home' : 'away']: (offenseIsHome ? state.playerProfiles.home : state.playerProfiles.away).map((profile) => profile.playerId === handlerId
      ? { ...profile, tendencies: { ...profile.tendencies, DRIVE_FREQUENCY: frequency.drive, SHOT_FREQUENCY: frequency.shot, PULLUP_FREQUENCY: frequency.shot, ADVANTAGE_PASS_FREQUENCY: frequency.pass, PASS_FIRST_BIAS: frequency.pass } }
      : profile),
  }
  return {
    ...session,
    state: {
      ...state,
      spatial,
      playerProfiles,
      screenIntent: undefined,
      offBallCut: undefined,
      driveIntent: undefined,
      offensiveAction: createOffensiveAction({ kind: 'ISOLATION', teamId: state.attackingTeamId, initiatorId: handlerId, participantIds: [handlerId], activeLineup: offense }),
    },
  }
}

function withPostUpContext(
  session: ReturnType<typeof createMatchSession>,
  frequency: { readonly backDown: number; readonly shot: number; readonly pass: number },
  validPosition = true,
) {
  const state = session.state
  const offenseIsHome = state.attackingTeamId === state.homeTeamId
  const offenseKey = offenseIsHome ? 'home' : 'away'
  const defenseKey = offenseIsHome ? 'away' : 'home'
  const offense = state.activeLineups[offenseKey]
  const defense = state.activeLineups[defenseKey]
  const postPlayerId = offense[2]!
  const playerProfiles = {
    ...state.playerProfiles,
    [offenseKey]: state.playerProfiles[offenseKey].map((profile) => ({
      ...profile,
      tendencies: profile.playerId === postPlayerId
        ? { ...profile.tendencies, POST_UP_FREQUENCY: frequency.backDown, RIM_ATTEMPT_FREQUENCY: frequency.shot, SHOT_FREQUENCY: frequency.shot, ADVANTAGE_PASS_FREQUENCY: frequency.pass, PASS_FIRST_BIAS: frequency.pass, ON_BALL_SCREENING_FREQUENCY: 0, CUT_FREQUENCY: 0 }
        : { ...profile.tendencies, ON_BALL_SCREENING_FREQUENCY: 0, CUT_FREQUENCY: 0 },
    })),
  }
  const assignments = calculateDefensiveAssignments(offense, defense, [...playerProfiles.home, ...playerProfiles.away], state.defensiveMatchups?.[defenseKey])
  const defenderId = assignments.find((assignment) => assignment.offensivePlayerId === postPlayerId)!.defensivePlayerId
  const basket = getSpatialPossessionView(state).attackingBasket
  const attackDirection = basket.x > state.spatial.court.lengthMeters / 2 ? 1 : -1
  const postPosition = validPosition
    ? { x: basket.x - attackDirection * 5.4, y: basket.y }
    : { x: state.spatial.court.lengthMeters / 2, y: state.spatial.court.widthMeters / 2 }
  const defenderPosition = { x: postPosition.x + attackDirection * 0.9, y: postPosition.y }
  const positionedSpatial = {
    ...state.spatial,
    players: state.spatial.players.map((player) => player.playerId === postPlayerId
      ? { ...player, position: postPosition, velocity: { x: 0, y: 0 } }
      : player.playerId === defenderId
        ? { ...player, position: defenderPosition, velocity: { x: 0, y: 0 } }
        : player),
  }
  const spatial = controlBallByPlayer(positionedSpatial, postPlayerId)
  return {
    ...session,
    state: {
      ...state,
      spatial,
      playerProfiles,
      screenIntent: undefined,
      offBallCut: undefined,
      driveIntent: undefined,
      offensiveAction: createOffensiveAction({ kind: 'POST_UP', teamId: state.attackingTeamId, initiatorId: postPlayerId, participantIds: [postPlayerId], activeLineup: offense }),
    },
  }
}

function withScreenerOnAssignedDefenderRoute(session: ReturnType<typeof createMatchSession>) {
  const state = session.state
  const screen = state.screenIntent!
  const spatial = controlBallByPlayer(state.spatial, screen.ballHandlerId)
  const targets = assignBaseSpatialTargets({ ...baseSpacingInput(state, screen.ballHandlerId), spatial })
  const defenderTarget = targets.defensive.find((target) => target.playerId === screen.defenderId)!.position
  const defender = spatial.players.find((player) => player.playerId === screen.defenderId)!.position
  const routeMidpoint = { x: (defender.x + defenderTarget.x) / 2, y: (defender.y + defenderTarget.y) / 2 }
  const routeSpatial = { ...spatial, players: spatial.players.map((player) => player.playerId === screen.screenerId ? { ...player, position: routeMidpoint } : player) }
  return { ...session, state: { ...state, spatial: routeSpatial, screenIntent: { ...screen, target: routeMidpoint } } }
}

function profilesFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) } }

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds } }

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
}

class OvertimeRandom implements RandomSource {
  private outcomes = 0
  private chanceCallsSinceOutcome = 0
  next(): number { this.outcomes += 1; this.chanceCallsSinceOutcome = 0; return 0.99 }
  nextInt(): number { return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(_probability: number): boolean { if (this.outcomes === 0) return true; this.chanceCallsSinceOutcome += 1; return this.chanceCallsSinceOutcome === 2 || (this.chanceCallsSinceOutcome === 1 && this.outcomes === 101) }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class FirstSportingRandom implements RandomSource {
  next(): number { return 0.5 }
  nextInt(minInclusive: number): number { return minInclusive }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(probability: number): boolean { return probability === 0.5 }
  pick<Item>(items: readonly Item[]): Item { return items[0]! }
}

class TurnoverRandom extends FirstSportingRandom {
  next(): number { return 0 }
}

class StealTurnoverRandom extends TurnoverRandom {
  chance(_probability: number): boolean { return true }
}

class MadeBasketRandom extends FirstSportingRandom {
  next(): number { return 0.99 }
  chance(_probability: number): boolean { return true }
}

class MissAndDefensiveReboundRandom extends FirstSportingRandom {
  public nextCalls = 0
  public nextIntCalls = 0
  public chanceCalls = 0
  next(): number { this.nextCalls += 1; return 0.99 }
  nextInt(minInclusive: number): number { this.nextIntCalls += 1; return minInclusive }
  chance(_probability: number): boolean { this.chanceCalls += 1; return this.chanceCalls === 1 }
}

class MissAndOffensiveReboundRandom extends FirstSportingRandom {
  private chanceCalls = 0
  chance(_probability: number): boolean { this.chanceCalls += 1; return this.chanceCalls === 1 || this.chanceCalls === 3 }
}

class FirstActorRandom extends FirstSportingRandom {}

class NoCreditActorRandom extends FirstActorRandom { chance(_probability: number): boolean { return false } }

class ZeroDecisionRandom extends FirstSportingRandom { next(): number { return 0 } }

class CertainDecisionRandom extends ZeroDecisionRandom { chance(probability: number): boolean { return probability > 0 } }

class ForcedPassRandom extends FirstSportingRandom {
  public constructor(private readonly completePass: boolean) { super() }
  next(): number { return 0.2 }
  chance(_probability: number): boolean { return this.completePass }
}

class OffBallPassRandom extends FirstSportingRandom {
  next(): number { return 0.3 }
  chance(_probability: number): boolean { return true }
}
