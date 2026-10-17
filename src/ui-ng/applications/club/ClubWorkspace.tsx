import { useMemo, useState, type ReactNode } from 'react'

import { buildClubFacilitiesWorkspaceModel } from '@/app/facilities'
import { buildClubGovernanceModel } from '@/app/governance'
import { getContractYearCompensation, getPlayerContractStatus } from '@/domain/contract'
import { getBoardSummary } from '@/engine/board'
import { getUserTeam } from '@/engine/calendar'
import { calculateTeamPayroll, calculateTeamSalaryStatus } from '@/engine/salary'
import { useGameStore } from '@/stores/gameStore'
import { formatMoney } from '@/ui/formatters'
import { resolveGameContext } from '@/ui/gameContext'
import { getTeamStaffPresentation } from '@/ui/staffPresentation'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { navigateToTeamInNg, readNgWorkspaceNavigation, syncWorkspaceAppQuery, type WorkspaceAppId } from '@/ui-ng/workspace/workspaceApps'

import './courtside-club.css'

const TABS = [
  { id: 'overview', label: 'RESUMEN' },
  { id: 'identity', label: 'IDENTIDAD' },
  { id: 'operations', label: 'ÁREAS DEL CLUB' },
] as const

type ClubTab = (typeof TABS)[number]['id']

const STRATEGIC_MODES: Record<string, string> = {
  CONTEND: 'Luchar por títulos',
  COMPETE: 'Competir',
  DEVELOP: 'Desarrollar talento',
  REBUILD: 'Reconstrucción',
  SELL: 'Reestructuración',
  SURVIVE: 'Permanencia',
}

function InfoMetric({ label, value, detail, emphasis = false }: {
  readonly label: string
  readonly value: ReactNode
  readonly detail?: string
  readonly emphasis?: boolean
}) {
  return <div className="cs-club__metric">
    <dt>{label}</dt>
    <dd className={emphasis ? 'cs-club__metric-value--accent' : undefined}>{value}</dd>
    {detail ? <small>{detail}</small> : null}
  </div>
}

function Field({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return <div className="cs-club__field"><dt>{label}</dt><dd>{value ?? '—'}</dd></div>
}

function AreaButton({ title, detail, number, app }: {
  readonly title: string
  readonly detail: string
  readonly number?: ReactNode
  readonly app: WorkspaceAppId
}) {
  return <button className="cs-club__area" type="button" onClick={() => syncWorkspaceAppQuery(app)}>
    <span className="cs-club__area-copy"><strong>{title}</strong><small>{detail}</small></span>
    {number === undefined ? null : <span className="cs-club__area-number">{number}</span>}
    <span className="cs-club__area-chevron" aria-hidden="true">↗</span>
  </button>
}

function PanelTitle({ label, action, onAction }: {
  readonly label: string
  readonly action?: string
  readonly onAction?: () => void
}) {
  return <div className="cs-club__panel-head">
    <h2>{label}</h2>
    {action && onAction ? <button type="button" className="cs-club__link" onClick={onAction}>{action} <span aria-hidden="true">↗</span></button> : null}
  </div>
}

export function ClubWorkspace() {
  const world = useGameStore((state) => state.world)
  const navigation = useNgWorkspaceNavigation()
  const [tab, setTab] = useState<ClubTab>('overview')
  const teamId = navigation.teamId ?? readNgWorkspaceNavigation().teamId
  const userTeam = world === null ? undefined : getUserTeam(world)
  const team = world === null ? undefined : (teamId === null || teamId === undefined ? undefined : world.teams[teamId]) ?? userTeam
  const isOwnClub = team !== undefined && userTeam?.id === team.id

  const view = useMemo(() => {
    if (world === null || team === undefined) return null

    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))
    const context = resolveGameContext(world, competition?.id)
    const staff = getTeamStaffPresentation(world, team.id)
    const board = getBoardSummary(world, team.id)
    const contracts = Object.values(world.contractsById).filter((contract) =>
      contract.teamId === team.id && getPlayerContractStatus(contract, world.currentDate) === 'active',
    )
    const activeCashSalary = contracts.reduce(
      (sum, contract) => sum + getContractYearCompensation(contract, world.currentDate).cashSalary, 0,
    )
    const rules = world.salaryRulesBySeasonId[world.currentSeasonId]
    const deadMoney = Object.values(world.deadMoneyChargesById)
      .filter((charge) => charge.teamId === team.id && charge.seasonId === world.currentSeasonId)
      .reduce((sum, charge) => sum + charge.amount, 0)
    const salary = rules === undefined
      ? undefined
      : calculateTeamSalaryStatus(rules, calculateTeamPayroll(contracts, world.currentDate, deadMoney))
    const organization = world.organizationsById[team.organizationId]
    const section = world.organizationSectionsById[team.organizationSectionId]
    const country = world.countries[team.countryId]
    const strategy = world.clubStrategicStatesByTeamId[team.id]
    const governance = isOwnClub ? buildClubGovernanceModel(world, team.id) : null
    const facilities = isOwnClub ? buildClubFacilitiesWorkspaceModel(world, team.id) : null

    const awaitingUser = governance?.pendingDecisions.filter((decision) =>
      decision.userApproverBodyIds.length > 0 || decision.userExecutorBodyIds.length > 0,
    ) ?? []

    return { context, staff, board, contracts, activeCashSalary, salary, organization,
      section, country, strategy, governance, facilities, awaitingUser }
  }, [world, team, isOwnClub])

  if (world === null) {
    return <NgHoloShell appLabel="Club" empty emptyMessage="No hay ninguna partida cargada." region="club-workspace" className="cs-club-screen" />
  }
  if (team === undefined || view === null) {
    return <NgHoloShell appLabel="Club" empty emptyMessage="No se ha encontrado el club." region="club-workspace" className="cs-club-screen" />
  }

  const { context, staff, board, contracts, activeCashSalary, salary, organization, section,
    country, strategy, governance, facilities, awaitingUser } = view
  const objectives = board?.state.objectives ?? []
  const confidence = board?.state.confidence
  const criticalNeeds = facilities?.criticalOpenNeeds.length ?? 0
  const activeProjects = facilities?.activeProjectIds.length ?? 0
  const outstanding = awaitingUser.length + (governance?.attentionRequests.length ?? 0) + criticalNeeds

  const goRoster = () => navigateToTeamInNg({ type: 'team', teamId: team.id, section: 'squad' })
  const goBoard = () => syncWorkspaceAppQuery('board')
  const goFacilities = () => syncWorkspaceAppQuery('facilities')

  return <NgHoloShell
    appLabel="Club"
    title={team.name}
    meta={[context.competitionName, context.seasonLabel].filter(Boolean).join(' · ') || world.currentDate}
    teamId={team.id}
    region="club-workspace"
    className="cs-club-screen"
    tabs={TABS}
    activeTabId={tab}
    onTabSelect={(id) => setTab(id as ClubTab)}
  >
    <div className="cs-club" data-ng-region="club-courtside">
      <section className="cs-club__identity-band">
        <div className="cs-club__crest" aria-hidden="true">{team.name.trim().slice(0, 2).toUpperCase()}</div>
        <div className="cs-club__identity-copy">
          <span className="cs-club__eyebrow">{isOwnClub ? 'MI CLUB' : 'FICHA DE CLUB'} <span className="cs-club__eyebrow-dot">•</span> {world.currentDate}</span>
          <h1>{team.name}</h1>
          <div className="cs-club__identity-details">
            <span>{country?.name ?? 'País no registrado'}</span>
            <span>{context.competitionName ?? 'Sin competición asignada'}</span>
            <span>{context.seasonLabel ?? 'Sin temporada activa'}</span>
          </div>
        </div>
        <button className="cs-club__primary-btn" type="button" onClick={goRoster}>VER PLANTILLA <span aria-hidden="true">↗</span></button>
      </section>

      {tab === 'overview' ? <>
        <dl className="cs-club__metric-row">
          <InfoMetric label="JUGADORES" value={team.rosterPlayerIds.length} detail="En plantilla" />
          <InfoMetric label="STAFF" value={staff.length} detail="Vinculado al equipo" />
          <InfoMetric label="CONFIANZA DIRECTIVA" value={confidence === undefined ? '—' : confidence} detail={board?.jobSecurity ?? 'Sin evaluación'} emphasis />
          <InfoMetric label="COSTE SALARIAL" value={salary ? formatMoney(salary.payroll.totalCapHit) : '—'} detail={salary ? 'Impacto en límite salarial' : 'Sin reglas de límite'} />
        </dl>

        <div className="cs-club__overview">
          <section className="cs-club__panel cs-club__board-panel">
            <PanelTitle label="DIRECCIÓN Y OBJETIVOS" action={isOwnClub ? 'IR A JUNTA' : undefined} onAction={goBoard} />
            {board === undefined ? <p className="cs-club__empty">No hay evaluación de la directiva registrada para este equipo.</p> : <>
              <div className="cs-club__board-top">
                <div><span>CONFIANZA</span><strong>{board.state.confidence}<small> / 100</small></strong></div>
                <div><span>SEGURIDAD DEL PUESTO</span><strong className="cs-club__board-security">{board.jobSecurity}</strong></div>
              </div>
              <div className="cs-club__progress" role="progressbar" aria-label="Confianza de la directiva" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, board.state.confidence))}>
                <span style={{ width: String(Math.max(0, Math.min(100, board.state.confidence))) + '%' }} />
              </div>
              <p className="cs-club__mandate">{board.state.expectation.summary}</p>
              <div className="cs-club__table-title">OBJETIVOS DE TEMPORADA <span>{objectives.length}</span></div>
              {objectives.length === 0
                ? <p className="cs-club__empty">Sin objetivos registrados.</p>
                : <div className="cs-club__objective-list">
                  {objectives.slice(0, 4).map((objective, index) =>
                    <div className="cs-club__objective" key={index}>
                      <span className="cs-club__objective-index">{String(index + 1).padStart(2, '0')}</span>
                      <strong>{objective.label}</strong>
                      <span>{objective.priority}</span>
                    </div>,
                  )}
                  {objectives.length > 4 ? <span className="cs-club__more">Y {objectives.length - 4} objetivos más en Junta</span> : null}
                </div>}
            </>}
          </section>

          <section className="cs-club__panel cs-club__attention-panel">
            <PanelTitle label="ATENCIÓN DEL CLUB" action={isOwnClub ? 'VER JUNTA' : undefined} onAction={goBoard} />
            {!isOwnClub
              ? <p className="cs-club__empty">La agenda institucional solo está disponible para el club que gestionas.</p>
              : outstanding === 0 && activeProjects === 0
                ? <div className="cs-club__quiet"><strong>SIN ASUNTOS PENDIENTES</strong><span>No hay decisiones a tu cargo, solicitudes registradas ni mantenimiento crítico.</span></div>
                : <div className="cs-club__attention-list">
                  {awaitingUser.slice(0, 3).map((decision) =>
                    <button className="cs-club__attention-row" type="button" key={decision.decisionId} onClick={goBoard}>
                      <span className="cs-club__status cs-club__status--orange" />
                      <span><strong>{decision.subjectLabel}</strong><small>Decisión de junta · requiere tu intervención</small></span>
                      <span aria-hidden="true">↗</span>
                    </button>,
                  )}
                  {(governance?.attentionRequests ?? []).slice(0, 2).map((request) =>
                    <button className="cs-club__attention-row" type="button" key={request.requestId} onClick={goBoard}>
                      <span className="cs-club__status cs-club__status--orange" />
                      <span><strong>{request.summary}</strong><small>Solicitud institucional{request.overdue ? ' · Vencida' : ''}</small></span>
                      <span aria-hidden="true">↗</span>
                    </button>,
                  )}
                  {criticalNeeds > 0 ? <button className="cs-club__attention-row" type="button" onClick={goFacilities}>
                    <span className="cs-club__status cs-club__status--red" />
                    <span><strong>{criticalNeeds} incidencias críticas</strong><small>Mantenimiento de instalaciones</small></span>
                    <span aria-hidden="true">↗</span>
                  </button> : null}
                  {activeProjects > 0 ? <button className="cs-club__attention-row" type="button" onClick={goFacilities}>
                    <span className="cs-club__status cs-club__status--lime" />
                    <span><strong>{activeProjects} proyectos activos</strong><small>Infraestructura y obras</small></span>
                    <span aria-hidden="true">↗</span>
                  </button> : null}
                </div>}
            {isOwnClub && outstanding > 0 ? <p className="cs-club__panel-note">{outstanding} asunto(s) para revisar. Consulta cada aplicación para tomar decisiones.</p> : null}
          </section>
        </div>
        <section className="cs-club__panel cs-club__management-panel">
          <PanelTitle label="CENTRO DE GESTIÓN" />
          <div className="cs-club__management-grid">
            {isOwnClub ? <>
              <AreaButton title="JUNTA DIRECTIVA" detail="Mandato, gobierno y decisiones" number={governance?.pendingDecisions.length ?? '—'} app="board" />
              <AreaButton title="FINANZAS" detail="Cuentas, previsiones y límite salarial" number={contracts.length + ' contratos'} app="finances" />
              <AreaButton title="INSTALACIONES" detail="Estado, mantenimiento e inversiones" number={facilities?.facilities.length ?? '—'} app="facilities" />
              <AreaButton title="STAFF" detail="Departamentos, tareas y contratación" number={staff.length} app="staff" />
              <AreaButton title="NORMATIVA" detail="Cumplimiento y expedientes" app="enforcement" />
            </> : <div className="cs-club__empty">Las operaciones de gestión están reservadas a tu club. Puedes consultar su identidad y su plantilla.</div>}
          </div>
        </section>
      </> : null}

      {tab === 'identity' ? <div className="cs-club__detail-grid">
        <section className="cs-club__panel">
          <PanelTitle label="IDENTIDAD INSTITUCIONAL" />
          <dl className="cs-club__fields">
            <Field label="Club deportivo" value={team.name} />
            <Field label="Entidad legal" value={organization?.legalName} />
            <Field label="Año de fundación" value={organization?.foundedYear} />
            <Field label="País" value={country?.name} />
            <Field label="Categoría" value={section?.categoryScope} />
            <Field label="Sección" value={section?.canonicalName} />
            <Field label="Rama" value={team.gender === 'female' ? 'Femenina' : 'Masculina'} />
          </dl>
        </section>
        <section className="cs-club__panel">
          <PanelTitle label="CONTEXTO DEPORTIVO" />
          <dl className="cs-club__fields">
            <Field label="Ecosistema" value={context.ecosystemName} />
            <Field label="Competición" value={context.competitionName} />
            <Field label="Temporada" value={context.seasonLabel} />
            <Field label="Jugadores inscritos" value={team.rosterPlayerIds.length} />
            <Field label="Profesionales de staff" value={staff.length} />
            <Field label="Contratos activos" value={contracts.length} />
          </dl>
        </section>
        <section className="cs-club__panel cs-club__strategy">
          <PanelTitle label="RUMBO DEL CLUB" />
          {strategy === undefined ? <p className="cs-club__empty">Todavía no hay una estrategia institucional canónica registrada.</p>
            : <>
              <div className="cs-club__strategy-mode">{STRATEGIC_MODES[strategy.mode] ?? strategy.mode}</div>
              <dl className="cs-club__fields">
                <Field label="Horizonte" value={strategy.horizon} />
                <Field label="Situación financiera" value={strategy.financialPosture} />
                <Field label="Foco de desarrollo" value={String(strategy.developmentEmphasis) + ' / 100'} />
                <Field label="Última revisión" value={strategy.lastReviewedOn} />
              </dl>
            </>}
        </section>
      </div> : null}

      {tab === 'operations' ? <div className="cs-club__operations">
        {isOwnClub ? <>
          <section className="cs-club__panel">
            <PanelTitle label="ESTRUCTURA Y RESPONSABILIDADES" />
            <div className="cs-club__operations-list">
              <AreaButton title="PERSONAL Y DEPARTAMENTOS" detail="Equipo técnico, staff profesional, roles y asignaciones" number={staff.length + ' miembros'} app="staff" />
              <AreaButton title="GOBIERNO DEL CLUB" detail="Objetivos, solicitudes, aprobaciones y renovación" number={board?.jobSecurity ?? 'Sin evaluación'} app="board" />
              <AreaButton title="INSTALACIONES" detail="Recursos físicos, proyectos y mantenimiento" number={(facilities?.facilities.length ?? 0) + ' centros'} app="facilities" />
              <AreaButton title="GESTIÓN FINANCIERA" detail="Estado real de caja y proyecciones en Finanzas" app="finances" />
              <AreaButton title="CUMPLIMIENTO" detail="Normativa, sanciones y seguimiento institucional" app="enforcement" />
            </div>
          </section>
          <section className="cs-club__panel">
            <PanelTitle label="DATOS OPERATIVOS" />
            <dl className="cs-club__fields">
              <Field label="Contratos activos" value={contracts.length} />
              <Field label="Salarios en efectivo del año contractual" value={formatMoney(activeCashSalary)} />
              <Field label="Impacto en límite salarial" value={salary ? formatMoney(salary.payroll.totalCapHit) : 'No aplicable'} />
              <Field label="Espacio bajo límite" value={salary ? formatMoney(salary.capSpace) : 'No aplicable'} />
              <Field label="Instalaciones vinculadas" value={facilities?.facilities.length ?? 0} />
              <Field label="Proyectos activos" value={activeProjects} />
              <Field label="Necesidades críticas abiertas" value={criticalNeeds} />
              <Field label="Decisiones institucionales pendientes" value={governance?.pendingDecisions.length ?? 0} />
            </dl>
            <p className="cs-club__disclaimer">El coste salarial y el espacio bajo límite no representan dinero disponible para fichajes. Consulta la tesorería real en Finanzas.</p>
          </section>
        </> : <section className="cs-club__panel"><p className="cs-club__empty">No tienes permisos de gestión sobre este club.</p></section>}
      </div> : null}
    </div>
  </NgHoloShell>
}
