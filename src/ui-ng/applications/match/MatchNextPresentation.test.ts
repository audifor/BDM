import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import { toFrame, type MatchFrame } from '@/engine/match-next'
import { projectMatchNextPresentation } from './MatchNextPresentation'

function createFixture() {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const prepared = createMatchEnginePort('match-next').prepare(world, game, 653113119)
  const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 1, periodSeconds: 30, overtimeSeconds: 20 } }
  const controller = createMatchEnginePort('match-next').createLiveSession(setup)
  return { world, setup, controller }
}

describe('Match Next presentation projection', () => {
  it('projects real lineups, bench, court time and both fatigue values without mutating match state', () => {
    const { world, setup, controller } = createFixture()
    controller.advanceTicks(20)
    const base = controller.snapshot().frame
    const benchId = setup.homeSquad.find((playerId) => !setup.initialLineups.home.includes(playerId))!
    const frame = {
      ...base,
      rotationPlayers: base.rotationPlayers.map((row) => row.playerId === benchId
        ? { ...row, matchSessionFatigue: 14, preMatchCareerFatigue: 38 }
        : row),
    }
    const stateBefore = JSON.stringify(controller.matchState)
    const view = projectMatchNextPresentation(world, setup, frame)

    expect(view.home.starters.map((player) => player.playerId)).toEqual(setup.initialLineups.home)
    expect(view.home.currentFive).toHaveLength(5)
    expect(view.home.bench.length).toBe(setup.homeSquad.length - 5)
    expect(view.playersById.get(setup.homeSquad[0]!)?.courtTimeSeconds).toBe(frame.rotationPlayers.find((row) => row.playerId === setup.homeSquad[0])!.courtTimeTenths / 10)
    expect(view.playersById.get(benchId)).toMatchObject({ onCourt: false, matchFatigue: 14, preMatchFatigue: 38 })
    expect(JSON.stringify(controller.matchState)).toBe(stateBefore)
  })

  it('projects only supported event statistics and canonical shooting splits', () => {
    const { world, setup, controller } = createFixture()
    const base = controller.snapshot().frame
    const shooter = setup.initialLineups.home[0]!
    const rebounder = setup.initialLineups.home[1]!
    const stealer = setup.initialLineups.away[0]!
    const additions: MatchFrame['events'] = [
      { sequence: 2, t: 1, period: 1, gameClockTenths: 299, type: 'shotReleased', shooterPlayerId: shooter, points: 3 },
      { sequence: 3, t: 2, period: 1, gameClockTenths: 298, type: 'shotMade', shooterPlayerId: shooter, teamId: setup.homeTeamId, points: 3 },
      { sequence: 4, t: 3, period: 1, gameClockTenths: 297, type: 'reboundSecured', playerId: rebounder, reboundType: 'defensive' },
      { sequence: 5, t: 4, period: 1, gameClockTenths: 296, type: 'passIntercepted', playerId: stealer },
    ]
    const view = projectMatchNextPresentation(world, setup, { ...base, score: { home: 3, away: 0 }, events: [...base.events, ...additions] })

    expect(view.playersById.get(shooter)?.stats).toMatchObject({ points: 3, fieldGoalsMade: 1, fieldGoalsAttempted: 1, threePointMade: 1, threePointAttempted: 1 })
    expect(view.playersById.get(rebounder)?.stats.rebounds).toBe(1)
    expect(view.playersById.get(stealer)?.stats.steals).toBe(1)
    expect(view.home.stats.points).toBe(3)
    expect(view.away.stats.steals).toBe(1)
    expect('assists' in view.playersById.get(shooter)!.stats).toBe(false)
    expect(view.unsupportedStats).toEqual(['AST', 'BLK', 'TO', 'PF', 'FT'])
  })

  it('updates the live team boxscore from the current Match Next event stream', () => {
    const { world, setup, controller } = createFixture()
    let frame = controller.snapshot().frame
    for (let tick = 0; tick < 2400 && !frame.events.some((event) => event.type === 'shotMade'); tick += 1) {
      frame = controller.advanceOneStep().frame
    }
    const view = projectMatchNextPresentation(world, setup, frame)

    expect(frame.events.some((event) => event.type === 'shotMade')).toBe(true)
    expect(view.home.stats.points).toBe(frame.score.home)
    expect(view.away.stats.points).toBe(frame.score.away)
    expect(view.home.stats.fieldGoalsAttempted + view.away.stats.fieldGoalsAttempted).toBeGreaterThan(0)
  })

  it('keeps current five and substitution presentation aligned with canonical substitution events', () => {
    const { world, setup, controller } = createFixture()
    const frame = controller.snapshot().frame
    const outgoing = setup.initialLineups.home[0]!
    const incoming = setup.homeSquad.find((playerId) => !setup.initialLineups.home.includes(playerId))!
    const substitution = { sequence: frame.events.length + 1, t: 10, period: 1, gameClockTenths: 290, type: 'substitution' as const, teamId: setup.homeTeamId, playerId: incoming, outgoingPlayerId: outgoing, substitutionReason: 'rotation' }
    const nextFrame: MatchFrame = {
      ...frame,
      events: [...frame.events, substitution],
      rotationPlayers: frame.rotationPlayers.map((player) => player.playerId === outgoing ? { ...player, active: false } : player.playerId === incoming ? { ...player, active: true } : player),
    }
    const view = projectMatchNextPresentation(world, setup, nextFrame)

    expect(view.home.currentFive.map((player) => player.playerId)).toContain(incoming)
    expect(view.home.currentFive.map((player) => player.playerId)).not.toContain(outgoing)
    expect(view.home.starters.map((player) => player.playerId)).toContain(outgoing)
    expect(view.home.bench.map((player) => player.playerId)).toContain(outgoing)
    expect(view.substitutionEvents).toContainEqual(substitution)
  })

  it('retains canonical final boxscore data and matches the completed Match Next result', () => {
    const { world, setup, controller } = createFixture()
    const result = controller.skipToEnd()
    const instantResult = createMatchEnginePort('match-next').runInstant(setup)
    const finalFrame = toFrame(result.finalState)
    const view = projectMatchNextPresentation(world, setup, finalFrame, result)

    expect(result.finalState.isComplete).toBe(true)
    expect(view.home.score).toBe(result.score.home)
    expect(view.away.score).toBe(result.score.away)
    expect(view.home.stats.points).toBe(result.teamStats.home.points)
    expect(view.away.stats.points).toBe(result.teamStats.away.points)
    expect(view.home.stats).toMatchObject({ points: instantResult.teamStats.home.points, rebounds: instantResult.teamStats.home.rebounds, steals: instantResult.teamStats.home.steals, fieldGoalsMade: instantResult.teamStats.home.fieldGoalsMade, fieldGoalsAttempted: instantResult.teamStats.home.fieldGoalsAttempted })
    expect(view.away.stats).toMatchObject({ points: instantResult.teamStats.away.points, rebounds: instantResult.teamStats.away.rebounds, steals: instantResult.teamStats.away.steals, fieldGoalsMade: instantResult.teamStats.away.fieldGoalsMade, fieldGoalsAttempted: instantResult.teamStats.away.fieldGoalsAttempted })
    expect(view.home.players.find((player) => player.playerId === setup.initialLineups.home[0])?.courtTimeSeconds)
      .toBe(result.playerStats.find((player) => player.playerId === setup.initialLineups.home[0])!.secondsPlayed)
  })
})
