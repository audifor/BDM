import { useMemo, useState } from 'react'

import { parseGameDate } from '@/domain/date'
import type { CompetitionId, TeamId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import {
  buildCompetitionWorkspaceModel,
  calendarEventsForMonth,
  CALENDAR_DAY_EVENT_CAP,
  COMPETITION_TAB_LABELS,
  COMPETITION_TABS,
  monthGrid,
  monthStart,
  monthTitle,
  shiftMonth,
  standingsPct,
  type CalendarEvent,
  type CalendarGameEvent,
  type CompetitionGameRow,
  type CompetitionTabId,
} from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { navigateToPlayer, syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './competition-workspace.css'

const STAKES_LABEL: Readonly<Record<CalendarGameEvent['stakes'], string | undefined>> = {
  regular: undefined,
  important: 'Importante',
  elimination: 'Eliminación',
  final: 'Final',
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

function TeamLink({ teamId, name }: { readonly teamId: TeamId; readonly name: string }) {
  const { openEntity } = useNgWorkspaceNavigation()
  return (
    <button
      className="ng-canon__link"
      onClick={() => openEntity({ type: 'team', teamId, section: 'overview' })}
      type="button"
    >
      {name}
    </button>
  )
}

function CompetitionGamesTable({
  games,
  gridId,
  showAction = false,
}: {
  readonly games: readonly CompetitionGameRow[]
  readonly gridId: string
  readonly showAction?: boolean
}) {
  return (
    <NgPrecisionTable
      className="ng-canon__table"
      columns={[
        ngCol('date', 'Fecha', (row) => row.date, { defaultWidth: 108, value: (row) => row.date }),
        ngCol('home', 'Local', (row) => <TeamLink name={row.homeName} teamId={row.homeTeamId} />, {
          value: (row) => row.homeName,
        }),
        ngCol('score', 'Res', (row) => row.scoreLabel, {
          align: 'center',
          defaultWidth: 96,
          value: (row) => row.scoreLabel,
        }),
        ngCol('away', 'Visitante', (row) => <TeamLink name={row.awayName} teamId={row.awayTeamId} />, {
          value: (row) => row.awayName,
        }),
        ...(showAction
          ? [
              ngCol(
                'action',
                '',
                (row) =>
                  row.status === 'scheduled' ? (
                    <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('match')} type="button">
                      Partido
                    </button>
                  ) : null,
                { align: 'center', defaultWidth: 92, sortable: false },
              ),
            ]
          : []),
      ]}
      gridId={gridId}
      rows={games}
    />
  )
}

function CalendarEventCard({ event }: { readonly event: CalendarEvent }) {
  if (event.kind === 'game') {
    const stakes = STAKES_LABEL[event.stakes]
    return (
      <div className={`competition-calendar__event is-${event.tone}`} data-calendar-kind={event.tone} title={event.competitionName}>
        {event.isSelectedCompetition ? null : (
          <span className="competition-calendar__comp">{event.competitionName}</span>
        )}
        <div className="competition-calendar__match">
          <TeamLink name={event.homeName} teamId={event.homeTeamId} />
          <span className="competition-calendar__score">{event.scoreLabel}</span>
          <TeamLink name={event.awayName} teamId={event.awayTeamId} />
        </div>
        {stakes === undefined ? null : <span className="competition-calendar__stakes">{stakes}</span>}
      </div>
    )
  }

  if (event.kind === 'training') {
    return (
      <button
        className="competition-calendar__event is-training"
        data-calendar-kind="training"
        onClick={() => syncWorkspaceAppQuery('training')}
        title={event.detail}
        type="button"
      >
        <span className="competition-calendar__note">{event.label}</span>
        {event.detail === undefined ? null : <span className="competition-calendar__detail">{event.detail}</span>}
      </button>
    )
  }

  return (
    <div className="competition-calendar__event is-milestone" data-calendar-kind="milestone" title={event.detail}>
      <span className="competition-calendar__note">{event.label}</span>
    </div>
  )
}

export function CompetitionWorkspace() {
  const world = useGameStore((state) => state.world)
  const [tab, setTab] = useState<CompetitionTabId>('calendar')
  const { competitionId } = useNgWorkspaceNavigation()
  const [preferredCompetitionId, setPreferredCompetitionId] = useState<CompetitionId | undefined>(
    competitionId ?? undefined,
  )
  const [onlyUserTeam, setOnlyUserTeam] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const team = world === null ? undefined : getUserTeam(world)
  const model = world === null ? null : buildCompetitionWorkspaceModel(world, preferredCompetitionId, team?.id)
  const currentMonth = world === null ? undefined : shiftMonth(monthStart(parseGameDate(world.currentDate)), monthOffset)
  const cells = currentMonth === undefined ? [] : monthGrid(currentMonth)
  const eventsByDate = useMemo(() => {
    if (model === null || currentMonth === undefined) return {}
    return calendarEventsForMonth(model.calendarEvents, currentMonth, onlyUserTeam && team !== undefined)
  }, [currentMonth, model, onlyUserTeam, team])

  if (world === null || model === null || currentMonth === undefined) {
    return (
      <NgHoloShell
        appLabel="Competition"
        empty
        emptyMessage="No competitions with a canonical season."
        region="competition-workspace"
      />
    )
  }

  return (
    <NgHoloShell
      activeTabId={tab}
      appLabel="Competition"
      meta={model.seasonLabel}
      onTabSelect={(id) => setTab(id as CompetitionTabId)}
      region="competition-workspace"
      tabs={COMPETITION_TABS.map((id) => ({ id, label: COMPETITION_TAB_LABELS[id] }))}
      teamId={team?.id}
      title={model.competitionName}
    >
      <div className="ng-canon__toolbar">
        <select
          aria-label="Competición"
          onChange={(event) => {
            setPreferredCompetitionId(event.target.value as CompetitionId)
            setMonthOffset(0)
          }}
          value={model.competitionId}
        >
          {model.competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.name}
            </option>
          ))}
        </select>
        {tab === 'calendar' ? (
          <label>
            Mostrar
            <select
              aria-label="Filtro de calendario"
              onChange={(event) => setOnlyUserTeam(event.target.value === 'mine')}
              value={team !== undefined && onlyUserTeam ? 'mine' : 'all'}
            >
              <option value="all">Todos</option>
              {team !== undefined ? <option value="mine">Mi equipo</option> : null}
            </select>
          </label>
        ) : null}
      </div>

      {tab === 'calendar' ? (
        <section className="competition-calendar" data-ng-region="competition-calendar">
          <div className="competition-calendar__nav">
            <button className="ng-canon__action" onClick={() => setMonthOffset((value) => value - 1)} type="button">
              Anterior
            </button>
            <h2 className="competition-calendar__month">{monthTitle(currentMonth)}</h2>
            <button className="ng-canon__action" onClick={() => setMonthOffset((value) => value + 1)} type="button">
              Siguiente
            </button>
          </div>
          <p className="competition-calendar__legend">
            <span className="is-user-game">Mis partidos</span>
            <span className="is-milestone">Hitos</span>
            <span className="is-training">Entrenamiento</span>
            {onlyUserTeam ? null : <span className="is-league-game">Liga</span>}
          </p>
          <div className="competition-calendar__grid">
            {WEEKDAYS.map((day) => (
              <span className="competition-calendar__weekday" key={day}>
                {day}
              </span>
            ))}
            {cells.map((date) => {
              const outside = !date.startsWith(currentMonth.slice(0, 7))
              const today = date === world.currentDate
              const dayEvents = eventsByDate[date] ?? []
              const visible = dayEvents.slice(0, CALENDAR_DAY_EVENT_CAP)
              const overflow = dayEvents.length - visible.length
              return (
                <article
                  className={`competition-calendar__day${outside ? ' is-outside' : ''}${today ? ' is-today' : ''}`}
                  key={date}
                >
                  <span className="competition-calendar__day-number">{Number(date.slice(-2))}</span>
                  {visible.map((event) => (
                    <CalendarEventCard event={event} key={event.id} />
                  ))}
                  {overflow > 0 ? (
                    <span className="competition-calendar__more">+{overflow} más</span>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {tab === 'upcoming' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {model.upcoming.length === 0 ? (
            <p className="ng-canon__empty">No hay partidos pendientes.</p>
          ) : (
            <CompetitionGamesTable games={model.upcoming} gridId="ng-competition-upcoming" showAction />
          )}
        </div>
      ) : null}

      {tab === 'results' ? (
        <div className="ng-canon__panel ng-holo-panel">
          {model.dateGroups.filter((group) => group.games.some((game) => game.status === 'completed')).length === 0 ? (
            <p className="ng-canon__empty">Aún no hay resultados en esta temporada.</p>
          ) : (
            model.dateGroups
              .filter((group) => group.games.some((game) => game.status === 'completed'))
              .map((group) => (
                <section className="competition-jornada" key={group.date}>
                  <h3>{group.label}</h3>
                  <CompetitionGamesTable
                    games={group.games.filter((game) => game.status === 'completed')}
                    gridId={`ng-competition-results-${group.date}`}
                  />
                </section>
              ))
          )}
        </div>
      ) : null}

      {tab === 'standings' ? (
        <div className="ng-canon__panel ng-holo-panel">
          <NgPrecisionTable
            className="ng-canon__table"
            columns={[
              ngCol('position', '#', (row) => row.position, { defaultWidth: 44, numeric: true, value: (row) => row.position }),
              ngCol('team', 'Equipo', (row) => <TeamLink name={row.teamName} teamId={row.teamId} />, {
                value: (row) => row.teamName,
              }),
              ngCol('played', 'PJ', (row) => row.played, { defaultWidth: 52, numeric: true, value: (row) => row.played }),
              ngCol('wins', 'W', (row) => row.wins, { defaultWidth: 48, numeric: true, value: (row) => row.wins }),
              ngCol('losses', 'L', (row) => row.losses, { defaultWidth: 48, numeric: true, value: (row) => row.losses }),
              ngCol('pointsFor', 'PF', (row) => row.pointsFor, { defaultWidth: 56, numeric: true, value: (row) => row.pointsFor }),
              ngCol('pointsAgainst', 'PA', (row) => row.pointsAgainst, { defaultWidth: 56, numeric: true, value: (row) => row.pointsAgainst }),
              ngCol('diff', 'Diff', (row) => (row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference), {
                defaultWidth: 56,
                numeric: true,
                value: (row) => row.pointDifference,
              }),
              ngCol('pct', 'Pct', (row) => standingsPct(row), {
                defaultWidth: 56,
                numeric: true,
                sortValue: (row) => (row.played === 0 ? 0 : row.wins / row.played),
                value: (row) => standingsPct(row),
              }),
            ]}
            gridId="ng-competition-standings"
            rows={model.standings.map((row) => ({
              ...row,
              id: row.teamId,
              teamName: world.teams[row.teamId]?.name ?? row.teamId,
            }))}
            selectedId={team?.id}
          />
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="competition-stats">
          {model.leaders.length === 0 ? (
            <div className="ng-canon__panel ng-holo-panel">
              <p className="ng-canon__empty">No hay estadísticas de partido en esta temporada.</p>
            </div>
          ) : (
            <>
              <div className="competition-stat-cards">
                {model.statPodiums.map((podium) => (
                  <article className="competition-stat-card ng-holo-panel" key={podium.id}>
                    <p className="ng-canon__eyebrow">{podium.label}</p>
                    <ol className="competition-stat-card__list">
                      {podium.entries.map((entry, index) => (
                        <li key={entry.playerId}>
                          <span className="competition-stat-card__rank">{index + 1}</span>
                          <button
                            className="ng-canon__link"
                            onClick={() => navigateToPlayer(entry.playerId)}
                            type="button"
                          >
                            {entry.playerName}
                          </button>
                          <strong className="competition-stat-card__value">{entry.value.toFixed(1)}</strong>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
              <div className="ng-canon__panel ng-holo-panel">
                <NgPrecisionTable
                  className="ng-canon__table"
                  columns={[
                    ngCol('rank', '#', (row) => row.rank, { numeric: true, value: (row) => row.rank }),
                    ngCol('player', 'Jugador', (row) => (
                      <button className="ng-canon__link" onClick={() => navigateToPlayer(row.playerId)} type="button">
                        {row.playerName}
                      </button>
                    ), { value: (row) => row.playerName }),
                    ngCol('team', 'Equipo', (row) => row.teamName, { value: (row) => row.teamName }),
                    ngCol('games', 'PJ', (row) => row.games, { numeric: true, value: (row) => row.games }),
                    ngCol('ppg', 'PPG', (row) => row.ppg.toFixed(1), { numeric: true, value: (row) => row.ppg }),
                    ngCol('rpg', 'RPG', (row) => row.rpg.toFixed(1), { numeric: true, value: (row) => row.rpg }),
                    ngCol('apg', 'APG', (row) => row.apg.toFixed(1), { numeric: true, value: (row) => row.apg }),
                  ]}
                  gridId="ng-competition-leaders"
                  rows={model.leaders.slice(0, 30).map((row, index) => ({ ...row, id: row.playerId, rank: index + 1 }))}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
    </NgHoloShell>
  )
}
