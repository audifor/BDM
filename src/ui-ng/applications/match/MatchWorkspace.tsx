import { useEffect, useMemo, useRef, useState } from 'react'
import { createMatchEnginePort, type MatchNextLiveController, type MatchNextResult } from '@/app/matchNext'
import { getUserMatchReadiness } from '@/app/game/UserMatchReadiness'
import type { GameId } from '@/domain/ids'
import type { MatchSetup } from '@/engine/match-next'
import { NgMatchNextViewer } from '@/ui-ng/applications/match/NgMatchNextViewer'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { NgMatchViewer } from '@/ui-ng/applications/match/NgMatchViewer'
import { MatchPrepPanel } from '@/ui-ng/applications/match/MatchPrepPanel'
import { latestUserMatchLog, MatchReportPanel } from '@/ui-ng/applications/match/MatchReportPanel'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './match-workspace.css'
import './match-prep.css'

export function MatchWorkspace() {
  const world = useGameStore((state) => state.world)
  // ME-LOCK1.1: day advances simulate the day's matches in parallel workers; the buttons wait while a day is being simulated.
  const advanceDay = useGameStore((state) => state.advanceDayAsync)
  const simulateRemainingGamesToday = useGameStore((state) => state.simulateRemainingGamesTodayAsync)
  const simulationBusy = useGameStore((state) => state.simulationBusy)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const setLiveMatchActive = useGameStore((state) => state.setLiveMatchActive)
  const simulation = useMatchViewerStore((state) => state.simulation)
  const [matchNextSession, setMatchNextSession] = useState<{ readonly gameId: GameId; readonly setup: MatchSetup; readonly controller: MatchNextLiveController } | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [instantProgress, setInstantProgress] = useState<string | null>(null)
  const instantFrame = useRef<number | null>(null)
  const readiness = useMemo(() => (world === null ? undefined : getUserMatchReadiness(world)), [world])
  const lastResult = useMemo(() => (world === null ? undefined : latestUserMatchLog(world)), [world])

  useEffect(() => () => {
    if (instantFrame.current !== null) globalThis.cancelAnimationFrame(instantFrame.current)
  }, [])
  // A watched or running simulation is not part of GameWorld: saving or loading meanwhile is refused by the career controls.
  const simulationActive = matchNextSession !== null || instantProgress !== null
  useEffect(() => {
    setLiveMatchActive(simulationActive)
    return () => setLiveMatchActive(false)
  }, [setLiveMatchActive, simulationActive])

  if (world === null) {
    return <NgHoloShell appLabel="Partido" empty region="match-workspace" />
  }

  const team = getUserTeam(world)
  if (team === undefined) {
    return <NgHoloShell appLabel="Partido" empty region="match-workspace" />
  }

  const matchNextPort = createMatchEnginePort('match-next')

  if (matchNextSession !== null) {
    return (
      <NgHoloShell appLabel="Partido" hideHeader region="match-workspace" teamId={team.id}>
        <NgMatchNextViewer
          controller={matchNextSession.controller}
          gameId={matchNextSession.gameId}
          setup={matchNextSession.setup}
          onComplete={(result: MatchNextResult) => {
            // The result enters GameWorld exactly once, when the final whistle is reached: a second application fails closed.
            try {
              const current = useGameStore.getState().world
              if (current !== null) replaceWorld(matchNextPort.complete(current, result, 'FULL'))
            } catch (error) {
              setMatchError(error instanceof Error ? error.message : 'No se pudo registrar el resultado del partido.')
            }
          }}
          onContinue={() => setMatchNextSession(null)}
          world={world}
        />
      </NgHoloShell>
    )
  }

  if (simulation !== null) {
    return (
      <NgHoloShell appLabel="Partido" hideHeader region="match-workspace" teamId={team.id}>
        <NgMatchViewer />
      </NgHoloShell>
    )
  }

  const game = readiness?.game
  const opponent = readiness === undefined ? undefined : world.teams[readiness.opponentTeamId]
  const startMatchNext = () => {
    if (game === undefined) return
    setMatchError(null)
    try {
      const setup = matchNextPort.prepare(world, game)
      setMatchNextSession({ gameId: game.id, setup, controller: matchNextPort.createLiveSession(setup) })
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'No se pudo iniciar el partido.')
    }
  }
  const simulateMatchNext = () => {
    if (game === undefined) return
    setMatchError(null)
    try {
      const setup = matchNextPort.prepare(world, game)
      const controller = matchNextPort.createLiveSession(setup)
      setInstantProgress('Simulando el partido…')
      const advanceChunk = () => {
        try {
          const snapshot = controller.advanceTicks(200)
          if (snapshot.isComplete) {
            const current = useGameStore.getState().world
            if (current !== null) replaceWorld(matchNextPort.complete(current, controller.result()))
            setInstantProgress(null)
            instantFrame.current = null
            return
          }
          setInstantProgress(`Simulando el partido · periodo ${snapshot.frame.period}`)
          instantFrame.current = globalThis.requestAnimationFrame(advanceChunk)
        } catch (error) {
          setMatchError(error instanceof Error ? error.message : 'No se pudo completar la simulación.')
          setInstantProgress(null)
          instantFrame.current = null
        }
      }
      instantFrame.current = globalThis.requestAnimationFrame(advanceChunk)
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'No se pudo simular el partido.')
      setInstantProgress(null)
    }
  }
  const justPlayed = lastResult !== undefined && lastResult.game.date === world.currentDate
  const report = lastResult === undefined ? null : <MatchReportPanel game={lastResult.game} log={lastResult.log} world={world} />
  const canPlay = readiness !== undefined && readiness.isToday && readiness.blockedReason === undefined

  return (
    <NgHoloShell
      appLabel="Partido"
      meta={readiness === undefined ? undefined : `${readiness.competitionName} · ${readiness.isHome ? 'En casa' : 'Fuera'}`}
      region="match-workspace"
      teamId={team.id}
      title={readiness === undefined ? `${team.name}` : `${team.name} vs ${opponent?.name ?? ''}`}
    >
      <div className="mp-root">
        <div className="mp-actions" role="group" aria-label="Acciones del partido">
          {readiness?.isToday ? (
            <>
              <button className="mp-action mp-action--primary" disabled={!canPlay || instantProgress !== null} onClick={startMatchNext} type="button">Jugar partido</button>
              <button className="mp-action" disabled={!canPlay || instantProgress !== null} onClick={simulateMatchNext} type="button">Simulación rápida</button>
              <button className="mp-action" disabled={instantProgress !== null || simulationBusy} onClick={() => { void simulateRemainingGamesToday() }} type="button">Simular otros partidos del día</button>
            </>
          ) : readiness === undefined ? null : <p className="mp-note">El próximo partido es el {readiness.game.date}. Avanza hasta esa fecha para disputarlo.</p>}
          <button className="mp-action" disabled={simulationBusy || instantProgress !== null} onClick={() => { void advanceDay() }} type="button">Avanzar un día</button>
        </div>
        {instantProgress && <p role="status" className="mp-note">{instantProgress}</p>}
        {matchError && <p role="alert" className="mp-alert">{matchError}</p>}
        {justPlayed && report}
        {readiness === undefined
          ? <p className="mp-empty">No hay partidos programados para tu equipo.</p>
          : <MatchPrepPanel onOpenRoster={() => syncWorkspaceAppQuery('roster')} onOpenTactics={() => syncWorkspaceAppQuery('tactics')} readiness={readiness} world={world} />}
        {!justPlayed && report}
      </div>
    </NgHoloShell>
  )
}
