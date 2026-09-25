import type { SpatialState } from '@/engine/match'
import type { PlayerId, TeamId } from '@/domain/ids'

export interface VisualMatchPlayer {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly xPercent: number
  readonly yPercent: number
}

export interface VisualMatchSnapshot {
  readonly court: { readonly lengthMeters: number; readonly widthMeters: number }
  readonly players: readonly VisualMatchPlayer[]
  readonly ball: {
    readonly xPercent: number
    readonly yPercent: number
    readonly ownerPlayerId: PlayerId | null
    readonly isPassing: boolean
  }
}

/** Copies only the canonical match geometry needed by the visual court. */
export function createVisualMatchSnapshot(spatial: SpatialState): VisualMatchSnapshot {
  const { lengthMeters, widthMeters } = spatial.court
  const project = (position: { readonly x: number; readonly y: number }) => ({
    xPercent: position.x / lengthMeters * 100,
    yPercent: position.y / widthMeters * 100,
  })

  return {
    court: { lengthMeters, widthMeters },
    players: spatial.players.map((player) => ({
      playerId: player.playerId,
      teamId: player.teamId,
      ...project(player.position),
    })),
    ball: {
      ...project(spatial.ball.position),
      ownerPlayerId: spatial.ball.kind === 'playerControlled' ? spatial.ball.playerId : null,
      isPassing: false,
    },
  }
}

/** Linear interpolation stays in visual space and never mutates either snapshot. */
export function interpolateVisualPosition(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  progress: number,
): { readonly x: number; readonly y: number } {
  const t = Math.min(1, Math.max(0, progress))
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/** Matches actors by stable PlayerId. New substitutes enter at their canonical inherited position. */
export function interpolateVisualMatchSnapshot(
  previous: VisualMatchSnapshot,
  current: VisualMatchSnapshot,
  progress: number,
): VisualMatchSnapshot {
  const t = Math.min(1, Math.max(0, progress))
  if (t === 0) return previous
  if (t === 1) return current
  const previousById = new Map(previous.players.map((player) => [player.playerId, player]))
  const players = current.players.map((player) => {
    const from = previousById.get(player.playerId)
    if (from === undefined) return { ...player }
    const position = interpolateVisualPosition(
      { x: from.xPercent, y: from.yPercent },
      { x: player.xPercent, y: player.yPercent },
      t,
    )
    return { ...player, xPercent: position.x, yPercent: position.y }
  })
  const ballPosition = interpolateVisualPosition(
    { x: previous.ball.xPercent, y: previous.ball.yPercent },
    { x: current.ball.xPercent, y: current.ball.yPercent },
    t,
  )

  return {
    court: { ...current.court },
    players,
    ball: {
      xPercent: ballPosition.x,
      yPercent: ballPosition.y,
      ownerPlayerId: t === 0
        ? previous.ball.ownerPlayerId
        : t === 1 || previous.ball.ownerPlayerId === current.ball.ownerPlayerId
          ? current.ball.ownerPlayerId
          : null,
      isPassing: t > 0 && t < 1
        && previous.ball.ownerPlayerId !== null
        && current.ball.ownerPlayerId !== null
        && previous.ball.ownerPlayerId !== current.ball.ownerPlayerId,
    },
  }
}
