import { useState } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
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
  getRecentStaffCareerHistory,
  getStaffAge,
  getStaffReputationProfile,
  getStaffRoleEvaluations,
  getTeamStaffPresentation,
  formatStaffCareerEntry,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  type StaffPresentationItem,
} from '@/ui/staffPresentation'
import { calculateStaffWorkload } from '@/domain/world'
import { STAFF_REPUTATION_DIMENSIONS } from '@/domain/staffReputation'

import './StaffScreen.css'

export function StaffScreen({ world, teamId, initialSelectedStaffId }: { readonly world: GameWorld; readonly teamId?: TeamId; readonly initialSelectedStaffId?: StaffPersonId }) {
  const team = teamId === undefined ? getUserTeam(world) : world.teams[teamId]
  const staff = team === undefined ? [] : getTeamStaffPresentation(world, team.id)
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
    { id: 'salary', label: 'SALARY', category: 'Contract', numeric: true, sortable: true, width: 84, render: (item) => item.annualSalary === undefined ? '—' : compactStaffSalary(item.annualSalary), value: (item) => item.annualSalary ?? -1 },
    { id: 'expiry', label: 'CONTRACT EXPIRES', category: 'Contract', sortable: true, width: 96, render: (item) => item.contractExpiresOn ?? '—', value: (item) => item.contractExpiresOn ?? '' },
  ]

  const rows = staff.map((item) => ({ ...item, id: item.staffPersonId }))

  return <AppFrame header={<AppHeader eyebrow="STAFF" meta={<span>{staff.length} STAFF</span>} title={team.name} />}>
    {staff.length === 0
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

    <DetailGroup title="PROFESSIONAL ATTRIBUTES">
      <dl className="staff-attributes">{STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => <div key={key}><dt>{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key]}</dt><dd>{person.professional.attributes[key]}</dd></div>)}</dl>
    </DetailGroup>
  </section>
}
