import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerId, StaffPersonId } from '@/domain/ids'
import type { ScoutingMission, ScoutingPriority, ScoutingTerritory } from '@/domain/scouting'
import { SCOUTING_TERRITORY_WORKLOAD_COST } from '@/domain/scouting'
import { getScoutingTerritoryCoverage } from '@/app/scouting'
import { getUserTeam } from '@/engine/calendar'
import { calculateStaffWorkload, isStaffRoleSuitableForScoutingTerritory, type GameWorld } from '@/domain/world'
import { STAFF_ROLE_LABELS, staffQualityBand } from '@/ui/staffPresentation'
import { useGameStore } from '@/stores/gameStore'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { buildScoutingReportDetail, buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'
import { SCOUTING_TAB_LABELS, SCOUTING_WORKSPACE_TABS, scoutingPriorityLabel, type ScoutingAssignmentRow, type ScoutingKnowledgeRow, type ScoutingOppositionRow, type ScoutingReportRow, type ScoutingWorkspaceModel, type ScoutingWorkspaceTabId } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import { RequestScoutingModal, ScoutingModalFrame } from '@/ui-ng/applications/scouting/ScoutingModals'
import { PlayPositionMark } from '@/ui-ng/components/PlayPositionMark'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import './scouting-workspace.css'

type ModalState = { readonly kind: 'request'; readonly playerId: PlayerId; readonly mission?: ScoutingMission } | { readonly kind: 'report'; readonly reportId: string } | { readonly kind: 'cancel'; readonly assignment: ScoutingAssignmentRow } | { readonly kind: 'coverage-add' } | { readonly kind: 'coverage-end'; readonly assignmentId: string }
const PRIORITIES: readonly ScoutingPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

function ScoutingWorkspaceHeader({ model }: { readonly model: ScoutingWorkspaceModel }) {
  return <header className="scouting-workspace-header" data-ng-region="scouting-workspace-header"><div className="scouting-workspace-header__main"><span className="scouting-workspace-header__app">Scouting</span><span className="scouting-workspace-header__sep" aria-hidden /><span className="scouting-workspace-header__team">{model.teamName}</span><span className="scouting-workspace-header__meta"><span className="ng-type-numeric">{model.knownSubjectCount}</span> known · <span className="ng-type-numeric">{model.openAssignmentCount}</span> open · <span className="ng-type-numeric">{model.reportCount}</span> reports · <span className="ng-type-numeric">{model.territoryCount}</span> territories</span></div></header>
}

function knowledgeLabel(row: ScoutingKnowledgeRow): string {
  if (row.knowledgeState === 'DISCOVERED') return 'Discovered · not scouted'
  if (row.knowledgeState === 'QUICK_LOOK') return 'Quick Look'
  if (row.knowledgeState === 'PARTIAL') return 'Partial'
  if (row.knowledgeState === 'DETAILED') return 'Detailed'
  return row.isOwnRoster ? 'Roster · not scouted' : 'Not scouted'
}

function KnowledgeBoard({ model, onOpenPlayer, onRequest, onManage }: { readonly model: ScoutingWorkspaceModel; readonly onOpenPlayer: (id: PlayerId) => void; readonly onRequest: (id: PlayerId) => void; readonly onManage: () => void }) {
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [beingScouted, setBeingScouted] = useState(false)
  const [position, setPosition] = useState('ALL')
  const [minimumAge, setMinimumAge] = useState('')
  const [maximumAge, setMaximumAge] = useState('')
  const rows = model.knowledge.filter((row) => {
    const search = query.trim().toLocaleLowerCase()
    const matchesSearch = search.length === 0 || `${row.name} ${row.clubName} ${row.competitionName} ${row.countryName}`.toLocaleLowerCase().includes(search)
    return matchesSearch && (position === 'ALL' || row.position === position) && (stateFilter === 'ALL' || row.knowledgeState === stateFilter) && (!beingScouted || row.activeAssignment !== null) && (minimumAge === '' || row.age >= Number(minimumAge)) && (maximumAge === '' || row.age <= Number(maximumAge))
  })
  const positions = [...new Set(model.knowledge.map((row) => row.position))].sort()
  return <section className="scouting-board ng-holo-panel">
    <div className="scouting-filter-bar" aria-label="Filter Players">
      <label>Search<input aria-label="Search Players" onChange={(event) => setQuery(event.target.value)} placeholder="Name, team, competition, country" value={query} /></label>
      <label>Position<select aria-label="Filter position" onChange={(event) => setPosition(event.target.value)} value={position}><option value="ALL">All</option>{positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Knowledge<select aria-label="Filter knowledge" onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}><option value="ALL">All states</option><option value="UNKNOWN">Not scouted</option><option value="DISCOVERED">Discovered</option><option value="QUICK_LOOK">Quick Look</option><option value="PARTIAL">Partial</option><option value="DETAILED">Detailed</option></select></label>
      <label className="scouting-filter-bar__age">Age<input aria-label="Minimum age" min="0" onChange={(event) => setMinimumAge(event.target.value)} placeholder="Min" type="number" value={minimumAge} /><input aria-label="Maximum age" min="0" onChange={(event) => setMaximumAge(event.target.value)} placeholder="Max" type="number" value={maximumAge} /></label>
      <label className="scouting-filter-bar__check"><input checked={beingScouted} onChange={(event) => setBeingScouted(event.target.checked)} type="checkbox" />Being scouted</label>
      <span className="scouting-filter-bar__count">{rows.length} / {model.candidateCount} Players</span>
    </div>
    {rows.length === 0 ? <p className="scouting-workspace__empty">No addressable Players match these filters.</p> : <div className="scouting-workspace__table-wrap"><table className="scouting-workspace__table"><thead><tr><th>Player</th><th>Pos</th><th>Club</th><th>Competition</th><th>Country</th><th>Age</th><th>Knowledge</th><th>Coverage</th><th>Scout / action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.playerId}><td><button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">{row.name}</button>{row.isOwnRoster ? <span className="scouting-workspace__tag">Roster</span> : null}</td><td><PlayPositionMark position={row.position} /></td><td>{row.clubName}</td><td>{row.competitionName}</td><td>{row.countryName}</td><td>{row.age}</td><td><span className={`scouting-state is-${row.knowledgeState.toLowerCase()}`}>{knowledgeLabel(row)}</span></td><td>{row.coverageLabel}</td><td>{row.activeAssignment ? <button className="ng-btn ng-btn--ghost" onClick={onManage} type="button">{row.activeAssignment.missionLabel} · {row.activeAssignment.statusLabel}</button> : <button className="ng-btn ng-btn--primary" disabled={!model.canRequestScouting} onClick={() => onRequest(row.playerId)} type="button">Request scouting</button>}</td></tr>)}</tbody></table></div>}
    {model.requestUnavailableLabel ? <p className="scouting-workspace__note">{model.requestUnavailableLabel}</p> : null}
  </section>
}

function AssignmentBoard({ rows, onOpenPlayer, onCancel, onPriority }: { readonly rows: readonly ScoutingAssignmentRow[]; readonly onOpenPlayer: (id: PlayerId) => void; readonly onCancel: (row: ScoutingAssignmentRow) => void; readonly onPriority: (row: ScoutingAssignmentRow, priority: ScoutingPriority) => void }) {
  if (rows.length === 0) return <p className="scouting-workspace__empty">No Scouting assignments.</p>
  return <div className="scouting-workspace__table-wrap ng-holo-panel"><table className="scouting-workspace__table"><thead><tr><th>Player</th><th>Mission</th><th>Scout</th><th>Role</th><th>Priority</th><th>Status</th><th>Requested</th><th>Expected</th><th>Workload</th><th>Source</th><th>Manage</th></tr></thead><tbody>{rows.map((row) => { const live = row.status === 'ACTIVE' || row.status === 'QUEUED'; return <tr key={row.id}><td><button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">{row.playerName}</button></td><td>{row.missionLabel}</td><td>{row.evaluatorName}</td><td>{row.evaluatorRoleLabel}</td><td>{live ? <select aria-label={`Priority for ${row.playerName}`} onChange={(event) => onPriority(row, event.target.value as ScoutingPriority)} value={row.priority}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{scoutingPriorityLabel(priority)}</option>)}</select> : row.priorityLabel}</td><td>{row.statusLabel}</td><td>{row.createdLabel}</td><td>{row.expectedLabel ?? '—'}</td><td>{row.workloadLabel}</td><td>{row.sourceLabel}</td><td>{live ? <button className="ng-btn ng-btn--danger" onClick={() => onCancel(row)} type="button">Cancel</button> : '—'}</td></tr> })}</tbody></table></div>
}

function ReportBoard({ rows, onOpenPlayer, onOpenReport }: { readonly rows: readonly ScoutingReportRow[]; readonly onOpenPlayer: (id: PlayerId) => void; readonly onOpenReport: (id: string) => void }) {
  if (rows.length === 0) return <p className="scouting-workspace__empty">No completed evaluator reports yet.</p>
  return <div className="scouting-workspace__list">{rows.map((row) => <article className="scouting-report-row ng-holo-panel" key={row.id}><div><button className="scouting-workspace__link" onClick={() => onOpenPlayer(row.playerId)} type="button">{row.playerName}</button><span className="scouting-workspace__tag">{row.missionLabel}</span></div><span>{row.evaluatorName} · {row.evaluatorRoleLabel}</span><span>{row.createdLabel}</span><span>{row.findingCount} findings</span><span>{row.confidenceLabel} confidence · {row.coverageLabel} coverage</span><span>{row.evidenceSourceLabel}</span><button className="ng-btn ng-btn--ghost" onClick={() => onOpenReport(row.id)} type="button">Open report</button></article>)}</div>
}

function CoverageBoard({ world, teamId, model, onAdd, onEnd }: { readonly world: GameWorld; readonly teamId: string; readonly model: ScoutingWorkspaceModel; readonly onAdd: () => void; readonly onEnd: (id: string) => void }) {
  const activeCount = model.coverage.filter((row) => row.assignment.status === 'ACTIVE').length
  return <section className="scouting-board ng-holo-panel"><header className="scouting-section-head"><div><h2>Territory coverage</h2><p>{activeCount} active · two existing workload units per operation</p></div><button className="ng-btn ng-btn--primary" disabled={model.validTerritories.length === 0} onClick={onAdd} type="button">Add coverage</button></header>{model.coverage.length === 0 ? <p className="scouting-workspace__empty">No territory operations yet. Add a country or competition where this club has current basketball context.</p> : <div className="scouting-workspace__table-wrap"><table className="scouting-workspace__table"><thead><tr><th>Territory</th><th>Type</th><th>Scout</th><th>Role</th><th>Coverage</th><th>Known / eligible</th><th>Status</th><th>Started</th><th>Workload</th><th /></tr></thead><tbody>{model.coverage.map((row) => <tr key={row.id}><td>{row.territoryLabel}</td><td>{row.territoryTypeLabel}</td><td>{row.scoutName}</td><td>{row.scoutRoleLabel}</td><td>{row.coverageLabel}</td><td>{row.knownEligibleLabel}</td><td>{row.assignment.status}</td><td>{row.assignment.startedAt}</td><td>{row.workloadLabel}</td><td>{row.assignment.status === 'ACTIVE' ? <button className="ng-btn ng-btn--danger" onClick={() => onEnd(row.id)} type="button">End coverage</button> : null}</td></tr>)}</tbody></table></div>}</section>
}

function OppositionBoard({ rows, onOpenPlayer }: { readonly rows: readonly ScoutingOppositionRow[]; readonly onOpenPlayer: (id: PlayerId) => void }) {
  if (rows.length === 0) return <p className="scouting-workspace__empty">No opposition scouting reports.</p>
  return <div className="scouting-workspace__list">{rows.map((row) => <article className="scouting-workspace__panel ng-holo-panel" key={row.id}><header className="scouting-workspace__card-head"><strong>{row.opponentName}</strong><span>{row.gameDateLabel}</span><span>{row.qualityLabel} report</span><span>{row.emphasisLabel ?? 'No emphasis'}</span><span>{row.paceLabel === null ? 'Pace —' : `Pace ${row.paceLabel}`}</span><span>{row.authoredBy} · {row.authorRoleLabel}</span></header>{row.flaggedPlayers.length ? <ul className="scouting-workspace__findings">{row.flaggedPlayers.map((player) => <li key={player.playerId}><button className="scouting-workspace__link" onClick={() => onOpenPlayer(player.playerId)} type="button">{player.name}</button></li>)}</ul> : <p className="scouting-workspace__note">No flagged Players.</p>}</article>)}</div>
}

function TerritoryModal({ world, model, teamId, onClose, onCreate }: { readonly world: GameWorld; readonly model: ScoutingWorkspaceModel; readonly teamId: string; readonly onClose: () => void; readonly onCreate: (input: { readonly scoutStaffId: StaffPersonId; readonly territory: ScoutingTerritory }) => string | null }) {
  const [territoryKey, setTerritoryKey] = useState('')
  const [staffId, setStaffId] = useState('AUTO')
  const [error, setError] = useState<string | null>(null)
  const selected = model.validTerritories.find((item) => (item.kind === 'COUNTRY' ? `COUNTRY:${item.countryId}` : `COMPETITION:${item.competitionId}`) === territoryKey) ?? model.validTerritories[0]
  const keyOf = (item: ScoutingTerritory) => item.kind === 'COUNTRY' ? `COUNTRY:${item.countryId}` : `COMPETITION:${item.competitionId}`
  const scouts = selected === undefined ? [] : Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === teamId && world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed' && isStaffRoleSuitableForScoutingTerritory(world, teamId as never, assignment.role, selected) && !calculateStaffWorkload(world, assignment.staffPersonId).overloaded && calculateStaffWorkload(world, assignment.staffPersonId).totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST <= calculateStaffWorkload(world, assignment.staffPersonId).capacityLimit).sort((a, b) => a.staffPersonId.localeCompare(b.staffPersonId))
  const choices = selected === undefined ? [] : model.validTerritories.filter((item) => scouts.some((scout) => isStaffRoleSuitableForScoutingTerritory(world, teamId as never, scout.role, item)))
  const territory = selected
  const projection = territory === undefined ? null : getScoutingTerritoryCoverage(world, world.teams[teamId as never]!.organizationId, territory)
  const submit = () => {
    if (territory === undefined || scouts.length === 0) return
    const scout = scouts.find((item) => item.staffPersonId === staffId) ?? (staffId === 'AUTO' ? scouts[0] : undefined)
    if (scout === undefined) return
    const message = onCreate({ scoutStaffId: scout.staffPersonId, territory })
    if (message === null) onClose()
    else setError(message)
  }
  return <ScoutingModalFrame title="Add territory coverage" onClose={onClose} footer={<><span className="scouting-modal__error" role="alert">{error ?? ''}</span><button className="ng-btn ng-btn--ghost" onClick={onClose} type="button">Cancel</button><button className="ng-btn ng-btn--primary" disabled={territory === undefined || scouts.length === 0} onClick={submit} type="button">Start coverage</button></>}>
    <div className="scouting-request-form"><label>Territory<select onChange={(event) => { setTerritoryKey(event.target.value); setStaffId('AUTO') }} value={territory === undefined ? '' : keyOf(territory)}>{choices.map((item) => { const key = keyOf(item); const label = item.kind === 'COUNTRY' ? world.countries[item.countryId]?.name ?? item.countryId : world.competitions[item.competitionId]?.name ?? item.competitionId; return <option key={key} value={key}>{item.kind === 'COUNTRY' ? 'Country · ' : 'Competition · '}{label}</option> })}</select></label><label>Scout<select onChange={(event) => setStaffId(event.target.value)} value={staffId}><option value="AUTO">Auto · best suitable workload</option>{scouts.map((item) => { const staff = world.staffPeopleById[item.staffPersonId]!; const workload = calculateStaffWorkload(world, item.staffPersonId); const a = staff.professional.attributes; const quality = staffQualityBand(Math.round((a.talentEvaluation + a.analysis) / 2)); return <option key={item.staffPersonId} value={item.staffPersonId}>{staff.identity.firstName} {staff.identity.lastName} · {STAFF_ROLE_LABELS[item.role]} · {quality} · {workload.totalCapacityUsed}/{workload.capacityLimit}</option> })}</select>{scouts.length === 0 ? <small>No employed Scout with territory role suitability and workload capacity.</small> : null}</label>{projection ? <div className="scouting-coverage-preview"><strong>Current coverage</strong><span>{Math.round(projection.coverage * 100)}%</span><span>{projection.knownPlayerCount} known / {projection.eligiblePlayerCount} eligible Players</span><span>Operation cost: {SCOUTING_TERRITORY_WORKLOAD_COST} workload units</span></div> : null}</div>
  </ScoutingModalFrame>
}

export function ReportDetailModal({ world, reportId, onClose }: { readonly world: GameWorld; readonly reportId: string; readonly onClose: () => void }) {
  const detail = buildScoutingReportDetail(world, reportId)
  if (detail === undefined) return <ScoutingModalFrame title="Report unavailable" onClose={onClose}><p>This historical report could not be found.</p></ScoutingModalFrame>
  return <ScoutingModalFrame title="Scouting report" onClose={onClose}><div className="scouting-report-detail"><header><strong>{detail.playerName}</strong><span>{detail.missionLabel} · {detail.createdLabel}</span><span>{detail.evaluatorName} · {detail.evaluatorRoleLabel}</span><span>{detail.confidenceLabel} confidence · {detail.coverageLabel} coverage · {detail.uncertaintyLabel} uncertainty</span><span>Evidence: {detail.evidenceSourceLabel}</span></header>{detail.tacticalFitLabel ? <p>Tactical fit estimate: {detail.tacticalFitLabel}</p> : null}{detail.broadFindings.length ? <section><h3>Broad findings</h3>{detail.broadFindings.map((item) => <p key={item.label}>{item.label}: {item.estimate} ±{item.uncertainty} · {item.confidence}% confidence</p>)}</section> : null}{detail.families.map((family) => <details key={family.id}><summary>{family.label} · {family.findings.length} ratings</summary><div className="scouting-report-detail__ratings">{family.findings.map((item) => <p key={item.key}>{item.label}<strong>{item.estimate} ±{item.uncertainty}</strong><small>{item.confidence}% confidence</small></p>)}</div></details>)}{detail.potentialFindings.length ? <section><h3>Potential estimates</h3>{detail.potentialFindings.map((item) => <p key={item.label}>{item.label}: {item.estimate} ±{item.uncertainty} · {item.confidence}% confidence</p>)}</section> : null}<section><h3>Evidence</h3>{detail.evidence.length ? detail.evidence.map((item) => <p key={item.id}>{item.source.replaceAll('_', ' ')} · {item.observedAt} · quality {Math.round(item.quality * 100)}%{item.gameId ? ` · Game ${item.gameId}` : ''}</p>) : <p>No evidence record is available.</p>}</section></div></ScoutingModalFrame>
}

function priorityAfter(priority: ScoutingPriority): ScoutingPriority {
  return PRIORITIES[Math.min(PRIORITIES.length - 1, PRIORITIES.indexOf(priority) + 1)]!
}

export function ScoutingWorkspace() {
  const world = useGameStore((state) => state.world)
  const requestScoutingAssignment = useGameStore((state) => state.requestScoutingAssignment)
  const setPriority = useGameStore((state) => state.updateScoutingAssignmentPriority)
  const cancelAssignment = useGameStore((state) => state.cancelScoutingAssignment)
  const createCoverage = useGameStore((state) => state.createScoutingTerritoryAssignment)
  const endCoverage = useGameStore((state) => state.endScoutingTerritoryAssignment)
  const { openEntity } = useNgWorkspaceNavigation()
  const [activeTab, setActiveTab] = useState<ScoutingWorkspaceTabId>('knowledge')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const model = useMemo(() => world === null ? null : buildScoutingWorkspaceModel(world), [world])
  const team = useMemo(() => world === null ? undefined : getUserTeam(world), [world])
  const teamStyle = useMemo(() => { if (team === undefined) return undefined; const colors = deriveTeamColors(team.id); return { '--po-team-primary': colors.primary, '--po-team-secondary': colors.secondary, '--po-team-muted': colors.muted } as CSSProperties }, [team])
  const tabs = useMemo(() => SCOUTING_WORKSPACE_TABS.map((id) => ({ id, label: SCOUTING_TAB_LABELS[id], active: id === activeTab })), [activeTab])
  const openPlayer = (playerId: PlayerId) => openEntity({ type: 'player', playerId, section: 'overview' })
  if (world === null || model === null || team === undefined) return <div className="scouting-workspace scouting-workspace--empty" data-ng-region="scouting-workspace"><section className="scouting-workspace__empty-state"><h1 className="scouting-workspace__empty-title">Scouting</h1><p className="scouting-workspace__empty-message">No team assigned to the user coach.</p></section></div>
  return <div className="scouting-workspace" data-ng-region="scouting-workspace" style={teamStyle}>
    <ApplicationWorkspace header={<ScoutingWorkspaceHeader model={model} />} tabs={<WorkspaceTabs activeTabId={activeTab} onTabSelect={(id) => setActiveTab(id as ScoutingWorkspaceTabId)} tabs={tabs} />}>
      <ScrollRegion className="scouting-workspace__scroll">
        {message ? <p className="scouting-workspace__feedback" role="status">{message}<button onClick={() => setMessage(null)} type="button">Dismiss</button></p> : null}
        {activeTab === 'knowledge' ? <KnowledgeBoard model={model} onOpenPlayer={openPlayer} onRequest={(id) => setModal({ kind: 'request', playerId: id })} onManage={() => setActiveTab('assignments')} /> : null}
        {activeTab === 'assignments' ? <AssignmentBoard onOpenPlayer={openPlayer} rows={model.assignments} onCancel={(row) => setModal({ kind: 'cancel', assignment: row })} onPriority={(row, priority) => { const error = setPriority(row.id, priority); setMessage(error ?? `${row.playerName} priority changed to ${scoutingPriorityLabel(priority)}.`) }} /> : null}
        {activeTab === 'reports' ? <ReportBoard rows={model.reports} onOpenPlayer={openPlayer} onOpenReport={(reportId) => setModal({ kind: 'report', reportId })} /> : null}
        {activeTab === 'coverage' ? <CoverageBoard world={world} teamId={team.id} model={model} onAdd={() => setModal({ kind: 'coverage-add' })} onEnd={(assignmentId) => setModal({ kind: 'coverage-end', assignmentId })} /> : null}
        {activeTab === 'opposition' ? <OppositionBoard onOpenPlayer={openPlayer} rows={model.opposition} /> : null}
      </ScrollRegion>
    </ApplicationWorkspace>
    {modal?.kind === 'request' ? <RequestScoutingModal world={world} teamId={team.id} playerId={modal.playerId} initialMission={modal.mission} onClose={() => setModal(null)} onSubmit={(input) => requestScoutingAssignment(input)} /> : null}
    {modal?.kind === 'report' ? <ReportDetailModal world={world} reportId={modal.reportId} onClose={() => setModal(null)} /> : null}
    {modal?.kind === 'cancel' ? <ScoutingModalFrame title="Cancel scouting assignment?" onClose={() => setModal(null)} footer={<><button className="ng-btn ng-btn--ghost" onClick={() => setModal(null)} type="button">Keep assignment</button><button className="ng-btn ng-btn--danger" onClick={() => { const error = cancelAssignment(modal.assignment.id); setMessage(error ?? `${modal.assignment.playerName} assignment cancelled.`); setModal(null) }} type="button">Cancel assignment</button></>}><p>{modal.assignment.playerName} · {modal.assignment.missionLabel} · {modal.assignment.evaluatorName}</p><p>Cancellation preserves the assignment history and any completed report or knowledge.</p></ScoutingModalFrame> : null}
    {modal?.kind === 'coverage-add' ? <TerritoryModal world={world} model={model} teamId={team.id} onClose={() => setModal(null)} onCreate={(input) => createCoverage(input)} /> : null}
    {modal?.kind === 'coverage-end' ? <ScoutingModalFrame title="End territory coverage?" onClose={() => setModal(null)} footer={<><button className="ng-btn ng-btn--ghost" onClick={() => setModal(null)} type="button">Keep coverage</button><button className="ng-btn ng-btn--danger" onClick={() => { endCoverage(modal.assignmentId); setModal(null) }} type="button">End coverage</button></>}><p>Ending this operation stops future discovery but keeps the operation history, awareness and all Player knowledge.</p></ScoutingModalFrame> : null}
  </div>
}
