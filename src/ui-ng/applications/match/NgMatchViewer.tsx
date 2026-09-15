import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { getUserTeam } from '@/engine/calendar'
import {
  calculateMatchPlayerStats,
  type MatchTacticalPlan,
} from '@/engine/match'
import { tauriGameSaveRepository } from '@/tauri/TauriGameSaveRepository'
import { useGameStore } from '@/stores/gameStore'
import { PLAYBACK_SPEEDS, useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import {
  createPresentationSegment,
  displayClockAtProgress,
  presentationDurationMs,
  visualDetailForSpeed,
  type MatchPresentationSegment,
} from '@/ui/match/MatchPresentationSegment'
import { formatClock, formatPeriod, resolveActiveMatchLineups, resolveMatchFatigue } from '@/ui/matchViewer'
import { isMatchComplete } from '@/ui/screens/MatchViewerScreen'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { LiveCourtStage } from '@/ui-ng/applications/match/engine/LiveCourtStage'
import {
  GameClock,
  MatchQuickControls,
  MatchScoreboard,
  TeamScoreSummary,
} from '@/ui-ng/applications/match/engine/MatchScoreboard'
import {
  energyFromFatigue,
  matchdayLabel,
  seasonLabel,
  teamFoulsTotal,
  teamMark,
  teamRecordLabel,
  venueLabel,
  chromeSafeClubAccent,
  type LiveStageMode,
  type TacticalPanelTab,
} from '@/ui-ng/applications/match/engine/matchPresentation'
import { TacticalPanel } from '@/ui-ng/applications/match/engine/TacticalPanel'
import { TeamBoxScore } from '@/ui-ng/applications/match/engine/TeamBoxScore'
import { navigateToPlayer, navigateToTeamInNg } from '@/ui-ng/workspace/workspaceApps'

import './engine/match-engine.css'

export function NgMatchViewer() {
  const world = useGameStore((state) => state.world)
  const completeMatch = useGameStore((state) => state.completeMatch)
  const saveCompletedMatch = useGameStore((state) => state.saveCompletedMatch)
  const advanceLiveMatchPresentation = useGameStore((state) => state.advanceLiveMatchPresentation)
  const skipLiveMatch = useGameStore((state) => state.skipLiveMatch)
  const applyLiveTactics = useGameStore((state) => state.applyLiveTactics)
  const applyManualSubstitutions = useGameStore((state) => state.applyManualSubstitutions)
  const currentLiveMatchSnapshot = useGameStore((state) => state.currentLiveMatchSnapshot)
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

  const [stageMode, setStageMode] = useState<LiveStageMode>('tracking')
  const [tacticalTab, setTacticalTab] = useState<TacticalPanelTab>('general')
  const [boxScoresCollapsed, setBoxScoresCollapsed] = useState(false)
  const [draft, setDraft] = useState(coachingPlan)
  const [tacticalError, setTacticalError] = useState<string | null>(null)
  const [matchSaveError, setMatchSaveError] = useState<string | null>(null)
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
    if (!markResultApplied()) return
    completeMatch(simulation)
    setMatchSaveError(null)
    saveCompletedMatch(tauriGameSaveRepository, new Date().toISOString()).catch((error: unknown) => {
      setMatchSaveError(error instanceof Error ? error.message : 'Unable to save the completed match')
    })
  }, [completeMatch, finished, markResultApplied, resultApplied, saveCompletedMatch, simulation])

  const homeColors = deriveTeamColors(simulation?.homeTeamId ?? 'home')
  const awayColors = deriveTeamColors(simulation?.awayTeamId ?? 'away')
  const userTeamId =
    world === null
      ? (simulation?.homeTeamId ?? 'home')
      : (getUserTeam(world)?.id ?? simulation?.homeTeamId ?? 'home')
  const rawClub = deriveTeamColors(String(userTeamId))
  const clubColors = chromeSafeClubAccent(rawClub.primary, rawClub.secondary)
  const courtStyle = useMemo(
    () =>
      ({
        '--ng-match-home': homeColors.primary,
        '--ng-match-home-accent': homeColors.secondary,
        '--ng-match-away': awayColors.primary,
        '--ng-match-away-accent': awayColors.secondary,
        '--me-club': clubColors.primary,
        '--me-club-hi': clubColors.secondary,
        '--me-club-ink': clubColors.ink,
      }) as CSSProperties,
    [
      awayColors.primary,
      awayColors.secondary,
      clubColors.primary,
      clubColors.secondary,
      clubColors.ink,
      homeColors.primary,
      homeColors.secondary,
    ],
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
  const game = world.games[simulation.gameId]
  const venue = venueLabel(world, simulation.homeTeamId)
  const onCourtStats = (coachingTeamId === simulation.homeTeamId ? homeStats : awayStats).filter((stat) =>
    coachingActiveLineup.includes(stat.playerId),
  )
  const benchStats = (coachingTeamId === simulation.homeTeamId ? homeStats : awayStats).filter(
    (stat) => !coachingActiveLineup.includes(stat.playerId),
  )
  const energyPercent = Math.round(
    coachingActiveLineup.reduce((sum, playerId) => sum + energyFromFatigue(fatigueByPlayerId[playerId]), 0) /
      Math.max(1, coachingActiveLineup.length),
  )
  const liveEventCount = revealedEvents.filter((event) => event.type === 'shotMade' || event.type === 'foul').length

  const openSubs = () => {
    pause()
    setTacticalTab('jugadores')
  }

  const openTactics = () => {
    pause()
    setDraft(coachingPlan)
    setTacticalTab('ataque')
  }

  const nextPossession = () => {
    if (finished || segment !== null) return
    pause()
    requestingSegmentRef.current = false
    setSegment(null)
    setPresentationProgress(0)
    const step = createPresentationSegment(advanceLiveMatchPresentation())
    replaceSimulation(step.endSimulation, false)
  }

  const skipToEnd = () => {
    setSegment(null)
    setPresentationProgress(0)
    requestingSegmentRef.current = false
    replaceSimulation(skipLiveMatch(), false)
  }

  const skipToEndOfPeriod = () => {
    if (finished) return
    setSegment(null)
    setPresentationProgress(0)
    requestingSegmentRef.current = false
    const controller = useGameStore.getState().getActiveMatchSession()
    if (controller === null) return
    replaceSimulation(controller.skipToEndOfPeriod(), false)
    pause()
  }

  return (
    <section className="me" data-ng-region="match-live" style={courtStyle}>
      <MatchScoreboard
        home={
          <TeamScoreSummary
            fouls={teamFoulsTotal(homeStats)}
            mark={teamMark(homeName)}
            name={homeName}
            onOpen={() => navigateToTeamInNg({ type: 'team', teamId: simulation.homeTeamId, section: 'overview' })}
            record={teamRecordLabel(world, simulation.homeTeamId)}
            side="home"
            timeouts={null}
          />
        }
        score={
          <GameClock
            arena={venue.arena}
            attendance={null}
            awayScore={awayScore}
            clockLabel={formatClock(clock)}
            finished={finished}
            homeScore={homeScore}
            location={venue.location}
            periodLabel={formatPeriod(period)}
            shotClock={null}
          />
        }
        away={
          <TeamScoreSummary
            fouls={teamFoulsTotal(awayStats)}
            mark={teamMark(awayName)}
            name={awayName}
            onOpen={() => navigateToTeamInNg({ type: 'team', teamId: simulation.awayTeamId, section: 'overview' })}
            record={teamRecordLabel(world, simulation.awayTeamId)}
            side="away"
            timeouts={null}
          />
        }
        controls={
          <MatchQuickControls
            canContinue={resultApplied}
            finished={finished}
            isPlaying={isPlaying}
            onContinue={clearMatch}
            onNextPossession={nextPossession}
            onSetSpeed={(value) => setSpeed(value as (typeof PLAYBACK_SPEEDS)[number])}
            onSubs={openSubs}
            onSkipEnd={skipToEnd}
            onSkipPeriod={skipToEndOfPeriod}
            onTimeout={() => {
              pause()
            }}
            onTogglePlay={isPlaying ? pause : resume}
            speed={speed}
            speeds={[1, 2, 4]}
          />
        }
        meta={
          <div className="me-meta">
            <div className="me-meta__season">
              <strong>{seasonLabel(world)}</strong>
              <em>{game === undefined ? 'Jornada' : matchdayLabel(world, game.competitionId)}</em>
              <span>{String(world.currentDate)}</span>
            </div>
            {finished && matchSaveError !== null ? (
              <div className="me-meta__live" role="alert">
                <em>Save failed</em>
                <strong>{matchSaveError}</strong>
              </div>
            ) : (
              <div className="me-meta__live">
                <em>Eventos en vivo</em>
                <strong>{liveEventCount} nuevos</strong>
                <span className="me-meta__dots" aria-hidden>
                  <i />
                  <i />
                </span>
              </div>
            )}
          </div>
        }
      />

      <div className="me-main">
        <div className="me-left">
          <div className="me-live-view">
            <LiveCourtStage
              attackingTeamId={segment?.attackingTeamId ?? simulation.homeTeamId}
              awayName={awayName}
              awayTeamId={simulation.awayTeamId}
              courtStyle={courtStyle}
              detail={visualDetailForSpeed(speed)}
              events={segment?.events ?? []}
              gameId={simulation.gameId}
              homeName={homeName}
              homeTeamId={simulation.homeTeamId}
              isPlaying={isPlaying}
              lineups={segment?.startLineups ?? activeLineups}
              onPlayerSelect={navigateToPlayer}
              period={segment?.period ?? period}
              playbackSpeed={speed}
              progress={presentationProgress}
              world={world}
            />
          </div>

          <div className="me-boxscores">
            <TeamBoxScore
              activePlayerIds={activeLineups.home}
              collapsed={boxScoresCollapsed}
              onToggleCollapsed={() => setBoxScoresCollapsed((value) => !value)}
              onOpenTeam={() => navigateToTeamInNg({ type: 'team', teamId: simulation.homeTeamId, section: 'overview' })}
              score={homeScore}
              side="local"
              stats={homeStats}
              title={homeName}
              world={world}
            />
            <TeamBoxScore
              activePlayerIds={activeLineups.away}
              collapsed={boxScoresCollapsed}
              onToggleCollapsed={() => setBoxScoresCollapsed((value) => !value)}
              onOpenTeam={() => navigateToTeamInNg({ type: 'team', teamId: simulation.awayTeamId, section: 'overview' })}
              score={awayScore}
              side="visitante"
              stats={awayStats}
              title={awayName}
              world={world}
            />
          </div>
        </div>

        <TacticalPanel
          activeLineup={coachingActiveLineup}
          allStats={[...homeStats, ...awayStats]}
          bench={benchStats}
          canApplySubs={segment === null}
          draft={draft}
          energyPercent={energyPercent}
          fatigueByPlayerId={fatigueByPlayerId}
          onApplySubs={(substitutions) => {
            const result = applyManualSubstitutions(coachingTeamId, substitutions)
            if (result.status !== 'applied') throw new Error(result.message)
            replaceSimulation(currentLiveMatchSnapshot(), false)
            setTacticalTab('general')
          }}
          onApplyTactics={(plan: MatchTacticalPlan) => {
            const result = applyLiveTactics(coachingTeamId, plan)
            if (result.status !== 'applied') { setTacticalError(result.message); return }
            setTacticalError(null)
            replaceSimulation(currentLiveMatchSnapshot(), false)
            setCoachingPlan(plan)
            setTacticalTab('general')
          }}
          tacticalError={tacticalError}
          onDraftChange={setDraft}
          onStageModeChange={setStageMode}
          onTabChange={(tab) => {
            setStageMode('tracking')
            if (tab === 'jugadores' || tab === 'ataque' || tab === 'defensa') {
              pause()
              setDraft(coachingPlan)
              setTacticalError(null)
            }
            setTacticalTab(tab)
          }}
          onCourt={onCourtStats}
          players={coachingPlayers}
          stageMode={stageMode}
          tab={tacticalTab}
          teamName={(team ?? world.teams[coachingTeamId]!).name}
          events={revealedEvents}
          world={world}
        />
      </div>
    </section>
  )
}
