import { useMemo, useState } from 'react'

import { compareGameDates } from '@/domain/date'
import type { Game } from '@/domain/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

const TABS = [
  { id: 'season', label: 'Season' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'results', label: 'Results' },
] as const

function compareGameIds(left: Game, right: Game): number {
  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1
}

export function ScheduleWorkspace() {
  const world = useGameStore((state) => state.world)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('season')
  const team = world === null ? undefined : getUserTeam(world)
  const games = useMemo(() => {
    if (world === null || team === undefined) return []
    return Object.values(world.games)
      .filter((game) => game.homeTeamId === team.id || game.awayTeamId === team.id)
      .sort((left, right) => compareGameDates(left.date, right.date) || compareGameIds(left, right))
  }, [team, world])

  if (world === null || team === undefined) {
    return <NgHoloShell appLabel="Schedule" empty region="schedule-workspace" />
  }

  const rows =
    tab === 'upcoming'
      ? games.filter((game) => game.status !== 'completed')
      : tab === 'results'
        ? games.filter((game) => game.status === 'completed')
        : games

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Schedule"
      meta={<><span className="ng-type-numeric">{games.length}</span> games</>}
      onTabSelect={(id) => setTab(id as (typeof TABS)[number]['id'])}
      region="schedule-workspace"
      tabs={TABS}
      teamId={team.id}
      title={team.name}
    >
      {rows.length === 0 ? (
        <p className="ng-canon__empty">No fixtures in this view.</p>
      ) : (
        <div className="ng-canon__panel ng-holo-panel">
          <NgPrecisionTable
            className="ng-canon__table"
            columns={ngTableColumns(rows.map((game) => {
              const home = world.teams[game.homeTeamId]!
              const away = world.teams[game.awayTeamId]!
              return {
                id: game.id,
                date: game.date,
                competitionName: world.competitions[game.competitionId]?.name ?? game.competitionId,
                matchup:
                  game.status === 'completed' && game.result !== undefined
                    ? `${home.name} ${game.result.homeScore} – ${game.result.awayScore} ${away.name}`
                    : `${home.name} vs ${away.name}`,
                venue: game.homeTeamId === team.id ? 'Home' : 'Away',
                status: game.status,
              }
            }), [
              ngCol('date', 'Date', (row) => formatGameDateLabel(row.date), { value: (row) => row.date }),
              ngCol('competition', 'Competition', (row) => row.competitionName, { value: (row) => row.competitionName }),
              ngCol('matchup', 'Matchup', (row) => row.matchup, { value: (row) => row.matchup }),
              ngCol('venue', 'Venue', (row) => row.venue, { value: (row) => row.venue }),
              ngCol('status', 'Status', (row) => (
                <>
                  <span className="ng-canon__badge">{row.status}</span>
                  {row.status === 'scheduled' ? (
                    <button className="ng-canon__link" onClick={() => syncWorkspaceAppQuery('match')} type="button">
                      {' '}
                      Open match
                    </button>
                  ) : null}
                </>
              ), { value: (row) => row.status }),
            ])}
            gridId="ng-schedule"
            rows={rows.map((game) => {
              const home = world.teams[game.homeTeamId]!
              const away = world.teams[game.awayTeamId]!
              return {
                id: game.id,
                date: game.date,
                competitionName: world.competitions[game.competitionId]?.name ?? game.competitionId,
                matchup:
                  game.status === 'completed' && game.result !== undefined
                    ? `${home.name} ${game.result.homeScore} – ${game.result.awayScore} ${away.name}`
                    : `${home.name} vs ${away.name}`,
                venue: game.homeTeamId === team.id ? 'Home' : 'Away',
                status: game.status,
              }
            })}
          />
        </div>
      )}
    </NgHoloShell>
  )
}
