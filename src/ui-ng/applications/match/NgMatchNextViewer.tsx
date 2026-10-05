import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { GameId, PlayerId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { projectMatchNextPlayByPlay, type MatchNextLiveController, type MatchNextResult } from '@/app/matchNext'
import type { MatchFrame, MatchSetup } from '@/engine/match-next'
import { formatClock, formatPeriod } from '@/ui/matchViewer'
import type { VisualMatchSnapshot } from '@/ui/match/SpatialVisualBridge'
import { interpolateVisualMatchSnapshot } from '@/ui/match/SpatialVisualBridge'
import { LiveCourtStage } from '@/ui-ng/applications/match/engine/LiveCourtStage'
import { GameClock, MatchScoreboard, TeamScoreSummary } from '@/ui-ng/applications/match/engine/MatchScoreboard'
import { chromeSafeClubAccent, teamMark, teamRecordLabel, venueLabel } from '@/ui-ng/applications/match/engine/matchPresentation'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { navigateToPlayer, navigateToTeamInNg } from '@/ui-ng/workspace/workspaceApps'
import { MatchNextCenterPanel } from './MatchNextCenterPanel'
import { projectMatchNextPresentation } from './MatchNextPresentation'

import './engine/match-engine.css'

const PLAYBACK_SPEEDS = [1, 2, 4] as const

export function NgMatchNextViewer({
  world,
  gameId,
  setup,
  controller,
  onComplete,
  onContinue,
}: {
  readonly world: GameWorld
  readonly gameId: GameId
  readonly setup: MatchSetup
  readonly controller: MatchNextLiveController
  readonly onComplete: (result: MatchNextResult) => void
  readonly onContinue: () => void
}) {
  const game = world.games[gameId]!
  const [snapshot, setSnapshot] = useState(() => controller.snapshot())
  const [, setVisualRevision] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isSkipping, setIsSkipping] = useState(false)
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1)
  const [result, setResult] = useState<MatchNextResult | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<PlayerId | null>(null)
  const completed = useRef(false)
  const skipFrame = useRef<number | null>(null)
  const visualFrame = useRef<number | null>(null)
  const visualSnapshotRef = useRef<VisualMatchSnapshot | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const publish = (next: ReturnType<MatchNextLiveController['snapshot']>) => {
    setSnapshot(next)
    if (!next.isComplete || completed.current) return
    completed.current = true
    setIsPlaying(false)
    const finalResult = controller.result()
    setResult(finalResult)
    onCompleteRef.current(finalResult)
  }

  useEffect(() => {
    if (!isPlaying || snapshot.isComplete) return
    const timer = globalThis.setInterval(() => publish(controller.advanceTicks(speed)), 100)
    return () => globalThis.clearInterval(timer)
  }, [controller, isPlaying, snapshot.isComplete, speed])

  useEffect(() => () => {
    if (skipFrame.current !== null) globalThis.cancelAnimationFrame(skipFrame.current)
    if (visualFrame.current !== null) globalThis.cancelAnimationFrame(visualFrame.current)
  }, [])

  const frame = snapshot.frame
  const homeTeam = world.teams[game.homeTeamId]!
  const awayTeam = world.teams[game.awayTeamId]!
  const homeColors = deriveTeamColors(game.homeTeamId)
  const awayColors = deriveTeamColors(game.awayTeamId)
  const clubColors = chromeSafeClubAccent(homeColors.primary, homeColors.secondary)
  const courtStyle = {
    '--ng-match-home': homeColors.primary,
    '--ng-match-home-accent': homeColors.secondary,
    '--ng-match-away': awayColors.primary,
    '--ng-match-away-accent': awayColors.secondary,
    '--me-club': clubColors.primary,
    '--me-club-hi': clubColors.secondary,
    '--me-club-ink': clubColors.ink,
  } as CSSProperties
  const venue = venueLabel(world, game.homeTeamId)
  const liveLines = projectMatchNextPlayByPlay(result?.events ?? frame.events).slice().reverse()
  const presentation = projectMatchNextPresentation(world, setup, frame, result)
  const homeName = homeTeam.name
  const awayName = awayTeam.name
  const offenseId = frame.possession?.teamId ?? game.homeTeamId
  const activeAction = frame.actions.find((action) => action.status === 'ACTIVE' && action.kind !== 'CLOSEOUT')
  const canonicalVisualSnapshot = createVisualSnapshot(frame)
  if (visualSnapshotRef.current === null) visualSnapshotRef.current = canonicalVisualSnapshot

  useEffect(() => {
    const from = visualSnapshotRef.current ?? canonicalVisualSnapshot
    const to = canonicalVisualSnapshot
    if (visualFrame.current !== null) globalThis.cancelAnimationFrame(visualFrame.current)
    const startedAt = performance.now()
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 100)
      const next = interpolateVisualMatchSnapshot(from, to, progress)
      visualSnapshotRef.current = next
      setVisualRevision((revision) => revision + 1)
      if (progress < 1) visualFrame.current = globalThis.requestAnimationFrame(animate)
      else visualFrame.current = null
    }
    visualFrame.current = globalThis.requestAnimationFrame(animate)
    return () => { if (visualFrame.current !== null) globalThis.cancelAnimationFrame(visualFrame.current) }
  }, [frame.t])
  const visualSnapshot = visualSnapshotRef.current

  const nextPossession = () => {
    if (snapshot.isComplete) return
    setIsPlaying(false)
    const priorId = frame.possession?.id ?? null
    let next = snapshot
    for (let tick = 0; tick < 3600; tick += 1) {
      next = controller.advanceOneStep()
      if (next.isComplete || (priorId === null ? next.frame.possession !== null : next.frame.possession?.id !== priorId)) break
    }
    publish(next)
  }

  const runToEnd = () => {
    if (snapshot.isComplete) return
    setIsPlaying(false)
    setIsSkipping(true)
    const advanceChunk = () => {
      const next = controller.advanceTicks(200)
      if (next.isComplete) {
        publish(next)
        setIsSkipping(false)
        skipFrame.current = null
        return
      }
      skipFrame.current = globalThis.requestAnimationFrame(advanceChunk)
    }
    skipFrame.current = globalThis.requestAnimationFrame(advanceChunk)
  }

  return (
    <section className="me" data-ng-region="match-live" data-me-engine="match-next" style={courtStyle}>
      <MatchScoreboard
        home={<TeamScoreSummary fouls={null} mark={teamMark(homeName)} name={homeName} onOpen={() => navigateToTeamInNg({ type: 'team', teamId: game.homeTeamId, section: 'overview' })} record={teamRecordLabel(world, game.homeTeamId)} side="home" timeouts={null} />}
        score={<GameClock arena={venue.arena} attendance={null} awayScore={frame.score.away} clockLabel={formatClock(frame.gameClock / 10)} finished={snapshot.isComplete} homeScore={frame.score.home} location={venue.location} periodLabel={formatPeriod(frame.period)} shotClock={frame.shotClock === null ? null : frame.shotClock / 10} />}
        away={<TeamScoreSummary fouls={null} mark={teamMark(awayName)} name={awayName} onOpen={() => navigateToTeamInNg({ type: 'team', teamId: game.awayTeamId, section: 'overview' })} record={teamRecordLabel(world, game.awayTeamId)} side="away" timeouts={null} />}
        controls={<div className="me-quick" aria-label="Match Next playback controls">
          <button className="me-quick__btn is-emphasis" onClick={() => setIsPlaying((playing) => !playing)} type="button">{isPlaying ? 'Pausar partido' : 'Reanudar partido'}</button>
          <button className="me-quick__btn" disabled={snapshot.isComplete || isSkipping} onClick={nextPossession} type="button">Próxima posesión</button>
          <button className="me-quick__btn" disabled={snapshot.isComplete || isSkipping} onClick={runToEnd} type="button">{isSkipping ? 'Simulando final…' : 'Simular final'}</button>
          {snapshot.isComplete
            ? <button className="me-quick__btn is-emphasis" onClick={onContinue} type="button">Continuar</button>
            : <label className="me-quick__speed">Velocidad<select aria-label="Velocidad del partido" value={speed} onChange={(event) => setSpeed(Number(event.target.value) as (typeof PLAYBACK_SPEEDS)[number])}>{PLAYBACK_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select></label>}
        </div>}
        meta={<div className="me-meta"><div className="me-meta__season"><strong>{world.competitions[game.competitionId]?.name ?? 'Partido'}</strong>{game.competitionStageKey && <em>{game.competitionStageKey}</em>}<em>{String(game.date)}</em><span>ME-NEXT · SEMILLA {controller.matchSeed}</span></div><div className="me-meta__live"><em>Estado de posesión</em><strong>{frame.possession?.phase ?? (snapshot.isComplete ? 'FINAL' : 'REINICIO')}</strong></div></div>}
      />

      <div className="me-main">
        <div className="me-left">
          <div className="me-live-view">
            <LiveCourtStage
              attackingTeamId={offenseId}
              awayName={awayName}
              awayTeamId={game.awayTeamId}
              courtStyle={courtStyle}
              detail="full"
              events={[]}
              gameId={gameId}
              homeName={homeName}
              homeTeamId={game.homeTeamId}
              isPlaying={isPlaying}
              lineups={{ home: presentation.home.currentFive.map((player) => player.playerId), away: presentation.away.currentFive.map((player) => player.playerId) }}
              onPlayerSelect={(playerId) => setSelectedPlayerId(playerId)}
              period={frame.period}
              playbackSpeed={speed}
              progress={1}
              visualSnapshot={visualSnapshot}
              world={world}
            />
          </div>
          <section className="me-box me-next-status">
            <strong>POSESIÓN {frame.possession?.id ?? '—'} · {frame.possession?.phase ?? 'SIN POSESIÓN'}</strong>
            <span>{activeAction ? `Acción: ${activeAction.kind}` : `Decisión: ${frame.currentDecision?.kind ?? 'organización ofensiva'}`}</span>
            <span>{frame.currentDecision?.reason ?? 'La defensa y el ataque comparten la posición actual de cada jugador y del balón.'}</span>
            {frame.transition && <span>Transición {frame.transition.trigger} · ventaja {frame.transition.advantage}</span>}
          </section>
          <MatchNextCenterPanel
            onSelectPlayer={(playerId) => setSelectedPlayerId((current) => current === playerId ? null : playerId)}
            presentation={presentation}
            selectedPlayerId={selectedPlayerId}
            world={world}
          />
        </div>

        <aside className="me-tactical">
          <div className="me-tactical__head"><div className="me-tactical__title-row"><h2>ME-NEXT · Partido en vivo</h2></div><p>La cancha muestra las posiciones del MatchFrame actual.</p></div>
          <div className="me-tactical__scroll me-next-pbp">
            <h3>Acción y defensa</h3>
            <p>Balón: <strong>{frame.ball.kind}</strong>{frame.ball.ownerPlayerId ? ` · ${playerName(world, frame.ball.ownerPlayerId)}` : ''}</p>
            <p>{frame.currentDecision?.reason ?? 'Esperando la siguiente decisión de posesión.'}</p>
            <p>Ayudas defensivas: {frame.defensiveStructure?.helpDefenderPlayerIds.length ?? 0} · Rebote: {frame.reboundState ? 'en disputa' : '—'}</p>
            {frame.defensiveStructure && <details>
              <summary>Traza defensiva</summary>
              <p>{frame.defensiveStructure.helpDecision.reason}</p>
              {frame.defensiveStructure.helpDecision.rotations.map((rotation) => <p key={rotation.playerId}>
                {playerName(world, rotation.playerId)} · {rotation.kind} → {playerName(world, rotation.targetAttackerPlayerId)}
                {rotation.secondaryAttackerPlayerId ? ` / ${playerName(world, rotation.secondaryAttackerPlayerId)}` : ''}
              </p>)}
              <ol>{frame.defensiveStructure.assignments.map((assignment) => {
                const defender = frame.players.find((player) => player.playerId === assignment.defenderPlayerId)
                const responsibility = frame.responsibilities.find((item) => item.playerId === assignment.defenderPlayerId && item.owner === 'defensiveStructure')
                const intent = frame.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId && item.provenance.owner === 'defensiveStructure')
                return <li key={assignment.defenderPlayerId}>
                  {playerName(world, assignment.defenderPlayerId)} → {playerName(world, assignment.attackerPlayerId)} · {responsibility?.kind ?? 'SIN TAREA'}
                  {responsibility ? `: ${responsibility.reason}` : ''}
                  {intent ? ` · objetivo (${intent.target.x.toFixed(1)}, ${intent.target.y.toFixed(1)})` : ''}
                  {defender ? ` · posición (${defender.position.x.toFixed(1)}, ${defender.position.y.toFixed(1)})` : ''}
                </li>
              })}</ol>
            </details>}
            {selectedPlayerId && <section className="me-next-inspected-player" aria-label="Jugador seleccionado">
              <strong>{playerName(world, selectedPlayerId)}</strong>
              <button className="me-next-inspected-player__link" onClick={() => navigateToPlayer(selectedPlayerId)} type="button">Abrir ficha completa</button>
              <button className="me-next-inspected-player__close" onClick={() => setSelectedPlayerId(null)} type="button">Cerrar</button>
            </section>}
            {presentation.substitutionEvents.length > 0 && <details data-testid="rotation-validation">
              <summary>Diagnostico de cambios</summary>
              <ol>{presentation.substitutionEvents.slice().reverse().map((event) => <li key={event.sequence}>
                {event.playerId ? playerName(world, event.playerId) : 'Jugador'} entra por {event.outgoingPlayerId ? playerName(world, event.outgoingPlayerId) : 'jugador'} - {formatPeriod(event.period)} {formatClock(event.gameClockTenths / 10)}{event.substitutionReason ? ` - ${event.substitutionReason}` : ''}
              </li>)}</ol>
            </details>}
            <h3>Play-by-play</h3>
            {liveLines.length === 0 ? <p>El registro aparecerá cuando ocurran acciones.</p> : <ol className="me-next-pbp__list">{liveLines.map((line) => <li key={line.sequence}><time>{formatPeriod(line.period)} {formatClock(line.gameClockTenths / 10)}</time><span>{line.type === 'pass' && line.playerId && line.targetPlayerId
              ? `${playerName(world, line.playerId)} pasó a ${playerName(world, line.targetPlayerId)}`
              : line.type === 'substitution' && line.playerId && line.targetPlayerId
                ? `${playerName(world, line.playerId)} entra por ${playerName(world, line.targetPlayerId)}${line.substitutionReason ? ` · ${line.substitutionReason}` : ''}`
                : `${line.playerId ? `${playerName(world, line.playerId)} ` : ''}${line.text}`}</span></li>)}</ol>}
            {result && <div className="me-next-final"><h3>FINAL - Estadisticas</h3><p>{awayName} {result.score.away} - {result.score.home} {homeName}</p><p>El boxscore completo permanece visible junto a la cancha.</p></div>}
          </div>
        </aside>
      </div>
    </section>
  )
}

function playerName(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player ? `${player.firstName} ${player.lastName}` : String(playerId)
}

function createVisualSnapshot(frame: MatchFrame): VisualMatchSnapshot {
  const ballState = frame.ball.kind === 'PASS_IN_FLIGHT' || frame.ball.kind === 'INBOUND' ? 'PASS'
    : frame.ball.kind === 'SHOT_IN_FLIGHT' ? 'SHOT'
    : frame.ball.kind === 'HELD' ? 'HELD' : frame.ball.kind === 'JUMP_BALL' ? 'SHOT' : 'LOOSE'
  return {
    court: { lengthMeters: frame.court.lengthMeters, widthMeters: frame.court.widthMeters },
    players: frame.players.map((player) => ({
      playerId: player.playerId,
      teamId: player.teamId,
      xPercent: player.position.x / frame.court.lengthMeters * 100,
      yPercent: player.position.y / frame.court.widthMeters * 100,
    })),
    ball: {
      xPercent: frame.ball.position.x / frame.court.lengthMeters * 100,
      yPercent: frame.ball.position.y / frame.court.widthMeters * 100,
      ownerPlayerId: frame.ball.ownerPlayerId ?? null,
      isPassing: ballState === 'PASS',
      state: ballState,
      heightMeters: frame.ball.heightMeters,
    },
  }
}
