import { useEffect, useId, useRef, useState } from 'react'

import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { getInboxItemsForCoach, getNewsFeed, getTeamRoster } from '@/domain/world'
import { calculateTeamPayroll, calculateTeamSalaryStatus } from '@/engine/salary'
import { formatMoney } from '@/ui/formatters'
import { EntityLink } from '@/ui/navigation/EntityLink'
import {
  standingsClassificationPoints,
  type CompetitionWorkspaceModel,
} from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import {
  standingsZoneClassName,
  standingsZoneForPosition,
} from '@/ui-ng/applications/competition/standingsZones'
import { StandingsZoneLegend } from '@/ui-ng/applications/competition/StandingsZoneLegend'
import {
  HOME_DASHBOARD_MODULE_IDS,
  homeDashboardModuleLabel,
  type HomeDashboardModuleId,
} from '@/ui-ng/applications/home/homeDashboardModules'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { NgMetric } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

export interface HomeModuleDynamics {
  readonly teamId: TeamId
  readonly name: string
  readonly strength: number
  readonly cohesion: number
  readonly morale: number
  readonly recordLabel: string
  readonly positionLabel: string
}

export interface HomeModuleUpcomingRow {
  readonly id: string
  readonly date: string
  readonly opponentTeamId: TeamId
  readonly opponentName: string
  readonly venue: 'Casa' | 'Fuera'
  readonly status: string
}

export interface HomeDashboardSlotContext {
  readonly world: GameWorld
  readonly teamId: TeamId | undefined
  readonly competition: CompetitionWorkspaceModel | null
  readonly homeDynamics: HomeModuleDynamics | undefined
  readonly awayDynamics: HomeModuleDynamics | undefined
  readonly upcoming: readonly HomeModuleUpcomingRow[]
}

export function HomeDashboardSlot({
  moduleId,
  context,
  onSelectModule,
}: {
  readonly moduleId: HomeDashboardModuleId
  readonly context: HomeDashboardSlotContext
  readonly onSelectModule: (id: HomeDashboardModuleId) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement | null>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <section className="home-slot ng-holo-panel" ref={rootRef}>
      <header className="home-slot__header">
        <button
          aria-controls={menuId}
          aria-expanded={open}
          aria-haspopup="menu"
          className="home-slot__trigger"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span className="home-slot__title">{homeDashboardModuleLabel(moduleId)}</span>
          <span aria-hidden className="home-slot__chevron">
            ▾
          </span>
        </button>
        {open ? (
          <ul className="home-slot__menu ng-holo-float" id={menuId} role="menu">
            {HOME_DASHBOARD_MODULE_IDS.map((id) => (
              <li key={id} role="none">
                <button
                  aria-checked={id === moduleId}
                  className={id === moduleId ? 'is-active' : undefined}
                  onClick={() => {
                    onSelectModule(id)
                    setOpen(false)
                  }}
                  role="menuitemradio"
                  type="button"
                >
                  <span aria-hidden className="home-slot__check">
                    {id === moduleId ? '✓' : ''}
                  </span>
                  {homeDashboardModuleLabel(id)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <div className="home-slot__body">
        <HomeModuleBody context={context} moduleId={moduleId} />
      </div>
    </section>
  )
}

function HomeModuleBody({
  moduleId,
  context,
}: {
  readonly moduleId: HomeDashboardModuleId
  readonly context: HomeDashboardSlotContext
}) {
  switch (moduleId) {
    case 'standings':
      return <StandingsModule context={context} />
    case 'leaders':
      return <LeadersModule context={context} />
    case 'objectives':
      return <ObjectivesModule context={context} />
    case 'finances':
      return <FinancesModule context={context} />
    case 'dynamics':
      return <DynamicsModule context={context} />
    case 'upcoming':
      return <UpcomingModule context={context} />
    case 'inbox':
      return <InboxModule context={context} />
    case 'news':
      return <NewsModule context={context} />
  }
}

function HomeTeamLink({
  teamId,
  name,
  className,
}: {
  readonly teamId: TeamId
  readonly name: string
  readonly className?: string
}) {
  const { openEntity } = useNgWorkspaceNavigation()
  return (
    <EntityLink
      className={['ng-canon__link', 'home-entity-link', className].filter(Boolean).join(' ')}
      destination={{ type: 'team', teamId, section: 'overview' }}
      onNavigate={openEntity}
    >
      {name}
    </EntityLink>
  )
}

function HomePlayerLink({
  playerId,
  name,
  className,
}: {
  readonly playerId: PlayerId
  readonly name: string
  readonly className?: string
}) {
  const { openEntity } = useNgWorkspaceNavigation()
  return (
    <EntityLink
      className={['ng-canon__link', 'home-entity-link', className].filter(Boolean).join(' ')}
      destination={{ type: 'player', playerId, section: 'overview' }}
      onNavigate={openEntity}
    >
      {name}
    </EntityLink>
  )
}

function StandingsModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  const competition = context.competition
  const standings = competition?.standings ?? []
  if (standings.length === 0 || competition == null) {
    return <p className="ng-canon__empty">Sin clasificación disponible.</p>
  }
  return (
    <div className="home-standings competition-standings">
      <div className="home-slot-table__head">
        <span>Pos</span>
        <span>Equipo</span>
        <span title="Partidos jugados">PJ</span>
        <span title="Ganados">G</span>
        <span title="Perdidos">P</span>
        <span title="Diferencia de anotación">Dif</span>
        <span title="Puntos de clasificación">Pts</span>
      </div>
      <ol className="home-slot-table">
        {standings.map((row) => {
          const zone = standingsZoneClassName(
            standingsZoneForPosition(row.position, competition.standingsZoneBands),
          )
          const teamName = context.world.teams[row.teamId]?.name ?? row.teamId
          return (
            <li
              className={[row.teamId === context.teamId ? 'is-user' : undefined, zone].filter(Boolean).join(' ') || undefined}
              key={row.teamId}
            >
              <span className="is-pos">{row.position}</span>
              <HomeTeamLink className="is-team" name={teamName} teamId={row.teamId} />
              <span className="is-num">{row.played}</span>
              <span className="is-num">{row.wins}</span>
              <span className="is-num">{row.losses}</span>
              <span className="is-num">{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</span>
              <span className="is-num is-pts">{standingsClassificationPoints(row)}</span>
            </li>
          )
        })}
      </ol>
      <StandingsZoneLegend bands={competition.standingsZoneBands} />
    </div>
  )
}

function LeadersModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  const leaders = context.competition?.leaders.slice(0, 6) ?? []
  const roster = context.teamId === undefined ? [] : getTeamRoster(context.world, context.teamId).slice(0, 6)
  if (leaders.length === 0 && roster.length === 0) {
    return <p className="ng-canon__empty">Sin líderes estadísticos todavía.</p>
  }
  return (
    <ul className="home-slot-list">
      {leaders.length > 0
        ? leaders.map((leader, index) => (
            <li key={leader.playerId}>
              <span aria-hidden className="home-slot-list__badge">
                {index + 1}
              </span>
              <div>
                <HomePlayerLink name={leader.playerName} playerId={leader.playerId} />
                <div className="ng-canon__note">
                  {leader.ppg.toFixed(1)} PPG · {leader.apg.toFixed(1)} AST · {leader.rpg.toFixed(1)} REB
                </div>
              </div>
            </li>
          ))
        : roster.map((player, index) => (
            <li key={player.id}>
              <span aria-hidden className="home-slot-list__badge">
                {index + 1}
              </span>
              <div>
                <HomePlayerLink name={`${player.firstName} ${player.lastName}`} playerId={player.id} />
                <div className="ng-canon__note">{player.basketball.primaryPosition} · Plantilla</div>
              </div>
            </li>
          ))}
    </ul>
  )
}

function ObjectivesModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  const objectives = Object.values(context.world.governanceObjectivesById)
    .slice()
    .sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
    .slice(0, 6)
  if (objectives.length === 0) {
    return <p className="ng-canon__empty">No tienes ningún objetivo pendiente en estos momentos.</p>
  }
  return (
    <ul className="home-slot-list">
      {objectives.map((objective) => (
        <li key={objective.id}>
          <div>
            <strong>{objective.family.replaceAll('_', ' ')}</strong>
            <div className="ng-canon__note">
              {objective.metric.replaceAll('_', ' ')} · {objective.horizon} · imp. {objective.importance}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function FinancesModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  if (context.teamId === undefined) return <p className="ng-canon__empty">Sin equipo asignado.</p>
  const finances = context.world.teamFinancesByTeamId[context.teamId]
  const rules = context.world.salaryRulesBySeasonId[context.world.currentSeasonId]
  const contracts =
    rules === undefined
      ? []
      : Object.values(context.world.contractsById).filter(
          (contract) =>
            contract.teamId === context.teamId && getPlayerContractStatus(contract, context.world.currentDate) === 'active',
        )
  const deadMoney =
    rules === undefined
      ? 0
      : Object.values(context.world.deadMoneyChargesById)
          .filter((charge) => charge.teamId === context.teamId && charge.seasonId === rules.seasonId)
          .reduce((sum, charge) => sum + charge.amount, 0)
  const status =
    rules === undefined ? undefined : calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, context.world.currentDate, deadMoney))
  const topContracts = contracts
    .map((contract) => ({
      id: contract.id,
      playerId: contract.playerId,
      name: (() => {
        const player = context.world.players[contract.playerId]
        return player === undefined ? contract.playerId : `${player.firstName} ${player.lastName}`
      })(),
      salary: getContractYearCompensation(contract, context.world.currentDate).cashSalary,
    }))
    .sort((a, b) => b.salary - a.salary)
    .slice(0, 4)

  return (
    <div className="home-finances">
      <dl className="ng-canon__metrics">
        <NgMetric label="Presupuesto jugadores" value={finances === undefined ? '—' : formatMoney(finances.playerSalaryBudget)} />
        <NgMetric label="Presupuesto staff" value={finances === undefined ? '—' : formatMoney(finances.staffSalaryBudget)} />
        <NgMetric label="Nómina" value={status === undefined ? '—' : formatMoney(status.payroll.totalCapHit)} />
        <NgMetric
          label="Espacio"
          value={status === undefined ? '—' : formatMoney(status.capSpace)}
        />
      </dl>
      {topContracts.length === 0 ? (
        <p className="ng-canon__empty">Sin contratos activos.</p>
      ) : (
        <ul className="home-slot-list">
          {topContracts.map((row) => (
            <li key={row.id}>
              <div className="home-slot-list__row">
                <HomePlayerLink name={row.name} playerId={row.playerId} />
                <span>{formatMoney(row.salary)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DynamicsModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  if (context.homeDynamics === undefined) return <p className="ng-canon__empty">Sin datos de dinámicas.</p>
  return (
    <div className="home-dynamics">
      <div className="home-dynamics__head">
        <HomeTeamLink name={context.homeDynamics.name} teamId={context.homeDynamics.teamId} />
        {context.awayDynamics === undefined ? (
          <span>Rival</span>
        ) : (
          <HomeTeamLink name={context.awayDynamics.name} teamId={context.awayDynamics.teamId} />
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
          <strong className="home-dynamics__value is-home">{context.homeDynamics![key]}</strong>
          <span className="home-dynamics__label">{label}</span>
          <strong className="home-dynamics__value is-away">{context.awayDynamics?.[key] ?? '—'}</strong>
        </div>
      ))}
      <div className="home-dynamics__row">
        <strong className="home-dynamics__value is-home">{context.homeDynamics.recordLabel}</strong>
        <span className="home-dynamics__label">Balance</span>
        <strong className="home-dynamics__value is-away">{context.awayDynamics?.recordLabel ?? '—'}</strong>
      </div>
      <div className="home-dynamics__row">
        <strong className="home-dynamics__value is-home">{context.homeDynamics.positionLabel}</strong>
        <span className="home-dynamics__label">Posición</span>
        <strong className="home-dynamics__value is-away">{context.awayDynamics?.positionLabel ?? '—'}</strong>
      </div>
    </div>
  )
}

function UpcomingModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  if (context.upcoming.length === 0) return <p className="ng-canon__empty">Sin partidos programados.</p>
  return (
    <ul className="home-upcoming">
      {context.upcoming.map((game) => (
        <li key={game.id}>
          <div className="home-upcoming__main">
            <HomeTeamLink name={game.opponentName} teamId={game.opponentTeamId} />
            <span>{game.venue}</span>
          </div>
          <div className="home-upcoming__meta">
            {formatGameDateLabel(game.date)} · {game.status}
          </div>
        </li>
      ))}
    </ul>
  )
}

function InboxModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  const inbox = getInboxItemsForCoach(context.world, context.world.userCoachId).slice(0, 5)
  if (inbox.length === 0) return <p className="ng-canon__empty">Sin mensajes pendientes.</p>
  return (
    <ul className="home-slot-list">
      {inbox.map((item) => (
        <li key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function NewsModule({ context }: { readonly context: HomeDashboardSlotContext }) {
  const news = getNewsFeed(context.world).slice(0, 5)
  const fallback = context.competition?.upcoming.slice(0, 4) ?? []
  if (news.length === 0 && fallback.length === 0) return <p className="ng-canon__empty">Sin novedades.</p>
  return (
    <ul className="home-slot-list">
      {news.length > 0
        ? news.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.headline}</strong>
                <div className="ng-canon__note">{formatGameDateLabel(item.gameDate)}</div>
              </div>
            </li>
          ))
        : fallback.map((game) => (
            <li key={game.id}>
              <div>
                <span className="home-news-match">
                  <HomeTeamLink name={game.homeName} teamId={game.homeTeamId} />
                  <span> vs </span>
                  <HomeTeamLink name={game.awayName} teamId={game.awayTeamId} />
                </span>
                <div className="ng-canon__note">
                  {game.date} · {game.status}
                </div>
              </div>
            </li>
          ))}
    </ul>
  )
}
