import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { BoardState } from '@/domain/board'
import {
  deriveGovernanceCommitmentStatus,
  deriveGovernanceMeetingScheduledFor,
  deriveGovernanceMeetingStatus,
  governanceManagerEvaluationScore,
} from '@/domain/governance'
import type { GameWorld } from '@/domain/world'
import type { ClubGovernanceModel } from '@/app/governance'
import { buildFinanceWorkspaceSection } from '@/ui-ng/applications/finances/financeWorkspaceModel'
import { syncWorkspaceAppQuery } from '@/ui-ng/workspace/workspaceApps'

import './board-courtside.css'

type BoardSection = 'overview' | 'mandate' | 'institution' | 'requests' | 'resources'
interface Props {
  readonly tab: BoardSection
  readonly world: GameWorld
  readonly teamId: string
  readonly state: BoardState
  readonly governance: ClubGovernanceModel
  readonly jobSecurity: string
  readonly renewal: string
  readonly onSelectTab: (tab: 'mandate' | 'institution' | 'requests' | 'resources' | 'governance' | 'history') => void
}
const readable = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
const objectivesOpen = (outcome: string) => outcome === 'inProgress'
const closedRequest = (status: string | undefined) => ['DECLINED', 'WITHDRAWN', 'FULFILLED'].includes(status ?? '')
const closedCommitment = (status: string | undefined) => ['WITHDRAWN', 'FULFILLED', 'SUPERSEDED'].includes(status ?? '')
const dateText = (date: string | null | undefined) => date ?? 'Sin fecha'
const labelForTarget = (target: { readonly kind: string; readonly value?: number | boolean; readonly minimum?: number; readonly maximum?: number }) => {
  if (target.kind === 'RANGE') return String(target.minimum) + ' a ' + String(target.maximum)
  return target.value === undefined ? 'No definido' : String(target.value)
}
function Panel({ label, children, className = '' }: { readonly label: string; readonly children: ReactNode; readonly className?: string }) {
  return <section className={'cs-board-v3__panel ' + className}><h2>{label}</h2>{children}</section>
}
function Kpi({ label, value, detail, tone }: { readonly label: string; readonly value: ReactNode; readonly detail?: string; readonly tone?: 'warm' | 'risk' }) {
  return <div className={'cs-board-v3__kpi ' + (tone ? 'cs-board-v3__kpi--' + tone : '')}>
    <span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}
  </div>
}
function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="cs-board-v3__empty">{children}</p>
}
function Pill({ children, status }: { readonly children: ReactNode; readonly status?: string }) {
  const tone = status === 'overdue' || status === 'REJECTED' || status === 'VETOED' || status === 'BREACHED' || status === 'severelyFailed' || status === 'failed' || status === 'CRITICAL'
    ? 'risk' : status === 'APPROVED' || status === 'EXECUTED' || status === 'FULFILLED' || status === 'met' || status === 'exceeded' || status === 'exceptional' ? 'good' : 'neutral'
  return <span className={'cs-board-v3__pill cs-board-v3__pill--' + tone}>{children}</span>
}
function Subhead({ title, onClick, action }: { readonly title: string; readonly onClick?: () => void; readonly action?: string }) {
  return <div className="cs-board-v3__subhead"><h3>{title}</h3>{onClick ? <button className="cs-board-v3__link" type="button" onClick={onClick}>{action ?? 'Ver todo'} ↗</button> : null}</div>
}

export function BoardCourtsideSections(props: Props) {
  const { tab, world, teamId, state, governance, jobSecurity, renewal, onSelectTab } = props
  const institutionIds = new Set(governance.institutionIds)
  const institutions = Object.values(world.governanceInstitutionsById).filter((item) => institutionIds.has(item.id))
  const periods = Object.values(world.governanceExpectationPeriodsById).filter((item) => institutionIds.has(item.institutionId))
  const periodIds = new Set(periods.map((item) => item.id))
  const objectives = Object.values(world.governanceObjectivesById).filter((item) => periodIds.has(item.expectationPeriodId))
  const evaluationPeriods = Object.values(world.governanceManagerEvaluationPeriodsById).filter((item) =>
    institutionIds.has(item.institutionId) && item.manager.kind === 'COACH' && item.manager.id === world.userCoachId)
  const managerPeriodIds = new Set(evaluationPeriods.map((item) => item.id))
  const evaluations = Object.values(world.governanceManagerEvaluationsById)
    .filter((item) => managerPeriodIds.has(item.evaluationPeriodId))
    .sort((a, b) => b.evaluatedOn.localeCompare(a.evaluatedOn) || a.id.localeCompare(b.id))
  const latestEvaluation = evaluations[0]
  const evaluationByObjective = new Map(evaluations.flatMap((evaluation) => evaluation.objectiveEvaluations.map((item) => [item.objectiveId, item] as const)))
  const transitions = Object.values(world.governanceJobSecurityTransitionsById)
    .filter((item) => institutionIds.has(item.institutionId) && item.managerId === world.userCoachId)
    .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))
  const meetings = Object.values(world.governanceMeetingsById).filter((meeting) => institutionIds.has(meeting.institutionId))
    .map((meeting) => {
      const events = Object.values(world.governanceMeetingEventsById).filter((event) => event.meetingId === meeting.id)
      const items = Object.values(world.governanceMeetingAgendaItemsById).filter((item) => item.meetingId === meeting.id).sort((a, b) => a.sequence - b.sequence)
      const participants = Object.values(world.governanceMeetingParticipantsById).filter((item) => item.meetingId === meeting.id)
      return { ...meeting, status: deriveGovernanceMeetingStatus(events), scheduledFor: deriveGovernanceMeetingScheduledFor(events), items, participants, events }
    }).sort((a, b) => (a.scheduledFor ?? a.createdOn).localeCompare(b.scheduledFor ?? b.createdOn))
  const bodyIds = new Set(governance.bodies.map((body) => body.bodyId))
  const activeAuthority = Object.values(world.governanceAuthorityGrantsById).filter((grant) =>
    bodyIds.has(grant.fromBodyId) && bodyIds.has(grant.toBodyId) &&
    grant.grantedOn <= world.currentDate && (grant.revokedOn === undefined || grant.revokedOn > world.currentDate))
  const externalRelationships = Object.values(world.governanceExternalRelationshipsById).filter((relationship) =>
    (relationship.institutionId !== undefined && institutionIds.has(relationship.institutionId)) ||
    (relationship.bodyId !== undefined && bodyIds.has(relationship.bodyId)))
    .filter((relationship) => relationship.startedOn <= world.currentDate &&
      (relationship.endedOn === undefined || relationship.endedOn >= world.currentDate))
  const commitments = Object.values(world.governanceCommitmentsById).filter((item) => institutionIds.has(item.institutionId))
    .map((item) => {
      const events = Object.values(world.governanceCommitmentEventsById).filter((event) => event.commitmentId === item.id)
      const status = deriveGovernanceCommitmentStatus(events)
      return { ...item, status, overdue: item.dueOn !== undefined && item.dueOn < world.currentDate && !closedCommitment(status) }
    }).sort((a, b) => (a.dueOn ?? '9999-12-31').localeCompare(b.dueOn ?? '9999-12-31'))
  const activeRequests = governance.requests.filter((request) => !closedRequest(request.status))
  const pendingCommitments = commitments.filter((item) => !closedCommitment(item.status))
  const actionable = governance.pendingDecisions.filter((decision) => decision.userApproverBodyIds.length > 0 || decision.userExecutorBodyIds.length > 0)
  const nextMeeting = meetings.find((meeting) => meeting.status === 'SCHEDULED' && (meeting.scheduledFor ?? '') >= world.currentDate)
  const latestTransition = transitions[0]
  const score = latestEvaluation === undefined ? undefined : governanceManagerEvaluationScore(latestEvaluation)

  if (tab === 'overview') {
    return <div className="cs-board-v3" data-ng-region="board-courtside-overview">
      <div className="cs-board-v3__hero">
        <section className="cs-board-v3__confidence">
          <span className="cs-board-v3__eyebrow">Confidence</span>
          <div className="cs-board-v3__confidence-main">
            <div className="cs-board-v3__dial" style={{ '--cs-board-progress': state.confidence + '%' } as CSSProperties}>
              <strong>{state.confidence}</strong><span>/ 100</span>
            </div>
            <div><h2>Confianza de la directiva</h2><p>Situación laboral: <strong>{readable(jobSecurity)}</strong></p><p>Renovación: {readable(renewal)}</p><small>Indicador Board. La evaluación institucional V2 se presenta por separado.</small></div>
          </div>
        </section>
        <section className="cs-board-v3__mandate">
          <span className="cs-board-v3__eyebrow">Mandate</span>
          <h2>{state.expectation.summary}</h2>
          <p>Expectativa principal de la temporada</p>
          <div className="cs-board-v3__mandate-foot">
            <span>Posición de referencia <b>{state.expectation.baselinePosition}</b></span>
            <button type="button" onClick={() => onSelectTab('mandate')}>Ver objetivos ↗</button>
          </div>
        </section>
      </div>
      <div className="cs-board-v3__section-eyebrow" data-ng-region="board-governance-attention">Governance attention</div>
      <div className="cs-board-v3__kpis">
        <Kpi label="Decisiones pendientes" value={governance.pendingDecisions.length} detail={String(actionable.length) + ' requieren tu intervención'} tone={actionable.length ? 'warm' : undefined} />
        <Kpi label="Solicitudes activas" value={activeRequests.length} detail={String(activeRequests.filter((item) => item.overdue).length) + ' fuera de plazo'} tone={activeRequests.some((item) => item.overdue) ? 'risk' : undefined} />
        <Kpi label="Compromisos activos" value={pendingCommitments.length} detail={String(pendingCommitments.filter((item) => item.overdue).length) + ' vencidos'} />
        <Kpi label="Próximo consejo" value={nextMeeting?.scheduledFor ?? 'Sin convocar'} detail={nextMeeting?.title ?? 'No hay reunión programada'} />
      </div>
      <div className="cs-board-v3__columns">
        <Panel label="Prioridades de la directiva">
          <Subhead title="Objetivos vigentes" action="Mandato completo" onClick={() => onSelectTab('mandate')} />
          {state.objectives.filter((objective) => objectivesOpen(objective.outcome)).length ? state.objectives.filter((objective) => objectivesOpen(objective.outcome)).slice(0, 4).map((objective) =>
            <div className="cs-board-v3__line" key={objective.id}><span><b>{objective.label}</b><small>{readable(objective.horizon)}</small></span><Pill status={objective.priority === 'critical' ? 'risk' : undefined}>{readable(objective.priority)}</Pill></div>) : <Empty>No hay objetivos Board en curso.</Empty>}
          {objectives.length ? <p className="cs-board-v3__footnote">{objectives.length} objetivos institucionales V2. La evaluación formal se consulta en Mandato.</p> : null}
        </Panel>
        <Panel label="Tu siguiente decisión">
          {actionable.length ? actionable.slice(0, 3).map((decision) =>
            <button type="button" className="cs-board-v3__decision-link" onClick={() => onSelectTab('governance')} key={decision.decisionId}>
              <span><b>{decision.subjectLabel}</b><small>{readable(decision.decisionType)} · {readable(decision.status ?? 'PROPOSED')}</small></span><span>Revisar ↗</span>
            </button>) : governance.pendingDecisions.length ? <><p className="cs-board-v3__footnote">Hay asuntos pendientes, pero ninguno requiere una autorización tuya en este momento.</p><button className="cs-board-v3__link" onClick={() => onSelectTab('governance')} type="button">Consultar decisiones ↗</button></> : <Empty>No tienes aprobaciones o ejecuciones pendientes.</Empty>}
          {governance.institutionIds.length === 0 ? <p className="cs-board-v3__footnote" data-ng-region="board-governance-unavailable">No canonical Governance institution is recorded for this club, so nothing can be decided here yet.</p> : null}
        </Panel>
      </div>
      <div className="cs-board-v3__columns">
        <Panel label="Evaluación y señales">
          <div className="cs-board-v3__line"><span>Evaluación institucional</span><strong>{score === undefined ? 'No evaluable' : Math.round(score * 100) + ' / 100'}</strong></div>
          <div className="cs-board-v3__line"><span>Seguridad institucional</span><strong>{latestTransition ? readable(latestTransition.nextState) : 'Sin resolución'}</strong></div>
          <Subhead title="Motivos recientes" onClick={() => onSelectTab('history')} action="Historial" />
          {state.reasons.length ? state.reasons.slice(-3).reverse().map((reason) => <div className="cs-board-v3__line" key={reason.id}><span><b>{reason.detail}</b><small>{reason.date}</small></span><Pill status={reason.delta < 0 ? 'risk' : 'good'}>{reason.delta > 0 ? '+' : ''}{reason.delta}</Pill></div>) : <Empty>Sin cambios documentados en la confianza.</Empty>}
        </Panel>
        <Panel label="Relación institucional">
          {institutions.length ? institutions.map((item) => <div className="cs-board-v3__line" key={item.id}><span><b>{item.name}</b><small>{readable(item.universe)}</small></span><span>{governance.bodies.filter((body) => world.governanceBodiesById[body.bodyId]?.institutionId === item.id).length} órganos</span></div>) : <Empty>Aún no existe una institución de gobernanza vinculada al club.</Empty>}
          <div className="cs-board-v3__quicklinks">
            <button type="button" onClick={() => onSelectTab('institution')}>Estructura y reuniones ↗</button>
            <button type="button" onClick={() => onSelectTab('requests')}>Peticiones y compromisos ↗</button>
          </div>
        </Panel>
      </div>
    </div>
  }
  if (tab === 'mandate') {
    return <div className="cs-board-v3" data-ng-region="board-courtside-mandate">
      <div className="cs-board-v3__columns cs-board-v3__columns--wide">
        <Panel label="Mandato deportivo">
          <div className="cs-board-v3__line"><span>Expectativa de la temporada</span><strong>{state.expectation.summary}</strong></div>
          <div className="cs-board-v3__line"><span>Posición de referencia</span><strong>{state.expectation.baselinePosition}</strong></div>
          <Subhead title="Objetivos Board" />
          {state.objectives.length ? state.objectives.map((objective) => <div className="cs-board-v3__line" key={objective.id}><span><b>{objective.label}</b><small>{readable(objective.horizon)} · {readable(objective.priority)} · {objective.seasonId}</small></span><Pill status={objective.outcome}>{readable(objective.outcome)}</Pill></div>) : <Empty>No hay objetivos Board registrados.</Empty>}
        </Panel>
        <Panel label="Perfil de la directiva">
          {[['Ambición', state.profile.ambition], ['Paciencia', state.profile.patience], ['Estabilidad', state.profile.stability], ['Resultados', state.profile.resultsFocus], ['Desarrollo', state.profile.developmentFocus], ['Prestigio', state.profile.prestigeFocus]].map(([label, value]) =>
            <div className="cs-board-v3__profile" key={label}><span>{label}</span><div role="meter" aria-label={String(label)} aria-valuenow={Number(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: String(value) + '%' }} /></div><b>{value}</b></div>)}
        </Panel>
      </div>
      <Panel label="Objetivos institucionales (Governance V2)">
        {objectives.length === 0 ? <Empty>Esta institución todavía no tiene objetivos V2 registrados. No se inventan metas a partir del perfil Board.</Empty> :
          <div className="cs-board-v3__table-wrap"><table className="cs-board-v3__table"><thead><tr><th>Área</th><th>Indicador</th><th>Objetivo</th><th>Horizonte</th><th>Evaluación real</th></tr></thead><tbody>
          {objectives.map((objective) => { const evaluation = evaluationByObjective.get(objective.id); return <tr key={objective.id}><td>{readable(objective.family)}</td><td>{readable(objective.metric)}</td><td>{readable(objective.comparison)} · {labelForTarget(objective.target)}</td><td>{readable(objective.horizon)}<small>{objective.evaluationEndsOn}</small></td><td><Pill status={evaluation?.status}>{readable(evaluation?.status ?? 'NOT_EVALUABLE')}</Pill>{evaluation?.measuredValue !== undefined ? <small>Valor: {String(evaluation.measuredValue)}</small> : null}</td></tr> })}
          </tbody></table></div>}
      </Panel>
    </div>
  }
  if (tab === 'institution') {
    return <div className="cs-board-v3" data-ng-region="board-courtside-institution">
      <div className="cs-board-v3__columns">
        <Panel label="Órganos y poderes">
          {institutions.length ? institutions.map((institution) =>
            <div key={institution.id}><Subhead title={institution.name} /><p className="cs-board-v3__footnote">{readable(institution.universe)}</p>
              {governance.bodies.filter((body) => world.governanceBodiesById[body.bodyId]?.institutionId === institution.id).map((body) =>
                <div className="cs-board-v3__line" key={body.bodyId}><span><b>{body.name}</b><small>{readable(body.kind)}</small></span><span>{body.userAppointed ? <Pill>Tu nombramiento</Pill> : body.roles.length ? body.roles.map(readable).join(', ') : 'Otro órgano'}</span></div>)}
            </div>) : <Empty>Sin estructura institucional en la partida.</Empty>}
        </Panel>
        <Panel label="Evaluación del mánager">
          <div className="cs-board-v3__kpis cs-board-v3__kpis--two">
            <Kpi label="Última evaluación" value={score === undefined ? 'No evaluable' : Math.round(score * 100) + '/100'} detail={latestEvaluation?.evaluatedOn ?? 'Sin evaluación'} />
            <Kpi label="Situación V2" value={latestTransition ? readable(latestTransition.nextState) : 'Sin decisión'} detail={latestTransition?.effectiveOn ?? 'No consta resolución'} />
          </div>
          {latestEvaluation ? latestEvaluation.factors.map((factor) => <div className="cs-board-v3__line" key={factor.id}><span>{readable(factor.kind)}</span><span>{factor.status === 'PRESENT' ? Math.round((factor.normalizedValue ?? 0) * 100) + '%' : 'No evaluable'}</span></div>) : <Empty>No se ha registrado ninguna evaluación institucional del entrenador.</Empty>}
          <p className="cs-board-v3__footnote">Esta evaluación no se deduce del medidor Board. Se muestran únicamente factores y resoluciones persistidos.</p>
        </Panel>
      </div>
      <div className="cs-board-v3__columns">
        <Panel label="Mapa de autoridad">
          {activeAuthority.length ? <div className="cs-board-v3__table-wrap"><table className="cs-board-v3__table"><thead><tr><th>De</th><th>Hacia</th><th>Competencia</th></tr></thead><tbody>
            {activeAuthority.map((grant) => <tr key={grant.id}><td>{world.governanceBodiesById[grant.fromBodyId]?.name ?? grant.fromBodyId}</td><td>{world.governanceBodiesById[grant.toBodyId]?.name ?? grant.toBodyId}</td><td>{readable(grant.decision)}</td></tr>)}
          </tbody></table></div> : <Empty>No hay delegaciones formales activas registradas.</Empty>}
          <p className="cs-board-v3__footnote">Los permisos efectivos de cada asunto se resuelven en Governance. Este mapa no otorga nuevos permisos.</p>
        </Panel>
        <Panel label="Relaciones externas">
          {externalRelationships.length ? externalRelationships.map((item) => <div className="cs-board-v3__line" key={item.id}>
            <span><b>{readable(item.relationshipType)}</b><small>{readable(item.externalRef.kind)}</small></span><span>{item.externalRef.id}</span>
          </div>) : <Empty>Sin relaciones institucionales externas activas registradas.</Empty>}
          <p className="cs-board-v3__footnote">NCAA, NBA/WNBA, clubes y federaciones muestran únicamente las relaciones de su propio universo.</p>
        </Panel>
      </div>
      <Panel label="Reuniones del consejo">
        {meetings.length ? <div className="cs-board-v3__meeting-grid">{meetings.map((meeting) => <article className="cs-board-v3__meeting" key={meeting.id}>
          <div className="cs-board-v3__line"><span><b>{meeting.title}</b><small>{readable(meeting.category)}</small></span><Pill status={meeting.status}>{readable(meeting.status ?? 'NOT_SCHEDULED')}</Pill></div>
          <p>Fecha: {dateText(meeting.scheduledFor)} · Convoca: {world.governanceBodiesById[meeting.conveningBodyId]?.name ?? meeting.conveningBodyId}</p>
          <p>{meeting.participants.length} participantes · {meeting.items.length} puntos del orden del día</p>
          {meeting.items.length ? <details><summary>Ver orden del día</summary><ol>{meeting.items.map((item) => <li key={item.id}>{readable(item.subject.kind)} · {'topic' in item.subject ? item.subject.topic : Object.values(item.subject)[1]}</li>)}</ol></details> : null}
        </article>)}</div> : <Empty>No se han convocado reuniones. No existe aún una acción canónica para convocarlas desde aquí.</Empty>}
      </Panel>
    </div>
  }
  if (tab === 'requests') {
    return <div className="cs-board-v3" data-ng-region="board-courtside-requests">
      <div className="cs-board-v3__columns">
        <Panel label="Solicitudes de la institución">
          {governance.requests.length ? governance.requests.map((request) => <article className="cs-board-v3__matter" key={request.requestId}>
            <div className="cs-board-v3__line"><span><b>{request.summary}</b><small>{readable(request.category)} · {request.issuerLabel} → {request.recipientLabel}</small></span><Pill status={request.overdue ? 'overdue' : request.status}>{request.overdue ? 'Vencida' : readable(request.status ?? 'NOT_ISSUED')}</Pill></div>
            <div className="cs-board-v3__meta"><span>Plazo: {dateText(request.dueOn)}</span><span>{request.addressedToUser ? 'Dirigida a ti' : 'Registro institucional'}</span></div>
            {!request.responseCommandAvailable ? <p className="cs-board-v3__footnote">Respuesta solo de consulta: todavía no existe comando canónico para responder a esta solicitud.</p> : null}
          </article>) : <Empty>No hay solicitudes de gobernanza registradas.</Empty>}
        </Panel>
        <Panel label="Compromisos y seguimiento">
          {commitments.length ? commitments.map((item) => <article className="cs-board-v3__matter" key={item.id}>
            <div className="cs-board-v3__line"><span><b>{item.summary}</b><small>Origen: {readable(item.provenance.kind)}</small></span><Pill status={item.overdue ? 'overdue' : item.status}>{item.overdue ? 'Vencido' : readable(item.status ?? 'NOT_MADE')}</Pill></div>
            <p className="cs-board-v3__footnote">Plazo: {dateText(item.dueOn)}</p>
          </article>) : <Empty>No hay compromisos institucionales registrados.</Empty>}
        </Panel>
      </div>
    </div>
  }
  // Board uses the existing Finance read model, never a parallel invented transfer budget.
  return <BoardResourceSection world={world} teamId={teamId} onSelectTab={onSelectTab} governance={governance} />
}

function BoardResourceSection({ world, teamId, governance, onSelectTab }: Pick<Props, 'world' | 'teamId' | 'governance' | 'onSelectTab'>) {
  const organizationId = world.teams[teamId as keyof typeof world.teams]?.organizationId
  const section = useMemo(() => organizationId === undefined ? null : buildFinanceWorkspaceSection(world, organizationId, 'budget'), [world, organizationId])
  const financialMatters = governance.decisions.filter((decision) =>
    ['BUDGET', 'PLAYER_BUDGET', 'STAFF_BUDGET', 'CAPITAL_EXPENDITURE', 'FACILITIES', 'DEBT'].includes(decision.decisionType))
  return <div className="cs-board-v3" data-ng-region="board-courtside-resources">
    <div className="cs-board-v3__columns">
      <Panel label="Presupuesto aprobado y situación">
        {section === null ? <Empty>No hay organización financiera vinculada al club.</Empty> :
          <><p className="cs-board-v3__footnote">Datos del mismo modelo canónico que Finanzas, sin crear fondos adicionales.</p>
          {section.metrics.length ? <div className="cs-board-v3__kpis cs-board-v3__kpis--two">{section.metrics.slice(0, 4).map((metric) => <Kpi key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />)}</div> : <Empty>Sin métricas presupuestarias disponibles.</Empty>}
          {section.notes.slice(0, 2).map((note, index) => <p className="cs-board-v3__footnote" key={index}>{note}</p>)}</>}
        <button type="button" className="cs-board-v3__primary" onClick={() => syncWorkspaceAppQuery('finances')}>Abrir Finanzas ↗</button>
      </Panel>
      <Panel label="Autorizaciones de recursos">
        {financialMatters.length ? financialMatters.slice(0, 8).map((item) => <button type="button" className="cs-board-v3__decision-link" onClick={() => onSelectTab('governance')} key={item.decisionId}><span><b>{item.subjectLabel}</b><small>{readable(item.decisionType)}</small></span><Pill status={item.status}>{readable(item.status ?? 'PROPOSED')}</Pill></button>) : <Empty>No hay decisiones de presupuesto o inversión registradas por la institución.</Empty>}
        <div className="cs-board-v3__quicklinks">
          <button type="button" onClick={() => syncWorkspaceAppQuery('facilities')}>Instalaciones ↗</button>
          <button type="button" onClick={() => syncWorkspaceAppQuery('staff')}>Estructura Staff ↗</button>
          <button type="button" onClick={() => syncWorkspaceAppQuery('market')}>Mercado ↗</button>
        </div>
      </Panel>
    </div>
    {section?.tables.length ? <Panel label="Detalle presupuestario">
      {section.tables.slice(0, 2).map((table) => <div className="cs-board-v3__budget-table" key={table.title}><Subhead title={table.title} />{table.rows.length ?
        <div className="cs-board-v3__table-wrap"><table className="cs-board-v3__table"><thead><tr>{table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{table.rows.slice(0, 12).map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div> :
        <Empty>{table.empty}</Empty>}</div>)}
      <p className="cs-board-v3__footnote">Para el presupuesto completo, revisiones, moneda y límites aplicables, usa Finanzas.</p>
    </Panel> : null}
  </div>
}
