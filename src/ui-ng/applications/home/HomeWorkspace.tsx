import { useMemo, useState, type CSSProperties } from 'react'

import { getContinueStopReason } from '@/app/game/ContinueFlow'
import { compareGameDates } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import { getInboxItemsForCoach, getTeamRoster } from '@/domain/world'
import type { GameWorld } from '@/domain/world'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { calculateTeamStrength } from '@/engine/team'
import { useGameStore } from '@/stores/gameStore'
import { buildCompetitionWorkspaceModel } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { HomeDashboardSlot } from '@/ui-ng/applications/home/HomeDashboardSlot'
import {
  HOME_DASHBOARD_DEFAULT_SLOTS,
  type HomeDashboardModuleId,
} from '@/ui-ng/applications/home/homeDashboardModules'
import { deriveTeamColors, formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgHoloShell, NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './home-workspace.css'

interface TeamDynamicsSnapshot {
  readonly teamId: TeamId
  readonly name: string
  readonly strength: number
  readonly cohesion: number
  readonly morale: number
  readonly recordLabel: string
  readonly positionLabel: string
}

interface UpcomingFixtureRow {
  readonly id: string
  readonly date: string
  readonly opponentTeamId: TeamId
  readonly opponentName: string
  readonly venue: 'Casa' | 'Fuera'
  readonly status: string
}

function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function TeamCrest({ teamId, name }: { readonly teamId: string; readonly name: string }) {
  const colors = deriveTeamColors(teamId)
  const style = {
    '--crest-primary': colors.primary,
    '--crest-secondary': colors.secondary,
  } as CSSProperties
  return (
    <div aria-hidden className="home-dashboard__crest" style={style}>
      {teamInitials(name)}
    </div>
  )
}

function averageRosterMorale(world: GameWorld, teamId: TeamId): number {
  const roster = getTeamRoster(world, teamId)
  if (roster.length === 0) return 50
  const total = roster.reduce((sum, player) => sum + (world.moraleByPersonId[player.id]?.value ?? 50), 0)
  return Math.round(total / roster.length)
}

function buildTeamDynamics(world: GameWorld, teamId: TeamId): TeamDynamicsSnapshot {
  const team = world.teams[teamId]
  const standings = buildCompetitionWorkspaceModel(world, undefined, teamId)?.standings.find((row) => row.teamId === teamId)
  return {
    teamId,
    name: team?.name ?? teamId,
    strength: Math.round(calculateTeamStrength(world, teamId).value),
    cohesion: Math.round(world.teamCohesionByTeamId[teamId] ?? 50),
    morale: averageRosterMorale(world, teamId),
    recordLabel: standings === undefined ? '0-0' : `${standings.wins}-${standings.losses}`,
    positionLabel: standings === undefined ? '—' : `${standings.position}º`,
  }
}

function upcomingUserGames(world: GameWorld, teamId: TeamId, limit = 5): readonly UpcomingFixtureRow[] {
  return Object.values(world.games)
    .filter(
      (game) =>
        game.status === 'scheduled' &&
        compareGameDates(game.date, world.currentDate) >= 0 &&
        (game.homeTeamId === teamId || game.awayTeamId === teamId),
    )
    .sort((a, b) => compareGameDates(a.date, b.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((game) => {
      const atHome = game.homeTeamId === teamId
      const opponentId = atHome ? game.awayTeamId : game.homeTeamId
      return {
        id: game.id,
        date: game.date,
        opponentTeamId: opponentId,
        opponentName: world.teams[opponentId]?.name ?? opponentId,
        venue: atHome ? 'Casa' : 'Fuera',
        status: game.status,
      }
    })
}

export function HomeWorkspace() {
  const world = useGameStore((state) => state.world)
  const { openEntity } = useNgWorkspaceNavigation()
  const [slots, setSlots] = useState<readonly HomeDashboardModuleId[]>(() => [...HOME_DASHBOARD_DEFAULT_SLOTS])

  const model = useMemo(() => {
    if (world === null) return null
    const team = getUserTeam(world)
    const competition = buildCompetitionWorkspaceModel(world, undefined, team?.id)
    const nextGame = getNextUserGame(world)
    const stop = getContinueStopReason(world)
    const opponentId =
      nextGame === undefined || team === undefined
        ? undefined
        : nextGame.homeTeamId === team.id
          ? nextGame.awayTeamId
          : nextGame.homeTeamId
    return {
      team,
      competition,
      nextGame,
      stop,
      inboxCount: getInboxItemsForCoach(world, world.userCoachId).length,
      homeDynamics: team === undefined ? undefined : buildTeamDynamics(world, team.id),
      awayDynamics: opponentId === undefined ? undefined : buildTeamDynamics(world, opponentId),
      upcoming: team === undefined ? [] : upcomingUserGames(world, team.id),
    }
  }, [world])

  if (world === null || model === null) {
    return (
      <NgHoloShell
        appLabel="Home"
        empty
        emptyTitle="Home"
        emptyMessage="No career loaded."
        region="home-workspace"
      />
    )
  }

  const homeTeam = model.team
  const opponent =
    model.nextGame === undefined || homeTeam === undefined
      ? undefined
      : world.teams[model.nextGame.homeTeamId === homeTeam.id ? model.nextGame.awayTeamId : model.nextGame.homeTeamId]
  const homeName = homeTeam?.name ?? 'Tu equipo'
  const awayName = opponent?.name ?? 'Rival por confirmar'
  const slotContext = {
    world,
    teamId: homeTeam?.id,
    competition: model.competition,
    homeDynamics: model.homeDynamics,
    awayDynamics: model.awayDynamics,
    upcoming: model.upcoming,
  }

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
      teamId={homeTeam?.id}
      title={homeName}
    >
      <div className="home-dashboard">
        <div className="home-dashboard__top">
          <section className="home-dashboard__fixture ng-holo-panel">
            <div className="home-dashboard__fixture-side">
              {homeTeam === undefined ? null : (
                <button
                  className="ng-canon__link"
                  onClick={() => openEntity({ type: 'team', teamId: homeTeam.id, section: 'overview' })}
                  type="button"
                >
                  <TeamCrest name={homeName} teamId={homeTeam.id} />
                </button>
              )}
              <p className="home-dashboard__fixture-name">
                {homeTeam === undefined ? (
                  homeName
                ) : (
                  <button
                    className="ng-canon__link"
                    onClick={() => openEntity({ type: 'team', teamId: homeTeam.id, section: 'overview' })}
                    type="button"
                  >
                    {homeName}
                  </button>
                )}
              </p>
            </div>

            <div className="home-dashboard__fixture-center">
              <p className="ng-canon__eyebrow">Próximo partido</p>
              <p className="home-dashboard__fixture-vs">VS</p>
              <p className="home-dashboard__fixture-meta">
                {model.nextGame === undefined
                  ? 'Sin partido programado'
                  : `${formatGameDateLabel(model.nextGame.date)} · ${model.competition?.competitionName ?? 'Liga'}`}
              </p>
              <dl className="home-dashboard__fixture-facts">
                <NgMetric label="Temporada" value={model.competition?.seasonLabel ?? '—'} />
                <NgMetric label="Estado" value={model.nextGame?.status ?? '—'} />
              </dl>
              <div className="ng-canon__actions home-dashboard__fixture-actions">
                {model.stop?.type === 'userGame' ? (
                  <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('match')} type="button">
                    Abrir partido
                  </button>
                ) : null}
                <button className="ng-canon__action" onClick={() => syncWorkspaceAppQuery('competition')} type="button">
                  Ver calendario
                </button>
              </div>
            </div>

            <div className="home-dashboard__fixture-side home-dashboard__fixture-side--away">
              {opponent === undefined ? (
                <div aria-hidden className="home-dashboard__crest">?</div>
              ) : (
                <button
                  className="ng-canon__link"
                  onClick={() => openEntity({ type: 'team', teamId: opponent.id, section: 'overview' })}
                  type="button"
                >
                  <TeamCrest name={awayName} teamId={opponent.id} />
                </button>
              )}
              <p className="home-dashboard__fixture-name">
                {opponent === undefined ? (
                  awayName
                ) : (
                  <button
                    className="ng-canon__link"
                    onClick={() => openEntity({ type: 'team', teamId: opponent.id, section: 'overview' })}
                    type="button"
                  >
                    {awayName}
                  </button>
                )}
              </p>
            </div>
          </section>

          <section className="home-dashboard__module home-dashboard__dynamics ng-holo-panel">
            <p className="ng-canon__eyebrow">Dinámicas del choque</p>
            {model.homeDynamics === undefined ? (
              <p className="ng-canon__empty">Sin datos de dinámicas.</p>
            ) : (
              <div className="home-dynamics">
                <div className="home-dynamics__head">
                  <button
                    className="ng-canon__link"
                    onClick={() => openEntity({ type: 'team', teamId: model.homeDynamics!.teamId, section: 'overview' })}
                    type="button"
                  >
                    {model.homeDynamics.name}
                  </button>
                  {model.awayDynamics === undefined ? (
                    <span>Rival</span>
                  ) : (
                    <button
                      className="ng-canon__link"
                      onClick={() => openEntity({ type: 'team', teamId: model.awayDynamics!.teamId, section: 'overview' })}
                      type="button"
                    >
                      {model.awayDynamics.name}
                    </button>
                  )}
                </div>
                {(
                  [
                    ['Fuerza', 'strength'],
                    ['Cohesión', 'cohesion'],
                    ['Moral', 'morale'],
                  ] as const
                ).map(([label, key]) => (
                  <div className="home-dynamics__row" key={key}>
                    <strong className="home-dynamics__value is-home">{model.homeDynamics![key]}</strong>
                    <span className="home-dynamics__label">{label}</span>
                    <strong className="home-dynamics__value is-away">{model.awayDynamics?.[key] ?? '—'}</strong>
                  </div>
                ))}
                <div className="home-dynamics__row">
                  <strong className="home-dynamics__value is-home">{model.homeDynamics.recordLabel}</strong>
                  <span className="home-dynamics__label">Balance</span>
                  <strong className="home-dynamics__value is-away">{model.awayDynamics?.recordLabel ?? '—'}</strong>
                </div>
                <div className="home-dynamics__row">
                  <strong className="home-dynamics__value is-home">{model.homeDynamics.positionLabel}</strong>
                  <span className="home-dynamics__label">Posición</span>
                  <strong className="home-dynamics__value is-away">{model.awayDynamics?.positionLabel ?? '—'}</strong>
                </div>
              </div>
            )}
          </section>

          <section className="home-dashboard__module home-dashboard__upcoming ng-holo-panel">
            <p className="ng-canon__eyebrow">Próximos partidos</p>
            {model.upcoming.length === 0 ? (
              <p className="ng-canon__empty">Sin partidos programados.</p>
            ) : (
              <ul className="home-upcoming">
                {model.upcoming.map((game) => (
                  <li key={game.id}>
                    <div className="home-upcoming__main">
                      <button
                        className="ng-canon__link"
                        onClick={() => openEntity({ type: 'team', teamId: game.opponentTeamId, section: 'overview' })}
                        type="button"
                      >
                        {game.opponentName}
                      </button>
                      <span>{game.venue}</span>
                    </div>
                    <div className="home-upcoming__meta">
                      {formatGameDateLabel(game.date)} · {game.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="home-dashboard__modules">
          {slots.map((moduleId, index) => (
            <HomeDashboardSlot
              context={slotContext}
              key={`${index}-${moduleId}`}
              moduleId={moduleId}
              onSelectModule={(nextId) => {
                setSlots((current) => current.map((id, slotIndex) => (slotIndex === index ? nextId : id)))
              }}
            />
          ))}
        </div>
      </div>
    </NgHoloShell>
  )
}
