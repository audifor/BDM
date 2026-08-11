import { useEffect, useRef, useState } from 'react'

import { getPlayer, type GameWorld } from '@/domain/world'
import type { Player } from '@/domain/player'
import { calculateMatchPlayerStats, type ManualSubstitution, type MatchEvent, type MatchSimulation, type MatchTacticalPlan, type PlayerMatchStats, type TacticalLevel } from '@/engine/match'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '@/stores/matchViewerStore'

import { createMatchViewerTokens, formatClock, formatMatchEvent, formatPeriod, resolveActiveMatchLineups, resolveMatchFatigue } from '../matchViewer'
import { ManualSubstitutionsPanel } from './ManualSubstitutionsPanel'
import { MatchCourt } from '../match/MatchCourt'
import { createPresentationSegment, displayClockAtProgress, presentationDurationMs, visualDetailForSpeed, type MatchPresentationSegment } from '../match/MatchPresentationSegment'

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
  readonly onRequestPresentationSegment: () => ReturnType<typeof createPresentationSegment>
  readonly onCompletePresentationSegment: (simulation: MatchSimulation) => void
  readonly onSkipToEnd: () => void
  readonly onApplyResult: () => void
  readonly onContinue: () => void
  readonly coachingPlan: MatchTacticalPlan
  readonly onApplyCoaching: (plan: MatchTacticalPlan) => void
  readonly coachingPlayers: readonly Player[]
  readonly coachingTeamId: MatchSimulation['homeTeamId']
  readonly onApplyManualSubstitutions: (substitutions: readonly ManualSubstitution[]) => void
}

export function MatchViewerScreen(props: MatchViewerScreenProps) {
  const [coachingOpen, setCoachingOpen] = useState(false)
  const [substitutionsOpen, setSubstitutionsOpen] = useState(false)
  const [draft, setDraft] = useState(props.coachingPlan)
  const [segment, setSegment] = useState<MatchPresentationSegment | null>(null)
  const [presentationProgress, setPresentationProgress] = useState(0)
  const requestingSegmentRef = useRef(false)
  const revealedEvents = props.simulation.events.slice(0, props.currentEventIndex)
  const lastEvent = revealedEvents.at(-1)
  /** Live snapshots may have no future events yet; only Engine's gameEnd is final. */
  const isFinished = isMatchComplete(revealedEvents)
  const homeScore = lastEvent?.homeScore ?? 0
  const awayScore = lastEvent?.awayScore ?? 0
  const period = lastEvent?.period ?? 1
  const clock = segment === null ? lastEvent?.clockSecondsRemaining ?? 600 : displayClockAtProgress(segment, presentationProgress)
  const playerStats = calculateMatchPlayerStats(props.simulation, revealedEvents)
  const activeLineups = resolveActiveMatchLineups(props.simulation, revealedEvents)
  const fatigueByPlayerId = resolveMatchFatigue(props.world, props.simulation, revealedEvents)
  const coachingActiveLineup = props.coachingTeamId === props.simulation.homeTeamId ? activeLineups.home : activeLineups.away
  const homePlayerIds = new Set(props.simulation.lineups.home)
  for (const event of revealedEvents) if (event.type === 'substitution' && event.teamId === props.simulation.homeTeamId) homePlayerIds.add(event.playerInId)
  const homeStats = playerStats.filter((stat) => homePlayerIds.has(stat.playerId))
  const awayStats = playerStats.filter((stat) => !homePlayerIds.has(stat.playerId))

  useEffect(() => {
    if (!props.isPlaying || isFinished || segment !== null || requestingSegmentRef.current) return
    requestingSegmentRef.current = true
    setPresentationProgress(0)
    setSegment(props.onRequestPresentationSegment())
  }, [isFinished, props.isPlaying, props.onRequestPresentationSegment, segment])

  useEffect(() => {
    if (!props.isPlaying || segment === null) return
    if (segment.gameSeconds === 0) {
      props.onCompletePresentationSegment(segment.endSimulation)
      requestingSegmentRef.current = false
      setSegment(null)
      return
    }
    const duration = presentationDurationMs(segment.gameSeconds, props.speed)
    const startedAt = performance.now() - presentationProgress * duration
    let frameId = 0
    const frame = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / duration)
      setPresentationProgress(nextProgress)
      if (nextProgress === 1) {
        props.onCompletePresentationSegment(segment.endSimulation)
        requestingSegmentRef.current = false
        setSegment(null)
        return
      }
      frameId = requestAnimationFrame(frame)
    }
    frameId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [presentationProgress, props.isPlaying, props.onCompletePresentationSegment, props.speed, segment])

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
      <MatchCourt world={props.world} homeTeamId={props.simulation.homeTeamId} awayTeamId={props.simulation.awayTeamId} lineups={segment?.startLineups ?? activeLineups} attackingTeamId={segment?.attackingTeamId ?? props.simulation.homeTeamId} period={segment?.period ?? period} events={segment?.events ?? []} progress={presentationProgress} detail={visualDetailForSpeed(props.speed)} />
      <section className="boxscore">
        <StatsTable title="HOME" stats={homeStats} world={props.world} fatigueByPlayerId={fatigueByPlayerId} />
        <StatsTable title="AWAY" stats={awayStats} world={props.world} fatigueByPlayerId={fatigueByPlayerId} />
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
            <button className="secondary-button" disabled={substitutionsOpen} onClick={props.isPlaying ? props.onPause : props.onResume} type="button">{props.isPlaying ? 'PAUSE' : 'PLAY'}</button>
            <button className="secondary-button" disabled={segment !== null} onClick={() => { props.onPause(); setSubstitutionsOpen(false); setDraft(props.coachingPlan); setCoachingOpen(true) }} type="button">COACHING</button>
            <button className="secondary-button" disabled={segment !== null} onClick={() => { props.onPause(); setCoachingOpen(false); setSubstitutionsOpen(true) }} type="button">SUBSTITUTIONS</button>
            <div className="speed-controls">{PLAYBACK_SPEEDS.map((speed) => <button className={props.speed === speed ? 'speed active' : 'speed'} key={speed} onClick={() => props.onSpeedChange(speed)} type="button">x{speed}</button>)}</div>
            <button className="primary-button" disabled={substitutionsOpen} onClick={() => { setSegment(null); props.onSkipToEnd() }} type="button">SKIP TO END</button>
          </div>
        )}
        {coachingOpen && <section className="content-panel"><p className="eyebrow">LIVE COACHING · CURRENT PLAN</p><label>PACE <LevelSelect value={draft.pace} onChange={(pace) => setDraft({ ...draft, pace })} /></label><label>RIM <LevelSelect value={draft.shotProfile.rim} onChange={(rim) => setDraft({ ...draft, shotProfile: { ...draft.shotProfile, rim } })} /></label><label>MID <LevelSelect value={draft.shotProfile.midRange} onChange={(midRange) => setDraft({ ...draft, shotProfile: { ...draft.shotProfile, midRange } })} /></label><label>3PT <LevelSelect value={draft.shotProfile.threePoint} onChange={(threePoint) => setDraft({ ...draft, shotProfile: { ...draft.shotProfile, threePoint } })} /></label><label>DEFENSE <select value={`${draft.defense.interior}/${draft.defense.perimeter}`} onChange={(event) => { const [interior, perimeter] = event.target.value.split('/').map(Number) as [TacticalLevel, TacticalLevel]; setDraft({ ...draft, defense: { interior, perimeter } }) }}><option value="0/0">Balanced</option><option value="2/-1">Protect Paint</option><option value="-1/2">Pressure Perimeter</option></select></label><label>FEATURED PLAYER <select value={draft.featuredPlayerId ?? ''} onChange={(event) => setDraft({ ...draft, ...(event.target.value === '' ? {} : { featuredPlayerId: event.target.value as Player['id'] }) })}><option value="">None</option>{props.coachingPlayers.map((player) => <option key={player.id} value={player.id}>{player.firstName} {player.lastName} · {player.basketball.primaryPosition}</option>)}</select></label><div className="game-actions"><button className="primary-button" onClick={() => { props.onApplyCoaching(draft); setCoachingOpen(false) }} type="button">APPLY CHANGES</button><button className="secondary-button" onClick={() => setCoachingOpen(false)} type="button">CANCEL</button></div></section>}
        {substitutionsOpen && <ManualSubstitutionsPanel activeLineup={coachingActiveLineup} squadPlayers={props.coachingPlayers} playerStats={playerStats} fatigueByPlayerId={fatigueByPlayerId} canApply={segment === null} onApply={(substitutions) => { props.onApplyManualSubstitutions(substitutions); setSubstitutionsOpen(false) }} onCancel={() => setSubstitutionsOpen(false)} />}
      </section>
    </main>
  )
}

export function isMatchComplete(events: readonly MatchEvent[]): boolean { return events.some((event) => event.type === 'gameEnd') }

function LevelSelect({ value, onChange }: { readonly value: TacticalLevel; readonly onChange: (value: TacticalLevel) => void }) { return <select value={value} onChange={(event) => onChange(Number(event.target.value) as TacticalLevel)}>{[-2, -1, 0, 1, 2].map((level) => <option key={level} value={level}>{level > 0 ? `+${level}` : level}</option>)}</select> }

function Court({ homeLabel, awayLabel, homePlayers, awayPlayers }: { readonly homeLabel: string; readonly awayLabel: string; readonly homePlayers: ReturnType<typeof createMatchViewerTokens>; readonly awayPlayers: ReturnType<typeof createMatchViewerTokens> }) {
  return <section className="court" aria-label="Prototype basketball court"><span className="court-label home-label">{homeLabel}</span><span className="court-label away-label">{awayLabel}</span><div className="half-court-line" />{homePlayers.map(({ player, visualSlot }) => <div className={`token home-token token-${visualSlot}`} key={player.id}><strong>{player.lastName}</strong><span>{player.basketball.primaryPosition}</span></div>)}{awayPlayers.map(({ player, visualSlot }) => <div className={`token away-token token-${visualSlot}`} key={player.id}><strong>{player.lastName}</strong><span>{player.basketball.primaryPosition}</span></div>)}</section>
}

function EventLine({ event, world }: { readonly event: MatchEvent; readonly world: GameWorld }) {
  const className = event.type === 'shotMade' || event.type === 'freeThrowMade' ? 'event-made' : event.type === 'shotMissed' || event.type === 'freeThrowMissed' ? 'event-missed' : event.type === 'turnover' ? 'event-turnover' : event.type === 'rebound' ? 'event-rebound' : event.type === 'foul' ? 'event-foul' : event.type === 'gameEnd' ? undefined : 'event-period'
  return <p className={className}><time>{event.type === 'gameEnd' ? '00:00' : formatClock(event.clockSecondsRemaining)}</time> {formatMatchEvent(event, world)}</p>
}

function StatsTable({ title, stats, world, fatigueByPlayerId }: { readonly title: string; readonly stats: readonly PlayerMatchStats[]; readonly world: GameWorld; readonly fatigueByPlayerId: Readonly<Record<string, number>> }) {
  return <section className="boxscore-team"><p className="eyebrow">{title}</p><table><thead><tr><th>PLAYER</th><th>MIN</th><th>CON</th><th>PTS</th><th>FG</th><th>FT</th><th>REB</th><th>AST</th><th>TO</th><th>PF</th></tr></thead><tbody>{stats.map((stat) => <tr key={stat.playerId}><td>{getPlayer(world, stat.playerId).lastName}</td><td>{formatMinutes(stat.secondsPlayed)}</td><td>{formatCondition(fatigueByPlayerId[stat.playerId] ?? 0)}</td><td>{stat.points}</td><td>{stat.fieldGoalsMade}/{stat.fieldGoalsAttempted}</td><td>{stat.freeThrowsMade}/{stat.freeThrowsAttempted}</td><td>{stat.rebounds}</td><td>{stat.assists}</td><td>{stat.turnovers}</td><td>{stat.foulsCommitted}</td></tr>)}</tbody></table></section>
}

function formatMinutes(secondsPlayed: number): string {
  return `${Math.floor(secondsPlayed / 60).toString().padStart(2, '0')}:${(secondsPlayed % 60).toString().padStart(2, '0')}`
}

function formatCondition(fatigue: number): string {
  return `${Math.round(100 - Math.min(100, Math.max(0, fatigue)))}%`
}
