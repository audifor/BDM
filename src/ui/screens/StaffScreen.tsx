import { useEffect, useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
import type { ResponsibilityKind, ResponsibilityMode } from '@/domain/responsibility'
import type { DelegationOutcomeId } from '@/domain/responsibility'
import type { SetTeamResponsibilityInput } from '@/app/staffResponsibilities'
import type { StaffRecommendationCommandResult } from '@/app/staffRecommendations'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { createEntityRef } from '@/app/entityActions/EntityRef'
import { useEntityActions } from '@/ui/entityActions/useEntityActions'
import { AppFrame, AppHeader, DetailGroup, SplitWorkspace } from '@/ui/desktop/AppFramework'
import { BDMDataGrid } from '@/ui/dataGrid'
import type { DataGridColumn } from '@/ui/dataGrid'
import { EmptyState } from '@/ui/components/designSystem'

import {
  classifyWorkloadState,
  compactStaffSalary,
  findActiveStaffContractForStaff,
  getEligibleResponsibilityCandidates,
  getRecentStaffCareerHistory,
  getResponsibilitiesHeldPresentation,
  getStaffAge,
  getStaffReputationProfile,
  getStaffRoleEvaluations,
  getTeamResponsibilityPresentation,
  getTeamStaffPresentation,
  formatStaffCareerEntry,
  RESPONSIBILITY_DOMAIN_LABELS,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
  STAFF_CONTRACT_STATUS_LABELS,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  type StaffPresentationItem,
  type StaffResponsibilityPresentationItem,
} from '@/ui/staffPresentation'
import { getStaffRecommendationsForTeam, type StaffRecommendationPresentationItem } from '@/ui/staffRecommendationPresentation'
import {
  getStaffDynamicsForTeam,
  explainStaffHumanState,
  SATISFACTION_BAND_LABELS,
  INTENSITY_BAND_LABELS,
  type StaffDynamicsPresentationItem,
} from '@/ui/staffHumanStatePresentation'
import { explainStaffCultureFit } from '@/ui/staffCulturePresentation'
import {
  explainStaffUnitCohesion,
  getStaffUnitsForTeam,
  STAFF_UNIT_COHESION_BAND_LABELS,
  type StaffUnitPresentationItem,
} from '@/ui/staffUnitCohesionPresentation'
import { STAFF_UNIT_COHESION_DIMENSIONS } from '@/domain/staffUnitCohesion'
import { STAFF_HUMAN_STATE_DIMENSIONS } from '@/domain/staffHumanState'
import { getStaffConflictsForTeam, type StaffConflictPresentationItem } from '@/ui/staffConflictPresentation'
import { calculateStaffWorkload } from '@/domain/world'
import { STAFF_REPUTATION_DIMENSIONS } from '@/domain/staffReputation'

import './StaffScreen.css'

type StaffScreenTab = 'staff' | 'responsibilities' | 'advisory' | 'dynamics'

export function StaffScreen({ world, teamId, initialSelectedStaffId, onSetResponsibility, onAcceptRecommendation, onDismissRecommendation }: { readonly world: GameWorld; readonly teamId?: TeamId; readonly initialSelectedStaffId?: StaffPersonId; readonly onSetResponsibility?: (input: SetTeamResponsibilityInput) => void; readonly onAcceptRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult; readonly onDismissRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult }) {
  const team = teamId === undefined ? getUserTeam(world) : world.teams[teamId]
  const staff = team === undefined ? [] : getTeamStaffPresentation(world, team.id)
  const [tab, setTab] = useState<StaffScreenTab>('staff')
  const [selectedStaffId, setSelectedStaffId] = useState<StaffPersonId | undefined>(undefined)
  const selected = staff.find((item) => item.staffPersonId === (selectedStaffId ?? initialSelectedStaffId)) ?? staff[0]

  if (team === undefined) return <section className="content-panel">No team assigned to the user coach.</section>

  const columns: readonly DataGridColumn<StaffPresentationItem & { readonly id: StaffPersonId }>[] = [
    { id: 'name', label: 'STAFF', category: 'Identity', sortable: true, searchable: true, minWidth: 140, flex: 2, render: (item) => item.name, value: (item) => item.name, sortValue: (item) => item.name },
    { id: 'role', label: 'ROLE', category: 'Identity', sortable: true, searchable: true, width: 150, render: (item) => STAFF_ROLE_LABELS[item.role], value: (item) => STAFF_ROLE_LABELS[item.role] },
    { id: 'department', label: 'DEPARTMENT', category: 'Identity', sortable: true, searchable: true, width: 120, render: (item) => STAFF_DEPARTMENT_LABELS[item.department], value: (item) => STAFF_DEPARTMENT_LABELS[item.department] },
    { id: 'proficiency', label: 'PROFICIENCY', category: 'Evaluation', numeric: true, sortable: true, width: 92, render: (item) => item.roleProficiency, value: (item) => item.roleProficiency },
    { id: 'reputation', label: 'REPUTATION', category: 'Evaluation', numeric: true, sortable: true, width: 92, render: (item) => item.reputationScore ?? '—', value: (item) => item.reputationScore ?? -1 },
    { id: 'workload', label: 'WORKLOAD', category: 'Capacity', sortable: true, width: 100, render: (item) => <WorkloadBadge state={item.workloadState} utilization={item.utilization} />, value: (item) => item.utilization === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : item.utilization },
    { id: 'employment', label: 'EMPLOYMENT', category: 'Contract', sortable: true, width: 96, render: (item) => item.employmentStatus, value: (item) => item.employmentStatus },
    { id: 'contractStatus', label: 'CONTRACT STATUS', category: 'Contract', sortable: true, width: 108, render: (item) => STAFF_CONTRACT_STATUS_LABELS[item.contractStatus], value: (item) => STAFF_CONTRACT_STATUS_LABELS[item.contractStatus] },
    { id: 'salary', label: 'SALARY', category: 'Contract', numeric: true, sortable: true, width: 84, render: (item) => item.annualSalary === undefined ? '—' : compactStaffSalary(item.annualSalary), value: (item) => item.annualSalary ?? -1 },
    { id: 'expiry', label: 'CONTRACT EXPIRES', category: 'Contract', sortable: true, width: 96, render: (item) => item.contractExpiresOn ?? '—', value: (item) => item.contractExpiresOn ?? '' },
  ]

  const rows = staff.map((item) => ({ ...item, id: item.staffPersonId }))
  const openAdvisoryCount = getStaffRecommendationsForTeam(world, team.id).filter((item) => item.status === 'PENDING' || item.status === 'INFORMATIONAL').length
  const needsAttentionCount = getStaffDynamicsForTeam(world, team.id).filter((item) => item.needsAttention).length

  const toolbar = <div className="staff-screen-tabs">
    <button aria-pressed={tab === 'staff'} className={tab === 'staff' ? 'is-active' : undefined} onClick={() => setTab('staff')} type="button">STAFF</button>
    <button aria-pressed={tab === 'responsibilities'} className={tab === 'responsibilities' ? 'is-active' : undefined} onClick={() => setTab('responsibilities')} type="button">RESPONSIBILITIES</button>
    <button aria-pressed={tab === 'advisory'} className={tab === 'advisory' ? 'is-active' : undefined} onClick={() => setTab('advisory')} type="button">ADVISORY{openAdvisoryCount > 0 ? ` · ${openAdvisoryCount}` : ''}</button>
    <button aria-pressed={tab === 'dynamics'} className={tab === 'dynamics' ? 'is-active' : undefined} onClick={() => setTab('dynamics')} type="button">DYNAMICS{needsAttentionCount > 0 ? ` · ${needsAttentionCount}` : ''}</button>
  </div>

  return <AppFrame header={<AppHeader eyebrow="STAFF" meta={<span>{staff.length} STAFF</span>} title={team.name} />} toolbar={toolbar}>
    {tab === 'responsibilities'
      ? <ResponsibilitiesTab onSetResponsibility={onSetResponsibility} teamId={team.id} world={world} />
      : tab === 'advisory'
        ? <AdvisoryTab onAcceptRecommendation={onAcceptRecommendation} onDismissRecommendation={onDismissRecommendation} teamId={team.id} world={world} />
        : tab === 'dynamics'
          ? <DynamicsTab teamId={team.id} world={world} />
          : staff.length === 0
            ? <EmptyState description="No staff assigned to this team." title="No staff" />
            : <SplitWorkspace inspector={selected !== undefined && <StaffDetail staffPersonId={selected.staffPersonId} world={world} />}>
              <BDMDataGrid
                columns={columns}
                emptyDescription="Change the current filters to see more staff."
                emptyTitle="No staff"
                entityForRow={(row) => createEntityRef('staff', row.staffPersonId)}
                gridId="staff-core"
                onRowClick={(row) => setSelectedStaffId(row.staffPersonId)}
                rows={rows}
                selectedId={selected?.staffPersonId}
              />
            </SplitWorkspace>}
  </AppFrame>
}

function WorkloadBadge({ state, utilization }: { readonly state: StaffPresentationItem['workloadState']; readonly utilization: number }) {
  const percent = Number.isFinite(utilization) ? `${Math.round(utilization * 100)}%` : '∞'
  return <span className={`staff-workload-badge staff-workload-badge--${state}`}>{WORKLOAD_STATE_LABELS[state]} · {percent}</span>
}

function StaffDetail({ world, staffPersonId }: { readonly world: GameWorld; readonly staffPersonId: StaffPersonId }) {
  const person = getStaffPerson(world, staffPersonId)
  const assignment = getStaffAssignment(world, staffPersonId)
  const target = useEntityActions(createEntityRef('staff', staffPersonId), { world, controlledTeamId: getUserTeam(world)?.id })
  if (person === undefined || assignment === undefined) return null

  const roleDefinition = staffRoleDefinition(assignment.role)
  const evaluations = getStaffRoleEvaluations(world, staffPersonId)
  const workload = calculateStaffWorkload(world, staffPersonId)
  const contract = findActiveStaffContractForStaff(world, staffPersonId)
  const reputation = getStaffReputationProfile(world, staffPersonId)
  const careerHistory = getRecentStaffCareerHistory(world, staffPersonId)
  const age = getStaffAge(world, staffPersonId)

  return <section className="staff-detail" {...target}>
    <div className="staff-detail__identity">
      <p className="eyebrow">STAFF PERSON</p>
      <h2>{person.identity.firstName} {person.identity.lastName}</h2>
      <dl className="staff-detail__summary">
        <div><dt>ROLE</dt><dd>{STAFF_ROLE_LABELS[assignment.role]}</dd></div>
        <div><dt>DEPARTMENT</dt><dd>{STAFF_DEPARTMENT_LABELS[roleDefinition.department]}</dd></div>
        <div><dt>SENIORITY</dt><dd>{roleDefinition.seniority.toUpperCase()}</dd></div>
        {age !== undefined && <div><dt>AGE</dt><dd>{age}</dd></div>}
        {person.identity.nationality !== undefined && <div><dt>NATIONALITY</dt><dd>{person.identity.nationality}</dd></div>}
      </dl>
    </div>

    <DetailGroup title="ROLE EVALUATION">
      <p className="staff-explanation">Professional proficiency based on current attributes.</p>
      <dl className="staff-evaluations">{evaluations.map((item) => <div className={item.role === assignment.role ? 'current-role' : undefined} key={item.role}><dt>{STAFF_ROLE_LABELS[item.role]}</dt><dd>{item.proficiency}</dd></div>)}</dl>
    </DetailGroup>

    <DetailGroup title="WORKLOAD">
      <dl className="staff-workload">
        <div><dt>UTILIZATION</dt><dd>{Number.isFinite(workload.utilization) ? `${Math.round(workload.utilization * 100)}%` : '∞'}</dd></div>
        <div><dt>CAPACITY USED</dt><dd>{workload.totalCapacityUsed} / {workload.capacityLimit || '—'}</dd></div>
        <div><dt>STATE</dt><dd className={`staff-workload-state staff-workload-state--${classifyWorkloadState(workload)}`}>{WORKLOAD_STATE_LABELS[classifyWorkloadState(workload)]}</dd></div>
      </dl>
    </DetailGroup>

    <DetailGroup title="EMPLOYMENT & CONTRACT">
      <dl className="staff-contract">
        <div><dt>STATUS</dt><dd>{world.staffEmploymentByStaffId[staffPersonId]?.status.toUpperCase() ?? 'UNKNOWN'}</dd></div>
        {contract === undefined
          ? <div><dt>CONTRACT</dt><dd>No active contract</dd></div>
          : <>
            <div><dt>SALARY</dt><dd>{compactStaffSalary(contract.compensation.annualSalary)}</dd></div>
            <div><dt>TERM</dt><dd>{contract.term.startsOn} → {contract.term.expiresOn}</dd></div>
            {contract.termination !== undefined && <div><dt>TERMINATION</dt><dd>{contract.termination.effectiveOn} · {contract.termination.reason}</dd></div>}
          </>}
      </dl>
    </DetailGroup>

    <DetailGroup title="REPUTATION">
      {reputation === undefined
        ? <p className="staff-explanation">No reputation profile yet.</p>
        : <dl className="staff-reputation">{STAFF_REPUTATION_DIMENSIONS.map((dimension) => <div key={dimension}><dt>{dimension.toUpperCase()}</dt><dd>{reputation.values[dimension]}</dd></div>)}</dl>}
    </DetailGroup>

    <DetailGroup title="CAREER HISTORY">
      {careerHistory.length === 0
        ? <p className="staff-explanation">No recorded career history.</p>
        : <ul className="staff-career-history">{careerHistory.map((entry, index) => <li key={`${entry.date}-${entry.kind}-${index}`}>{formatStaffCareerEntry(entry)}</li>)}</ul>}
    </DetailGroup>

    <DetailGroup title="RESPONSIBILITIES HELD">
      <ResponsibilitiesHeld staffPersonId={staffPersonId} world={world} />
    </DetailGroup>

    <DetailGroup title="PROFESSIONAL ATTRIBUTES">
      <dl className="staff-attributes">{STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => <div key={key}><dt>{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key]}</dt><dd>{person.professional.attributes[key]}</dd></div>)}</dl>
    </DetailGroup>
  </section>
}

/** Compact, read-only: rows where `responsibility.holderStaffId === staffPersonId`. Editing happens only in the RESPONSIBILITIES tab. */
function ResponsibilitiesHeld({ world, staffPersonId }: { readonly world: GameWorld; readonly staffPersonId: StaffPersonId }) {
  const held = getResponsibilitiesHeldPresentation(world, staffPersonId)
  if (held.length === 0) return <p className="staff-explanation">No responsibilities assigned.</p>
  return <dl className="staff-responsibilities-held">
    {held.map((item) => <div key={item.id}>
      <dt>{RESPONSIBILITY_KIND_LABELS[item.kind]}</dt>
      <dd>{RESPONSIBILITY_MODE_LABELS[item.mode]} · {item.capacityCost}</dd>
    </div>)}
  </dl>
}

function ResponsibilitiesTab({ world, teamId, onSetResponsibility }: { readonly world: GameWorld; readonly teamId: TeamId; readonly onSetResponsibility?: (input: SetTeamResponsibilityInput) => void }) {
  const rows = getTeamResponsibilityPresentation(world, teamId)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]

  const columns: readonly DataGridColumn<StaffResponsibilityPresentationItem & { readonly id: string }>[] = [
    { id: 'responsibility', label: 'RESPONSIBILITY', category: 'Identity', sortable: true, searchable: true, minWidth: 170, flex: 2, render: (item) => RESPONSIBILITY_KIND_LABELS[item.kind], value: (item) => RESPONSIBILITY_KIND_LABELS[item.kind] },
    { id: 'domain', label: 'DOMAIN', category: 'Identity', sortable: true, searchable: true, width: 100, render: (item) => RESPONSIBILITY_DOMAIN_LABELS[item.domain], value: (item) => RESPONSIBILITY_DOMAIN_LABELS[item.domain] },
    { id: 'control', label: 'CONTROL', category: 'Delegation', sortable: true, width: 120, render: (item) => RESPONSIBILITY_MODE_LABELS[item.mode], value: (item) => RESPONSIBILITY_MODE_LABELS[item.mode] },
    { id: 'holder', label: 'HOLDER', category: 'Delegation', sortable: true, searchable: true, width: 140, render: (item) => item.holderLabel, value: (item) => item.holderLabel },
    { id: 'role', label: 'ROLE', category: 'Delegation', sortable: true, width: 130, render: (item) => item.holderRole === undefined ? '—' : STAFF_ROLE_LABELS[item.holderRole], value: (item) => item.holderRole === undefined ? '' : STAFF_ROLE_LABELS[item.holderRole] },
    { id: 'load', label: 'LOAD', category: 'Capacity', numeric: true, sortable: true, width: 72, render: (item) => item.capacityCost, value: (item) => item.capacityCost },
    { id: 'utilization', label: 'UTILIZATION', category: 'Capacity', sortable: true, width: 110, render: (item) => item.holderUtilization === undefined ? '—' : <WorkloadBadge state={item.holderWorkloadState ?? 'unassigned'} utilization={item.holderUtilization} />, value: (item) => item.holderUtilization ?? -1 },
  ]

  const gridRows = rows.map((item) => ({ ...item, id: item.id }))

  return <SplitWorkspace inspector={selected !== undefined && <ResponsibilityInspector onApply={onSetResponsibility} responsibility={selected} teamId={teamId} world={world} />}>
    <BDMDataGrid
      columns={columns}
      emptyDescription="No responsibilities configured."
      emptyTitle="No responsibilities"
      gridId="staff-responsibilities"
      onRowClick={(row) => setSelectedId(row.id)}
      rows={gridRows}
      selectedId={selected?.id}
    />
  </SplitWorkspace>
}

function ResponsibilityInspector({ world, teamId, responsibility, onApply }: { readonly world: GameWorld; readonly teamId: TeamId; readonly responsibility: StaffResponsibilityPresentationItem; readonly onApply?: (input: SetTeamResponsibilityInput) => void }) {
  const [draftMode, setDraftMode] = useState<ResponsibilityMode>(responsibility.mode)
  const [draftHolderId, setDraftHolderId] = useState<StaffPersonId | undefined>(responsibility.holderStaffId)

  // Reset the draft whenever the selected Responsibility or its canonical world state changes, so a
  // stale draft can never be applied onto a different Responsibility.
  useEffect(() => {
    setDraftMode(responsibility.mode)
    setDraftHolderId(responsibility.holderStaffId)
  }, [responsibility.id, responsibility.mode, responsibility.holderStaffId])

  const readOnly = onApply === undefined || responsibility.eligibleParticipant === 'coach'
  const needsHolder = draftMode === 'delegated' || draftMode === 'advisory'
  const candidates = needsHolder ? getEligibleResponsibilityCandidates(world, teamId, responsibility.kind, draftMode) : []
  const selectedCandidate = candidates.find((candidate) => candidate.staffPersonId === draftHolderId)

  const hasChange = draftMode !== responsibility.mode || (needsHolder ? draftHolderId !== responsibility.holderStaffId : false)
  const canApply = !readOnly && hasChange && (!needsHolder || selectedCandidate !== undefined)

  const apply = () => {
    if (!canApply || onApply === undefined) return
    onApply({ teamId, kind: responsibility.kind, mode: draftMode, ...(needsHolder && draftHolderId !== undefined ? { holderStaffId: draftHolderId } : {}) })
  }

  return <section className="staff-responsibility-inspector">
    <p className="eyebrow">RESPONSIBILITY</p>
    <h2>{RESPONSIBILITY_KIND_LABELS[responsibility.kind]}</h2>
    <dl className="staff-responsibility-summary">
      <div><dt>DOMAIN</dt><dd>{RESPONSIBILITY_DOMAIN_LABELS[responsibility.domain]}</dd></div>
      <div><dt>CAPACITY COST</dt><dd>{responsibility.capacityCost}</dd></div>
      <div><dt>CURRENT CONTROL</dt><dd>{RESPONSIBILITY_MODE_LABELS[responsibility.mode]}</dd></div>
      <div><dt>CURRENT HOLDER</dt><dd>{responsibility.holderLabel}</dd></div>
    </dl>

    <DetailGroup title="CONTROL MODE">
      {responsibility.eligibleParticipant === 'coach'
        ? <p className="staff-explanation">Head Coach-only. Only {RESPONSIBILITY_MODE_LABELS[responsibility.mode]} is available for this responsibility.</p>
        : <div className="staff-mode-group" role="group">
          {responsibility.supportedModes.map((mode) => <button
            aria-pressed={draftMode === mode}
            className={draftMode === mode ? 'is-active' : undefined}
            disabled={readOnly}
            key={mode}
            onClick={() => setDraftMode(mode)}
            type="button"
          >{RESPONSIBILITY_MODE_LABELS[mode]}</button>)}
        </div>}
    </DetailGroup>

    {needsHolder && <DetailGroup title="STAFF SELECTOR">
      {candidates.length === 0
        ? <p className="staff-explanation">NO ELIGIBLE STAFF</p>
        : <>
          <select disabled={readOnly} onChange={(event) => setDraftHolderId((event.target.value || undefined) as StaffPersonId | undefined)} value={draftHolderId ?? ''}>
            <option value="">Select staff…</option>
            {candidates.map((candidate) => <option key={candidate.staffPersonId} value={candidate.staffPersonId}>
              {candidate.name} · {STAFF_ROLE_LABELS[candidate.role]} · PROF {candidate.proficiency} · {formatPercent(candidate.currentUtilization)} → {formatPercent(candidate.projectedUtilization)}
            </option>)}
          </select>
          {selectedCandidate !== undefined && <dl className="staff-candidate-summary">
            <div><dt>ROLE</dt><dd>{STAFF_ROLE_LABELS[selectedCandidate.role]}</dd></div>
            <div><dt>PROFICIENCY</dt><dd>{selectedCandidate.proficiency}</dd></div>
            <div><dt>CURRENT WORKLOAD</dt><dd>{formatPercent(selectedCandidate.currentUtilization)}</dd></div>
            <div><dt>PROJECTED WORKLOAD</dt><dd>{formatPercent(selectedCandidate.projectedUtilization)}</dd></div>
            <div><dt>PROJECTED STATE</dt><dd className={`staff-workload-state staff-workload-state--${selectedCandidate.projectedWorkloadState}`}>{WORKLOAD_STATE_LABELS[selectedCandidate.projectedWorkloadState]}</dd></div>
          </dl>}
        </>}
    </DetailGroup>}

    {!readOnly && <button className="primary-button staff-responsibility-apply" disabled={!canApply} onClick={apply} type="button">APPLY</button>}
  </section>
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '∞'
}

type AdvisoryFilter = 'open' | 'history'

/** Failure reasons from `StaffRecommendationCommandResult` mapped to compact, non-technical inspector copy (Wave 4C3 §34). */
const RECOMMENDATION_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  notFound: 'Recommendation no longer exists.',
  alreadyResolved: 'Recommendation already resolved.',
  notAcceptable: 'This recommendation is informational only.',
  underlyingRejected: 'Recommendation is no longer valid.',
}

function AdvisoryTab({ world, teamId, onAcceptRecommendation, onDismissRecommendation }: { readonly world: GameWorld; readonly teamId: TeamId; readonly onAcceptRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult; readonly onDismissRecommendation?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult }) {
  const items = getStaffRecommendationsForTeam(world, teamId)
  const [filter, setFilter] = useState<AdvisoryFilter>('open')
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [failureMessage, setFailureMessage] = useState<string | undefined>(undefined)

  const filtered = items.filter((item) => filter === 'open' ? item.status === 'PENDING' || item.status === 'INFORMATIONAL' : item.status === 'ACCEPTED' || item.status === 'DISMISSED')
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0]

  const columns: readonly DataGridColumn<StaffRecommendationPresentationItem & { readonly id: string }>[] = [
    { id: 'date', label: 'DATE', category: 'Identity', sortable: true, width: 92, render: (item) => item.decidedOn, value: (item) => item.decidedOn },
    { id: 'domain', label: 'DOMAIN', category: 'Identity', sortable: true, searchable: true, width: 100, render: (item) => RESPONSIBILITY_DOMAIN_LABELS[item.domain], value: (item) => RESPONSIBILITY_DOMAIN_LABELS[item.domain] },
    { id: 'recommendation', label: 'RECOMMENDATION', category: 'Identity', sortable: true, searchable: true, minWidth: 200, flex: 2, render: (item) => item.summary, value: (item) => item.summary },
    { id: 'from', label: 'FROM', category: 'Identity', sortable: true, searchable: true, width: 130, render: (item) => item.staffName, value: (item) => item.staffName },
    { id: 'quality', label: 'QUALITY', category: 'Evaluation', numeric: true, sortable: true, width: 80, render: (item) => item.qualityScore, value: (item) => item.qualityScore },
    { id: 'status', label: 'STATUS', category: 'Status', sortable: true, width: 100, render: (item) => item.status, value: (item) => item.status },
  ]

  const gridRows = filtered.map((item) => ({ ...item, id: item.id }))

  return <SplitWorkspace inspector={selected !== undefined && <AdvisoryInspector item={selected} key={selected.id} onAccept={onAcceptRecommendation} onDismiss={onDismissRecommendation} onFailure={setFailureMessage} />}>
    <div className="staff-advisory-toolbar">
      <div className="staff-mode-group" role="group">
        <button aria-pressed={filter === 'open'} className={filter === 'open' ? 'is-active' : undefined} onClick={() => { setFilter('open'); setFailureMessage(undefined) }} type="button">OPEN</button>
        <button aria-pressed={filter === 'history'} className={filter === 'history' ? 'is-active' : undefined} onClick={() => { setFilter('history'); setFailureMessage(undefined) }} type="button">HISTORY</button>
      </div>
    </div>
    <BDMDataGrid
      columns={columns}
      emptyDescription={filter === 'open' ? 'No open recommendations.' : 'No resolved recommendations yet.'}
      emptyTitle="No recommendations"
      gridId="staff-advisory"
      onRowClick={(row) => { setSelectedId(row.id); setFailureMessage(undefined) }}
      rows={gridRows}
      selectedId={selected?.id}
    />
  </SplitWorkspace>
}

function AdvisoryInspector({ item, onAccept, onDismiss, onFailure }: { readonly item: StaffRecommendationPresentationItem; readonly onAccept?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult; readonly onDismiss?: (outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult; readonly onFailure: (message: string | undefined) => void }) {
  const [localFailure, setLocalFailure] = useState<string | undefined>(undefined)
  const readOnly = onAccept === undefined && onDismiss === undefined

  const runCommand = (command: ((outcomeId: DelegationOutcomeId) => StaffRecommendationCommandResult) | undefined) => {
    if (command === undefined) return
    const result = command(item.outcomeId)
    if (!result.ok) {
      const message = RECOMMENDATION_FAILURE_MESSAGES[result.reason] ?? 'Recommendation is no longer valid.'
      setLocalFailure(message)
      onFailure(message)
    } else {
      setLocalFailure(undefined)
      onFailure(undefined)
    }
  }

  return <section className="staff-recommendation-inspector">
    <p className="eyebrow">RECOMMENDATION</p>
    <h2>{item.title}</h2>
    <dl className="staff-recommendation-summary">
      <div><dt>DOMAIN</dt><dd>{RESPONSIBILITY_DOMAIN_LABELS[item.domain]}</dd></div>
      <div><dt>STATUS</dt><dd>{item.status}</dd></div>
      <div><dt>DATE</dt><dd>{item.decidedOn}</dd></div>
      <div><dt>FROM</dt><dd>{item.staffName}</dd></div>
      {item.staffRole !== undefined && <div><dt>ROLE</dt><dd>{STAFF_ROLE_LABELS[item.staffRole]}</dd></div>}
      <div><dt>QUALITY</dt><dd>{item.qualityScore}</dd></div>
    </dl>

    <DetailGroup title="DETAILS">
      <p className="staff-explanation">{item.summary}</p>
      <dl className="staff-recommendation-detail">
        {item.detailRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
      </dl>
    </DetailGroup>

    {!readOnly && localFailure !== undefined && <p className="staff-recommendation-failure">{localFailure}</p>}

    {!readOnly && item.status === 'PENDING' && item.actionability === 'ACCEPTABLE' && <div className="staff-recommendation-actions">
      <button className="primary-button" onClick={() => runCommand(onAccept)} type="button">ACCEPT</button>
      <button onClick={() => runCommand(onDismiss)} type="button">DISMISS</button>
    </div>}

    {!readOnly && item.status === 'INFORMATIONAL' && <div className="staff-recommendation-actions">
      <button onClick={() => runCommand(onDismiss)} type="button">DISMISS</button>
    </div>}
  </section>
}

// ---------------------------------------------------------------------------
// DYNAMICS tab (Wave 5A — Human State & Reaction System)
// ---------------------------------------------------------------------------

type DynamicsFilter = 'ALL' | 'NEEDS_ATTENTION' | 'FRUSTRATED' | 'OVERLOADED' | 'UNDERUTILIZED' | 'LOW_INFLUENCE' | 'LOW_COMMITMENT' | 'CONTRACT_CONCERNS' | 'DEVELOPMENT_CONCERNS' | 'THRIVING'

const DYNAMICS_FILTER_LABELS: Readonly<Record<DynamicsFilter, string>> = {
  ALL: 'ALL',
  NEEDS_ATTENTION: 'NEEDS ATTENTION',
  FRUSTRATED: 'FRUSTRATED',
  OVERLOADED: 'OVERLOADED',
  UNDERUTILIZED: 'UNDERUTILIZED',
  LOW_INFLUENCE: 'LOW INFLUENCE',
  LOW_COMMITMENT: 'LOW COMMITMENT',
  CONTRACT_CONCERNS: 'CONTRACT CONCERNS',
  DEVELOPMENT_CONCERNS: 'DEVELOPMENT CONCERNS',
  THRIVING: 'THRIVING',
}

const DYNAMICS_FILTERS: readonly DynamicsFilter[] = ['ALL', 'NEEDS_ATTENTION', 'FRUSTRATED', 'OVERLOADED', 'UNDERUTILIZED', 'LOW_INFLUENCE', 'LOW_COMMITMENT', 'CONTRACT_CONCERNS', 'DEVELOPMENT_CONCERNS', 'THRIVING']

/** Filters are driven entirely by the presentation item's already-derived `signalKinds`/`interpretedState`/`needsAttention` — never a second magic-number threshold duplicated in the UI. */
function matchesDynamicsFilter(item: StaffDynamicsPresentationItem, filter: DynamicsFilter): boolean {
  switch (filter) {
    case 'ALL': return true
    case 'NEEDS_ATTENTION': return item.needsAttention
    case 'FRUSTRATED': return item.interpretedState === 'FRUSTRATED'
    case 'OVERLOADED': return item.signalKinds.includes('sustainedOverload') || item.signalKinds.includes('responsibilityOverextension')
    case 'UNDERUTILIZED': return item.signalKinds.includes('sustainedUnderutilization')
    case 'LOW_INFLUENCE': return item.signalKinds.includes('influenceDeficit')
    case 'LOW_COMMITMENT': return item.signalKinds.includes('lowOrganizationalCommitment')
    case 'CONTRACT_CONCERNS': return item.signalKinds.includes('contractMismatch') || item.signalKinds.includes('jobSecurityConcern')
    case 'DEVELOPMENT_CONCERNS': return item.signalKinds.includes('developmentStagnation')
    case 'THRIVING': return item.interpretedState === 'THRIVING'
    default: return true
  }
}

const DYNAMICS_STATE_LABELS: Readonly<Record<StaffDynamicsPresentationItem['interpretedState'], string>> = {
  THRIVING: 'THRIVING', CONTENT: 'CONTENT', SETTLED: 'SETTLED', MIXED: 'MIXED',
  CONCERNED: 'CONCERNED', FRUSTRATED: 'FRUSTRATED', STRAINED: 'STRAINED', DISENGAGED: 'DISENGAGED',
}
const DYNAMICS_TREND_LABELS: Readonly<Record<StaffDynamicsPresentationItem['trend'], string>> = {
  IMPROVING: '↑ IMPROVING', STABLE: '→ STABLE', WORSENING: '↓ WORSENING',
}
const WORKING_RELATIONSHIP_STATE_LABELS: Readonly<Record<string, string>> = {
  EXCELLENT: 'EXCELLENT', STRONG: 'STRONG', GOOD: 'GOOD', PROFESSIONAL: 'PROFESSIONAL', MIXED: 'MIXED', STRAINED: 'STRAINED', POOR: 'POOR',
}
const TREND_ARROW: Readonly<Record<'IMPROVING' | 'STABLE' | 'WORSENING', string>> = { IMPROVING: '↑', STABLE: '→', WORSENING: '↓' }

/** Compact per-dimension column abbreviations, in canonical `STAFF_HUMAN_STATE_DIMENSIONS` order. */
const DIMENSION_COLUMN_LABEL: Readonly<Record<typeof STAFF_HUMAN_STATE_DIMENSIONS[number], string>> = {
  roleSatisfaction: 'ROLE',
  responsibilitySatisfaction: 'RESP',
  autonomySatisfaction: 'AUT',
  influenceSatisfaction: 'INF',
  contractSatisfaction: 'CTR',
  workloadSatisfaction: 'WORK',
  professionalFulfillment: 'FUL',
  recognitionSatisfaction: 'REC',
  frustration: 'FRU',
  stress: 'STR',
  organizationalCommitment: 'COM',
}

function bandLabel(value: string): string {
  return (SATISFACTION_BAND_LABELS as Record<string, string>)[value] ?? (INTENSITY_BAND_LABELS as Record<string, string>)[value] ?? value
}

type DynamicsSubview = 'PEOPLE' | 'UNITS' | 'CONFLICTS'

/** Wave 5C — the DYNAMICS tab hosts two subviews. PEOPLE (per-Staff Human State) stays the default. */
function DynamicsTab({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const [subview, setSubview] = useState<DynamicsSubview>('PEOPLE')

  const toggle = <div className="staff-dynamics-subview">
    <div className="staff-mode-group" role="group">
      <button aria-pressed={subview === 'PEOPLE'} className={subview === 'PEOPLE' ? 'is-active' : undefined} onClick={() => setSubview('PEOPLE')} type="button">PEOPLE</button>
      <button aria-pressed={subview === 'UNITS'} className={subview === 'UNITS' ? 'is-active' : undefined} onClick={() => setSubview('UNITS')} type="button">UNITS</button>
      <button aria-pressed={subview === 'CONFLICTS'} className={subview === 'CONFLICTS' ? 'is-active' : undefined} onClick={() => setSubview('CONFLICTS')} type="button">CONFLICTS</button>
    </div>
  </div>

  return <>
    {toggle}
    {subview === 'UNITS' ? <UnitsSubview teamId={teamId} world={world} /> : subview === 'CONFLICTS' ? <ConflictsSubview teamId={teamId} world={world} /> : <PeopleSubview teamId={teamId} world={world} />}
  </>
}

function ConflictsSubview({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const [history, setHistory] = useState(false)
  const items = getStaffConflictsForTeam(world, teamId).filter((item) => history ? item.status === 'RESOLVED' : item.status === 'ACTIVE')
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const columns: readonly DataGridColumn<StaffConflictPresentationItem>[] = [
    { id: 'parties', label: 'PARTIES', category: 'Conflict', sortable: true, searchable: true, minWidth: 180, flex: 2, render: (item) => item.parties, value: (item) => item.parties },
    { id: 'type', label: 'TYPE', category: 'Conflict', sortable: true, width: 140, render: (item) => item.type, value: (item) => item.type },
    { id: 'stage', label: 'STAGE', category: 'State', sortable: true, width: 110, render: (item) => item.stage, value: (item) => item.stage },
    { id: 'severity', label: 'SEVERITY', category: 'State', sortable: true, width: 100, render: (item) => item.severity, value: (item) => item.severity },
    { id: 'trend', label: 'TREND', category: 'State', sortable: true, width: 105, render: (item) => item.trend, value: (item) => item.trend },
  ]
  return <SplitWorkspace inspector={selected !== undefined && <section className="staff-recommendation-inspector"><p className="eyebrow">CONFLICT</p><h2>{selected.parties}</h2><dl className="staff-recommendation-summary"><div><dt>PRIMARY CAUSE</dt><dd>{selected.primaryCause}</dd></div><div><dt>STATE</dt><dd>{selected.severity} · {selected.stage}</dd></div></dl><DetailGroup title="DRIVERS">{selected.drivers.map((driver) => <p key={driver} className="staff-explanation">{driver}</p>)}</DetailGroup></section>}>
    <div className="staff-advisory-toolbar"><div className="staff-mode-group" role="group"><button aria-pressed={!history} className={!history ? 'is-active' : undefined} onClick={() => setHistory(false)} type="button">OPEN</button><button aria-pressed={history} className={history ? 'is-active' : undefined} onClick={() => setHistory(true)} type="button">HISTORY</button></div></div>
    <BDMDataGrid columns={columns} emptyDescription="No staff conflicts in this scope." emptyTitle="No conflicts" onRowClick={(item) => setSelectedId(item.id)} rows={items} selectedId={selected?.id} />
  </SplitWorkspace>
}

function PeopleSubview({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const items = getStaffDynamicsForTeam(world, teamId)
  const [filter, setFilter] = useState<DynamicsFilter>('ALL')
  const [selectedId, setSelectedId] = useState<StaffPersonId | undefined>(undefined)

  const filtered = items.filter((item) => matchesDynamicsFilter(item, filter))
  const selected = filtered.find((item) => item.staffId === selectedId) ?? filtered[0]

  const needAttention = items.filter((item) => item.needsAttention).length
  const highStress = items.filter((item) => item.bands.stress === 'HIGH' || item.bands.stress === 'VERY_HIGH' || item.bands.stress === 'EXTREME').length
  const lowCommitment = items.filter((item) => item.signalKinds.includes('lowOrganizationalCommitment')).length
  const thriving = items.filter((item) => item.interpretedState === 'THRIVING').length

  const columns: readonly DataGridColumn<StaffDynamicsPresentationItem & { readonly id: StaffPersonId }>[] = [
    { id: 'staff', label: 'STAFF', category: 'Identity', sortable: true, searchable: true, minWidth: 140, flex: 2, render: (item) => item.staffName, value: (item) => item.staffName },
    { id: 'role', label: 'ROLE', category: 'Identity', sortable: true, searchable: true, width: 130, render: (item) => item.role ?? '—', value: (item) => item.role ?? '' },
    { id: 'state', label: 'STATE', category: 'State', sortable: true, width: 110, render: (item) => DYNAMICS_STATE_LABELS[item.interpretedState], value: (item) => DYNAMICS_STATE_LABELS[item.interpretedState] },
    ...STAFF_HUMAN_STATE_DIMENSIONS.map((dimension): DataGridColumn<StaffDynamicsPresentationItem & { readonly id: StaffPersonId }> => ({
      id: dimension, label: DIMENSION_COLUMN_LABEL[dimension], category: 'Conditions', sortable: true, width: 64,
      render: (item) => bandLabel(item.bands[dimension]), value: (item) => bandLabel(item.bands[dimension]),
    })),
    { id: 'issues', label: 'ISSUES', category: 'Signals', width: 60, render: (item) => item.signalKinds.length > 0 ? String(item.signalKinds.length) : '—', value: (item) => item.signalKinds.length },
  ]

  const gridRows = filtered.map((item) => ({ ...item, id: item.staffId }))

  return <SplitWorkspace inspector={selected !== undefined && <DynamicsInspector staffId={selected.staffId} world={world} />}>
    <div className="staff-dynamics-summary">
      <span>{items.length} STAFF</span>
      <span>{needAttention} NEED ATTENTION</span>
      <span>{highStress} HIGH STRESS</span>
      <span>{lowCommitment} LOW COMMITMENT</span>
      <span>{thriving} THRIVING</span>
    </div>
    <div className="staff-advisory-toolbar">
      <div className="staff-mode-group" role="group">
        {DYNAMICS_FILTERS.map((option) => <button
          aria-pressed={filter === option}
          className={filter === option ? 'is-active' : undefined}
          key={option}
          onClick={() => setFilter(option)}
          type="button"
        >{DYNAMICS_FILTER_LABELS[option]}</button>)}
      </div>
    </div>
    <BDMDataGrid
      columns={columns}
      emptyDescription="No Staff match this filter."
      emptyTitle="No Staff"
      gridId="staff-dynamics"
      onRowClick={(row) => setSelectedId(row.staffId)}
      rows={gridRows}
      selectedId={selected?.staffId}
    />
  </SplitWorkspace>
}

function DynamicsInspector({ world, staffId }: { readonly world: GameWorld; readonly staffId: StaffPersonId }) {
  const explanation = explainStaffHumanState(world, staffId)
  const person = getStaffPerson(world, staffId)
  if (explanation === undefined || person === undefined) return <section className="staff-recommendation-inspector"><p className="staff-explanation">No Dynamics data yet.</p></section>

  return <section className="staff-recommendation-inspector">
    <p className="eyebrow">PROFESSIONAL STATE</p>
    <h2>{person.identity.firstName} {person.identity.lastName}</h2>
    <dl className="staff-recommendation-summary">
      <div><dt>STATE</dt><dd>{DYNAMICS_STATE_LABELS[explanation.currentState]}</dd></div>
      <div><dt>TREND</dt><dd>{DYNAMICS_TREND_LABELS[explanation.trend]}</dd></div>
    </dl>

    {explanation.positives.length > 0 && <DetailGroup title="KEY POSITIVES">
      <ul className="staff-career-history">{explanation.positives.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </DetailGroup>}

    {explanation.concerns.length > 0 && <DetailGroup title="KEY CONCERNS">
      <ul className="staff-career-history">{explanation.concerns.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </DetailGroup>}

    {explanation.expectationGaps.length > 0 && <DetailGroup title="EXPECTATION GAPS">
      <dl className="staff-recommendation-detail">{explanation.expectationGaps.map((gap) => <div key={gap.dimension}><dt>{gap.label}</dt><dd>{gap.band.replace(/_/g, ' ')}</dd></div>)}</dl>
    </DetailGroup>}

    {explanation.recentDevelopments.length > 0 && <DetailGroup title="RECENT DEVELOPMENTS">
      <ul className="staff-career-history">{explanation.recentDevelopments.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </DetailGroup>}

    {explanation.memories.length > 0 && <DetailGroup title="SIGNIFICANT PROFESSIONAL MEMORIES">
      <ul className="staff-career-history">{explanation.memories.map((memory) => <li key={memory.id}>{memory.summary} ({memory.occurredOn})</li>)}</ul>
    </DetailGroup>}

    <CultureFitGroup staffId={staffId} world={world} />

    {explanation.relationships.length > 0 && <DetailGroup title="WORKING RELATIONSHIPS">
      <ul className="staff-working-relationships">
        {explanation.relationships.map((relationship) => <li key={relationship.personId}>
          <span className="staff-working-relationship__person">{relationship.personLabel}{relationship.personRole !== undefined ? ` · ${relationship.personRole}` : ''}</span>
          <span className="staff-working-relationship__state">{WORKING_RELATIONSHIP_STATE_LABELS[relationship.state] ?? relationship.state}</span>
          <span className="staff-working-relationship__trend">{TREND_ARROW[relationship.trend]}</span>
        </li>)}
      </ul>
    </DetailGroup>}

    {explanation.positives.length === 0 && explanation.concerns.length === 0 && explanation.expectationGaps.length === 0 && explanation.recentDevelopments.length === 0
      && <p className="staff-explanation">Nothing notable to report — a settled, unremarkable professional state.</p>}
  </section>
}

// ---------------------------------------------------------------------------
// Wave 5C — Culture Fit + UNITS subview (qualitative bands only, never raw values)
// ---------------------------------------------------------------------------

function CultureFitGroup({ world, staffId }: { readonly world: GameWorld; readonly staffId: StaffPersonId }) {
  const fit = explainStaffCultureFit(world, staffId)
  return <DetailGroup title="CULTURE FIT">
    <dl className="staff-recommendation-summary">
      <div><dt>FIT</dt><dd>{fit.label}</dd></div>
    </dl>
    {!fit.established && <p className="staff-explanation">Organizational culture has not settled yet.</p>}
    {fit.causes.length > 0 && <ul className="staff-career-history">{fit.causes.map((cause, index) => <li key={index}>{cause}</li>)}</ul>}
    {fit.established && fit.causes.length === 0 && fit.frictionWith.length === 0 && fit.alignedWith.length > 0
      && <p className="staff-explanation">Aligned on: {fit.alignedWith.slice(0, 4).join(', ')}.</p>}
  </DetailGroup>
}

/** Compact per-dimension column abbreviations for the UNITS grid, in canonical order. */
const UNIT_COHESION_COLUMN_LABEL: Readonly<Record<typeof STAFF_UNIT_COHESION_DIMENSIONS[number], string>> = {
  communication: 'COMMS',
  coordination: 'COORD',
  roleClarity: 'ROLE CLARITY',
  mutualSupport: 'SUPPORT',
  sharedPurpose: 'PURPOSE',
  trustClimate: 'TRUST',
  leadershipAlignment: 'LEAD ALIGNMENT',
  stability: 'STABILITY',
}

function UnitsSubview({ world, teamId }: { readonly world: GameWorld; readonly teamId: TeamId }) {
  const units = getStaffUnitsForTeam(world, teamId)
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined)
  const selected = units.find((unit) => unit.unitKey === selectedKey) ?? units[0]

  const columns: readonly DataGridColumn<StaffUnitPresentationItem & { readonly id: string }>[] = [
    { id: 'unit', label: 'UNIT', category: 'Identity', sortable: true, searchable: true, minWidth: 140, flex: 2, render: (item) => item.departmentLabel, value: (item) => item.departmentLabel },
    { id: 'members', label: 'MEMBERS', category: 'Identity', numeric: true, sortable: true, width: 84, render: (item) => item.memberCount, value: (item) => item.memberCount },
    { id: 'lead', label: 'LEAD', category: 'Identity', sortable: true, searchable: true, width: 150, render: (item) => item.leaderLabel, value: (item) => item.leaderLabel },
    ...STAFF_UNIT_COHESION_DIMENSIONS.map((dimension): DataGridColumn<StaffUnitPresentationItem & { readonly id: string }> => ({
      id: dimension, label: UNIT_COHESION_COLUMN_LABEL[dimension], category: 'Cohesion', sortable: true, width: 96,
      render: (item) => STAFF_UNIT_COHESION_BAND_LABELS[item.bands[dimension]],
      value: (item) => STAFF_UNIT_COHESION_BAND_LABELS[item.bands[dimension]],
    })),
  ]

  const gridRows = units.map((unit) => ({ ...unit, id: unit.unitKey }))

  return <SplitWorkspace inspector={selected !== undefined && <UnitInspector unit={selected} world={world} />}>
    <BDMDataGrid
      columns={columns}
      emptyDescription="No Staff units resolved for this team."
      emptyTitle="No units"
      gridId="staff-units"
      onRowClick={(row) => setSelectedKey(row.unitKey)}
      rows={gridRows}
      selectedId={selected?.unitKey}
    />
  </SplitWorkspace>
}

function UnitInspector({ world, unit }: { readonly world: GameWorld; readonly unit: StaffUnitPresentationItem }) {
  const explanation = explainStaffUnitCohesion(world, unit.unitKey)

  return <section className="staff-unit-inspector">
    <p className="eyebrow">STAFF UNIT</p>
    <h2>{unit.departmentLabel}</h2>
    <dl className="staff-recommendation-summary">
      <div><dt>LEAD</dt><dd>{unit.leaderLabel}</dd></div>
    </dl>

    {!explanation.established
      ? <p className="staff-explanation">Unit cohesion has not been established yet.</p>
      : <DetailGroup title="COHESION">
        <dl className="staff-recommendation-detail">
          {explanation.dimensions.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{STAFF_UNIT_COHESION_BAND_LABELS[item.band]}</dd></div>)}
        </dl>
      </DetailGroup>}

    {explanation.strengths.length > 0 && <DetailGroup title="UNIT STRENGTHS">
      <ul className="staff-career-history">{explanation.strengths.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </DetailGroup>}

    {explanation.concerns.length > 0 && <DetailGroup title="UNIT CONCERNS">
      <ul className="staff-career-history">{explanation.concerns.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </DetailGroup>}
  </section>
}
