import { getCareerFatigueForPlayer, getTeamRoster, isPlayerAvailable } from '@/domain/world'
import { getGamesToday, getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { useMatchViewerStore } from '@/stores/matchViewerStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgMatchViewer } from '@/ui-ng/applications/match/NgMatchViewer'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { navigateToPlayer, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './match-workspace.css'

export function MatchWorkspace() {
  const world = useGameStore((state) => state.world)
  const instantResult = useGameStore((state) => state.instantResult)
  const advanceDay = useGameStore((state) => state.advanceDay)
  const simulateRemainingGamesToday = useGameStore((state) => state.simulateRemainingGamesToday)
  const startLiveMatch = useGameStore((state) => state.startLiveMatch)
  const startMatch = useMatchViewerStore((state) => state.startMatch)
  const simulation = useMatchViewerStore((state) => state.simulation)
  const tacticalPlan = useTacticalPlanStore((state) => state.plan)

  if (world === null) {
    return <NgHoloShell appLabel="Match" empty region="match-workspace" />
  }

  const team = getUserTeam(world)
  if (team === undefined) {
    return <NgHoloShell appLabel="Match" empty region="match-workspace" />
  }

  if (simulation !== null) {
    return (
      <NgHoloShell
        appLabel="Match"
        region="match-workspace"
        teamId={team.id}
        title={`${world.teams[simulation.homeTeamId]?.name ?? 'Home'} vs ${world.teams[simulation.awayTeamId]?.name ?? 'Away'}`}
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
        <button className="ng-canon__action" onClick={() => advanceDay()} type="button">
          Advance day
        </button>
      </NgHoloShell>
    )
  }

  const opponent = world.teams[game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId]!
  const isToday = game.date === world.currentDate && game.status === 'scheduled'
  const roster = getTeamRoster(world, team.id)

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
                  onClick={() => startMatch(startLiveMatch(tacticalPlan))}
                  type="button"
                >
                  Play match
                </button>
                <button className="ng-canon__action" onClick={() => instantResult(tacticalPlan)} type="button">
                  Instant result
                </button>
                <button className="ng-canon__action" onClick={() => simulateRemainingGamesToday()} type="button">
                  Simulate other games
                </button>
              </>
            ) : null}
            <button className="ng-canon__action" onClick={() => advanceDay()} type="button">
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
      <div className="ng-canon__panel ng-holo-panel" style={{ marginTop: 'var(--ng-spacing-12)' }}>
        <p className="ng-canon__eyebrow">Readiness</p>
        <NgPrecisionTable
          className="ng-canon__table"
          columns={[
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
          ]}
          gridId="ng-match-readiness"
          rows={roster}
        />
      </div>
    </NgHoloShell>
  )
}
