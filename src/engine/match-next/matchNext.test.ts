import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CourtPosition } from '@/domain/court'
import { getGamesForTeam } from '@/domain/world'
import { createNewGame } from '@/app/game/createNewGame'
import { prepareMatchSetup } from '@/app/matchNext/prepareMatchSetup'
import { activePossession, applyCommand, createMatchState, tick, toFrame, observeFrames, createRngState, draw, validateMatchSetup, type MatchSetup, type MatchState } from './index'

function generatedSetup() {
  const world = createNewGame()
  const worldSnapshot = JSON.stringify(world)
  const team = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
  const game = getGamesForTeam(world, team.id).find((candidate) => candidate.status === 'scheduled')!
  const setup = prepareMatchSetup(world, game, 123456)
  return { world, game, setup, worldSnapshot }
}

function positionedSetup(source: MatchSetup, overrides: Readonly<Record<string, CourtPosition>> = {}, changes: Partial<MatchSetup['clockRules']> = {}): MatchSetup {
  const center = { x: source.court.lengthMeters / 2, y: source.court.widthMeters / 2 }
  const home = [center, { x: source.court.lengthMeters - 4, y: center.y }, { x: center.x + 4, y: center.y }, { x: center.x + 3, y: center.y }, { x: 4, y: center.y - 1 }]
  const away = [{ x: source.court.lengthMeters - 0.5, y: center.y }, { x: source.court.lengthMeters - 3, y: center.y }, { x: source.court.lengthMeters - 8, y: center.y }, { x: source.court.lengthMeters - 6, y: center.y - 2 }, { x: source.court.lengthMeters - 6, y: center.y + 2 }]
  return { ...source, clockRules: { ...source.clockRules, ...changes }, initialPlayerPositions: [...source.initialLineups.home.map((playerId, i) => ({ playerId, position: overrides[playerId] ?? home[i]! })), ...source.initialLineups.away.map((playerId, i) => ({ playerId, position: overrides[playerId] ?? away[i]! }))] }
}

function ticks(state: MatchState, count: number): MatchState { let current = state; for (let i = 0; i < count; i += 1) current = tick(current); return current }

function liveHome(source: MatchSetup, changes: Partial<MatchSetup['clockRules']> = {}): MatchState {
  const setup = { ...source, clockRules: { ...source.clockRules, ...changes }, initialPlayerPositions: source.initialPlayerPositions ?? positionedSetup(source).initialPlayerPositions }
  let state = createMatchState(setup)
  state = applyCommand(state, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: setup.initialLineups.home[0]!, reason: 'periodStart' })
  state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: setup.initialLineups.home[1]!, passKind: 'chest', travelTicks: 10 })
  return ticks(state, 10)
}

describe('Match Next ball and possession authority', () => {
  it('prepares a JSON-safe setup without retaining or mutating GameWorld', () => {
    const { world, game, setup, worldSnapshot } = generatedSetup()
    expect(setup.gameId).toBe(game.id)
    expect(setup.initialLineups.home).toHaveLength(5)
    expect(setup.initialLineups.away).toHaveLength(5)
    expect(setup).not.toHaveProperty('world')
    expect(Object.values(setup)).not.toContain(world)
    expect(JSON.stringify(world)).toBe(worldSnapshot)
    expect(JSON.parse(JSON.stringify(setup))).toEqual(setup)
    expect(setup.clockRules).toHaveProperty('shotClockSeconds', 24)
    expect(setup.clockRules).toHaveProperty('offensiveReboundShotClockSeconds', null)
  })

  it('validates setup membership, positions, lineups, and optional shot-clock reset rules', () => {
    const { setup } = generatedSetup()
    expect(() => validateMatchSetup({ ...setup, awayTeamId: setup.homeTeamId })).toThrow('Home and away teams must be different')
    expect(() => validateMatchSetup({ ...setup, players: [...setup.players, setup.players[0]!] })).toThrow('Duplicate player profile')
    expect(() => validateMatchSetup({ ...setup, homeSquad: [...setup.homeSquad, setup.homeSquad[0]!] })).toThrow('Home squad contains duplicate player IDs')
    expect(() => validateMatchSetup({ ...setup, clockRules: { ...setup.clockRules, offensiveReboundShotClockSeconds: 0 } })).toThrow('offensiveReboundShotClockSeconds')
    expect(() => validateMatchSetup(positionedSetup(setup, { [setup.initialLineups.home[0]!]: { x: 1000, y: 0 } }))).toThrow('outside the court')
  })

  it('starts possession explicitly and starts both clocks only after a legal inbound catch', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    let state = createMatchState(setup)
    expect(state.ball.kind).toBe('DEAD')
    expect(state.activePossessionId).toBeNull()
    expect(state.clock).toEqual({ gameRunning: false, shotRunning: false })
    state = applyCommand(state, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: setup.initialLineups.home[0]!, reason: 'periodStart' })
    expect(state.ball.kind).toBe('INBOUND')
    expect(activePossession(state)).toMatchObject({ id: 'possession-1', startReason: 'periodStart', phase: 'INBOUND' })
    state = applyCommand(state, { type: 'releaseInbound', receiverPlayerId: setup.initialLineups.home[1]!, passKind: 'chest', travelTicks: 10 })
    expect(state.clock).toEqual({ gameRunning: false, shotRunning: false })
    const middle = ticks(state, 5)
    expect(middle.ball.kind).toBe('PASS_IN_FLIGHT')
    state = ticks(middle, 5)
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: setup.initialLineups.home[1]!, ownerTeamId: setup.homeTeamId })
    expect(activePossession(state)?.phase).toBe('ADVANCE')
    expect(state.clock).toEqual({ gameRunning: true, shotRunning: true })
    expect(state.shotClockTenths).toBe(240)
    expect(tick(state).gameClockTenths).toBe(state.gameClockTenths - 1)
    expect(tick(state).shotClockTenths).toBe(239)
  })

  it('moves passes continuously, catches close receivers, and leaves distant receivers as loose balls', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    const held = liveHome(source)
    const receiver = setup.initialLineups.home[2]!
    const target = held.players.find((player) => player.playerId === receiver)!.position
    let state = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: receiver, target, passKind: 'chest', travelTicks: 10 } })
    const start = state.ball.position
    state = ticks(state, 5)
    expect(state.ball.kind).toBe('PASS_IN_FLIGHT')
    if (state.ball.kind === 'PASS_IN_FLIGHT') expect(state.ball.position).not.toEqual(start)
    state = ticks(state, 5)
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: receiver })
    expect(state.events.some((event) => event.type === 'passReceived' && event.acquisitionDistanceMeters! <= 1)).toBe(true)

    let distant = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target: { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }, passKind: 'bounce', travelTicks: 10 } })
    distant = ticks(distant, 10)
    expect(distant.ball).toMatchObject({ kind: 'LOOSE', cause: 'badPass' })
  })

  it('rejects distant interception, rebound, and loose-ball recovery attempts', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    const held = liveHome(source)
    let pass = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[2]!, target: setup.court.baskets.left, passKind: 'lob', travelTicks: 20 } })
    pass = ticks(pass, 5)
    expect(() => applyCommand(pass, { type: 'interceptPass', playerId: setup.initialLineups.away[0]! })).toThrow('from the pass')

    let rebound = applyCommand(held, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 5, plannedOutcome: { kind: 'MISS', reboundTarget: setup.court.baskets.right, reboundAvailableT: held.t + 20 } } })
    rebound = ticks(rebound, 20)
    expect(rebound.ball.kind).toBe('REBOUNDABLE')
    expect(() => applyCommand(rebound, { type: 'secureRebound', playerId: setup.initialLineups.away[4]! })).toThrow('from the ball')

    let loose = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target: { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }, passKind: 'chest', travelTicks: 10 } })
    loose = ticks(loose, 10)
    expect(loose.ball.kind).toBe('LOOSE')
    expect(() => applyCommand(loose, { type: 'recoverLooseBall', playerId: setup.initialLineups.away[0]! })).toThrow('from the ball')
  })

  it('records a physically close interception as a turnover and a new possession', () => {
    const { setup: source } = generatedSetup()
    const centerY = source.court.widthMeters / 2
    const receiverId = source.initialLineups.home[2]!
    const defenderId = source.initialLineups.away[0]!
    const target = { x: source.court.lengthMeters / 2 + 4, y: centerY }
    const origin = { x: source.court.lengthMeters - 4, y: centerY }
    const setup = positionedSetup(source, { [defenderId]: { x: (target.x + origin.x) / 2, y: centerY } })
    let state = liveHome(setup)
    state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiverId, target, passKind: 'chest', travelTicks: 10 } })
    state = ticks(state, 5)
    const previous = activePossession(state)!
    state = applyCommand(state, { type: 'interceptPass', playerId: defenderId })
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: defenderId })
    expect(state.possessions.find((item) => item.id === previous.id)).toMatchObject({ endReason: 'turnover' })
    expect(activePossession(state)).toMatchObject({ id: 'possession-2', teamId: setup.awayTeamId, startReason: 'steal', phase: 'ADVANCE' })
  })

  it('scores a planned make once, closes possession, and waits for a legal opponent inbound', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    let state = liveHome(source)
    state = applyCommand(state, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 5, plannedOutcome: { kind: 'MAKE', points: 3 } } })
    state = ticks(state, 5)
    expect(state.ball).toMatchObject({ kind: 'DEAD', reason: 'madeBasket', restartTeamId: setup.awayTeamId })
    expect(state.score).toEqual({ home: 3, away: 0 })
    expect(state.possessions[0]).toMatchObject({ endReason: 'made' })
    expect(state.clock).toEqual({ gameRunning: false, shotRunning: false })
    expect(state.events.filter((event) => event.type === 'shotMade')).toHaveLength(1)
    state = applyCommand(state, { type: 'startInbound', teamId: setup.awayTeamId, inbounderPlayerId: setup.initialLineups.away[0]!, reason: 'madeBasketInbound' })
    expect(state.ball.kind).toBe('INBOUND')
    expect(activePossession(state)).toMatchObject({ teamId: setup.awayTeamId, startReason: 'madeBasketInbound', phase: 'INBOUND' })
  })

  it('supports a turnover dead ball followed by an explicit turnover inbound possession', () => {
    const { setup: source } = generatedSetup()
    const center = { x: source.court.lengthMeters / 2, y: source.court.widthMeters / 2 }
    const awayInbounder = source.initialLineups.away[0]!
    const setup = positionedSetup(source, { [awayInbounder]: center })
    let state = liveHome(setup)
    state = applyCommand(state, { type: 'putBallDead', reason: 'other', restartTeamId: setup.awayTeamId })
    expect(state.ball).toMatchObject({ kind: 'DEAD', reason: 'other', restartTeamId: setup.awayTeamId })
    expect(state.possessions[0]).toMatchObject({ endReason: 'turnover' })
    state = applyCommand(state, { type: 'startInbound', teamId: setup.awayTeamId, inbounderPlayerId: awayInbounder, reason: 'turnoverInbound' })
    expect(activePossession(state)).toMatchObject({ teamId: setup.awayTeamId, startReason: 'turnoverInbound', phase: 'INBOUND' })
  })

  it('distinguishes defensive rebound possessions from offensive rebounds and their optional reset', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    const held = liveHome(source)
    const awayRebounder = setup.initialLineups.away[2]!
    const awayPosition = held.players.find((player) => player.playerId === awayRebounder)!.position
    let defensive = applyCommand(held, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 5, plannedOutcome: { kind: 'MISS', reboundTarget: awayPosition, reboundAvailableT: held.t + 25 } } })
    defensive = ticks(defensive, 25)
    expect(() => applyCommand(defensive, { type: 'secureRebound', playerId: setup.initialLineups.away[4]! })).toThrow('from the ball')
    defensive = applyCommand(defensive, { type: 'secureRebound', playerId: awayRebounder })
    expect(defensive.possessions[0]).toMatchObject({ endReason: 'defensiveRebound' })
    expect(activePossession(defensive)).toMatchObject({ teamId: setup.awayTeamId, startReason: 'defensiveRebound', phase: 'ADVANCE' })

    const resetSetup = positionedSetup(source, {}, { offensiveReboundShotClockSeconds: 14 })
    const offense = liveHome(resetSetup)
    const rebounder = resetSetup.initialLineups.home[2]!
    const offensePosition = offense.players.find((player) => player.playerId === rebounder)!.position
    let offensive = applyCommand(offense, { type: 'releaseShot', command: { targetBasket: resetSetup.court.baskets.right, travelTicks: 5, plannedOutcome: { kind: 'MISS', reboundTarget: offensePosition, reboundAvailableT: offense.t + 25 } } })
    offensive = ticks(offensive, 25)
    const id = activePossession(offensive)?.id
    offensive = applyCommand(offensive, { type: 'secureRebound', playerId: rebounder })
    expect(activePossession(offensive)).toMatchObject({ id, phase: 'SETUP', offensiveRebounds: 1 })
    expect(offensive.shotClockTenths).toBe(140)

    const unresolvedSetup = positionedSetup(source)
    const unresolvedHeld = liveHome(unresolvedSetup)
    const unresolvedTarget = unresolvedHeld.players.find((player) => player.playerId === unresolvedSetup.initialLineups.home[2])!.position
    let unresolved = applyCommand(unresolvedHeld, { type: 'releaseShot', command: { targetBasket: unresolvedSetup.court.baskets.right, travelTicks: 5, plannedOutcome: { kind: 'MISS', reboundTarget: unresolvedTarget, reboundAvailableT: unresolvedHeld.t + 25 } } })
    unresolved = ticks(unresolved, 25)
    const priorShotClock = unresolved.shotClockTenths
    unresolved = applyCommand(unresolved, { type: 'secureRebound', playerId: unresolvedSetup.initialLineups.home[2]! })
    expect(unresolvedSetup.clockRules.offensiveReboundShotClockSeconds).toBeNull()
    expect(unresolved.shotClockTenths).toBe(priorShotClock)
    expect(activePossession(unresolved)?.phase).toBe('SETUP')
  })

  it('recovers a moving loose ball without changing possession when the same team wins it', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    let state = liveHome(source)
    const target = { x: setup.court.lengthMeters / 2 + 4, y: setup.court.widthMeters / 2 }
    state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target, passKind: 'bounce', travelTicks: 10 } })
    state = ticks(state, 10)
    expect(state.ball).toMatchObject({ kind: 'LOOSE', cause: 'badPass' })
    const x = state.ball.position.x
    state = tick(state)
    expect(state.ball.position.x).toBeLessThan(x)
    state = applyCommand(state, { type: 'recoverLooseBall', playerId: setup.initialLineups.home[3]! })
    expect(state.ball).toMatchObject({ kind: 'HELD', ownerPlayerId: setup.initialLineups.home[3]! })
    expect(activePossession(state)?.id).toBe('possession-1')
  })

  it('closes the old possession and starts the winner team possession after a loose-ball turnover', () => {
    const { setup: source } = generatedSetup()
    const center = { x: source.court.lengthMeters / 2 + 4, y: source.court.widthMeters / 2 }
    const awayRecoverer = source.initialLineups.away[0]!
    const setup = positionedSetup(source, { [awayRecoverer]: center })
    let state = liveHome(setup)
    state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target: center, passKind: 'chest', travelTicks: 10 } })
    state = ticks(state, 10)
    const loose = state
    expect(loose.ball.kind).toBe('LOOSE')
    state = applyCommand(state, { type: 'recoverLooseBall', playerId: awayRecoverer })
    expect(state.possessions[0]).toMatchObject({ endReason: 'turnover' })
    expect(activePossession(state)).toMatchObject({ id: 'possession-2', teamId: setup.awayTeamId, startReason: 'other', phase: 'ADVANCE' })
    expect(state.events.some((event) => event.type === 'looseBallRecovered' && event.teamId === setup.awayTeamId)).toBe(true)
  })

  it.each([24, 30])('uses configured %s-second shot-clock mechanics in tenths', (seconds) => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source, {}, { shotClockSeconds: seconds })
    let state = liveHome(setup)
    state = ticks(state, seconds * 10 - 1)
    expect(state.shotClockTenths).toBe(1)
    state = tick(state)
    expect(state.shotClockTenths).toBe(0)
    expect(state.ball).toMatchObject({ kind: 'DEAD', reason: 'shotClockViolation' })
    expect(state.possessions.at(-1)).toMatchObject({ endReason: 'shotClock' })
    expect(state.events.some((event) => event.type === 'shotClockViolation')).toBe(true)
    expect(state.clock).toEqual({ gameRunning: false, shotRunning: false })
  })

  it('allows a shot released before shot-clock zero to resolve afterward', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source, {}, { shotClockSeconds: 1 })
    let state = liveHome(setup)
    state = applyCommand(state, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 20, plannedOutcome: { kind: 'MAKE', points: 2 } } })
    state = ticks(state, 10)
    expect(state.shotClockTenths).toBe(0)
    expect(state.ball.kind).toBe('SHOT_IN_FLIGHT')
    expect(state.events.some((event) => event.type === 'shotClockViolation')).toBe(false)
    state = ticks(state, 10)
    expect(state.score.home).toBe(2)
    expect(state.events.some((event) => event.type === 'shotMade')).toBe(true)
  })

  it('ends pass, shot, and live rebound states at the exact period horn', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source, {}, { periodCount: 2, periodSeconds: 1 })
    let pass = liveHome(setup)
    pass = applyCommand(pass, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[2]!, target: pass.players.find((player) => player.playerId === setup.initialLineups.home[2])!.position, passKind: 'lob', travelTicks: 20 } })
    pass = tick({ ...pass, gameClockTenths: 1 })
    expect(pass.ball).toMatchObject({ kind: 'DEAD', reason: 'periodEnd' })
    expect(pass.period).toBe(2)

    let shot = liveHome(setup)
    shot = applyCommand(shot, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 20, plannedOutcome: { kind: 'MAKE', points: 2 } } })
    shot = tick({ ...shot, gameClockTenths: 1 })
    expect(shot.ball).toMatchObject({ kind: 'DEAD', reason: 'periodEnd' })
    expect(shot.score.home).toBe(0)
    expect(shot.possessions[0]).toMatchObject({ endReason: 'periodEnd' })

    let rebound = liveHome(setup)
    rebound = applyCommand(rebound, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 1, plannedOutcome: { kind: 'MISS', reboundTarget: setup.court.baskets.right, reboundAvailableT: rebound.t + 10 } } })
    rebound = tick({ ...rebound, gameClockTenths: 1 })
    expect(rebound.ball).toMatchObject({ kind: 'DEAD', reason: 'periodEnd' })
  })

  it('resumes exactly from JSON during inbound, pass, shot, reboundable, and loose states', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    const initial = createMatchState(setup)
    const inbound = applyCommand(initial, { type: 'startInbound', teamId: setup.homeTeamId, inbounderPlayerId: setup.initialLineups.home[0]!, reason: 'periodStart' })
    expect(ticks(JSON.parse(JSON.stringify(inbound)) as MatchState, 3)).toEqual(ticks(inbound, 3))

    const held = liveHome(source)
    const target = held.players.find((player) => player.playerId === setup.initialLineups.home[2])!.position
    let pass = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[2]!, target, passKind: 'lob', travelTicks: 10 } })
    pass = ticks(pass, 3)
    expect(ticks(JSON.parse(JSON.stringify(pass)) as MatchState, 10)).toEqual(ticks(pass, 10))

    let shot = applyCommand(held, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 12, plannedOutcome: { kind: 'MAKE', points: 2 } } })
    shot = ticks(shot, 3)
    expect(ticks(JSON.parse(JSON.stringify(shot)) as MatchState, 12)).toEqual(ticks(shot, 12))

    let rebound = applyCommand(held, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 4, plannedOutcome: { kind: 'MISS', reboundTarget: target, reboundAvailableT: held.t + 20 } } })
    rebound = ticks(rebound, 6)
    expect(rebound.ball.kind).toBe('REBOUNDABLE')
    expect(ticks(JSON.parse(JSON.stringify(rebound)) as MatchState, 14)).toEqual(ticks(rebound, 14))

    let loose = applyCommand(held, { type: 'releasePass', command: { receiverPlayerId: setup.initialLineups.home[4]!, target: { x: setup.court.lengthMeters / 2, y: setup.court.widthMeters / 2 }, passKind: 'chest', travelTicks: 10 } })
    loose = ticks(loose, 10)
    expect(loose.ball.kind).toBe('LOOSE')
    expect(ticks(JSON.parse(JSON.stringify(loose)) as MatchState, 10)).toEqual(ticks(loose, 10))
  })

  it('replays identical commands identically and maintains event sequence ordering', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source)
    const replay = () => {
      let state = liveHome(setup)
      const receiver = setup.initialLineups.home[2]!
      state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target: state.players.find((player) => player.playerId === receiver)!.position, passKind: 'bounce', travelTicks: 10 } })
      state = ticks(state, 10)
      state = applyCommand(state, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 10, plannedOutcome: { kind: 'MAKE', points: 2 } } })
      return ticks(state, 10)
    }
    const first = replay()
    expect(replay()).toEqual(first)
    expect(first.events.map((event) => event.sequence)).toEqual(first.events.map((_, index) => index + 1))
    expect(first.nextEventSequence).toBe(first.events.length + 1)
  })

  it('reports zero structural violations over repeatable ball-heavy scripts', () => {
    const { setup: source } = generatedSetup()
    for (const seed of [11, 123456, 0xffff_ffff]) {
      const setup = positionedSetup({ ...source, matchSeed: seed })
      let state = liveHome(setup)
      const frames = [toFrame(state)]
      const receiver = setup.initialLineups.home[2]!
      state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target: state.players.find((player) => player.playerId === receiver)!.position, passKind: seed % 2 ? 'chest' : 'lob', travelTicks: 10 } })
      frames.push(toFrame(state))
      state = ticks(state, 10)
      frames.push(toFrame(state))
      const target = state.players.find((player) => player.playerId === receiver)!.position
      state = applyCommand(state, { type: 'releaseShot', command: { targetBasket: setup.court.baskets.right, travelTicks: 10, plannedOutcome: { kind: 'MISS', reboundTarget: target, reboundAvailableT: state.t + 20 } } })
      frames.push(toFrame(state))
      state = ticks(state, 20)
      frames.push(toFrame(state))
      state = applyCommand(state, { type: 'secureRebound', playerId: receiver })
      frames.push(toFrame(state))
      const report = observeFrames(frames)
      expect(report.ballTeleports).toBe(0)
      expect(report.illegalAcquisitions).toBe(0)
      expect(report.invalidPossessions).toBe(0)
      expect(report.clockViolationCount).toBe(0)
      expect(report.ballStateViolations).toEqual([])
      expect(report.possessionViolations).toEqual([])
      expect(report.clockViolations).toEqual([])
      expect(report.playerContinuityViolations).toEqual([])
    }
  })

  it('keeps production engine code free of UI, wall-clock, random, and persistent-world dependencies', () => {
    const folder = join(process.cwd(), 'src/engine/match-next')
    const files = readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? readdirSync(join(folder, entry.name)).map((name) => join(folder, entry.name, name)) : [join(folder, entry.name)]).filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    const source = files.map((path) => readFileSync(path, 'utf8')).join('\n')
    expect(source).not.toMatch(/from\s+['"](?:react|zustand|@tauri-apps)/i)
    expect(source).not.toMatch(/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/)
    expect(source).not.toMatch(/GameWorld/)
    expect(readFileSync(join(folder, 'state.ts'), 'utf8')).not.toMatch(/\b(?:Map|Set)\b/)
  })

  it('measures a full clock-only regulation baseline and a synthetic ball-heavy workload', () => {
    const { setup: source } = generatedSetup()
    const setup = positionedSetup(source, {}, { periodCount: 4, periodSeconds: 600 })
    const samples: number[] = []
    for (let run = 0; run < 3; run += 1) {
      let state = createMatchState(setup)
      const started = performance.now()
      for (let i = 0; i < 24_000; i += 1) {
        if (!state.clock.gameRunning && !state.isComplete) state = { ...state, clock: { gameRunning: true, shotRunning: false } }
        state = tick(state)
      }
      samples.push(performance.now() - started)
      expect(state.isComplete).toBe(true)
      expect(state.t).toBe(24_000)
    }
    const mean = samples.reduce((sum, item) => sum + item, 0) / samples.length
    process.stderr.write(`Match Next foundation regulation: 24000 ticks x 3; ${samples.map((value) => value.toFixed(1)).join(', ')} ms; mean ${mean.toFixed(1)} ms/game; ${(24_000 / (mean / 1000)).toFixed(0)} ticks/s\n`)
    expect(mean).toBeLessThan(200)

    const workloadSetup = positionedSetup(source, {}, { periodSeconds: 10000, shotClockSeconds: 600 })
    const started = performance.now()
    let state = liveHome(workloadSetup)
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const owner = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : workloadSetup.initialLineups.home[1]!
      const receiver = owner === workloadSetup.initialLineups.home[1]! ? workloadSetup.initialLineups.home[2]! : workloadSetup.initialLineups.home[1]!
      const receiverPosition = state.players.find((player) => player.playerId === receiver)!.position
      state = applyCommand(state, { type: 'releasePass', command: { receiverPlayerId: receiver, target: receiverPosition, passKind: cycle % 2 ? 'chest' : 'bounce', travelTicks: 6 } })
      state = ticks(state, 6)
      const shooter = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : receiver
      const landing = state.players.find((player) => player.playerId === shooter)!.position
      state = applyCommand(state, { type: 'releaseShot', command: { targetBasket: workloadSetup.court.baskets.right, travelTicks: 10, plannedOutcome: { kind: 'MISS', reboundTarget: landing, reboundAvailableT: state.t + 18 } } })
      state = ticks(state, 18)
      state = applyCommand(state, { type: 'secureRebound', playerId: shooter })
    }
    const workloadMs = performance.now() - started
    process.stderr.write(`Match Next ball-heavy workload: ${state.t} ticks, ${state.events.length} events, ${workloadMs.toFixed(1)} ms, ${(state.t / (workloadMs / 1000)).toFixed(0)} ticks/s\n`)
    expect(state.events.filter((event) => event.type === 'passReleased')).toHaveLength(101)
    expect(state.events.filter((event) => event.type === 'shotMissed')).toHaveLength(100)
    expect(state.events.filter((event) => event.type === 'reboundSecured')).toHaveLength(100)
  })

  it('preserves deterministic RNG stream behavior without consuming draws for planned outcomes', () => {
    const initial = createRngState(11)
    expect(draw(initial, 'outcome').value).toBe(draw(createRngState(11), 'outcome').value)
    expect(draw(initial, 'outcome').value).not.toBe(draw(createRngState(12), 'outcome').value)
    expect(draw(draw(initial, 'outcome').state, 'decision').value).toBe(draw(initial, 'decision').value)
  })
})
