import type { CSSProperties, ReactNode } from 'react'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { MatchEvent, MatchLineups } from '@/engine/match'
import { MatchCourt } from '@/ui/match/MatchCourt'
import { displayJerseyNumber } from './matchPresentation'

export function LiveCourtStage({
  world,
  gameId,
  homeTeamId,
  awayTeamId,
  lineups,
  attackingTeamId,
  period,
  events,
  progress,
  detail,
  courtStyle,
  overlay,
  onPlayerSelect,
  playbackSpeed = 1,
  isPlaying = true,
}: {
  readonly world: GameWorld
  readonly gameId: keyof GameWorld['games']
  readonly homeTeamId: keyof GameWorld['teams']
  readonly awayTeamId: keyof GameWorld['teams']
  readonly homeName: string
  readonly awayName: string
  readonly lineups: MatchLineups
  readonly attackingTeamId: keyof GameWorld['teams']
  readonly period: number
  readonly events: readonly MatchEvent[]
  readonly progress: number
  readonly detail: 'full' | 'compressed' | 'compact'
  readonly courtStyle: CSSProperties
  readonly overlay?: ReactNode
  readonly onPlayerSelect?: (playerId: PlayerId) => void
  readonly playbackSpeed?: number
  readonly isPlaying?: boolean
}) {
  return (
    <div className="me-court-stage" style={courtStyle}>
      <div className="me-court-stage__floor">
        <MatchCourt
          attackingTeamId={attackingTeamId}
          awayTeamId={awayTeamId}
          detail={detail}
          events={events}
          gameId={gameId}
          homeTeamId={homeTeamId}
          isPlaying={isPlaying}
          lineups={lineups}
          markerMode="jersey"
          onPlayerSelect={onPlayerSelect}
          period={period}
          playbackSpeed={playbackSpeed}
          progress={progress}
          world={world}
        />
        {overlay}
      </div>
    </div>
  )
}

/** Used by MatchCourt jersey markers — re-exported for tests. */
export { displayJerseyNumber }
