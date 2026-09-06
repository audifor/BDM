import { useMemo } from 'react'

import { getContinueStopReason } from '@/app/game/ContinueFlow'
import { getInboxItemsForCoach, getNewsFeed, getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getNextUserGame } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildCompetitionWorkspaceModel,
  standingsPct,
} from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { HomeCompetitionCalendar } from '@/ui-ng/applications/home/HomeCompetitionCalendar'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

export function HomeWorkspace() {
  const world = useGameStore((state) => state.world)
  const { openEntity } = useNgWorkspaceNavigation()

  const model = useMemo(() => {
    if (world === null) return null
    const team = getUserTeam(world)
    const competition = buildCompetitionWorkspaceModel(world, undefined, team?.id)
    const nextGame = getNextUserGame(world)
    const stop = getContinueStopReason(world)
    return {
      team,
      competition,
      nextGame,
      roster: team === undefined ? [] : getTeamRoster(world, team.id),
      stop,
      inboxCount: getInboxItemsForCoach(world, world.userCoachId).length,
      inbox: getInboxItemsForCoach(world, world.userCoachId).slice(0, 4),
      news: getNewsFeed(world).slice(0, 4),
    }
  }, [world])

  if (world === null || model === null) {
    return <NgHoloShell appLabel="Home" empty emptyTitle="Home" emptyMessage="No career loaded." region="home-workspace" />
  }

  const opponent = model.nextGame === undefined || model.team === undefined
    ? undefined
    : world.teams[model.nextGame.homeTeamId === model.team.id ? model.nextGame.awayTeamId : model.nextGame.homeTeamId]
  const standings = model.competition?.standings.slice(0, 8) ?? []
  const leaders = model.competition?.leaders.slice(0, 5) ?? []
  const rosterHighlights = model.roster.slice(0, 5)

  return (
    <NgHoloShell
      appLabel="Home"
      meta={
        <>
          <span className="ng-type-numeric">{model.inboxCount}</span> inbox
          {' · '}
          {model.stop?.type === 'userGame' ? 'Match day' : model.stop?.type === 'mediaOpportunity' ? 'Press waiting' : 'Ready'}
        </>
      }
      region="home-workspace"
      teamId={model.team?.id}
      title={model.team?.name ?? 'Career'}
    >
      <div className="home-dashboard">
        <section className="home-dashboard__fixture ng-holo-panel">
          <div className="home-dashboard__fixture-copy">
            <p className="ng-canon__eyebrow">Próximo partido</p>
            <h2 className="home-dashboard__fixture-title">
              {opponent === undefined ? 'Sin partido programado' : (
                <button className="ng-canon__link" onClick={() => openEntity({ type: 'team', teamId: opponent.id, section: 'overview' })} type="button">
                  {model.team?.name ?? 'Tu equipo'} <span>vs</span> {opponent.name}
                </button>
              )}
            </h2>
            <p className="home-dashboard__fixture-meta">
              {model.nextGame === undefined ? 'El calendario está despejado.' : `${formatGameDateLabel(model.nextGame.date)} · ${model.nextGame.status}`}
            </p>
            <div className="ng-canon__actions">
              {model.stop?.type === 'userGame' ? <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('match')} type="button">Abrir partido</button> : null}
              <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('competition')} type="button">Ver calendario</button>
            </div>
          </div>
          <dl className="home-dashboard__fixture-facts">
            <NgMetric label="Competición" value={model.competition?.competitionName ?? '—'} />
            <NgMetric label="Temporada" value={model.competition?.seasonLabel ?? '—'} />
            <NgMetric label="Estado" value={model.nextGame?.status ?? '—'} />
          </dl>
        </section>

        <aside className="home-dashboard__news ng-holo-panel">
          <p className="ng-canon__eyebrow">Noticias del club</p>
          {model.news.length === 0 && (model.competition?.upcoming.length ?? 0) === 0 ? <p className="ng-canon__empty">Sin novedades.</p> : (
            <ul className="ng-canon__list">
              {model.news.length > 0 ? model.news.map((item) => <li key={item.id}><strong>{item.headline}</strong><div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div></li>) : model.competition?.upcoming.slice(0, 4).map((game) => <li key={game.id}><strong>{game.homeName} vs {game.awayName}</strong><div className="ng-canon__note">{game.date} · {game.status}</div></li>)}
            </ul>
          )}
        </aside>

        <section className="home-dashboard__panel ng-holo-panel">
          <p className="ng-canon__eyebrow">Clasificación</p>
          <div className="home-dashboard__table-head"><span>Equipo</span><span>PJ</span><span>PTS</span></div>
          <ol className="home-dashboard__standings">
            {standings.map((row) => <li className={row.teamId === model.team?.id ? 'is-user' : undefined} key={row.teamId}><span>{row.position}. {world.teams[row.teamId]?.name ?? row.teamId}</span><span>{row.played}</span><strong>{standingsPct(row)}</strong></li>)}
          </ol>
        </section>

        <section className="home-dashboard__panel ng-holo-panel">
          <p className="ng-canon__eyebrow">Líderes de la liga</p>
          <ul className="home-dashboard__leaders">
            {leaders.length > 0 ? leaders.map((leader) => <li key={leader.playerId}><strong>{leader.playerName}</strong><span>{leader.ppg.toFixed(1)} PPG · {leader.apg.toFixed(1)} AST</span></li>) : rosterHighlights.map((player) => <li key={player.id}><strong>{player.firstName} {player.lastName}</strong><span>{player.basketball.primaryPosition} · Plantilla activa</span></li>)}
          </ul>
        </section>

        <section className="home-dashboard__panel home-dashboard__calendar ng-holo-panel">
          <HomeCompetitionCalendar world={world} />
        </section>

        <aside className="home-dashboard__panel ng-holo-panel">
          <p className="ng-canon__eyebrow">Inbox</p>
          {model.inbox.length === 0 ? <p className="ng-canon__empty">Sin mensajes pendientes.</p> : <ul className="ng-canon__list">{model.inbox.map((item) => <li key={item.id}><strong>{item.title}</strong><div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div></li>)}</ul>}
        </aside>
      </div>
    </NgHoloShell>
  )
}
