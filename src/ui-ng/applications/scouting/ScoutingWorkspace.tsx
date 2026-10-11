import { useMemo, useState, type CSSProperties } from 'react'
import type { PlayerId, StaffPersonId } from '@/domain/ids'
import type { ScoutingMission, ScoutingPriority, ScoutingTerritory } from '@/domain/scouting'
import type { BasketballPosition } from '@/domain/primitives'
import { calculateAge } from '@/domain/player'
import { SCOUTING_TERRITORY_WORKLOAD_COST } from '@/domain/scouting'
import { estimateRecruitmentFocusWorkloadImpact, getRecruitmentFocusCandidates, getScoutingTerritoryCoverage, getValidScoutingTerritories, searchAddressableScoutingPlayers, type CreateRecruitmentFocusInput } from '@/app/scouting'
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
import { TalentOperationsNav } from '@/ui-ng/applications/talent/TalentOperationsNav'

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

function KnowledgeBoard({ model, onOpenPlayer, onRequest, onManage, initialQuery = '' }: { readonly model: ScoutingWorkspaceModel; readonly onOpenPlayer: (id: PlayerId) => void; readonly onRequest: (id: PlayerId) => void; readonly onManage: () => void; readonly initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery)
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

const BASKETBALL_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C']
const FOCUS_EVALUATION_DIMENSIONS = ['finishing', 'shooting', 'creation', 'perimeterDefense', 'interiorDefense', 'rebounding', 'physical'] as const

function FocusCriteriaEditor({ focus, onSave }: { readonly focus: GameWorld['scoutingRecruitmentFocusesById'][string]; readonly onSave: (criteria: Pick<CreateRecruitmentFocusInput, 'name' | 'positions' | 'minimumAge' | 'maximumAge' | 'knowledgeState' | 'evaluationDimension' | 'minimumCurrentLevel' | 'minimumPotentialLevel'>) => void }) {
  const [name, setName] = useState(focus.name)
  const [positions, setPositions] = useState<BasketballPosition[]>([...focus.positions])
  const [minimumAge, setMinimumAge] = useState(focus.minimumAge?.toString() ?? '')
  const [maximumAge, setMaximumAge] = useState(focus.maximumAge?.toString() ?? '')
  const [knowledgeState, setKnowledgeState] = useState<'ANY' | 'DISCOVERED' | 'EVALUATED'>(focus.knowledgeState ?? 'ANY')
  const [dimension, setDimension] = useState<(typeof FOCUS_EVALUATION_DIMENSIONS)[number]>(focus.evaluationDimension ?? 'creation')
  const [current, setCurrent] = useState(focus.minimumCurrentLevel?.toString() ?? '')
  const [potential, setPotential] = useState(focus.minimumPotentialLevel?.toString() ?? '')
  return <details className="scouting-workspace__panel"><summary>Edit search criteria</summary><div className="scouting-filter-bar"><label>Brief name<input value={name} onChange={(event) => setName(event.target.value)} /></label>{BASKETBALL_POSITIONS.map((position) => <label key={position}><input type="checkbox" checked={positions.includes(position)} onChange={(event) => setPositions(event.target.checked ? [...positions, position] : positions.filter((item) => item !== position))} />{position}</label>)}<label>Age from<input type="number" min="0" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /></label><label>Age to<input type="number" min="0" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /></label><label>Knowledge state<select value={knowledgeState} onChange={(event) => setKnowledgeState(event.target.value as typeof knowledgeState)}><option value="ANY">Any</option><option value="DISCOVERED">Discovered</option><option value="EVALUATED">Evaluated</option></select></label><label>Evaluation dimension<select value={dimension} onChange={(event) => setDimension(event.target.value as typeof dimension)}>{FOCUS_EVALUATION_DIMENSIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Min current<input type="number" min="0" max="100" value={current} onChange={(event) => setCurrent(event.target.value)} /></label><label>Min potential<input type="number" min="0" max="100" value={potential} onChange={(event) => setPotential(event.target.value)} /></label><button className="ng-btn ng-btn--ghost" onClick={() => onSave({ name, positions, minimumAge: numberValue(minimumAge), maximumAge: numberValue(maximumAge), knowledgeState, evaluationDimension: dimension, minimumCurrentLevel: numberValue(current), minimumPotentialLevel: numberValue(potential) })} type="button">Save criteria</button></div></details>
}

function RecruitmentFocusBoard({ world, teamId, onOpenPlayer, onRequest, onMessage }: { readonly world: GameWorld; readonly teamId: string; readonly onOpenPlayer: (id: PlayerId) => void; readonly onRequest: (id: PlayerId) => void; readonly onMessage: (message: string) => void }) {
  const advanceDay = useGameStore((state) => state.advanceDay)
  const create = useGameStore((state) => state.createRecruitmentFocus)
  const editCriteria = useGameStore((state) => state.editRecruitmentFocusCriteria)
  const setPriority = useGameStore((state) => state.updateRecruitmentFocusPriority)
  const cancel = useGameStore((state) => state.cancelRecruitmentFocus)
  const dismiss = useGameStore((state) => state.dismissRecruitmentFocusCandidate)
  const [position, setPosition] = useState<BasketballPosition>('PG')
  const [minimumAge, setMinimumAge] = useState('18')
  const [maximumAge, setMaximumAge] = useState('24')
  const [knowledgeState, setKnowledgeState] = useState<'ANY' | 'DISCOVERED' | 'EVALUATED'>('ANY')
  const [evaluationDimension, setEvaluationDimension] = useState<(typeof FOCUS_EVALUATION_DIMENSIONS)[number]>('creation')
  const [minimumCurrentLevel, setMinimumCurrentLevel] = useState('')
  const [minimumPotentialLevel, setMinimumPotentialLevel] = useState('')
  const [territoryKey, setTerritoryKey] = useState('')
  const [scoutStaffIds, setScoutStaffIds] = useState<StaffPersonId[]>([])
  const [autoAssign, setAutoAssign] = useState(true)
  const [priority, setLocalPriority] = useState<ScoutingPriority>('HIGH')
  const [duration, setDuration] = useState<'SHORT' | 'MEDIUM' | 'ONGOING'>('MEDIUM')
  const territories = getValidScoutingTerritories(world)
  const selectedTerritory = territories.find((territory) => keyOfTerritory(territory) === territoryKey) ?? territories[0]
  const staff = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === teamId && world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed' && selectedTerritory !== undefined && isStaffRoleSuitableForScoutingTerritory(world, teamId as never, assignment.role, selectedTerritory)).map((assignment) => ({ ...assignment, person: world.staffPeopleById[assignment.staffPersonId]! })).filter((assignment) => assignment.person !== undefined).sort((a, b) => a.staffPersonId.localeCompare(b.staffPersonId))
  const createFocus = (seed?: Partial<CreateRecruitmentFocusInput>) => {
    if (selectedTerritory === undefined) { onMessage('Choose a territory for this Recruitment Focus.'); return }
    const selectedTerritories = seed?.territories ?? [selectedTerritory]
    const staffAssignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.teamId === teamId && world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed')
    const assignedScouts = autoAssign ? staffAssignments.filter((assignment) => selectedTerritories.every((territory) => isStaffRoleSuitableForScoutingTerritory(world, teamId as never, assignment.role, territory))).filter((assignment) => { const load = calculateStaffWorkload(world, assignment.staffPersonId); return load.totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST * selectedTerritories.length <= load.capacityLimit }).sort((a, b) => calculateStaffWorkload(world, a.staffPersonId).totalCapacityUsed - calculateStaffWorkload(world, b.staffPersonId).totalCapacityUsed).slice(0, 1).map((item) => item.staffPersonId) : scoutStaffIds
    if (assignedScouts.length === 0) { onMessage('Choose an employed Scout with territory-role suitability and available workload capacity.'); return }
    const input: CreateRecruitmentFocusInput = { name: seed?.name ?? `${seed?.positions?.[0] ?? position} recruitment`, positions: seed?.positions ?? [position], minimumAge: seed?.minimumAge ?? numberValue(minimumAge), maximumAge: seed?.maximumAge ?? numberValue(maximumAge), knowledgeState, evaluationDimension, ...(numberValue(minimumCurrentLevel) === undefined ? {} : { minimumCurrentLevel: numberValue(minimumCurrentLevel) }), ...(numberValue(minimumPotentialLevel) === undefined ? {} : { minimumPotentialLevel: numberValue(minimumPotentialLevel) }), territories: selectedTerritories, scoutStaffIds: assignedScouts, priority: seed?.priority ?? priority, duration: seed?.duration ?? duration }
    const error = create(input)
    onMessage(error ?? `Recruitment Focus created. Scout workload: ${estimateRecruitmentFocusWorkloadImpact(world, assignedScouts)}.`)
  }
  const liveFocuses = Object.values(world.scoutingRecruitmentFocusesById).filter((focus) => focus.requestingTeamId === teamId).sort((a, b) => a.status === 'ACTIVE' ? -1 : b.status === 'ACTIVE' ? 1 : b.createdAt.localeCompare(a.createdAt))
  const advanceScoutingDay = () => {
    const result = advanceDay()
    if (result.status === 'BREAKPOINT_PREVENTED') onMessage(result.breakpointBefore.breakpoint?.diagnostic ?? 'Resolve the pending game action before advancing.')
    else if (result.status === 'FAILED') onMessage(`Date did not advance: ${result.failure?.message ?? 'daily simulation failed'}`)
    else onMessage(`Date advanced to ${result.world.currentDate}.${result.status === 'BREAKPOINT_AFTER_PROCESSING' ? ` ${result.breakpointAfter?.breakpoint?.diagnostic ?? 'A new action is waiting.'}` : ''}`)
  }
  return <section className="scouting-board ng-holo-panel">
    <header className="scouting-section-head"><div><h2>Recruitment brief</h2><p>Describe the Player profile first. Scouts explore only the selected territory over time.</p></div><button className="ng-btn ng-btn--primary" onClick={advanceScoutingDay} type="button">Advance one day</button></header>
    <div className="scouting-filter-bar">
      <label>Position<select value={position} onChange={(event) => setPosition(event.target.value as BasketballPosition)}>{BASKETBALL_POSITIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Age from<input type="number" min="0" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /></label>
      <label>Age to<input type="number" min="0" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /></label>
      <label>Knowledge state<select value={knowledgeState} onChange={(event) => setKnowledgeState(event.target.value as typeof knowledgeState)}><option value="ANY">Any</option><option value="DISCOVERED">Discovered</option><option value="EVALUATED">Evaluated</option></select></label>
      <label>Known profile<select value={evaluationDimension} onChange={(event) => setEvaluationDimension(event.target.value as typeof evaluationDimension)}>{FOCUS_EVALUATION_DIMENSIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Min current level<input type="number" min="0" max="100" value={minimumCurrentLevel} onChange={(event) => setMinimumCurrentLevel(event.target.value)} placeholder="Any / unknown" /></label>
      <label>Min potential level<input type="number" min="0" max="100" value={minimumPotentialLevel} onChange={(event) => setMinimumPotentialLevel(event.target.value)} placeholder="Any / unknown" /></label>
      <label>Country / competition<select value={territoryKey || (selectedTerritory ? keyOfTerritory(selectedTerritory) : '')} onChange={(event) => { setTerritoryKey(event.target.value); setScoutStaffIds([]); setAutoAssign(true) }}>{territories.map((item) => <option key={keyOfTerritory(item)} value={keyOfTerritory(item)}>{item.kind === 'COUNTRY' ? world.countries[item.countryId]?.name : world.competitions[item.competitionId]?.name}</option>)}</select></label>
      <label>Scouts<select multiple aria-label="Assign Scouts" value={scoutStaffIds} onChange={(event) => { setScoutStaffIds([...event.target.selectedOptions].map((option) => option.value as StaffPersonId)); setAutoAssign(false) }}>{staff.map((item) => { const attrs = item.person.professional.attributes; const quality = staffQualityBand(Math.round((attrs.talentEvaluation + attrs.analysis) / 2)); const load = calculateStaffWorkload(world, item.staffPersonId); return <option key={item.staffPersonId} value={item.staffPersonId}>{item.person.identity.firstName} {item.person.identity.lastName} · {STAFF_ROLE_LABELS[item.role]} · {quality} · {load.totalCapacityUsed}/{load.capacityLimit} → {load.totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST}/{load.capacityLimit}</option> })}</select>{staff.length ? <small>Eligible role for the selected territory · quality uses evaluation and analysis · workload includes this territory’s cost.</small> : <small>No employed Scout has the required role for this territory.</small>}</label>
      <label><input type="checkbox" checked={autoAssign} onChange={(event) => setAutoAssign(event.target.checked)} />Auto assign best available Scout</label>
      <label>Priority<select value={priority} onChange={(event) => setLocalPriority(event.target.value as ScoutingPriority)}>{PRIORITIES.map((item) => <option key={item} value={item}>{scoutingPriorityLabel(item)}</option>)}</select></label>
      <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value as typeof duration)}><option value="SHORT">Short · 14 days</option><option value="MEDIUM">Medium · 42 days</option><option value="ONGOING">Ongoing</option></select></label>
      <button className="ng-btn ng-btn--primary" onClick={() => createFocus()} type="button">Create Focus</button>
    </div>
    <p className="scouting-workspace__note">Select multiple Scouts with Ctrl/⌘. Capacity is charged through each Scout’s existing territory workload.</p>
    {liveFocuses.length === 0 ? <p className="scouting-workspace__empty">No Recruitment Focuses yet.</p> : liveFocuses.map((focus) => {
      const candidates = getRecruitmentFocusCandidates(world, focus.id)
      const active = focus.status === 'ACTIVE'
      return <article className="scouting-workspace__panel ng-holo-panel" key={focus.id}><header className="scouting-workspace__card-head"><strong>{focus.name}</strong><span>{focus.positions.join(', ')} · {focus.minimumAge ?? '—'}–{focus.maximumAge ?? '—'}</span><span>{focus.priority} · {focus.status} · {focus.daysActive} days</span><span>{focus.scoutStaffIds.map((id) => `${world.staffPeopleById[id]?.identity.firstName ?? 'Scout'} ${world.staffPeopleById[id]?.identity.lastName ?? ''}`).join(', ')}</span>{active ? <><select aria-label={`Priority for ${focus.name}`} value={focus.priority} onChange={(event) => onMessage(setPriority(focus.id, event.target.value as ScoutingPriority) ?? `${focus.name} priority updated.`)}>{PRIORITIES.map((item) => <option key={item} value={item}>{scoutingPriorityLabel(item)}</option>)}</select><button className="ng-btn ng-btn--danger" onClick={() => onMessage(cancel(focus.id) ?? `${focus.name} cancelled; discoveries and reports remain.`)} type="button">Cancel</button></> : null}</header>{active ? <FocusCriteriaEditor focus={focus} onSave={(criteria) => onMessage(editCriteria(focus.id, criteria) ?? `${focus.name} criteria updated.`)} /> : null}<p>{focus.territories.map((item) => item.kind === 'COUNTRY' ? world.countries[item.countryId]?.name : world.competitions[item.competitionId]?.name).join(', ')} · {focus.knowledgeState ?? 'ANY'} knowledge · {focus.evaluationDimension ?? 'no ability target'} · {candidates.length} candidates</p>{candidates.length ? <div className="scouting-workspace__table-wrap"><table className="scouting-workspace__table"><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>Team</th><th>Competition</th><th>Knowledge</th><th>Fit / confidence</th><th>Report state</th><th>Next action</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.playerId}><td><button className="scouting-workspace__link" onClick={() => onOpenPlayer(candidate.playerId)} type="button">{candidate.name}</button></td><td>{candidate.position}</td><td>{candidate.age}</td><td>{candidate.teamName}</td><td>{candidate.competitionName}</td><td>{candidate.knowledge}</td><td title={candidate.reasons.join(' · ')}>{candidate.fit} · {candidate.confidence}%</td><td>{candidate.scoutingStatus === 'IN_PROGRESS' ? `In progress · ${candidate.activeMission?.replaceAll('_', ' ') ?? 'Report'}${candidate.activeScoutName ? ` · ${candidate.activeScoutName}` : ''}` : candidate.scoutingStatus === 'REPORTED' ? 'Report completed' : 'Not requested'}</td><td><button className="ng-btn ng-btn--ghost" disabled={candidate.scoutingStatus === 'IN_PROGRESS'} onClick={() => onRequest(candidate.playerId)} type="button">{candidate.scoutingStatus === 'IN_PROGRESS' ? 'Report in progress' : candidate.scoutingStatus === 'REPORTED' ? 'Request follow-up report' : 'Request deeper report'}</button> <button className="ng-btn ng-btn--ghost" onClick={() => onMessage(dismiss(focus.id, candidate.playerId) ?? `${candidate.name} removed from this Focus.`)} type="button">Remove</button></td></tr>)}</tbody></table></div> : <p className="scouting-workspace__empty">No Players discovered for this brief yet. Advance days to let assigned Scouts work.</p>}</article>
    })}
  </section>
}

function PlayerSearchBoard({ world, teamId, onOpenPlayer, onMessage }: { readonly world: GameWorld; readonly teamId: string; readonly onOpenPlayer: (id: PlayerId) => void; readonly onMessage: (message: string) => void }) {
  const create = useGameStore((state) => state.createRecruitmentFocus)
  const [name, setName] = useState('')
  const [position, setPosition] = useState<BasketballPosition | ''>('')
  const [minimumAge, setMinimumAge] = useState('')
  const [maximumAge, setMaximumAge] = useState('')
  const [knowledge, setKnowledge] = useState<'ANY' | 'UNKNOWN' | 'DISCOVERED' | 'EVALUATED'>('ANY')
  const [countryId, setCountryId] = useState('')
  const [competitionId, setCompetitionId] = useState('')
  const [rosterTeamId, setRosterTeamId] = useState('')
  const [marketStatus, setMarketStatus] = useState<'ANY' | 'ROSTERED' | 'FREE_AGENT'>('ANY')
  const [scoutingStatus, setScoutingStatus] = useState<'ANY' | 'NOT_SCOUTED' | 'ACTIVE' | 'REPORTED'>('ANY')
  const [evaluationDimension, setEvaluationDimension] = useState<(typeof FOCUS_EVALUATION_DIMENSIONS)[number]>('creation')
  const [minimumCurrentLevel, setMinimumCurrentLevel] = useState('')
  const [minimumPotentialLevel, setMinimumPotentialLevel] = useState('')
  const team = world.teams[teamId as never]!
  const ids = searchAddressableScoutingPlayers(world, team.id, { name, position, minimumAge: numberValue(minimumAge), maximumAge: numberValue(maximumAge), knowledge, countryId, competitionId, rosterTeamId: rosterTeamId as never, marketStatus, scoutingStatus, evaluationDimension, minimumCurrentLevel: numberValue(minimumCurrentLevel), minimumPotentialLevel: numberValue(minimumPotentialLevel) })
  const territories = getValidScoutingTerritories(world)
  const selectedTerritory = territories.find((item) => item.kind === 'COUNTRY' ? item.countryId === (countryId || (rosterTeamId ? world.teams[rosterTeamId as never]?.countryId : '')) : item.competitionId === competitionId) ?? territories[0]
  const createFocusFromSearch = () => {
    if (selectedTerritory === undefined || !position) { onMessage('Choose a position and a country or competition before creating a Focus.'); return }
    const scouts = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === team.id && world.staffEmploymentByStaffId[item.staffPersonId]?.status === 'employed' && isStaffRoleSuitableForScoutingTerritory(world, team.id, item.role, selectedTerritory)).filter((item) => { const load = calculateStaffWorkload(world, item.staffPersonId); return load.totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST <= load.capacityLimit }).sort((a, b) => calculateStaffWorkload(world, a.staffPersonId).totalCapacityUsed - calculateStaffWorkload(world, b.staffPersonId).totalCapacityUsed)
    if (scouts.length === 0) { onMessage('No suitable Scout has enough workload capacity for this search.'); return }
    const error = create({ name: `Search focus · ${position}`, positions: [position], ...(numberValue(minimumAge) === undefined ? {} : { minimumAge: numberValue(minimumAge) }), ...(numberValue(maximumAge) === undefined ? {} : { maximumAge: numberValue(maximumAge) }), knowledgeState: knowledge === 'DISCOVERED' || knowledge === 'EVALUATED' ? knowledge : 'ANY', evaluationDimension, ...(numberValue(minimumCurrentLevel) === undefined ? {} : { minimumCurrentLevel: numberValue(minimumCurrentLevel) }), ...(numberValue(minimumPotentialLevel) === undefined ? {} : { minimumPotentialLevel: numberValue(minimumPotentialLevel) }), territories: [selectedTerritory], scoutStaffIds: [scouts[0]!.staffPersonId], priority: 'NORMAL', duration: 'MEDIUM' })
    onMessage(error ?? 'Recruitment Focus created from Player Search criteria.')
  }
  return <section className="scouting-board ng-holo-panel"><header className="scouting-section-head"><div><h2>Player Search</h2><p>Search only public or already addressable Player identities. Ability filters use known evidence only; unknown estimates are never used.</p></div></header><div className="scouting-filter-bar"><label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Position<select value={position} onChange={(event) => setPosition(event.target.value as BasketballPosition | '')}><option value="">Any</option>{BASKETBALL_POSITIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Age from<input type="number" min="0" value={minimumAge} onChange={(event) => setMinimumAge(event.target.value)} /></label><label>Age to<input type="number" min="0" value={maximumAge} onChange={(event) => setMaximumAge(event.target.value)} /></label><label>Country<select value={countryId} onChange={(event) => { setCountryId(event.target.value); setCompetitionId('') }}><option value="">Any</option>{Object.values(world.countries).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Competition<select value={competitionId} onChange={(event) => { setCompetitionId(event.target.value); setCountryId('') }}><option value="">Any</option>{Object.values(world.competitions).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Club<select value={rosterTeamId} onChange={(event) => setRosterTeamId(event.target.value)}><option value="">Any</option>{Object.values(world.teams).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Market<select value={marketStatus} onChange={(event) => setMarketStatus(event.target.value as typeof marketStatus)}><option value="ANY">Any</option><option value="ROSTERED">Rostered</option><option value="FREE_AGENT">Free agent</option></select></label><label>Knowledge<select value={knowledge} onChange={(event) => setKnowledge(event.target.value as typeof knowledge)}><option value="ANY">Any</option><option value="UNKNOWN">Unknown</option><option value="DISCOVERED">Discovered</option><option value="EVALUATED">Evaluated</option></select></label><label>Scouting<select value={scoutingStatus} onChange={(event) => setScoutingStatus(event.target.value as typeof scoutingStatus)}><option value="ANY">Any</option><option value="NOT_SCOUTED">Not scouted</option><option value="ACTIVE">In progress</option><option value="REPORTED">Has report</option></select></label><label>Known rating<select value={evaluationDimension} onChange={(event) => setEvaluationDimension(event.target.value as typeof evaluationDimension)}>{FOCUS_EVALUATION_DIMENSIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Min current<input type="number" min="0" max="100" value={minimumCurrentLevel} onChange={(event) => setMinimumCurrentLevel(event.target.value)} /></label><label>Min potential<input type="number" min="0" max="100" value={minimumPotentialLevel} onChange={(event) => setMinimumPotentialLevel(event.target.value)} /></label><span>{ids.length} Players</span><button className="ng-btn ng-btn--primary" onClick={createFocusFromSearch} type="button">Create Focus from Search</button></div>{ids.length ? <div className="scouting-workspace__table-wrap"><table className="scouting-workspace__table"><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>Club / market</th><th>Knowledge</th></tr></thead><tbody>{ids.map((id) => { const player = world.players[id as PlayerId]!; const age = calculateAge(player.bio.dateOfBirth, world.currentDate); const roster = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(player.id)); const evaluated = world.organizationKnowledge.some((item) => item.organizationId === team.organizationId && item.subjectPlayerId === player.id); const discovered = Object.values(world.organizationPlayerAwarenessById).some((item) => item.organizationId === team.organizationId && item.playerId === player.id); return <tr key={id}><td><button className="scouting-workspace__link" onClick={() => onOpenPlayer(player.id)} type="button">{player.firstName} {player.lastName}</button></td><td>{player.basketball.primaryPosition}</td><td>{age}</td><td>{roster?.name ?? 'Free agent / contextual'}</td><td>{evaluated ? 'Evaluated' : discovered ? 'Discovered' : 'Unknown'}</td></tr> })}</tbody></table></div> : <p className="scouting-workspace__empty">No addressable Players match.</p>}</section>
}

function ScoutWorkloadBoard({ world, teamId }: { readonly world: GameWorld; readonly teamId: string }) {
  const scoutingRoles = new Set(['headScout', 'regionalScout', 'internationalScout', 'collegeScout', 'proScout'])
  const scouts = Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === teamId && world.staffEmploymentByStaffId[item.staffPersonId]?.status === 'employed' && scoutingRoles.has(item.role)).sort((a, b) => a.staffPersonId.localeCompare(b.staffPersonId))
  return <section className="scouting-board ng-holo-panel"><header className="scouting-section-head"><div><h2>Scout workload</h2><p>Active Focuses, Player assignments and territory work use the same Staff workload authority.</p></div></header><div className="scouting-workspace__list">{scouts.map((assignment) => {
    const staff = world.staffPeopleById[assignment.staffPersonId]!
    const workload = calculateStaffWorkload(world, assignment.staffPersonId)
    const focuses = Object.values(world.scoutingRecruitmentFocusesById).filter((item) => item.status === 'ACTIVE' && item.scoutStaffIds.includes(assignment.staffPersonId))
    const players = Object.values(world.scoutingAssignmentsById).filter((item) => item.evaluatorStaffId === assignment.staffPersonId && (item.status === 'ACTIVE' || item.status === 'QUEUED'))
    const territories = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.scoutStaffId === assignment.staffPersonId && item.status === 'ACTIVE')
    const reports = Object.values(world.evaluatorReportsById).filter((item) => item.evaluatorStaffId === assignment.staffPersonId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
    return <article className="scouting-workspace__panel ng-holo-panel" key={assignment.staffPersonId}><header className="scouting-workspace__card-head"><strong>{staff.identity.firstName} {staff.identity.lastName}</strong><span>{STAFF_ROLE_LABELS[assignment.role]}</span><span>Workload {workload.totalCapacityUsed}/{workload.capacityLimit}{workload.overloaded ? ' · OVERLOADED' : ''}</span></header><p>Focuses: {focuses.map((item) => item.name).join(', ') || 'None'} · Player assignments: {players.length} · Territory operations: {territories.length}</p><small>Recent reports: {reports.length ? reports.map((item) => `${world.players[item.subjectPlayerId]?.firstName ?? 'Player'} ${world.players[item.subjectPlayerId]?.lastName ?? ''} · ${item.createdAt}`).join(' / ') : 'None'}</small></article>
  })}</div></section>
}

function ScoutingCentreBoard({ world, teamId, model, onOpenPlayer, onOpenReport, onOpenFocuses }: { readonly world: GameWorld; readonly teamId: string; readonly model: ScoutingWorkspaceModel; readonly onOpenPlayer: (id: PlayerId) => void; readonly onOpenReport: (id: string) => void; readonly onOpenFocuses: () => void }) {
  const team = world.teams[teamId as never]!
  const focuses = Object.values(world.scoutingRecruitmentFocusesById).filter((item) => item.requestingTeamId === team.id)
  const activeFocuses = focuses.filter((item) => item.status === 'ACTIVE')
  const discoveries = Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === team.organizationId).sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)).slice(0, 5)
  const reports = model.reports.slice(0, 5)
  const matches = activeFocuses.flatMap((focus) => getRecruitmentFocusCandidates(world, focus.id).filter((candidate) => candidate.fit === 'ESTIMATED' && candidate.confidence >= 60).map((candidate) => ({ focus, candidate }))).slice(0, 5)
  const scoutingRoles = new Set(['headScout', 'regionalScout', 'internationalScout', 'collegeScout', 'proScout'])
  const scoutIds = new Set(Object.values(world.teamStaffAssignmentsById).filter((item) => item.teamId === team.id && scoutingRoles.has(item.role)).map((item) => item.staffPersonId))
  const overloaded = [...scoutIds].map((id) => ({ id, workload: calculateStaffWorkload(world, id) })).filter((item) => item.workload.overloaded)
  const stale = model.knowledge.filter((item) => Number.parseInt(item.freshnessLabel, 10) < 50).slice(0, 5)
  return <section className="scouting-board ng-holo-panel"><header className="scouting-section-head"><div><h2>Scouting Centre</h2><p>{activeFocuses.length} active focuses · {model.knownSubjectCount} known Players · {model.openAssignmentCount} open Player assignments · {overloaded.length} overloaded staff</p></div><button className="ng-btn ng-btn--primary" onClick={onOpenFocuses} type="button">Recruitment Focuses</button></header>
    <div className="scouting-workspace__list">
      <article className="scouting-workspace__panel"><h3>New discoveries</h3>{discoveries.length ? discoveries.map((item) => { const player = world.players[item.playerId]; const scout = world.staffPeopleById[item.discoveredByStaffId]; return <p key={item.id}><button className="scouting-workspace__link" onClick={() => onOpenPlayer(item.playerId)} type="button">{player ? `${player.firstName} ${player.lastName}` : 'Player'}</button> · {item.discoveredAt} · {scout ? `${scout.identity.firstName} ${scout.identity.lastName}` : 'Scout'}</p> }) : <p>No new discoveries yet.</p>}</article>
      <article className="scouting-workspace__panel"><h3>Completed reports</h3>{reports.length ? reports.map((item) => <p key={item.id}><button className="scouting-workspace__link" onClick={() => onOpenReport(item.id)} type="button">{item.playerName}</button> · {item.missionLabel} · {item.createdLabel}</p>) : <p>No reports completed yet.</p>}</article>
      <article className="scouting-workspace__panel"><h3>Focus progress & strong matches</h3>{activeFocuses.length ? activeFocuses.map((focus) => <p key={focus.id}><strong>{focus.name}</strong> · {getRecruitmentFocusCandidates(world, focus.id).length} candidates · {focus.daysActive} days active</p>) : <p>No active Recruitment Focuses.</p>}{matches.map(({ focus, candidate }) => <p key={`${focus.id}:${candidate.playerId}`}>Match: <button className="scouting-workspace__link" onClick={() => onOpenPlayer(candidate.playerId)} type="button">{candidate.name}</button> · {focus.name} · {candidate.confidence}% confidence</p>)}</article>
      <article className="scouting-workspace__panel"><h3>Attention needed</h3>{overloaded.map(({ id, workload }) => { const staff = world.staffPeopleById[id]; return <p key={id}>{staff ? `${staff.identity.firstName} ${staff.identity.lastName}` : 'Staff'} is overloaded · {workload.totalCapacityUsed}/{workload.capacityLimit}</p> })}{stale.map((item) => <p key={item.playerId}>Stale knowledge: <button className="scouting-workspace__link" onClick={() => onOpenPlayer(item.playerId)} type="button">{item.name}</button> · {item.freshnessLabel}</p>)}{overloaded.length === 0 && stale.length === 0 ? <p>No workload or stale knowledge issues detected.</p> : null}</article>
      <article className="scouting-workspace__panel"><h3>Scout recommendations</h3><p>Recommendations are surfaced only when recorded by canonical scouting reports. Open Reports to review staff findings.</p></article>
    </div>
  </section>
}

function keyOfTerritory(territory: ScoutingTerritory): string { return territory.kind === 'COUNTRY' ? `COUNTRY:${territory.countryId}` : `COMPETITION:${territory.competitionId}` }
function numberValue(value: string): number | undefined { return value.trim() === '' ? undefined : Number(value) }

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
  const [focusPlayerId] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('focusPlayerId'))
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
        <TalentOperationsNav current="scouting" />
        {message ? <p className="scouting-workspace__feedback" role="status">{message}<button onClick={() => setMessage(null)} type="button">Dismiss</button></p> : null}
        {activeTab === 'centre' ? <ScoutingCentreBoard world={world} teamId={team.id} model={model} onOpenPlayer={openPlayer} onOpenReport={(reportId) => setModal({ kind: 'report', reportId })} onOpenFocuses={() => setActiveTab('focuses')} /> : null}
        {activeTab === 'search' ? <PlayerSearchBoard world={world} teamId={team.id} onOpenPlayer={openPlayer} onMessage={setMessage} /> : null}
        {activeTab === 'focuses' ? <RecruitmentFocusBoard world={world} teamId={team.id} onOpenPlayer={openPlayer} onRequest={(id) => setModal({ kind: 'request', playerId: id, mission: 'FULL_REPORT' })} onMessage={setMessage} /> : null}
        {activeTab === 'knowledge' ? <KnowledgeBoard model={model} initialQuery={focusPlayerId && world.players[focusPlayerId as keyof typeof world.players] ? `${world.players[focusPlayerId as keyof typeof world.players]!.firstName} ${world.players[focusPlayerId as keyof typeof world.players]!.lastName}` : ''} onOpenPlayer={openPlayer} onRequest={(id) => setModal({ kind: 'request', playerId: id })} onManage={() => setActiveTab('assignments')} /> : null}
        {activeTab === 'assignments' ? <><AssignmentBoard onOpenPlayer={openPlayer} rows={model.assignments} onCancel={(row) => setModal({ kind: 'cancel', assignment: row })} onPriority={(row, priority) => { const error = setPriority(row.id, priority); setMessage(error ?? `${row.playerName} priority changed to ${scoutingPriorityLabel(priority)}.`) }} /><ScoutWorkloadBoard world={world} teamId={team.id} /><CoverageBoard world={world} teamId={team.id} model={model} onAdd={() => setModal({ kind: 'coverage-add' })} onEnd={(assignmentId) => setModal({ kind: 'coverage-end', assignmentId })} /></> : null}
        {activeTab === 'reports' ? <ReportBoard rows={model.reports} onOpenPlayer={openPlayer} onOpenReport={(reportId) => setModal({ kind: 'report', reportId })} /> : null}
        {activeTab === 'coverage' ? <CoverageBoard world={world} teamId={team.id} model={model} onAdd={() => setModal({ kind: 'coverage-add' })} onEnd={(assignmentId) => setModal({ kind: 'coverage-end', assignmentId })} /> : null}
        {activeTab === 'opposition' ? <OppositionBoard onOpenPlayer={openPlayer} rows={model.opposition} /> : null}
      </ScrollRegion>
    </ApplicationWorkspace>
    {modal?.kind === 'request' ? <RequestScoutingModal world={world} teamId={team.id} playerId={modal.playerId} initialMission={modal.mission} onClose={() => setModal(null)} onSubmit={(input) => { const error = requestScoutingAssignment(input); if (error === null) setMessage('Scouting report requested. Assignment and Scout are shown in the Focus candidate list.'); return error }} /> : null}
    {modal?.kind === 'report' ? <ReportDetailModal world={world} reportId={modal.reportId} onClose={() => setModal(null)} /> : null}
    {modal?.kind === 'cancel' ? <ScoutingModalFrame title="Cancel scouting assignment?" onClose={() => setModal(null)} footer={<><button className="ng-btn ng-btn--ghost" onClick={() => setModal(null)} type="button">Keep assignment</button><button className="ng-btn ng-btn--danger" onClick={() => { const error = cancelAssignment(modal.assignment.id); setMessage(error ?? `${modal.assignment.playerName} assignment cancelled.`); setModal(null) }} type="button">Cancel assignment</button></>}><p>{modal.assignment.playerName} · {modal.assignment.missionLabel} · {modal.assignment.evaluatorName}</p><p>Cancellation preserves the assignment history and any completed report or knowledge.</p></ScoutingModalFrame> : null}
    {modal?.kind === 'coverage-add' ? <TerritoryModal world={world} model={model} teamId={team.id} onClose={() => setModal(null)} onCreate={(input) => createCoverage(input)} /> : null}
    {modal?.kind === 'coverage-end' ? <ScoutingModalFrame title="End territory coverage?" onClose={() => setModal(null)} footer={<><button className="ng-btn ng-btn--ghost" onClick={() => setModal(null)} type="button">Keep coverage</button><button className="ng-btn ng-btn--danger" onClick={() => { endCoverage(modal.assignmentId); setModal(null) }} type="button">End coverage</button></>}><p>Ending this operation stops future discovery but keeps the operation history, awareness and all Player knowledge.</p></ScoutingModalFrame> : null}
  </div>
}
