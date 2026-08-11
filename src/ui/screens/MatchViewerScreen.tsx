import { useEffect } from 'react'

import type { GameWorld } from '@/domain/world'
import type { MatchEvent, MatchSimulation } from '@/engine/match'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '@/stores/matchViewerStore'

import { createMatchViewerTokens, formatClock, formatMatchEvent, formatPeriod } from '../matchViewer'

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
      <Court homeLabel="HOME" awayLabel="AWAY" homePlayers={createMatchViewerTokens(props.world, props.simulation.lineups.home)} awayPlayers={createMatchViewerTokens(props.world, props.simulation.lineups.away)} />
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
  const className = event.type === 'shotMade' ? 'event-made' : event.type === 'shotMissed' ? 'event-missed' : event.type === 'turnover' ? 'event-turnover' : event.type === 'gameEnd' ? undefined : 'event-period'
  return <p className={className}><time>{event.type === 'gameEnd' ? '00:00' : formatClock(event.clockSecondsRemaining)}</time> {formatMatchEvent(event, world)}</p>
}
