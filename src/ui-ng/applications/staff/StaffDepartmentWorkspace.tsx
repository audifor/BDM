import { useMemo } from 'react'

import type { TeamId } from '@/domain/ids'
import type { StaffDepartment, StaffProfessionalAttributeKey } from '@/domain/staff'
import type { GameWorld } from '@/domain/world'
import {
  compactStaffSalary,
  STAFF_CONTRACT_STATUS_LABELS,
  STAFF_DEPARTMENT_LABELS,
  STAFF_PROFESSIONAL_ATTRIBUTE_LABELS,
  STAFF_ROLE_LABELS,
} from '@/ui/staffPresentation'

import { buildStaffDepartmentDetailModel, type StaffDepartmentPersonRow } from '@/ui-ng/applications/staff/buildStaffDepartmentDetailModel'
import { useStaffDepartmentTabHover, WorkloadBadge } from '@/ui-ng/applications/staff/StaffChrome'
import { ngCol, ngTableColumns, NgPrecisionTable } from '@/ui-ng/components/NgPrecisionTable'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

const PERSON_STACK_COLORS = ['#7dd3fc', '#a78bfa', '#facc15', '#34d399', '#fb923c', '#f472b6', '#60a5fa', '#4ade80'] as const

function DepartmentHeader({ department }: { readonly department: StaffDepartment }) {
  return (
    <header className="staff-workspace-header" data-ng-region="staff-workspace-header">
      <div className="staff-workspace-header__main">
        <span className="staff-workspace-header__app">Staff</span>
        <span className="staff-workspace-header__sep" aria-hidden />
        <span className="staff-workspace-header__team">{STAFF_DEPARTMENT_LABELS[department]}</span>
      </div>
    </header>
  )
}

function RoleColumn({ roles }: { readonly roles: ReturnType<typeof buildStaffDepartmentDetailModel>['roles'] }) {
  return (
    <section className="staff-department-detail__panel ng-holo-panel">
      <h3 className="staff-workspace__group-title">Roles</h3>
      {roles.length === 0 ? (
        <p className="staff-workspace__note">No roles configured for this department.</p>
      ) : (
        <ul className="staff-department-card__role-list">
          {roles.map((row) => (
            <li className={row.filled < row.target ? 'is-understaffed' : undefined} key={row.role}>
              <span className="staff-department-card__role-ratio">
                {row.filled}/{row.target}
              </span>
              <span className="staff-department-card__role-name">{STAFF_ROLE_LABELS[row.role]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonStackedAttributes({
  people,
  attributes,
}: {
  readonly people: readonly StaffDepartmentPersonRow[]
  readonly attributes: readonly StaffProfessionalAttributeKey[]
}) {
  return (
    <section className="staff-department-detail__panel ng-holo-panel">
      <h3 className="staff-workspace__group-title">Department attributes</h3>
      {people.length === 0 ? (
        <p className="staff-workspace__note">No staff assigned to this department.</p>
      ) : (
        <>
          <ul className="staff-department-detail__legend">
            {people.map((person, index) => (
              <li key={person.staffPersonId}>
                <span className="staff-department-detail__legend-dot" style={{ background: PERSON_STACK_COLORS[index % PERSON_STACK_COLORS.length] }} />
                {person.name}
              </li>
            ))}
          </ul>
          <div className="staff-department-detail__stack-grid">
            {attributes.map((attribute) => (
              <div className="staff-department-detail__stack-column" key={attribute}>
                <div className="staff-department-detail__stack-track">
                  {people.map((person, index) => {
                    const value = person.attributes[attribute] ?? 0
                    return (
                      <div
                        className="staff-department-detail__stack-segment"
                        key={person.staffPersonId}
                        style={{ height: `${value / people.length}%`, background: PERSON_STACK_COLORS[index % PERSON_STACK_COLORS.length] }}
                        title={`${person.name}: ${value}`}
                      />
                    )
                  })}
                </div>
                <span className="staff-department-chart__label">{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[attribute]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function LeagueComparisonColumn({ comparisons }: { readonly comparisons: ReturnType<typeof buildStaffDepartmentDetailModel>['comparisons'] }) {
  const leagueHigh = comparisons.length === 0 ? 0 : Math.max(...comparisons.map((item) => item.leagueHigh))
  const leagueLow = comparisons.length === 0 ? 0 : Math.min(...comparisons.map((item) => item.leagueLow))

  return (
    <section className="staff-department-detail__panel ng-holo-panel">
      <h3 className="staff-workspace__group-title">League comparison</h3>
      <div className="staff-department-chart">
        <p className="staff-department-chart__caption">Highest in the league ({leagueHigh})</p>
        <div className="staff-department-chart__grid">
          {comparisons.map((comparison) => {
            const span = Math.max(comparison.leagueHigh - comparison.leagueLow, 1)
            const fillPercent = Math.round(((comparison.leagueHigh - comparison.leagueLow) / 100) * 100)
            const markerPercent =
              comparison.teamValue === undefined ? undefined : Math.min(100, Math.max(0, ((comparison.teamValue - comparison.leagueLow) / span) * 100))
            return (
              <div className="staff-department-chart__column" key={comparison.attribute}>
                <div className="staff-department-chart__track">
                  <div className="staff-department-chart__range" style={{ height: `${fillPercent}%` }} />
                  {markerPercent !== undefined ? (
                    <div className="staff-department-chart__marker" style={{ bottom: `${markerPercent}%` }} title={`Your team: ${comparison.teamValue}`} />
                  ) : null}
                </div>
                <span className="staff-department-chart__label">{STAFF_PROFESSIONAL_ATTRIBUTE_LABELS[comparison.attribute]}</span>
              </div>
            )
          })}
        </div>
        <p className="staff-department-chart__caption staff-department-chart__caption--low">Lowest in the league ({leagueLow})</p>
      </div>
    </section>
  )
}

function DepartmentPeopleTable({ people }: { readonly people: readonly StaffDepartmentPersonRow[] }) {
  if (people.length === 0) {
    return <p className="staff-workspace__empty">No staff assigned to this department.</p>
  }
  const rows = people.map((row) => ({ ...row, id: row.staffPersonId }))
  return (
    <div className="staff-workspace__panel ng-holo-panel">
      <NgPrecisionTable
        className="staff-workspace__table"
        columns={ngTableColumns(rows, [
          ngCol('name', 'Staff', (row) => row.name, { value: (row) => row.name }),
          ngCol('role', 'Role', (row) => STAFF_ROLE_LABELS[row.role], { value: (row) => STAFF_ROLE_LABELS[row.role] }),
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
          ngCol('salary', 'Salary', (row) => (row.annualSalary === undefined ? '—' : compactStaffSalary(row.annualSalary)), {
            numeric: true,
            value: (row) => row.annualSalary,
          }),
          ngCol('expires', 'Expires', (row) => row.contractExpiresOn ?? '—', { value: (row) => row.contractExpiresOn }),
        ])}
        gridId="ng-staff-department-people"
        rows={rows}
      />
    </div>
  )
}

export function StaffDepartmentWorkspace({
  world,
  teamId,
  department,
}: {
  readonly world: GameWorld
  readonly teamId: TeamId
  readonly department: StaffDepartment
}) {
  const model = useMemo(() => buildStaffDepartmentDetailModel(world, teamId, department), [world, teamId, department])
  const departmentHover = useStaffDepartmentTabHover(department)

  return (
    <div className="staff-workspace" data-ng-region="staff-department-workspace">
      <ApplicationWorkspace
        header={<DepartmentHeader department={department} />}
        tabs={
          <>
            <WorkspaceTabs
              activeTabId="staff"
              onTabMouseEnter={() => departmentHover.onTabMouseEnter()}
              onTabMouseLeave={() => departmentHover.onTabMouseLeave()}
              tabRef={departmentHover.tabButtonRef}
              tabRefId="staff"
              tabs={[{ id: 'staff', label: 'Staff' }]}
            />
            {departmentHover.menu}
          </>
        }
      >
        <ScrollRegion className="staff-workspace__scroll">
          <div className="staff-workspace__stack">
            <div className="staff-department-detail__grid">
              <RoleColumn roles={model.roles} />
              <PersonStackedAttributes attributes={model.attributes} people={model.people} />
              <LeagueComparisonColumn comparisons={model.comparisons} />
            </div>
            <DepartmentPeopleTable people={model.people} />
          </div>
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
