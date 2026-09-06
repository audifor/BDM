import { useMemo, useState } from 'react'

import { parseGameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import {
  buildCompetitionWorkspaceModel,
  calendarEventsForMonth,
  CALENDAR_DAY_EVENT_CAP,
  monthGrid,
  monthStart,
  monthTitle,
  shiftMonth,
  type CalendarEvent,
  type CalendarGameEvent,
} from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import '@/ui-ng/applications/competition/competition-workspace.css'

const STAKES_LABEL: Readonly<Record<CalendarGameEvent['stakes'], string | undefined>> = {
  regular: undefined,
  important: 'Importante',
  elimination: 'Eliminación',
  final: 'Final',
}
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const

function TeamLink({ teamId, name }: { readonly teamId: TeamId; readonly name: string }) {
  const { openEntity } = useNgWorkspaceNavigation()
  return <button className="ng-canon__link" onClick={() => openEntity({ type: 'team', teamId, section: 'overview' })} type="button">{name}</button>
}

function CalendarEventCard({ event }: { readonly event: CalendarEvent }) {
  if (event.kind === 'game') {
    return (
      <div className={`competition-calendar__event is-${event.tone}`} title={event.competitionName}>
        <div className="competition-calendar__match">
          <TeamLink name={event.homeName} teamId={event.homeTeamId} />
          <span className="competition-calendar__score">{event.scoreLabel}</span>
          <TeamLink name={event.awayName} teamId={event.awayTeamId} />
        </div>
        {STAKES_LABEL[event.stakes] === undefined ? null : <span className="competition-calendar__stakes">{STAKES_LABEL[event.stakes]}</span>}
      </div>
    )
  }
  if (event.kind === 'training') {
    return <button className="competition-calendar__event is-training" onClick={() => syncWorkspaceAppQuery('training')} title={event.detail} type="button"><span className="competition-calendar__note">{event.label}</span></button>
  }
  return <div className="competition-calendar__event is-milestone" title={event.detail}><span className="competition-calendar__note">{event.label}</span></div>
}

export function HomeCompetitionCalendar({ world }: { readonly world: GameWorld }) {
  const team = getUserTeam(world)
  const model = buildCompetitionWorkspaceModel(world, undefined, team?.id)
  const [monthOffset, setMonthOffset] = useState(0)
  const [onlyUserTeam, setOnlyUserTeam] = useState(true)
  const currentMonth = shiftMonth(monthStart(parseGameDate(world.currentDate)), monthOffset)
  const eventsByDate = useMemo(
    () => calendarEventsForMonth(model?.calendarEvents ?? [], currentMonth, onlyUserTeam && team !== undefined),
    [currentMonth, model?.calendarEvents, onlyUserTeam, team],
  )

  if (model === null) return null
  return (
    <section className="home-competition-calendar ng-holo-panel" data-ng-region="home-competition-calendar">
      <header className="home-competition-calendar__header">
        <p className="ng-canon__eyebrow">Calendario</p>
        <select aria-label="Filtro de calendario" onChange={(event) => setOnlyUserTeam(event.target.value === 'mine')} value={onlyUserTeam ? 'mine' : 'all'}>
          <option value="mine">Mi equipo</option>
          <option value="all">Todos</option>
        </select>
      </header>
      <div className="competition-calendar__nav">
        <button aria-label="Mes anterior" className="ng-canon__action" onClick={() => setMonthOffset((value) => value - 1)} title="Mes anterior" type="button">←</button>
        <h2 className="competition-calendar__month">{monthTitle(currentMonth)}</h2>
        <button aria-label="Mes siguiente" className="ng-canon__action" onClick={() => setMonthOffset((value) => value + 1)} title="Mes siguiente" type="button">→</button>
      </div>
      <div className="competition-calendar__grid">
        {WEEKDAYS.map((day) => <span className="competition-calendar__weekday" key={day}>{day}</span>)}
        {monthGrid(currentMonth).map((date) => {
          const visible = (eventsByDate[date] ?? []).slice(0, CALENDAR_DAY_EVENT_CAP)
          return <article className={`competition-calendar__day${!date.startsWith(currentMonth.slice(0, 7)) ? ' is-outside' : ''}${date === world.currentDate ? ' is-today' : ''}`} key={date}>
            <span className="competition-calendar__day-number">{Number(date.slice(-2))}</span>
            {visible.map((event) => <CalendarEventCard event={event} key={event.id} />)}
          </article>
        })}
      </div>
    </section>
  )
}