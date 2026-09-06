import type { MatchEvent } from '@/engine/match'
import type { PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getPlayer } from '@/domain/world'
import { formatClock, formatMatchEvent, formatPeriod } from '@/ui/matchViewer'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'
import { isHighlightPlay, playByPlayKind, type PlayByPlayKind } from './matchPresentation'

const KIND_GLYPH: Record<PlayByPlayKind, string> = {
  shot: '●',
  assist: '↗',
  rebound: '↺',
  turnover: '✕',
  foul: '!',
  timeout: 'T',
  substitution: '⇄',
  period: '◆',
  other: '·',
}

export function PlayByPlay({
  events,
  world,
}: {
  readonly events: readonly MatchEvent[]
  readonly world: GameWorld
}) {
  const rows = [...events].reverse()
  return (
    <section className="me-pbp" aria-label="Play-by-play">
      {rows.length === 0 ? (
        <p className="me-pbp__empty">Esperando el salto inicial…</p>
      ) : (
        <ul className="me-pbp__list">
          {rows.map((event) => (
            <PlayByPlayEvent event={event} key={event.sequence} world={world} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PlayByPlayEvent({ event, world }: { readonly event: MatchEvent; readonly world: GameWorld }) {
  const kind = playByPlayKind(event)
  const highlight = isHighlightPlay(event)
  const clock = event.type === 'gameEnd' ? '00:00' : formatClock(event.clockSecondsRemaining)
  const period = formatPeriod(event.period)
  const score =
    event.type === 'shotMade' || event.type === 'freeThrowMade' || event.type === 'gameEnd'
      ? `${event.homeScore}-${event.awayScore}`
      : null

  return (
    <li className={`me-pbp__item is-${kind}${highlight ? ' is-highlight' : ''}`}>
      <span className="me-pbp__glyph" aria-hidden>
        {KIND_GLYPH[kind]}
      </span>
      <time>
        {clock} <em>{period}</em>
      </time>
      <div className="me-pbp__body">
        <p>{renderMatchEvent(event, world)}</p>
        {score === null ? null : <strong className="me-pbp__score">{score}</strong>}
      </div>
    </li>
  )
}

function PlayerLink({ playerId, world }: { readonly playerId: PlayerId; readonly world: GameWorld }) {
  const player = getPlayer(world, playerId)
  return (
    <button className="me-pbp__player" onClick={() => navigateToPlayer(playerId)} type="button">
      {player.lastName}
    </button>
  )
}

function renderMatchEvent(event: MatchEvent, world: GameWorld) {
  if (event.type === 'shotMade') {
    return (
      <>
        <PlayerLink playerId={event.playerId} world={world} />{' '}
        {event.shotZone === 'rim' ? 'scores at the rim' : event.shotZone === 'midRange' ? 'hits from mid-range' : 'hits a three'}
        {event.assistPlayerId === undefined ? null : (
          <>
            {' '}
            (assist <PlayerLink playerId={event.assistPlayerId} world={world} />)
          </>
        )}
      </>
    )
  }
  if (event.type === 'shotMissed') {
    if (event.blockedByPlayerId === undefined) {
      return (
        <>
          <PlayerLink playerId={event.playerId} world={world} /> misses{' '}
          {event.shotZone === 'rim' ? 'at the rim' : event.shotZone === 'midRange' ? 'from mid-range' : 'a three'}
        </>
      )
    }
    return (
      <>
        <PlayerLink playerId={event.blockedByPlayerId} world={world} /> blocks{' '}
        <PlayerLink playerId={event.playerId} world={world} />
        {"'s shot"}
      </>
    )
  }
  if (event.type === 'turnover') {
    if (event.stealPlayerId === undefined) {
      return (
        <>
          <PlayerLink playerId={event.playerId} world={world} /> turnover
        </>
      )
    }
    return (
      <>
        <PlayerLink playerId={event.stealPlayerId} world={world} /> steals the ball from{' '}
        <PlayerLink playerId={event.playerId} world={world} />
      </>
    )
  }
  if (event.type === 'rebound') {
    return (
      <>
        <PlayerLink playerId={event.playerId} world={world} /> {event.reboundType} rebound
      </>
    )
  }
  if (event.type === 'foul') {
    return (
      <>
        <PlayerLink playerId={event.playerId} world={world} /> shooting foul
      </>
    )
  }
  if (event.type === 'freeThrowMade') {
    return (
      <>
        <PlayerLink playerId={event.playerId} world={world} /> makes free throw
      </>
    )
  }
  if (event.type === 'freeThrowMissed') {
    return (
      <>
        <PlayerLink playerId={event.playerId} world={world} /> misses free throw
      </>
    )
  }
  if (event.type === 'substitution') {
    return (
      <>
        <PlayerLink playerId={event.playerInId} world={world} /> replaces{' '}
        <PlayerLink playerId={event.playerOutId} world={world} />
      </>
    )
  }
  return formatMatchEvent(event, world)
}
