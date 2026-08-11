import { useEffect } from 'react'

import type { MatchEvent, MatchSimulation } from '@/engine/match'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '@/stores/matchViewerStore'

interface MatchViewerScreenProps {
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
      <Court homeLabel="HOME" awayLabel="AWAY" />
      <section className="viewer-lower">
        <div className="event-feed">
          <p className="eyebrow">MATCH EVENTS</p>
          {revealedEvents.slice(-10).reverse().map((event) => <EventLine event={event} key={event.sequence} />)}
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

function Court({ homeLabel, awayLabel }: { readonly homeLabel: string; readonly awayLabel: string }) {
  return <section className="court" aria-label="Prototype basketball court"><span className="court-label home-label">{homeLabel}</span><span className="court-label away-label">{awayLabel}</span><div className="half-court-line" />{[0, 1, 2, 3, 4].map((position) => <i className={`token home-token token-${position}`} key={`home-${position}`} />)}{[0, 1, 2, 3, 4].map((position) => <i className={`token away-token token-${position}`} key={`away-${position}`} />)}</section>
}

function EventLine({ event }: { readonly event: MatchEvent }) {
  if (event.type === 'shotMade') return <p className="event-made"><time>{formatClock(event.clockSecondsRemaining)}</time> {event.teamId} scores {event.points}</p>
  if (event.type === 'shotMissed') return <p className="event-missed"><time>{formatClock(event.clockSecondsRemaining)}</time> {event.teamId} miss</p>
  if (event.type === 'turnover') return <p className="event-turnover"><time>{formatClock(event.clockSecondsRemaining)}</time> {event.teamId} turnover</p>
  if (event.type === 'gameEnd') return <p><time>00:00</time> FINAL</p>
  return <p className="event-period"><time>{formatClock(event.clockSecondsRemaining)}</time> {event.type === 'periodStart' ? `${formatPeriod(event.period)} START` : `${formatPeriod(event.period)} END`}</p>
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function formatPeriod(period: number): string {
  if (period <= 4) return `Q${period}`
  return period === 5 ? 'OT' : `${period - 4}OT`
}
