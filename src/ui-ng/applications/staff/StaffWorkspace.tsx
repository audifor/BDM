import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { StaffPersonId } from '@/domain/ids'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import { StaffAdvisoryBoard } from '@/ui-ng/applications/staff/StaffAdvisoryBoard'
import { StaffDynamicsBoard } from '@/ui-ng/applications/staff/StaffDynamicsBoard'
import { StaffPeopleBoard } from '@/ui-ng/applications/staff/StaffPeopleBoard'
import { StaffPersonWorkspace } from '@/ui-ng/applications/staff/StaffPersonWorkspace'
import { StaffResponsibilitiesBoard } from '@/ui-ng/applications/staff/StaffResponsibilitiesBoard'
import { buildStaffWorkspaceModel } from '@/ui-ng/applications/staff/buildStaffWorkspaceModel'
import {
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

function StaffWorkspaceHeader({ model }: { readonly model: StaffWorkspaceModel }) {
  return (
    <header className="staff-workspace-header" data-ng-region="staff-workspace-header">
      <div className="staff-workspace-header__main">
        <span className="staff-workspace-header__app">Staff</span>
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

export function StaffWorkspace() {
  const staffId = useStaffIdFromUrl()
  if (staffId !== null) {
    return <StaffPersonWorkspace staffId={staffId} />
  }
  return <StaffBoardWorkspace />
}

function StaffBoardWorkspace() {
  const world = useGameStore((state) => state.world)
  const setStaffResponsibility = useGameStore((state) => state.setStaffResponsibility)
  const acceptStaffRecommendation = useGameStore((state) => state.acceptStaffRecommendation)
  const dismissStaffRecommendation = useGameStore((state) => state.dismissStaffRecommendation)
  const grantStaffCareerRequest = useGameStore((state) => state.grantStaffCareerRequest)
  const declineStaffCareerRequest = useGameStore((state) => state.declineStaffCareerRequest)
  const [activeTab, setActiveTab] = useState<StaffWorkspaceTabId>('staff')
  const [selectedStaffId, setSelectedStaffId] = useState<StaffPersonId | undefined>(undefined)

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
        header={<StaffWorkspaceHeader model={model} />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as StaffWorkspaceTabId)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="staff-workspace__scroll">
          {activeTab === 'staff' ? (
            <StaffPeopleBoard
              onOpenStaff={navigateToStaff}
              onSelectStaff={setSelectedStaffId}
              selectedStaffId={selectedStaffId}
              staff={model.staff}
              world={world}
            />
          ) : null}
          {activeTab === 'responsibilities' ? (
            <StaffResponsibilitiesBoard onSetResponsibility={setStaffResponsibility} teamId={model.teamId} world={world} />
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
      </ApplicationWorkspace>
    </div>
  )
}
