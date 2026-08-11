import { useEffect } from 'react'

import { getPlayer, type GameWorld } from '@/domain/world'
import { calculateMatchPlayerStats, type MatchEvent, type MatchSimulation, type PlayerMatchStats } from '@/engine/match'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '@/stores/matchViewerStore'

import { createMatchViewerTokens, formatClock, formatMatchEvent, formatPeriod, resolveActiveMatchLineups } from '../matchViewer'

interface MatchViewerScreenProps {
  readonly world: GameWorld
  readonly simulation: MatchSimulation
  readonly homeTeamName: string
  readonly awayTeamName: string
  readonly currentEventIndex: number
  readonly isPlaying: boolean
  readonly speed: PlaybackSpeed
  readonly resultApplied: boolean
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onSpeedChange: (speed: PlaybackSpeed) => void
  readonly onRevealNext: () => void
  readonly onSkipToEnd: () => void
  readonly onApplyResult: () => void
  readonly onContinue: () => void
}

export function MatchViewerScreen(props: MatchViewerScreenProps) {
  const revealedEvents = props.simulation.events.slice(0, props.currentEventIndex)
  const lastEvent = revealedEvents.at(-1)
  const isFinished = props.currentEventIndex >= props.simulation.events.length
  const homeScore = lastEvent?.homeScore ?? 0
  const awayScore = lastEvent?.awayScore ?? 0
  const period = lastEvent?.period ?? 1
  const clock = lastEvent?.clockSecondsRemaining ?? 600
  const playerStats = calculateMatchPlayerStats(props.simulation, revealedEvents)
  const activeLineups = resolveActiveMatchLineups(props.simulation, revealedEvents)
  const homePlayerIds = new Set(props.simulation.lineups.home)
  for (const event of revealedEvents) if (event.type === 'substitution' && event.teamId === props.simulation.homeTeamId) homePlayerIds.add(event.playerInId)
  const homeStats = playerStats.filter((stat) => homePlayerIds.has(stat.playerId))
  const awayStats = playerStats.filter((stat) => !homePlayerIds.has(stat.playerId))

  useEffect(() => {
    if (!props.isPlaying || isFinished) return
    const intervalId = window.setInterval(props.onRevealNext, 600 / props.speed)
    return () => window.clearInterval(intervalId)
  }, [isFinished, props.isPlaying, props.onRevealNext, props.speed])

  useEffect(() => {
    if (isFinished && !props.resultApplied) props.onApplyResult()
  }, [isFinished, props.resultApplied, props.onApplyResult])

  return (
    <main className="match-viewer">
      <header className="viewer-header"><span>BDM MATCH CENTRE</span><span>{isFinished ? 'FINAL' : formatPeriod(period)}</span></header>
      <section className="scoreboard">
        <strong>{props.homeTeamName}</strong>
        <div><b>{homeScore} - {awayScore}</b><span>{isFinished ? 'FINAL' : `${formatPeriod(period)} · ${formatClock(clock)}`}</span></div>
        <strong>{props.awayTeamName}</strong>
      </section>
      <Court homeLabel="HOME" awayLabel="AWAY" homePlayers={createMatchViewerTokens(props.world, activeLineups.home)} awayPlayers={createMatchViewerTokens(props.world, activeLineups.away)} />
      <section className="boxscore">
        <StatsTable title="HOME" stats={homeStats} world={props.world} />
        <StatsTable title="AWAY" stats={awayStats} world={props.world} />
      </section>
      <section className="viewer-lower">
        <div className="event-feed">
          <p className="eyebrow">MATCH EVENTS</p>
          {revealedEvents.slice(-10).reverse().map((event) => <EventLine event={event} key={event.sequence} world={props.world} />)}
          {revealedEvents.length === 0 && <p className="empty-events">Waiting for tip-off...</p>}
        </div>
        {isFinished ? (
          <div className="viewer-controls final-controls"><strong>FINAL · {props.simulation.finalScore.home} - {props.simulation.finalScore.away}</strong><button className="primary-button" onClick={props.onContinue} type="button">CONTINUE</button></div>
        ) : (
          <div className="viewer-controls">
            <button className="secondary-button" onClick={props.isPlaying ? props.onPause : props.onResume} type="button">{props.isPlaying ? 'PAUSE' : 'PLAY'}</button>
            <div className="speed-controls">{PLAYBACK_SPEEDS.map((speed) => <button className={props.speed === speed ? 'speed active' : 'speed'} key={speed} onClick={() => props.onSpeedChange(speed)} type="button">x{speed}</button>)}</div>
            <button className="primary-button" onClick={props.onSkipToEnd} type="button">SKIP TO END</button>
          </div>
        )}
      </section>
    </main>
  )
}

function Court({ homeLabel, awayLabel, homePlayers, awayPlayers }: { readonly homeLabel: string; readonly awayLabel: string; readonly homePlayers: ReturnType<typeof createMatchViewerTokens>; readonly awayPlayers: ReturnType<typeof createMatchViewerTokens> }) {
  return <section className="court" aria-label="Prototype basketball court"><span className="court-label home-label">{homeLabel}</span><span className="court-label away-label">{awayLabel}</span><div className="half-court-line" />{homePlayers.map(({ player, visualSlot }) => <div className={`token home-token token-${visualSlot}`} key={player.id}><strong>{player.lastName}</strong><span>{player.basketball.primaryPosition}</span></div>)}{awayPlayers.map(({ player, visualSlot }) => <div className={`token away-token token-${visualSlot}`} key={player.id}><strong>{player.lastName}</strong><span>{player.basketball.primaryPosition}</span></div>)}</section>
}

function EventLine({ event, world }: { readonly event: MatchEvent; readonly world: GameWorld }) {
  const className = event.type === 'shotMade' || event.type === 'freeThrowMade' ? 'event-made' : event.type === 'shotMissed' || event.type === 'freeThrowMissed' ? 'event-missed' : event.type === 'turnover' ? 'event-turnover' : event.type === 'rebound' ? 'event-rebound' : event.type === 'foul' ? 'event-foul' : event.type === 'gameEnd' ? undefined : 'event-period'
  return <p className={className}><time>{event.type === 'gameEnd' ? '00:00' : formatClock(event.clockSecondsRemaining)}</time> {formatMatchEvent(event, world)}</p>
}

function StatsTable({ title, stats, world }: { readonly title: string; readonly stats: readonly PlayerMatchStats[]; readonly world: GameWorld }) {
  return <section className="boxscore-team"><p className="eyebrow">{title}</p><table><thead><tr><th>PLAYER</th><th>PTS</th><th>FG</th><th>FT</th><th>REB</th><th>AST</th><th>TO</th><th>PF</th></tr></thead><tbody>{stats.map((stat) => <tr key={stat.playerId}><td>{getPlayer(world, stat.playerId).lastName}</td><td>{stat.points}</td><td>{stat.fieldGoalsMade}/{stat.fieldGoalsAttempted}</td><td>{stat.freeThrowsMade}/{stat.freeThrowsAttempted}</td><td>{stat.rebounds}</td><td>{stat.assists}</td><td>{stat.turnovers}</td><td>{stat.foulsCommitted}</td></tr>)}</tbody></table></section>
}
