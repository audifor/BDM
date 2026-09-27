import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { applyMatchResult } from '@/engine/match'
import { createMatchState, tick } from '@/engine/match-next'
import { createMatchEnginePort } from './MatchEnginePortFactory'

describe('MatchEnginePort integration', () => {
  it('opens a live Match Next session with a deterministic center jump ball before possession', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 30, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)
    const opening = live.snapshot()

    expect(opening.frame.ball.kind).toBe('JUMP_BALL')
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
    for (const player of live.matchState.players) {
      const target = restartTargets.get(player.playerId)!
      expect(Math.hypot(player.position.x - target.x, player.position.y - target.y)).toBeLessThanOrEqual(0.75)
    }
  })

  it('restarts a real possession after a made basket instead of stalling on DEAD with the game clock stopped', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
    const prepared = createMatchEnginePort('match-next').prepare(world, game, 20260927)
    const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 300, overtimeSeconds: 20 } }
    const live = createMatchEnginePort('match-next').createLiveSession(setup)

    let snapshot = live.snapshot()
    for (let tick = 0; tick < 1200 && !snapshot.frame.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket'); tick += 1) {
      snapshot = live.advanceOneStep()
    }
    for (let tick = 0; tick < 500 && !snapshot.frame.clock.gameRunning; tick += 1) snapshot = live.advanceOneStep()

    expect(snapshot.frame.events.some((event) => event.type === 'ballDead' && event.ballReason === 'madeBasket')).toBe(true)
    expect(snapshot.frame.events.some((event) => event.type === 'possessionStart' && event.startReason === 'madeBasketInbound')).toBe(true)
    expect(snapshot.frame.clock.gameRunning).toBe(true)
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
