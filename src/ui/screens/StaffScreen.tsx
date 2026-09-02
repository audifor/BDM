import { useEffect, useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
import type { ResponsibilityKind, ResponsibilityMode } from '@/domain/responsibility'
import type { SetTeamResponsibilityInput } from '@/app/staffResponsibilities'
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
import { calculateStaffWorkload } from '@/domain/world'
import { STAFF_REPUTATION_DIMENSIONS } from '@/domain/staffReputation'

import './StaffScreen.css'

type StaffScreenTab = 'staff' | 'responsibilities'

export function StaffScreen({ world, teamId, initialSelectedStaffId, onSetResponsibility }: { readonly world: GameWorld; readonly teamId?: TeamId; readonly initialSelectedStaffId?: StaffPersonId; readonly onSetResponsibility?: (input: SetTeamResponsibilityInput) => void }) {
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

  const toolbar = <div className="staff-screen-tabs">
    <button aria-pressed={tab === 'staff'} className={tab === 'staff' ? 'is-active' : undefined} onClick={() => setTab('staff')} type="button">STAFF</button>
    <button aria-pressed={tab === 'responsibilities'} className={tab === 'responsibilities' ? 'is-active' : undefined} onClick={() => setTab('responsibilities')} type="button">RESPONSIBILITIES</button>
  </div>

  return <AppFrame header={<AppHeader eyebrow="STAFF" meta={<span>{staff.length} STAFF</span>} title={team.name} />} toolbar={toolbar}>
    {tab === 'responsibilities'
      ? <ResponsibilitiesTab onSetResponsibility={onSetResponsibility} teamId={team.id} world={world} />
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
