import { useEffect, useRef, useState } from 'react'
import { createMatchEnginePort, type MatchNextLiveController, type MatchNextResult } from '@/app/matchNext'
import type { GameId } from '@/domain/ids'
import type { MatchSetup } from '@/engine/match-next'
import { NgMatchNextViewer } from '@/ui-ng/applications/match/NgMatchNextViewer'
import { getCareerFatigueForPlayer, getTeamRoster, isPlayerAvailable } from '@/domain/world'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgMatchViewer } from '@/ui-ng/applications/match/NgMatchViewer'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { navigateToPlayer, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './match-workspace.css'

export function MatchWorkspace() {
  const world = useGameStore((state) => state.world)
  // ME-LOCK1.1: day advances simulate the day's matches in parallel workers; the buttons wait while a day is being simulated.
  const advanceDay = useGameStore((state) => state.advanceDayAsync)
  const simulateRemainingGamesToday = useGameStore((state) => state.simulateRemainingGamesTodayAsync)
  const simulationBusy = useGameStore((state) => state.simulationBusy)
  const replaceWorld = useGameStore((state) => state.replaceWorld)
  const simulation = useMatchViewerStore((state) => state.simulation)
  const tacticalPlan = useTacticalPlanStore((state) => state.plan)
  const hasExplicitTacticalPlan = useTacticalPlanStore((state) => state.hasExplicitPlan)
  const tacticalPlanOverride = hasExplicitTacticalPlan ? tacticalPlan : undefined
  const [matchNextSession, setMatchNextSession] = useState<{ readonly gameId: GameId; readonly setup: MatchSetup; readonly controller: MatchNextLiveController } | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [instantProgress, setInstantProgress] = useState<string | null>(null)
  const instantFrame = useRef<number | null>(null)

  useEffect(() => () => {
    if (instantFrame.current !== null) globalThis.cancelAnimationFrame(instantFrame.current)
  }, [])

  if (world === null) {
    return <NgHoloShell appLabel="Match" empty region="match-workspace" />
  }

  const team = getUserTeam(world)
  if (team === undefined) {
    return <NgHoloShell appLabel="Match" empty region="match-workspace" />
  }

  if (matchNextSession !== null) {
    const port = createMatchEnginePort('match-next')
    return (
      <NgHoloShell appLabel="Match" hideHeader region="match-workspace" teamId={team.id}>
        <NgMatchNextViewer
          controller={matchNextSession.controller}
          gameId={matchNextSession.gameId}
          setup={matchNextSession.setup}
          onComplete={(result: MatchNextResult) => {
            const current = useGameStore.getState().world
            if (current !== null) replaceWorld(port.complete(current, result, 'FULL'))
          }}
          onContinue={() => setMatchNextSession(null)}
          world={world}
        />
      </NgHoloShell>
    )
  }

  if (simulation !== null) {
    return (
      <NgHoloShell
        appLabel="Match"
        hideHeader
        region="match-workspace"
        teamId={team.id}
      >
        <NgMatchViewer />
      </NgHoloShell>
    )
  }

  const today = getGamesToday(world).find((game) => game.homeTeamId === team.id || game.awayTeamId === team.id)
  const next = getNextUserGame(world)
  const game = today ?? next
  if (game === undefined) {
    return (
      <NgHoloShell appLabel="Match" empty emptyMessage="No scheduled match." region="match-workspace" teamId={team.id}>
        <button className="ng-canon__action" disabled={simulationBusy} onClick={() => { void advanceDay() }} type="button">
          Advance day
        </button>
      </NgHoloShell>
    )
  }

  const opponent = world.teams[game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId]!
  const isToday = game.date === world.currentDate && game.status === 'scheduled'
  const roster = getTeamRoster(world, team.id)
  const matchNextPort = createMatchEnginePort('match-next')
  const tacticalOverrides = tacticalPlanOverride === undefined ? undefined
    : team.id === game.homeTeamId ? { home: tacticalPlanOverride } : { away: tacticalPlanOverride }
  const startMatchNext = () => {
    setMatchError(null)
    try {
      const setup = matchNextPort.prepare(world, game, undefined, tacticalOverrides)
      setMatchNextSession({ gameId: game.id, setup, controller: matchNextPort.createLiveSession(setup) })
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'No se pudo iniciar el partido ME-NEXT.')
    }
  }
  const simulateMatchNext = () => {
    setMatchError(null)
    try {
      const setup = matchNextPort.prepare(world, game, undefined, tacticalOverrides)
      const controller = matchNextPort.createLiveSession(setup)
      setInstantProgress('Simulando resultado ME-NEXT…')
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
          setInstantProgress(`Simulando ME-NEXT · período ${snapshot.frame.period}`)
          instantFrame.current = globalThis.requestAnimationFrame(advanceChunk)
        } catch (error) {
          setMatchError(error instanceof Error ? error.message : 'No se pudo completar la simulación ME-NEXT.')
          setInstantProgress(null)
          instantFrame.current = null
        }
      }
      instantFrame.current = globalThis.requestAnimationFrame(advanceChunk)
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'No se pudo simular el partido ME-NEXT.')
      setInstantProgress(null)
    }
  }

  return (
    <NgHoloShell
      appLabel="Match"
      meta={`${formatGameDateLabel(game.date)} · ${game.homeTeamId === team.id ? 'Home' : 'Away'}`}
      region="match-workspace"
      teamId={team.id}
      title={`${team.name} vs ${opponent.name}`}
    >
      <div className="ng-canon__overview">
        <section className="ng-canon__card ng-holo-panel">
          <p className="ng-canon__eyebrow">Match day</p>
          <h3 className="ng-canon__title">{isToday ? 'Game today' : 'Next fixture'}</h3>
          <dl className="ng-canon__metrics">
            <NgMetric label="Opponent" value={opponent.name} />
            <NgMetric label="Status" value={game.status} />
            <NgMetric label="Competition" value={world.competitions[game.competitionId]?.name ?? '—'} />
          </dl>
          <div className="ng-canon__actions">
            {isToday ? (
              <>
                <button
                  className="ng-canon__action"
                  disabled={instantProgress !== null}
                  onClick={startMatchNext}
                  type="button"
                >
                  Play match
                </button>
                <button className="ng-canon__action" disabled={instantProgress !== null} onClick={simulateMatchNext} type="button">
                  Instant result
                </button>
                <button className="ng-canon__action" disabled={instantProgress !== null || simulationBusy} onClick={() => { void simulateRemainingGamesToday() }} type="button">
                  Simulate other games
                </button>
              </>
            ) : null}
            <button className="ng-canon__action" disabled={simulationBusy} onClick={() => { void advanceDay() }} type="button">
              Advance day
            </button>
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('roster')} type="button">
              Roster
            </button>
            <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('tactics')} type="button">
              Tactics
            </button>
          </div>
        </section>
      </div>
      {instantProgress && <p role="status">{instantProgress}</p>}
      {matchError && <p role="alert" className="ng-canon__error">{matchError}</p>}
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <p className="ng-canon__eyebrow">Readiness</p>
        <NgPrecisionTable
          className="ng-canon__table"
          columns={ngTableColumns(roster, [
            ngCol(
              'player',
              'Player',
              (player) => (
                <button className="ng-canon__link" onClick={() => navigateToPlayer(player.id)} type="button">
                  {player.firstName} {player.lastName}
                </button>
              ),
              { value: (player) => `${player.firstName} ${player.lastName}` },
            ),
            ngCol('pos', 'Pos', (player) => <PlayPositionMark position={player.basketball.primaryPosition} />, {
              value: (player) => player.basketball.primaryPosition,
            }),
            ngCol('fatigue', 'Fatigue', (player) => getCareerFatigueForPlayer(world, player.id), {
              numeric: true,
              value: (player) => getCareerFatigueForPlayer(world, player.id),
            }),
            ngCol(
              'available',
              'Available',
              (player) => (isPlayerAvailable(world, player.id) ? 'Available' : 'Unavailable'),
              { value: (player) => (isPlayerAvailable(world, player.id) ? 'Available' : 'Unavailable') },
            ),
          ])}
          gridId="ng-match-readiness"
          rows={roster}
        />
      </div>
    </NgHoloShell>
  )
}
