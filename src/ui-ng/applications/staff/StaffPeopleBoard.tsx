import { calculateStaffWorkload, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { staffRoleDefinition } from '@/domain/staff'
import { STAFF_REPUTATION_DIMENSIONS } from '@/domain/staffReputation'
import type { StaffPersonId } from '@/domain/ids'
import {
  STAFF_CONTRACT_STATUS_LABELS,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_KEYS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  classifyWorkloadState,
  compactStaffSalary,
  findActiveStaffContractForStaff,
  formatStaffCareerEntry,
  getRecentStaffCareerHistory,
  getResponsibilitiesHeldPresentation,
  getStaffAge,
  getStaffReputationProfile,
  getStaffRoleEvaluations,
  RESPONSIBILITY_KIND_LABELS,
  RESPONSIBILITY_MODE_LABELS,
  type StaffPresentationItem,
} from '@/ui/staffPresentation'

import { InspectorSection, MetricRow, WorkloadBadge } from '@/ui-ng/applications/staff/StaffChrome'
import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ngCol, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'

export function StaffPeopleBoard({
  world,
  staff,
  selectedStaffId,
  onSelectStaff,
  onOpenStaff,
}: {
  readonly world: GameWorld
  readonly staff: readonly StaffPresentationItem[]
  readonly selectedStaffId: StaffPersonId | undefined
  readonly onSelectStaff: (staffPersonId: StaffPersonId) => void
  readonly onOpenStaff: (staffPersonId: StaffPersonId) => void
}) {
  if (staff.length === 0) {
    return <p className="staff-workspace__empty">No staff assigned to this team.</p>
  }

  const selected = staff.find((item) => item.staffPersonId === selectedStaffId) ?? staff[0]
  const rows = staff.map((row) => ({ ...row, id: row.staffPersonId }))

  return (
    <div className="staff-workspace__split">
      <div className="staff-workspace__panel ng-holo-panel">
        <NgPrecisionTable
          className="staff-workspace__table"
          columns={[
            ngCol(
              'name',
              'Staff',
              (row) => (
                <button
                  className="staff-workspace__link"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenStaff(row.staffPersonId)
                  }}
                  type="button"
                >
                  {row.name}
                </button>
              ),
              { value: (row) => row.name },
            ),
            ngCol('role', 'Role', (row) => STAFF_ROLE_LABELS[row.role], { value: (row) => STAFF_ROLE_LABELS[row.role] }),
            ngCol('department', 'Department', (row) => STAFF_DEPARTMENT_LABELS[row.department], {
              value: (row) => STAFF_DEPARTMENT_LABELS[row.department],
            }),
            ngCol('proficiency', 'Proficiency', (row) => row.roleProficiency, {
              numeric: true,
              value: (row) => row.roleProficiency,
            }),
            ngCol('reputation', 'Reputation', (row) => row.reputationScore ?? '—', {
              numeric: true,
              value: (row) => row.reputationScore,
            }),
            ngCol(
              'workload',
              'Workload',
              (row) => <WorkloadBadge state={row.workloadState} utilization={row.utilization} />,
              { value: (row) => row.utilization },
            ),
            ngCol('employment', 'Employment', (row) => row.employmentStatus, { value: (row) => row.employmentStatus }),
            ngCol('contract', 'Contract', (row) => STAFF_CONTRACT_STATUS_LABELS[row.contractStatus], {
              value: (row) => STAFF_CONTRACT_STATUS_LABELS[row.contractStatus],
            }),
            ngCol(
              'salary',
              'Salary',
              (row) => (row.annualSalary === undefined ? '—' : compactStaffSalary(row.annualSalary)),
              { numeric: true, value: (row) => row.annualSalary },
            ),
            ngCol('expires', 'Expires', (row) => row.contractExpiresOn ?? '—', { value: (row) => row.contractExpiresOn }),
          ]}
          gridId="ng-staff-people"
          onSelectionChange={(ids) => {
            if (ids[0]) onSelectStaff(ids[0])
          }}
          rows={rows}
          selectedId={selected?.staffPersonId}
        />
      </div>
      {selected !== undefined ? <StaffDetail staffPersonId={selected.staffPersonId} world={world} /> : null}
    </div>
  )
}

function StaffDetail({ world, staffPersonId }: { readonly world: GameWorld; readonly staffPersonId: StaffPersonId }) {
  const person = getStaffPerson(world, staffPersonId)
  const assignment = getStaffAssignment(world, staffPersonId)
  if (person === undefined || assignment === undefined) return null

  const roleDefinition = staffRoleDefinition(assignment.role)
  const evaluations = getStaffRoleEvaluations(world, staffPersonId)
  const workload = calculateStaffWorkload(world, staffPersonId)
  const contract = findActiveStaffContractForStaff(world, staffPersonId)
  const reputation = getStaffReputationProfile(world, staffPersonId)
  const careerHistory = getRecentStaffCareerHistory(world, staffPersonId)
  const held = getResponsibilitiesHeldPresentation(world, staffPersonId)
  const age = getStaffAge(world, staffPersonId)

  return (
    <aside className="staff-workspace__inspector ng-holo-panel">
      <p className="staff-workspace__eyebrow">Staff person</p>
      <h2 className="staff-workspace__inspector-title">
        {person.identity.firstName} {person.identity.lastName}
      </h2>
      <dl className="staff-workspace__metrics">
        <MetricRow label="Role" value={STAFF_ROLE_LABELS[assignment.role]} />
        <MetricRow label="Department" value={STAFF_DEPARTMENT_LABELS[roleDefinition.department]} />
        <MetricRow label="Seniority" value={roleDefinition.seniority} />
        {age !== undefined ? <MetricRow label="Age" value={age} /> : null}
        {person.identity.nationality !== undefined ? <MetricRow label="Nationality" value={person.identity.nationality} /> : null}
      </dl>

      <InspectorSection title="Role evaluation">
        <p className="staff-workspace__note">Professional proficiency based on current attributes.</p>
        <dl className="staff-workspace__metrics">
          {evaluations.map((item) => (
            <MetricRow
              current={item.role === assignment.role}
              key={item.role}
              label={STAFF_ROLE_LABELS[item.role]}
              value={item.proficiency}
            />
          ))}
        </dl>
      </InspectorSection>

      <InspectorSection title="Workload">
        <dl className="staff-workspace__metrics">
          <MetricRow label="Utilization" value={formatStaffPercent(workload.utilization)} />
          <MetricRow label="Capacity used" value={`${workload.totalCapacityUsed} / ${workload.capacityLimit || '—'}`} />
          <MetricRow
            label="State"
            value={
              <span className={`staff-workspace__state staff-workspace__state--${classifyWorkloadState(workload)}`}>
                {WORKLOAD_STATE_LABELS[classifyWorkloadState(workload)]}
              </span>
            }
          />
        </dl>
      </InspectorSection>

      <InspectorSection title="Employment & contract">
        <dl className="staff-workspace__metrics">
          <MetricRow label="Status" value={world.staffEmploymentByStaffId[staffPersonId]?.status.toUpperCase() ?? 'UNKNOWN'} />
          {contract === undefined ? (
            <MetricRow label="Contract" value="No active contract" />
          ) : (
            <>
              <MetricRow label="Salary" value={compactStaffSalary(contract.compensation.annualSalary)} />
              <MetricRow label="Term" value={`${contract.term.startsOn} → ${contract.term.expiresOn}`} />
              {contract.termination !== undefined ? (
                <MetricRow label="Termination" value={`${contract.termination.effectiveOn} · ${contract.termination.reason}`} />
              ) : null}
            </>
          )}
        </dl>
      </InspectorSection>

      <InspectorSection title="Reputation">
        {reputation === undefined ? (
          <p className="staff-workspace__note">No reputation profile yet.</p>
        ) : (
          <dl className="staff-workspace__metrics">
            {STAFF_REPUTATION_DIMENSIONS.map((dimension) => (
              <MetricRow key={dimension} label={dimension} value={reputation.values[dimension]} />
            ))}
          </dl>
        )}
      </InspectorSection>

      <InspectorSection title="Career history">
        {careerHistory.length === 0 ? (
          <p className="staff-workspace__note">No recorded career history.</p>
        ) : (
          <ul className="staff-workspace__list">
            {careerHistory.map((entry, index) => (
              <li key={`${entry.date}-${entry.kind}-${index}`}>{formatStaffCareerEntry(entry)}</li>
            ))}
          </ul>
        )}
      </InspectorSection>

      <InspectorSection title="Responsibilities held">
        {held.length === 0 ? (
          <p className="staff-workspace__note">No responsibilities assigned.</p>
        ) : (
          <dl className="staff-workspace__metrics">
            {held.map((item) => (
              <MetricRow
                key={item.id}
                label={RESPONSIBILITY_KIND_LABELS[item.kind]}
                value={`${RESPONSIBILITY_MODE_LABELS[item.mode]} · ${item.capacityCost}`}
              />
            ))}
          </dl>
        )}
      </InspectorSection>

      <InspectorSection title="Professional attributes">
        <dl className="staff-workspace__metrics">
          {STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => (
            <MetricRow key={key} label={STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[key]} value={person.professional.attributes[key]} />
          ))}
        </dl>
      </InspectorSection>
    </aside>
  )
}
