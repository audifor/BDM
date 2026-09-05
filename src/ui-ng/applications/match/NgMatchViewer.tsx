import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { Player } from '@/domain/player'
import { getPlayer } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import {
  calculateMatchPlayerStats,
  calculateTeamMatchStats,
  type MatchEvent,
  type MatchTacticalPlan,
  type PlayerMatchStats,
  type TacticalLevel,
} from '@/engine/match'
import { useGameStore } from '@/stores/gameStore'
import { PLAYBACK_SPEEDS, useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { MatchCourt } from '@/ui/match/MatchCourt'
import {
  createPresentationSegment,
  displayClockAtProgress,
  presentationDurationMs,
  visualDetailForSpeed,
  type MatchPresentationSegment,
} from '@/ui/match/MatchPresentationSegment'
import { formatClock, formatMatchEvent, formatPeriod, resolveActiveMatchLineups, resolveMatchFatigue } from '@/ui/matchViewer'
import { ManualSubstitutionsPanel } from '@/ui/screens/ManualSubstitutionsPanel'
import { isMatchComplete } from '@/ui/screens/MatchViewerScreen'
import { deriveTeamColors, teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { navigateToPlayer } from '@/ui-ng/workspace/workspaceApps'

type ViewerPanel = 'none' | 'coaching' | 'substitutions'

export function NgMatchViewer() {
  const world = useGameStore((state) => state.world)
  const completeMatch = useGameStore((state) => state.completeMatch)
  const advanceLiveMatchPresentation = useGameStore((state) => state.advanceLiveMatchPresentation)
  const skipLiveMatch = useGameStore((state) => state.skipLiveMatch)
  const applyLiveTactics = useGameStore((state) => state.applyLiveTactics)
  const applyManualSubstitutions = useGameStore((state) => state.applyManualSubstitutions)
  const simulation = useMatchViewerStore((state) => state.simulation)
  const isPlaying = useMatchViewerStore((state) => state.isPlaying)
  const speed = useMatchViewerStore((state) => state.speed)
  const resultApplied = useMatchViewerStore((state) => state.resultApplied)
  const pause = useMatchViewerStore((state) => state.pause)
  const resume = useMatchViewerStore((state) => state.resume)
  const setSpeed = useMatchViewerStore((state) => state.setSpeed)
  const replaceSimulation = useMatchViewerStore((state) => state.replaceSimulation)
  const markResultApplied = useMatchViewerStore((state) => state.markResultApplied)
  const clearMatch = useMatchViewerStore((state) => state.clear)
  const coachingPlan = useTacticalPlanStore((state) => state.plan)
  const setCoachingPlan = useTacticalPlanStore((state) => state.setPlan)

  const [panel, setPanel] = useState<ViewerPanel>('none')
  const [draft, setDraft] = useState(coachingPlan)
  const [segment, setSegment] = useState<MatchPresentationSegment | null>(null)
  const [presentationProgress, setPresentationProgress] = useState(0)
  const requestingSegmentRef = useRef(false)

  const revealedEvents = simulation?.events ?? []
  const finished = simulation !== null && isMatchComplete(revealedEvents)

  useEffect(() => {
    if (simulation === null || !isPlaying || finished || segment !== null || requestingSegmentRef.current) return
    requestingSegmentRef.current = true
    setPresentationProgress(0)
    setSegment(createPresentationSegment(advanceLiveMatchPresentation()))
  }, [advanceLiveMatchPresentation, finished, isPlaying, segment, simulation])

  useEffect(() => {
    if (!isPlaying || segment === null) return
    if (segment.gameSeconds === 0) {
      replaceSimulation(segment.endSimulation)
      requestingSegmentRef.current = false
      setSegment(null)
      return
    }
    const duration = presentationDurationMs(segment.gameSeconds, speed)
    const startedAt = performance.now() - presentationProgress * duration
    let frameId = 0
    const frame = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / duration)
      setPresentationProgress(nextProgress)
      if (nextProgress === 1) {
        replaceSimulation(segment.endSimulation)
        requestingSegmentRef.current = false
        setSegment(null)
        return
      }
      frameId = requestAnimationFrame(frame)
    }
    frameId = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(frameId)
  }, [isPlaying, presentationProgress, replaceSimulation, segment, speed])

  useEffect(() => {
    if (simulation === null || !finished || resultApplied) return
    if (markResultApplied()) completeMatch(simulation)
  }, [completeMatch, finished, markResultApplied, resultApplied, simulation])

  const homeColors = deriveTeamColors(simulation?.homeTeamId ?? 'home')
  const awayColors = deriveTeamColors(simulation?.awayTeamId ?? 'away')
  const courtStyle = useMemo(
    () =>
      ({
        '--ng-match-home': homeColors.primary,
        '--ng-match-home-accent': homeColors.secondary,
        '--ng-match-away': awayColors.primary,
        '--ng-match-away-accent': awayColors.secondary,
      }) as CSSProperties,
    [awayColors.primary, awayColors.secondary, homeColors.primary, homeColors.secondary],
  )

  if (world === null || simulation === null) return null

  const team = getUserTeam(world)
  const lastEvent = revealedEvents.at(-1)
  const homeScore = lastEvent?.homeScore ?? 0
  const awayScore = lastEvent?.awayScore ?? 0
  const period = lastEvent?.period ?? 1
  const clock =
    segment === null ? (lastEvent?.clockSecondsRemaining ?? 600) : displayClockAtProgress(segment, presentationProgress)
  const playerStats = calculateMatchPlayerStats(simulation, revealedEvents)
  const activeLineups = resolveActiveMatchLineups(simulation, revealedEvents)
  const fatigueByPlayerId = resolveMatchFatigue(world, simulation, revealedEvents)
  const coachingTeamId = team?.id ?? simulation.homeTeamId
  const coachingPlayers = (team ?? world.teams[coachingTeamId]!).rosterPlayerIds.map((playerId) => world.players[playerId]!)
  const coachingActiveLineup = coachingTeamId === simulation.homeTeamId ? activeLineups.home : activeLineups.away
  const homeStats = playerStats.filter((stat) => simulation.squads.home.includes(stat.playerId))
  const awayStats = playerStats.filter((stat) => simulation.squads.away.includes(stat.playerId))
  const homeName = world.teams[simulation.homeTeamId]!.name
  const awayName = world.teams[simulation.awayTeamId]!.name

  const openPanel = (next: ViewerPanel) => {
    pause()
    setDraft(coachingPlan)
    setPanel(next)
  }

  const simulateQuarter = () => {
    setSegment(null)
    setPresentationProgress(0)
    requestingSegmentRef.current = false
    const controller = useGameStore.getState().getActiveMatchSession()
    if (controller === null) return
    replaceSimulation(controller.skipToEndOfPeriod(), false)
    pause()
  }

  return (
    <section className="ng-match" data-ng-region="match-live" style={courtStyle}>
      <header className="ng-match__scoreboard ng-holo-panel">
        <div className="ng-match__team is-home">
          <span className="ng-match__mark">{teamShortCode(homeName)}</span>
          <strong>{homeName}</strong>
        </div>
        <div className="ng-match__score">
          <b>
            {homeScore}
            <span>–</span>
            {awayScore}
          </b>
          <em>{finished ? 'FINAL' : `${formatPeriod(period)} · ${formatClock(clock)}`}</em>
        </div>
        <div className="ng-match__team is-away">
          <strong>{awayName}</strong>
          <span className="ng-match__mark is-away">{teamShortCode(awayName)}</span>
        </div>
      </header>

      <div className="ng-match__stage">
        <div className="ng-match__court-wrap ng-holo-panel">
          <MatchCourt
            attackingTeamId={segment?.attackingTeamId ?? simulation.homeTeamId}
            awayTeamId={simulation.awayTeamId}
            detail={visualDetailForSpeed(speed)}
            events={segment?.events ?? []}
            gameId={simulation.gameId}
            homeTeamId={simulation.homeTeamId}
            lineups={segment?.startLineups ?? activeLineups}
            period={segment?.period ?? period}
            progress={presentationProgress}
            world={world}
          />
        </div>
        <aside className="ng-match__rail">
          <section className="ng-match__feed ng-holo-panel">
            <p className="ng-canon__eyebrow">Play-by-play</p>
            <div className="ng-match__feed-scroll">
              {revealedEvents.length === 0 ? (
                <p className="ng-canon__empty">Esperando el salto inicial…</p>
              ) : (
                [...revealedEvents]
                  .slice(-12)
                  .reverse()
                  .map((event) => (
                    <p className={`ng-match__event is-${eventTone(event)}`} key={event.sequence}>
                      <time>{event.type === 'gameEnd' ? '00:00' : formatClock(event.clockSecondsRemaining)}</time>
                      <span>{formatMatchEvent(event, world)}</span>
                    </p>
                  ))
              )}
            </div>
          </section>
          {panel === 'coaching' ? (
            <CoachingDrawer
              draft={draft}
              onApply={(plan) => {
                replaceSimulation(applyLiveTactics(coachingTeamId, plan), false)
                setCoachingPlan(plan)
                setPanel('none')
              }}
              onCancel={() => setPanel('none')}
              onChange={setDraft}
              players={coachingPlayers}
            />
          ) : null}
          {panel === 'substitutions' ? (
            <div className="ng-match__drawer ng-holo-panel">
              <ManualSubstitutionsPanel
                activeLineup={coachingActiveLineup}
                canApply={segment === null}
                fatigueByPlayerId={fatigueByPlayerId}
                onApply={(substitutions) => {
                  replaceSimulation(applyManualSubstitutions(coachingTeamId, substitutions), false)
                  setPanel('none')
                }}
                onCancel={() => setPanel('none')}
                playerStats={[...homeStats, ...awayStats]}
                squadPlayers={coachingPlayers}
              />
            </div>
          ) : null}
        </aside>
      </div>

      <div className="ng-match__box ng-holo-panel">
        <BoxScore
          activePlayerIds={activeLineups.home}
          fatigueByPlayerId={fatigueByPlayerId}
          stats={homeStats}
          title={homeName}
          world={world}
        />
        <BoxScore
          activePlayerIds={activeLineups.away}
          fatigueByPlayerId={fatigueByPlayerId}
          stats={awayStats}
          title={awayName}
          world={world}
        />
      </div>

      <footer className="ng-match__controls ng-holo-panel">
        {finished ? (
          <>
            <strong>
              FINAL · {simulation.finalScore.home} – {simulation.finalScore.away}
            </strong>
            <button className="ng-btn ng-btn--primary" disabled={!resultApplied} onClick={clearMatch} type="button">
              Continuar
            </button>
          </>
        ) : (
          <>
            <button
              aria-label={isPlaying ? 'Pausar partido' : 'Reanudar partido'}
              className="ng-btn ng-btn--ghost"
              disabled={panel !== 'none'}
              onClick={isPlaying ? pause : resume}
              type="button"
            >
              {isPlaying ? 'Pausa' : 'Reanudar'}
            </button>
            <button className="ng-btn ng-btn--ghost" disabled={segment !== null} onClick={() => openPanel('coaching')} type="button">
              Coaching
            </button>
            <button className="ng-btn ng-btn--ghost" disabled={segment !== null} onClick={() => openPanel('substitutions')} type="button">
              Cambios
            </button>
            <div className="ng-match__speeds">
              {PLAYBACK_SPEEDS.map((value) => (
                <button
                  aria-pressed={speed === value}
                  className={`ng-match__speed${speed === value ? ' is-active' : ''}`}
                  key={value}
                  onClick={() => setSpeed(value)}
                  type="button"
                >
                  x{value}
                </button>
              ))}
            </div>
            <button className="ng-btn ng-btn--ghost" disabled={panel !== 'none'} onClick={simulateQuarter} type="button">
              Saltar cuarto
            </button>
            <button
              className="ng-btn ng-btn--primary"
              disabled={panel !== 'none'}
              onClick={() => {
                setSegment(null)
                replaceSimulation(skipLiveMatch(), false)
              }}
              type="button"
            >
              Saltar al final
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

function CoachingDrawer({
  draft,
  onApply,
  onCancel,
  onChange,
  players,
}: {
  readonly draft: MatchTacticalPlan
  readonly onApply: (plan: MatchTacticalPlan) => void
  readonly onCancel: () => void
  readonly onChange: (plan: MatchTacticalPlan) => void
  readonly players: readonly Player[]
}) {
  return (
    <section className="ng-match__drawer ng-holo-panel">
      <p className="ng-canon__eyebrow">Coaching en vivo</p>
      <label>
        Ritmo
        <LevelSelect onChange={(pace) => onChange({ ...draft, pace })} value={draft.pace} />
      </label>
      <label>
        Aro
        <LevelSelect
          onChange={(rim) => onChange({ ...draft, shotProfile: { ...draft.shotProfile, rim } })}
          value={draft.shotProfile.rim}
        />
      </label>
      <label>
        Media
        <LevelSelect
          onChange={(midRange) => onChange({ ...draft, shotProfile: { ...draft.shotProfile, midRange } })}
          value={draft.shotProfile.midRange}
        />
      </label>
      <label>
        Triple
        <LevelSelect
          onChange={(threePoint) => onChange({ ...draft, shotProfile: { ...draft.shotProfile, threePoint } })}
          value={draft.shotProfile.threePoint}
        />
      </label>
      <label>
        Defensa
        <select
          onChange={(event) => {
            const [interior, perimeter] = event.target.value.split('/').map(Number) as [TacticalLevel, TacticalLevel]
            onChange({ ...draft, defense: { interior, perimeter } })
          }}
          value={`${draft.defense.interior}/${draft.defense.perimeter}`}
        >
          <option value="0/0">Equilibrada</option>
          <option value="2/-1">Proteger pintura</option>
          <option value="-1/2">Presión perimetral</option>
        </select>
      </label>
      <label>
        Jugador destacado
        <select
          onChange={(event) =>
            onChange({
              ...draft,
              ...(event.target.value === '' ? {} : { featuredPlayerId: event.target.value as Player['id'] }),
            })
          }
          value={draft.featuredPlayerId ?? ''}
        >
          <option value="">Ninguno</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.firstName} {player.lastName} · {player.basketball.primaryPosition}
            </option>
          ))}
        </select>
      </label>
      <div className="ng-canon__actions">
        <button className="ng-btn ng-btn--primary" onClick={() => onApply(draft)} type="button">
          Aplicar
        </button>
        <button className="ng-btn ng-btn--ghost" onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </section>
  )
}

function LevelSelect({ value, onChange }: { readonly value: TacticalLevel; readonly onChange: (value: TacticalLevel) => void }) {
  return (
    <select onChange={(event) => onChange(Number(event.target.value) as TacticalLevel)} value={value}>
      {[-2, -1, 0, 1, 2].map((level) => (
        <option key={level} value={level}>
          {level > 0 ? `+${level}` : level}
        </option>
      ))}
    </select>
  )
}

function BoxScore({
  title,
  stats,
  world,
  fatigueByPlayerId,
  activePlayerIds,
}: {
  readonly title: string
  readonly stats: readonly PlayerMatchStats[]
  readonly world: import('@/domain/world').GameWorld
  readonly fatigueByPlayerId: Readonly<Record<string, number>>
  readonly activePlayerIds: readonly string[]
}) {
  const totals = calculateTeamMatchStats(
    stats,
    stats.map((stat) => stat.playerId),
  )
  const ordered = [...stats].sort((left, right) => rankOnCourt(activePlayerIds, left.playerId) - rankOnCourt(activePlayerIds, right.playerId))
  const rows = [
    ...ordered.map((stat) => {
      const condition = Math.round(100 - Math.min(100, Math.max(0, fatigueByPlayerId[stat.playerId] ?? 0)))
      return {
        id: stat.playerId,
        isTotal: false,
        lastName: getPlayer(world, stat.playerId).lastName,
        minutes: formatMinutes(stat.secondsPlayed),
        secondsPlayed: stat.secondsPlayed,
        conditionLabel: `${condition}%`,
        condition,
        points: stat.points,
        rebounds: stat.rebounds,
        assists: stat.assists,
        plusMinus: stat.plusMinus,
        plusMinusLabel: stat.plusMinus > 0 ? `+${stat.plusMinus}` : String(stat.plusMinus),
      }
    }),
    {
      id: '__total__',
      isTotal: true,
      lastName: 'TOTAL',
      minutes: '',
      secondsPlayed: -1,
      conditionLabel: '',
      condition: -1,
      points: totals.points,
      rebounds: totals.rebounds,
      assists: totals.assists,
      plusMinus: Number.NEGATIVE_INFINITY,
      plusMinusLabel: '',
    },
  ]
  return (
    <section>
      <p className="ng-canon__eyebrow">{title}</p>
      <NgPrecisionTable
        className="ng-canon__table"
        columns={[
          ngCol<(typeof rows)[number]>(
            'player',
            'Jugador',
            (row) =>
              row.isTotal ? (
                row.lastName
              ) : (
                <button className="ng-canon__link" onClick={() => navigateToPlayer(row.id)} type="button">
                  {row.lastName}
                </button>
              ),
            { value: (row) => row.lastName },
          ),
          ngCol<(typeof rows)[number]>('minutes', 'MIN', (row) => row.minutes, {
            numeric: true,
            value: (row) => row.secondsPlayed,
          }),
          ngCol<(typeof rows)[number]>('condition', 'CON', (row) => row.conditionLabel, {
            numeric: true,
            value: (row) => row.condition,
          }),
          ngCol<(typeof rows)[number]>('points', 'PTS', (row) => row.points, {
            numeric: true,
            value: (row) => row.points,
          }),
          ngCol<(typeof rows)[number]>('rebounds', 'REB', (row) => row.rebounds, {
            numeric: true,
            value: (row) => row.rebounds,
          }),
          ngCol<(typeof rows)[number]>('assists', 'AST', (row) => row.assists, {
            numeric: true,
            value: (row) => row.assists,
          }),
          ngCol<(typeof rows)[number]>('plusMinus', '+/-', (row) => row.plusMinusLabel, {
            numeric: true,
            value: (row) => row.plusMinus,
          }),
        ]}
        gridId="ng-match-box-score"
        rows={rows}
        selectedIds={activePlayerIds}
      />
    </section>
  )
}

function rankOnCourt(activePlayerIds: readonly string[], playerId: string): number {
  const index = activePlayerIds.indexOf(playerId)
  return index === -1 ? 99 : index
}

function formatMinutes(secondsPlayed: number): string {
  return `${Math.floor(secondsPlayed / 60).toString().padStart(2, '0')}:${(secondsPlayed % 60).toString().padStart(2, '0')}`
}

function eventTone(event: MatchEvent): string {
  if (event.type === 'shotMade' || event.type === 'freeThrowMade') return 'made'
  if (event.type === 'shotMissed' || event.type === 'freeThrowMissed') return 'missed'
  if (event.type === 'turnover') return 'turnover'
  if (event.type === 'rebound') return 'rebound'
  if (event.type === 'foul') return 'foul'
  return 'period'
}
