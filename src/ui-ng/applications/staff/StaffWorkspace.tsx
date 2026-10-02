import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { StaffPersonId } from '@/domain/ids'
import type { StaffDepartment } from '@/domain/staff'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { StaffAdvisoryBoard } from '@/ui-ng/applications/staff/StaffAdvisoryBoard'
import { StaffAssignmentsScreen, type StaffAssignmentPanelRequest } from '@/ui-ng/applications/staff/assignments/StaffAssignmentsScreen'
import { useStaffDepartmentTabHover } from '@/ui-ng/applications/staff/StaffChrome'
import { StaffDepartmentWorkspace } from '@/ui-ng/applications/staff/StaffDepartmentWorkspace'
import { StaffDynamicsBoard } from '@/ui-ng/applications/staff/StaffDynamicsBoard'
import { StaffPeopleBoard } from '@/ui-ng/applications/staff/StaffPeopleBoard'
import { StaffPersonWorkspace } from '@/ui-ng/applications/staff/StaffPersonWorkspace'
import { buildStaffWorkspaceModel } from '@/ui-ng/applications/staff/buildStaffWorkspaceModel'
import {
  parseStaffDepartment,
  STAFF_TAB_LABELS,
  STAFF_WORKSPACE_TABS,
  staffTabLabel,
  type StaffWorkspaceModel,
  type StaffWorkspaceTabId,
} from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'
import { navigateToStaff, parseWorkspaceStaffId } from '@/ui-ng/workspace/workspaceApps'

import './staff-workspace.css'

function StaffWorkspaceHeader({
  model,
  label,
  actions,
}: {
  readonly model: StaffWorkspaceModel
  readonly label: string
  readonly actions?: ReactNode
}) {
  return (
    <header className="staff-workspace-header" data-ng-region="staff-workspace-header">
      <div className="staff-workspace-header__main">
        <span className="staff-workspace-header__app">{label}</span>
        <span className="staff-workspace-header__sep" aria-hidden />
        <span className="staff-workspace-header__team">{model.teamName}</span>
        <span className="staff-workspace-header__meta">
          <span className="ng-type-numeric">{model.staffCount}</span> staff
          {' · '}
          <span className="ng-type-numeric">{model.openAdvisoryCount}</span> advisory
          {' · '}
          <span className="ng-type-numeric">{model.needsAttentionCount}</span> attention
        </span>
      </div>
      {actions === undefined ? null : <div className="staff-workspace-header__actions">{actions}</div>}
    </header>
  )
}

function useStaffIdFromUrl(): StaffPersonId | null {
  const read = () => parseWorkspaceStaffId(new URLSearchParams(window.location.search).get('staffId'))
  const [staffId, setStaffId] = useState(read)
  useEffect(() => {
    const sync = () => setStaffId(read())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])
  return staffId
}

function useStaffDepartmentFromUrl(): StaffDepartment | null {
  const read = () => parseStaffDepartment(new URLSearchParams(window.location.search).get('staffDept'))
  const [department, setDepartment] = useState(read)
  useEffect(() => {
    const sync = () => setDepartment(read())
    window.addEventListener('bdm-ng-nav', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('bdm-ng-nav', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])
  return department
}

export function StaffWorkspace() {
  const staffId = useStaffIdFromUrl()
  const department = useStaffDepartmentFromUrl()
  const world = useGameStore((state) => state.world)
  const team = useMemo(() => (world === null ? undefined : getUserTeam(world)), [world])

  if (staffId !== null) {
    return <StaffPersonWorkspace staffId={staffId} />
  }
  if (department !== null && world !== null && team !== undefined) {
    return <StaffDepartmentWorkspace department={department} teamId={team.id} world={world} />
  }
  return <StaffBoardWorkspace />
}

function StaffBoardWorkspace() {
  const world = useGameStore((state) => state.world)
  const acceptStaffRecommendation = useGameStore((state) => state.acceptStaffRecommendation)
  const dismissStaffRecommendation = useGameStore((state) => state.dismissStaffRecommendation)
  const grantStaffCareerRequest = useGameStore((state) => state.grantStaffCareerRequest)
  const declineStaffCareerRequest = useGameStore((state) => state.declineStaffCareerRequest)
  const [activeTab, setActiveTab] = useState<StaffWorkspaceTabId>('staff')
  const [assignmentPanel, setAssignmentPanel] = useState<StaffAssignmentPanelRequest | null>(null)
  const departmentHover = useStaffDepartmentTabHover(null)

  const model = useMemo(() => (world === null ? null : buildStaffWorkspaceModel(world)), [world])
  const team = useMemo(() => (world === null ? undefined : getUserTeam(world)), [world])
  const teamStyle = useMemo(() => {
    if (team === undefined) return undefined
    const colors = deriveTeamColors(team.id)
    return {
      '--po-team-primary': colors.primary,
      '--po-team-secondary': colors.secondary,
      '--po-team-muted': colors.muted,
    } as CSSProperties
  }, [team])

  const tabs = useMemo(
    () =>
      model === null
        ? []
        : STAFF_WORKSPACE_TABS.map((id) => ({
            id,
            label: staffTabLabel(id, model),
            active: id === activeTab,
          })),
    [activeTab, model],
  )

  const tabsNode: ReactNode = (
    <>
      <WorkspaceTabs
        activeTabId={activeTab}
        onTabMouseEnter={(tabId) => {
          if (tabId === 'staff') departmentHover.onTabMouseEnter()
        }}
        onTabMouseLeave={(tabId) => {
          if (tabId === 'staff') departmentHover.onTabMouseLeave()
        }}
        onTabSelect={(tabId) => setActiveTab(tabId as StaffWorkspaceTabId)}
        tabRef={departmentHover.tabButtonRef}
        tabRefId="staff"
        tabs={tabs}
      />
      {departmentHover.menu}
    </>
  )

  if (world === null || model === null) {
    return (
      <div className="staff-workspace staff-workspace--empty" data-ng-region="staff-workspace">
        <section className="staff-workspace__empty-state">
          <h1 className="staff-workspace__empty-title">Staff</h1>
          <p className="staff-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="staff-workspace" data-ng-region="staff-workspace" style={teamStyle}>
      <ApplicationWorkspace
        tabs={tabsNode}
        tabsHeader={
          <StaffWorkspaceHeader
            actions={
              activeTab === 'assignments' ? (
                <>
                  <button className="sa-action" onClick={() => setAssignmentPanel({ kind: 'autoAssign' })} type="button">
                    AUTO-ASSIGN
                  </button>
                  <button className="sa-action" onClick={() => setAssignmentPanel({ kind: 'optimize' })} type="button">
                    OPTIMIZE
                  </button>
                  <button className="sa-action sa-action--primary" onClick={() => setAssignmentPanel({ kind: 'newAssignment' })} type="button">
                    + NEW ASSIGNMENT
                  </button>
                </>
              ) : undefined
            }
            label={STAFF_TAB_LABELS[activeTab]}
            model={model}
          />
        }
      >
        {activeTab === 'assignments' ? (
          <StaffAssignmentsScreen
            onPanelRequestHandled={() => setAssignmentPanel(null)}
            panelRequest={assignmentPanel}
            teamId={model.teamId}
            world={world}
          />
        ) : (
          <ScrollRegion className="staff-workspace__scroll">
            {activeTab === 'staff' ? (
              <StaffPeopleBoard
                staff={model.staff}
                teamId={model.teamId}
                world={world}
              />
            ) : null}
            {activeTab === 'advisory' ? (
              <StaffAdvisoryBoard
                onAcceptRecommendation={acceptStaffRecommendation}
                onDismissRecommendation={dismissStaffRecommendation}
                teamId={model.teamId}
                world={world}
              />
            ) : null}
            {activeTab === 'dynamics' ? (
              <StaffDynamicsBoard
                onDeclineCareerRequest={declineStaffCareerRequest}
                onGrantCareerRequest={grantStaffCareerRequest}
                onOpenStaff={navigateToStaff}
                teamId={model.teamId}
                world={world}
              />
            ) : null}
          </ScrollRegion>
        )}
      </ApplicationWorkspace>
    </div>
  )
}
