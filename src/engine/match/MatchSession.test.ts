import { describe, expect, it } from 'vitest'

import { createGameWorld, type GameWorld } from '@/domain/world'
import { playerIdFromString } from '@/domain/ids'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource, type RandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { MATCH_RULES_V2, MatchSimulationError, attackingBasketForTeam, assignBaseSpatialTargets, BASE_SPATIAL_STEP_METERS, calculateActiveLineups, calculateDefensiveAssignments, controlBallByPlayer, createMatchPlayerProfile, createMatchSession, getSpatialPossessionView, isSpatialStateCoherentWithPossession, isSpatialStateInsideCourt, movePlayerToward, simulateMatchDetailed, stepMatchSession, stepPlayersTowardBaseSpacing, substitutePlayer, toMatchSimulation, type MatchLineups, type SimulateMatchOptions } from './index'

describe('MatchSession', () => {
  it('produces the same complete simulation through stepping as through the wrapper', () => {
    const { world, game } = createScheduledGameWorld()
    const whole = simulateMatchDetailed(createOptions(world, game.id, 12345, 67890))
    const stepped = toMatchSimulation(runToComplete(createMatchSession(createOptions(world, game.id, 12345, 67890))))

    expect(stepped).toEqual(whole)
    expect(regressionSummary(whole)).toEqual({ finalScore: { home: 63, away: 71 }, eventCount: 209, homeTurnovers: 10, awayTurnovers: 8, homeRebounds: 24, awayRebounds: 30, homeAssists: 14, awayAssists: 14 })
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

  it('moves an active player partially toward a legal target and can reach it', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const player = spatial.players[0]!
    const target = { x: 0, y: player.position.y }
    const distance = player.position.x
    const maxDistance = distance / 2
    const partial = movePlayerToward(spatial, player.playerId, target, maxDistance)
    const movedPlayer = partial.players.find((candidate) => candidate.playerId === player.playerId)!

    expect(movedPlayer.position.x).toBeCloseTo(player.position.x - maxDistance)
    expect(movedPlayer.position.y).toBe(player.position.y)
    expect(Math.hypot(movedPlayer.position.x - player.position.x, movedPlayer.position.y - player.position.y)).toBeCloseTo(maxDistance)
    expect(isSpatialStateInsideCourt(partial)).toBe(true)
    expect(movePlayerToward(spatial, player.playerId, target, distance).players.find((candidate) => candidate.playerId === player.playerId)!.position).toEqual(target)
    expect(movePlayerToward(spatial, player.playerId, target, 0)).toBe(spatial)
    expect(movePlayerToward(spatial, player.playerId, player.position, 1)).toBe(spatial)
  })

  it('keeps a controlled ball with its moved handler and leaves an unassigned ball alone', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const holderId = spatial.players[0]!.playerId
    const held = controlBallByPlayer(spatial, holderId)
    const holder = held.players.find((player) => player.playerId === holderId)!
    const target = { x: 0, y: holder.position.y }
    const movedHeld = movePlayerToward(held, holderId, target, 1)
    const movedHolder = movedHeld.players.find((player) => player.playerId === holderId)!

    expect(movedHeld.ball).toMatchObject({ kind: 'playerControlled', playerId: holderId, teamId: holder.teamId, position: movedHolder.position })
    expect(movedHeld.players.filter((player) => player.playerId !== holderId)).toEqual(held.players.filter((player) => player.playerId !== holderId))
    const movedUnassigned = movePlayerToward(spatial, holderId, target, 1)
    expect(movedUnassigned.ball).toBe(spatial.ball)
    const loose = { ...spatial, ball: { kind: 'loose' as const, position: spatial.ball.position } }
    expect(movePlayerToward(loose, holderId, target, 1).ball).toBe(loose.ball)
  })

  it('rejects invalid movement distance and off-court targets', () => {
    const { world, game } = createScheduledGameWorld()
    const spatial = createMatchSession(createOptions(world, game.id, 12345, 67890)).state.spatial
    const playerId = spatial.players[0]!.playerId

    expect(() => movePlayerToward(spatial, playerId, { x: 0, y: 0 }, -1)).toThrow(RangeError)
    expect(() => movePlayerToward(spatial, playerId, { x: spatial.court.lengthMeters + 1, y: 0 }, 1)).toThrow(RangeError)
    expect(() => movePlayerToward(spatial, playerIdFromString('inactive-player'), { x: 0, y: 0 }, 1)).toThrow(/not active/)
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
    const stepped = stepPlayersTowardBaseSpacing(input)
    const after = stepped.players.find((player) => player.playerId === pgTarget.playerId)!
    const afterDistance = Math.hypot(after.position.x - pgTarget.position.x, after.position.y - pgTarget.position.y)
    const distanceMoved = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y)
    for (const target of [...targets.offensive, ...targets.defensive]) {
      const start = input.spatial.players.find((player) => player.playerId === target.playerId)!.position
      const end = stepped.players.find((player) => player.playerId === target.playerId)!.position
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThanOrEqual(BASE_SPATIAL_STEP_METERS + 1e-9)
      expect(Math.hypot(end.x - target.position.x, end.y - target.position.y)).toBeLessThanOrEqual(Math.hypot(start.x - target.position.x, start.y - target.position.y))
    }
    const runtimeStepped = stepMatchSession(createMatchSession(createOptions(world, game.id, 12345, 67890))).session.state

    expect(afterDistance).toBeLessThan(beforeDistance)
    expect(distanceMoved).toBeLessThanOrEqual(BASE_SPATIAL_STEP_METERS + 1e-9)
    expect(stepped.ball).toMatchObject({ kind: 'playerControlled', playerId: handlerId, position: stepped.players.find((player) => player.playerId === handlerId)!.position })
    expect(isSpatialStateInsideCourt(stepped)).toBe(true)
    expect(runtimeStepped.spatial.players).not.toEqual(state.spatial.players)
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
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new TurnoverRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const previousAttackingTeamId = session.state.attackingTeamId
    const result = stepMatchSession(session)
    const view = getSpatialPossessionView(result.session.state)

    expect(result.newEvents.some((event) => event.type === 'turnover')).toBe(true)
    expect(view.offensiveTeamId).toBe(previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.defensiveTeamId).toBe(previousAttackingTeamId)
    expect(view.attackingBasket).toEqual(result.session.state.spatial.court.baskets.left)
    expect(view.ballHandlerId).toBeUndefined()
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('assigns a credited steal to the existing defensive actor', () => {
    const { world, game } = createScheduledGameWorld()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random: new TurnoverRandom(), decisionRandom: new ZeroDecisionRandom(), actorRandom: new StealTurnoverRandom() })
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
    const result = stepMatchSession(session)
    const view = getSpatialPossessionView(result.session.state)

    expect(result.newEvents.some((event) => event.type === 'shotMade')).toBe(true)
    expect(view.offensiveTeamId).toBe(previousAttackingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId)
    expect(view.ballHandlerId).toBeUndefined()
    expect(result.session.state.spatial.ball.kind).toBe('unassigned')
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
  })

  it('synchronizes rebound control and does not spend RNG for spatial bookkeeping', () => {
    const { world, game } = createScheduledGameWorld()
    const random = new MissAndDefensiveReboundRandom()
    const session = createMatchSession({ ...createOptions(world, game.id, 1, 1), random, decisionRandom: new ZeroDecisionRandom(), actorRandom: new FirstActorRandom() })
    const result = stepMatchSession(session)
    const rebound = result.newEvents.find((event) => event.type === 'rebound')
    const view = getSpatialPossessionView(result.session.state)
    const holder = result.session.state.spatial.players.find((player) => player.playerId === rebound?.playerId)

    expect(result.newEvents.some((event) => event.type === 'shotMissed')).toBe(true)
    expect(rebound).toBeDefined()
    expect(view.offensiveTeamId).toBe(rebound!.teamId)
    expect(view.ballHandlerId).toBe(rebound!.playerId)
    expect(result.session.state.spatial.ball).toMatchObject({ kind: 'playerControlled', playerId: rebound!.playerId, teamId: rebound!.teamId, position: holder!.position })
    expect(result.session.state.spatial.players).toEqual(session.state.spatial.players)
    expect(isSpatialStateCoherentWithPossession(result.session.state)).toBe(true)
    expect(random).toMatchObject({ nextIntCalls: 1, nextCalls: 1, chanceCalls: 3 })
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

function baseSpacingInput(state: ReturnType<typeof createMatchSession>['state'], ballHandlerId: ReturnType<typeof createMatchSession>['state']['activeLineups']['home'][number]) {
  return { homeTeamId: state.homeTeamId, awayTeamId: state.awayTeamId, attackingTeamId: state.attackingTeamId, period: state.period, activeLineups: state.activeLineups, playerProfiles: state.playerProfiles, spatial: state.spatial, ballHandlerId }
}

function openingHandlerId(state: ReturnType<typeof createMatchSession>['state']) {
  return state.attackingTeamId === state.homeTeamId ? state.activeLineups.home[0]! : state.activeLineups.away[0]!
}

function profilesFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) } }

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds } }

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5), away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5) }
}

class OvertimeRandom implements RandomSource {
  private outcomes = 0
  next(): number { this.outcomes += 1; return this.outcomes <= 100 ? 0.99 : this.outcomes === 101 ? 0.3 : 0.99 }
  nextInt(): number { return 24 }
  nextFloat(minInclusive: number): number { return minInclusive }
  chance(probability: number): boolean { return probability === 0.25 || probability === 0.5 || (this.outcomes === 101 && probability > 0.1 && probability < 0.9) }
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

class StealTurnoverRandom extends FirstSportingRandom {
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

class FirstActorRandom extends FirstSportingRandom {}

class ZeroDecisionRandom extends FirstSportingRandom { next(): number { return 0 } }
