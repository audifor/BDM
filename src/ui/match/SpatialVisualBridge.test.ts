import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createLiveUserMatch, createNewGame } from '@/app/game'
import { applySpatialSubstitution, controlBallByPlayer } from '@/engine/match'
import { MatchCourt } from './MatchCourt'
import { createPresentationSegment } from './MatchPresentationSegment'
import { createVisualMatchSnapshot, interpolateVisualMatchSnapshot, interpolateVisualPosition } from './SpatialVisualBridge'

describe('SpatialVisualBridge', () => {
  it('projects a live MatchSession step into stable visual snapshots and interpolates between them', () => {
    const controller = createLiveUserMatch(createNewGame())
    const beforeSpatial = controller.spatialSnapshot()
    const step = controller.advanceOneStepWithSnapshots()
    const segment = createPresentationSegment(step)
    const start = segment.startVisualSnapshot
    const end = segment.endVisualSnapshot
    const middle = interpolateVisualMatchSnapshot(start, end, 0.5)

    expect(start).toEqual(createVisualMatchSnapshot(beforeSpatial))
    expect(interpolateVisualMatchSnapshot(start, end, 0.5).ball.isPassing).toBe(false)
    expect(start.players).toHaveLength(10)
    expect(new Set(start.players.map(({ playerId }) => playerId)).size).toBe(10)
    expect(segment.endVisualSnapshot).toEqual(createVisualMatchSnapshot(step.afterSpatial))
    expect(segment.attackingTeamId).toBe(step.endAttackingTeamId)
    expect(interpolateVisualMatchSnapshot(start, end, 0)).toEqual(start)
    expect(interpolateVisualMatchSnapshot(start, end, 1)).toEqual(end)

    const movedPlayer = end.players.find((player) => {
      const previous = start.players.find((candidate) => candidate.playerId === player.playerId)!
      return previous.xPercent !== player.xPercent || previous.yPercent !== player.yPercent
    })!
    const previous = start.players.find(({ playerId }) => playerId === movedPlayer.playerId)!
    const halfway = middle.players.find(({ playerId }) => playerId === movedPlayer.playerId)!
    expect(halfway.xPercent).toBeCloseTo((previous.xPercent + movedPlayer.xPercent) / 2)
    expect(halfway.yPercent).toBeCloseTo((previous.yPercent + movedPlayer.yPercent) / 2)
    expect(interpolateVisualPosition({ x: 0, y: 0 }, { x: 10, y: 10 }, 1.5)).toEqual({ x: 10, y: 10 })
  })

  it('tracks canonical ball control and represents an owner change as a visual pass', () => {
    const controller = createLiveUserMatch(createNewGame())
    const spatial = controller.spatialSnapshot()
    const first = spatial.players[0]!
    const second = spatial.players[5]!
    const previous = createVisualMatchSnapshot(controlBallByPlayer(spatial, first.playerId))
    const current = createVisualMatchSnapshot(controlBallByPlayer(spatial, second.playerId))
    const halfway = interpolateVisualMatchSnapshot(previous, current, 0.5)

    expect(previous.ball.ownerPlayerId).toBe(first.playerId)
    expect(interpolateVisualMatchSnapshot(previous, current, 0).ball.ownerPlayerId).toBe(first.playerId)
    expect(halfway.ball.ownerPlayerId).toBeNull()
    expect(halfway.ball.isPassing).toBe(true)
    expect(halfway.ball.xPercent).toBeCloseTo((previous.ball.xPercent + current.ball.xPercent) / 2)
    expect(interpolateVisualMatchSnapshot(previous, current, 1).ball.ownerPlayerId).toBe(second.playerId)
  })

  it('renders the projected active actors and canonical ball position on the court', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const simulation = controller.snapshot()
    const snapshot = createVisualMatchSnapshot(controller.spatialSnapshot())
    const markup = renderToStaticMarkup(createElement(MatchCourt, {
      world,
      gameId: simulation.gameId,
      homeTeamId: simulation.homeTeamId,
      awayTeamId: simulation.awayTeamId,
      lineups: controller.activeLineups,
      attackingTeamId: simulation.homeTeamId,
      period: 1,
      events: [],
      progress: 0,
      proceduralSkin: false,
      canvasPlayers: false,
      visualSnapshot: snapshot,
    }))
    const firstPlayer = snapshot.players[0]!

    expect(markup.match(/class="token /g)).toHaveLength(10)
    expect(markup).toContain(`left:${firstPlayer.xPercent}%`)
    expect(markup).toContain(`top:${firstPlayer.yPercent}%`)
    expect(markup).toContain(`left:${snapshot.ball.xPercent}%`)
    expect(markup).toContain(`top:${snapshot.ball.yPercent}%`)
  })

  it('replaces a substituted player by ID at the inherited spatial position', () => {
    const world = createNewGame()
    const controller = createLiveUserMatch(world)
    const spatial = controller.spatialSnapshot()
    const outgoing = spatial.players[0]!
    const incomingId = world.teams[outgoing.teamId]!.rosterPlayerIds.find((playerId) =>
      !spatial.players.some((player) => player.playerId === playerId),
    )!
    const previous = createVisualMatchSnapshot(spatial)
    const current = createVisualMatchSnapshot(applySpatialSubstitution(spatial, outgoing.teamId, outgoing.playerId, incomingId))
    const incoming = current.players.find(({ playerId }) => playerId === incomingId)!

    expect(current.players).toHaveLength(10)
    expect(current.players.some(({ playerId }) => playerId === outgoing.playerId)).toBe(false)
    expect(current.players.filter(({ playerId }) => playerId === incomingId)).toHaveLength(1)
    expect(incoming.xPercent).toBe(previous.players.find(({ playerId }) => playerId === outgoing.playerId)!.xPercent)
    expect(incoming.yPercent).toBe(previous.players.find(({ playerId }) => playerId === outgoing.playerId)!.yPercent)
  })
})
