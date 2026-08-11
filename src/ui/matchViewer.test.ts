import { describe, expect, it } from 'vitest'

import { createNewGame, prepareUserMatch } from '@/app/game'
import { playerIdFromString, type PlayerId } from '@/domain/ids'
import type { MatchEvent } from '@/engine/match'

import { createMatchViewerTokens, formatMatchEvent, resolveMatchLineup } from './matchViewer'

describe('MatchViewer presentation helpers', () => {
  it('resolves the five home and away lineup PlayerIds from GameWorld', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)

    expect(resolveMatchLineup(world, simulation.lineups.home).map((player) => player.id)).toEqual(simulation.lineups.home)
    expect(resolveMatchLineup(world, simulation.lineups.away).map((player) => player.id)).toEqual(simulation.lineups.away)
    expect(resolveMatchLineup(world, simulation.lineups.home)).toHaveLength(5)
    expect(resolveMatchLineup(world, simulation.lineups.away)).toHaveLength(5)
  })

  it('formats sporting events with the Player resolved from its PlayerId', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const madeShot = simulation.events.find(isMadeShot)!
    const missedShot = simulation.events.find(isMissedShot)!
    const turnover = simulation.events.find(isTurnover)!
    const rebound = simulation.events.find(isRebound)!
    const foul = simulation.events.find(isFoul)!
    const freeThrow = simulation.events.find(isFreeThrow)!
    const assisterId = simulation.lineups.home.find((playerId) => playerId !== madeShot.playerId)!

    expect(formatMatchEvent(madeShot, world)).toContain(world.players[madeShot.playerId]!.lastName)
    expect(formatMatchEvent(missedShot, world)).toContain(world.players[missedShot.playerId]!.lastName)
    expect(formatMatchEvent(turnover, world)).toContain(world.players[turnover.playerId]!.lastName)
    expect(formatMatchEvent(rebound, world)).toContain(`${world.players[rebound.playerId]!.lastName} ${rebound.reboundType} rebound`)
    expect(formatMatchEvent({ ...madeShot, assistPlayerId: assisterId }, world)).toContain(`assist ${world.players[assisterId]!.lastName}`)
    expect(formatMatchEvent(foul, world)).toContain(`${world.players[foul.playerId]!.lastName} shooting foul`)
    expect(formatMatchEvent(freeThrow, world)).toContain(world.players[freeThrow.playerId]!.lastName)
    const substitution = { sequence: 999, period: 1, clockSecondsRemaining: 500, type: 'substitution' as const, teamId: simulation.homeTeamId, playerOutId: simulation.lineups.home[0]!, playerInId: world.teams[simulation.homeTeamId]!.rosterPlayerIds[5]!, homeScore: 0, awayScore: 0 }
    expect(formatMatchEvent(substitution, world)).toContain(`${world.players[substitution.playerInId]!.lastName} replaces ${world.players[substitution.playerOutId]!.lastName}`)
  })

  it('fails explicitly when a lineup PlayerId cannot be resolved', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const missingPlayerId = playerIdFromString('missing-player')
    const madeShot = simulation.events.find(isMadeShot)!

    expect(() => resolveMatchLineup(world, [missingPlayerId])).toThrow('Player does not exist: missing-player')
    expect(() => formatMatchEvent({ ...madeShot, playerId: missingPlayerId }, world)).toThrow('Player does not exist: missing-player')
  })

  it('assigns deterministic, non-overlapping visual slots from primary positions', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const first = createMatchViewerTokens(world, simulation.lineups.home)
    const second = createMatchViewerTokens(world, simulation.lineups.home)

    expect(first).toEqual(second)
    expect(new Set(first.map((token) => token.visualSlot)).size).toBe(5)
    expect(first.map((token) => token.player.id)).toEqual(simulation.lineups.home)
  })
})

function isMadeShot(event: MatchEvent): event is MatchEvent & { readonly type: 'shotMade'; readonly playerId: PlayerId } {
  return event.type === 'shotMade'
}

function isMissedShot(event: MatchEvent): event is MatchEvent & { readonly type: 'shotMissed'; readonly playerId: PlayerId } {
  return event.type === 'shotMissed'
}

function isTurnover(event: MatchEvent): event is MatchEvent & { readonly type: 'turnover'; readonly playerId: PlayerId } {
  return event.type === 'turnover'
}

function isRebound(event: MatchEvent): event is MatchEvent & { readonly type: 'rebound'; readonly playerId: PlayerId; readonly reboundType: 'offensive' | 'defensive' } {
  return event.type === 'rebound'
}

function isFoul(event: MatchEvent): event is MatchEvent & { readonly type: 'foul'; readonly playerId: PlayerId } {
  return event.type === 'foul'
}

function isFreeThrow(event: MatchEvent): event is MatchEvent & { readonly type: 'freeThrowMade' | 'freeThrowMissed'; readonly playerId: PlayerId } {
  return event.type === 'freeThrowMade' || event.type === 'freeThrowMissed'
}
