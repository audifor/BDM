import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { applyMatchResult } from '@/engine/match'
import { createMatchState, decideRotationSubstitutions, tick } from '@/engine/match-next'
import { createMatchEnginePort } from './MatchEnginePortFactory'

describe('MatchEnginePort integration', () => {
  it('opens a live Match Next session with a deterministic center jump ball before possession', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 653113119)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 30, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    const opening = live.snapshot()

    expect(opening.frame.ball.kind).toBe('JUMP_BALL')
    expect(opening.frame.rotationPlayers).toHaveLength(setup.homeSquad.length + setup.awaySquad.length)
    expect(opening.frame.rotationPlayers.filter((player) => player.active && player.teamId === setup.homeTeamId)).toHaveLength(5)
    expect(opening.frame.rotationPlayers.filter((player) => player.active && player.teamId === setup.awayTeamId)).toHaveLength(5)
    expect(opening.frame.rotationPlayers.filter((player) => player.started)).toHaveLength(10)
    expect(opening.frame.clock.gameRunning).toBe(false)
    expect(opening.frame.events.some((event) => event.type === 'jumpBallStarted')).toBe(true)
    expect(opening.frame.players.filter((player) => Math.abs(player.position.x - opening.frame.court.lengthMeters / 2) < 0.8)).toHaveLength(2)
    expect(new Set(opening.frame.players.map((player) => Math.round(player.position.y * 10))).size).toBeGreaterThan(4)

    const tipped = live.advanceTicks(20)
    const repeated = createMatchEnginePort('match-next').createLiveSession(setup).advanceTicks(20)
    expect(repeated.frame).toEqual(tipped.frame)
    expect(tipped.frame.events.some((event) => event.type === 'jumpBallResolved')).toBe(true)
    expect(tipped.frame.possession?.startReason).toBe('openingJumpBall')
    expect(tipped.frame.transition).toMatchObject({ trigger: 'openingJumpBall' })
    expect(tipped.frame.transition?.roles).toHaveLength(10)
    expect(tipped.frame.movementIntents).toHaveLength(10)
    const defendingIds = new Set(tipped.frame.players.filter((player) => player.teamId !== tipped.frame.possession?.teamId).map((player) => player.playerId))
    expect(tipped.frame.movementIntents.filter((intent) => defendingIds.has(intent.playerId) && intent.urgency === 'sprint')).toHaveLength(5)
    const towardBasket = Math.sign(tipped.frame.defensiveStructure!.defendedBasket.x - tipped.frame.ball.position.x)
    const matchRoles = tipped.frame.transition!.roles.filter((role) => role.kind === 'MATCH')
    expect(matchRoles).toHaveLength(3)
    expect(matchRoles.every((role) => (role.target.x - tipped.frame.ball.position.x) * towardBasket > 2.5)).toBe(true)
    expect(Math.max(...matchRoles.map((role) => role.target.y)) - Math.min(...matchRoles.map((role) => role.target.y))).toBeGreaterThan(3.5)
    const next = live.advanceTicks(15).frame
    expect(next.players.filter((player) => defendingIds.has(player.playerId)
      && (player.position.x - next.ball.position.x) * towardBasket > 1.5).length).toBeGreaterThanOrEqual(3)
    expect(tipped.frame.events.some((event) => event.type === 'inboundStarted' && event.startReason === 'periodStart')).toBe(false)
    expect(tipped.frame.clock.gameRunning).toBe(true)
  })

  it('moves both teams into an organized restart before a made-basket inbound', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 300, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)

    for (let tick = 0; tick < 1200 && !live.matchState.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket'); tick += 1) {
      live.advanceOneStep()
    }

    const restartBall = live.matchState.ball
    expect(restartBall.kind).toBe('DEAD')
    if (restartBall.kind !== 'DEAD') throw new Error('Made basket should leave the ball dead for an inbound')
    expect(restartBall.reason).toBe('madeBasket')
    expect(live.matchState.responsibilities.filter((item) => item.kind === 'PERIOD_RESTART')).toHaveLength(10)
    expect(live.matchState.movementIntents).toHaveLength(10)
    expect(new Set(live.matchState.movementIntents.map((item) => item.urgency))).toEqual(new Set(['run', 'sprint']))
    const restartTargets = new Map(live.matchState.movementIntents.map((item) => [item.playerId, item.target]))
    const targetXs = [...restartTargets.values()].map((item) => item.x)
    const targetYs = [...restartTargets.values()].map((item) => item.y)
    expect(Math.max(...targetXs) - Math.min(...targetXs)).toBeGreaterThan(13)
    expect(Math.max(...targetYs) - Math.min(...targetYs)).toBeGreaterThan(8)
    const inboundTeamId = restartBall.restartTeamId!
    const inboundLineup = inboundTeamId === setup.homeTeamId ? setup.initialLineups.home : setup.initialLineups.away
    const receiverTarget = live.matchState.movementIntents.find((item) => item.playerId === inboundLineup[1])!.target
    expect(Math.hypot(receiverTarget.x - restartBall.restartSpot!.x, receiverTarget.y - restartBall.restartSpot!.y)).toBeGreaterThan(2)

    for (let tick = 0; tick < 300 && !live.matchState.events.some((event) => event.type === 'inboundStarted' && event.startReason === 'madeBasketInbound'); tick += 1) {
      live.advanceOneStep()
    }
    expect(live.matchState.events.some((event) => event.type === 'inboundStarted' && event.startReason === 'madeBasketInbound')).toBe(true)
    for (const player of live.matchState.players.filter((item) => item.active)) {
      const target = restartTargets.get(player.playerId)!
      expect(Math.hypot(player.position.x - target.x, player.position.y - target.y)).toBeLessThanOrEqual(0.75)
    }
  })

  it('continues into a real possession after a made basket under a continuing-clock rule', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 300, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)

    let snapshot = live.snapshot()
    for (let tick = 0; tick < 1200 && !snapshot.frame.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket'); tick += 1) {
      snapshot = live.advanceOneStep()
    }
    for (let tick = 0; tick < 500 && !snapshot.frame.events.some((event) => event.type === 'possessionStart' && event.startReason === 'madeBasketInbound'); tick += 1) snapshot = live.advanceOneStep()

    expect(snapshot.frame.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket')).toBe(true)
    expect(snapshot.frame.events.some((event) => event.type === 'possessionStart' && event.startReason === 'madeBasketInbound')).toBe(true)
    expect(snapshot.frame.clock).toEqual({ gameRunning: true, shotRunning: false })
  })

  it('continues the competition clock through an ordinary made-basket inbound without opening a substitution window', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 4, periodSeconds: 300, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    for (let tick = 0; tick < 1200 && !live.matchState.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket'); tick += 1) live.advanceOneStep()

    expect(live.matchState.ball).toMatchObject({ kind: 'DEAD', reason: 'madeBasket' })
    expect(live.matchState.clock).toEqual({ gameRunning: true, shotRunning: false })
    expect(decideRotationSubstitutions(live.matchState)).toEqual([])
    for (let tick = 0; tick < 500 && !live.matchState.events.some((event) => event.type === 'inboundReleased'); tick += 1) live.advanceOneStep()
    expect(live.matchState.clock.gameRunning).toBe(true)
    const inboundRelease = live.matchState.events.find((event) => event.type === 'inboundReleased')!
    for (let tick = 0; tick < 30 && !live.matchState.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === inboundRelease.receiverPlayerId); tick += 1) live.advanceOneStep()
    expect(live.matchState.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === inboundRelease.receiverPlayerId)).toBe(true)
    expect(live.matchState.clock).toEqual({ gameRunning: true, shotRunning: true })
  })

  it('stops made baskets by competition rule and restarts the clock when the inbound is received', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 1, periodSeconds: 300, overtimeSeconds: 20, madeBasketClockStopUnderSecondsInFinalPeriod: 300, clockRestartOnInbound: 'receive' as const } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    for (let tick = 0; tick < 1200 && !live.matchState.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket'); tick += 1) live.advanceOneStep()

    expect(live.matchState.ball).toMatchObject({ kind: 'DEAD', reason: 'madeBasket' })
    expect(live.matchState.clock).toEqual({ gameRunning: false, shotRunning: false })
    for (let tick = 0; tick < 500 && !live.matchState.events.some((event) => event.type === 'inboundReleased'); tick += 1) live.advanceOneStep()
    expect(live.matchState.clock.gameRunning).toBe(false)
    const inboundRelease = live.matchState.events.find((event) => event.type === 'inboundReleased')!
    for (let tick = 0; tick < 30 && !live.matchState.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === inboundRelease.receiverPlayerId); tick += 1) live.advanceOneStep()
    expect(live.matchState.events.some((event) => event.type === 'passReceived' && event.receiverPlayerId === inboundRelease.receiverPlayerId)).toBe(true)
    expect(live.matchState.clock).toEqual({ gameRunning: true, shotRunning: true })
  })

  it('keeps a five-man defensive retreat after a made-basket inbound until the ball reaches the frontcourt', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 653113119)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 300, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)

    for (let step = 0; step < 1700 && !live.matchState.events.some((event) => event.type === 'possessionStart' && event.startReason === 'madeBasketInbound'); step += 1) live.advanceOneStep()
    for (let step = 0; step < 20 && live.matchState.ball.kind !== 'HELD'; step += 1) live.advanceOneStep()

    const inbound = live.matchState
    expect(inbound.ball.kind).toBe('HELD')
    expect(inbound.transition).toMatchObject({ trigger: 'madeBasketInbound' })
    const defending = inbound.players.filter((player) => player.active && player.teamId !== inbound.transition?.teamId)
    expect(inbound.transition?.roles.filter((role) => role.teamId === defending[0]?.teamId).map((role) => role.kind))
      .toEqual(expect.arrayContaining(['STOP_BALL', 'PROTECT_RIM', 'MATCH', 'MATCH', 'MATCH']))
    expect(inbound.movementIntents.filter((intent) => defending.some((player) => player.playerId === intent.playerId) && intent.urgency === 'sprint')).toHaveLength(5)
    expect(inbound.actions.some((action) => action.teamId === inbound.transition?.teamId && action.startedT >= inbound.transition.startedT)).toBe(false)

    live.advanceTicks(15)
    const retreat = live.matchState
    expect(retreat.transition).toMatchObject({ trigger: 'madeBasketInbound' })
    const rimProtectorId = inbound.transition!.roles.find((role) => role.kind === 'PROTECT_RIM')!.playerId
    const before = inbound.players.find((player) => player.playerId === rimProtectorId)!.position
    const after = retreat.players.find((player) => player.playerId === rimProtectorId)!.position
    const defendedBasketX = inbound.defensiveStructure?.defendedBasket.x
    expect(defendedBasketX).toBeDefined()
    expect(Math.abs(after.x - defendedBasketX!)).toBeLessThan(Math.abs(before.x - defendedBasketX!))
    const towardBasket = Math.sign(defendedBasketX! - retreat.ball.position.x)
    const defendersBasketSide = retreat.players.filter((player) => player.active && player.teamId === defending[0]!.teamId
      && (player.position.x - retreat.ball.position.x) * towardBasket > 0.5)
    expect(defendersBasketSide.length).toBeGreaterThanOrEqual(3)
    expect(retreat.actions.some((action) => action.teamId === inbound.transition?.teamId && action.startedT >= inbound.transition.startedT)).toBe(false)

    for (let step = 0; step < 100 && live.matchState.transition?.trigger === 'madeBasketInbound'; step += 1) live.advanceOneStep()
    const settled = live.matchState
    expect(settled.transition?.trigger).not.toBe('madeBasketInbound')
    expect(settled.defensiveStructure?.teamId).toBe(defending[0]!.teamId)
    const basketSideAtMidcourt = settled.players.filter((player) => player.active && player.teamId === defending[0]!.teamId
      && (player.position.x - settled.ball.position.x) * Math.sign(defendedBasketX! - settled.ball.position.x) > 0.5)
    expect(basketSideAtMidcourt.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps trailing matchups from pulling the defense behind the ball after the opening transition', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const setup = createMatchEnginePort('match-next').prepare(world, game, 3498342002)
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    live.advanceTicks(35)
    const state = live.matchState
    expect(state.transition).toBeNull()
    expect(state.ball.kind).toBe('HELD')
    const basketX = state.defensiveStructure!.defendedBasket.x
    const direction = Math.sign(basketX - state.ball.position.x)
    const trailing = state.defensiveStructure!.assignments.filter((assignment) => {
      const attacker = state.players.find((player) => player.playerId === assignment.attackerPlayerId)!
      return (state.ball.position.x - attacker.position.x) * direction > 2
    })
    expect(trailing.length).toBeGreaterThanOrEqual(2)
    expect(trailing.every((assignment) => {
      const intent = state.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId)!
      return (intent.target.x - state.ball.position.x) * direction > 0
    })).toBe(true)
  })

  it('hands stop-ball duty to a basket-side defender when the original stopper is beaten', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const port = createMatchEnginePort('match-next')
    const setup = port.prepare(world, game, 3498342002)
    const live = port.createLiveSession(setup)
    // Play until the first made-basket inbound transition is live with the ball advancing (the moment used to be tick 130).
    live.advanceTicks(130)
    for (let step = 0; step < 6000 && !(live.matchState.transition?.trigger === 'madeBasketInbound' && live.matchState.ball.kind === 'HELD'); step += 1) live.advanceOneStep()
    const state = live.matchState
    expect(state.transition?.trigger).toBe('madeBasketInbound')
    expect(state.ball.kind).toBe('HELD')
    const stopper = state.transition!.roles.find((role) => role.kind === 'STOP_BALL')!
    const player = state.players.find((item) => item.playerId === stopper.playerId)!
    const direction = Math.sign(state.defensiveStructure!.defendedBasket.x - state.ball.position.x)
    expect((player.position.x - state.ball.position.x) * direction).toBeGreaterThan(0)
  })

  it('runs one real Game through the same Match Next path for LIVE and INSTANT, then applies its event-derived result', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const port = createMatchEnginePort('match-next')
    const prepared = port.prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 30, overtimeSeconds: 20 } }
    const live = port.createLiveSession(setup)
    for (let index = 0; index < 12; index += 1) live.advanceOneStep()
    const liveResult = live.skipToEnd()
    const instantResult = port.runInstant(setup)

    expect(liveResult).toEqual(instantResult)
    expect(liveResult.finalState.events.at(-1)?.type).toBe('gameEnd')
    expect(liveResult.score.home).not.toBe(liveResult.score.away)
    expect(liveResult.playByPlay.some((line) => line.type === 'score')).toBe(true)
    const receivedPass = liveResult.events.find((event) => event.type === 'passReceived')
    expect(receivedPass).toBeDefined()
    expect(liveResult.playByPlay).toContainEqual(expect.objectContaining({
      type: 'pass', playerId: receivedPass!.passerPlayerId, targetPlayerId: receivedPass!.receiverPlayerId,
    }))
    expect(liveResult.playerStats.reduce((sum, line) => sum + line.steals, 0))
      .toBe(liveResult.events.filter((event) => event.type === 'passIntercepted' && event.playerId).length)
    expect(liveResult.playerStats.reduce((sum, line) => sum + line.rebounds, 0))
      .toBe(liveResult.events.filter((event) => event.type === 'reboundSecured' && event.playerId).length)
    expect(liveResult.teamStats.home.points).toBe(liveResult.score.home)
    expect(liveResult.teamStats.away.points).toBe(liveResult.score.away)

    const completed = port.complete(world, liveResult)
    const storedGame = completed.games[game.id]!
    const statLog = completed.matchStatLogsByGameId[game.id]!
    expect(storedGame).toMatchObject({ status: 'completed', result: { homeScore: liveResult.score.home, awayScore: liveResult.score.away } })
    expect(statLog.finalScore).toEqual(liveResult.score)
    expect(statLog.playerLines.reduce((sum, line) => sum + line.stats.points, 0)).toBe(liveResult.score.home + liveResult.score.away)
    expect(() => applyMatchResult(completed, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 1, awayScore: 0 })).toThrow('Cannot apply result to completed Game')
  })

  it('continues a tied regulation game into configured overtime and completes once the score separates', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 17)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 4, periodSeconds: 600, overtimeSeconds: 30 } }
    const initial = createMatchState(setup)
    const regulationEnd = tick({ ...initial, period: 4, gameClockTenths: 1, clock: { gameRunning: true, shotRunning: false }, score: { home: 80, away: 80 } })
    expect(regulationEnd).toMatchObject({ period: 5, gameClockTenths: 300, isComplete: false })
    expect(regulationEnd.events.at(-1)?.type).toBe('periodStart')

    const overtimeEnd = tick({ ...regulationEnd, gameClockTenths: 1, clock: { gameRunning: true, shotRunning: false }, score: { home: 82, away: 80 } })
    expect(overtimeEnd.isComplete).toBe(true)
    expect(overtimeEnd.events.at(-1)?.type).toBe('gameEnd')
  })
})
