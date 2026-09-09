import { useMemo, useState, type CSSProperties } from 'react'

import { useGameStore } from '@/stores/gameStore'
import { TeamCrest } from '@/ui-ng/applications/player/components/EntityIdentityBand'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildTeamWorkspaceModel,
  type TeamWorkspaceModel,
} from '@/ui-ng/applications/team/buildTeamWorkspaceModel'
import {
  TEAM_DETAIL_PREPARED_TABS,
  TEAM_DETAIL_ROSTER_TAB,
  TEAM_DETAIL_TAB_LABELS,
  TEAM_DETAIL_TABS,
  parseTeamDetailTabId,
} from '@/ui-ng/applications/team/teamStructuralData'
import { TeamOverviewView } from '@/ui-ng/applications/team/views/TeamOverviewView'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import './team-workspace.css'

function TeamHeader({ model }: { readonly model: TeamWorkspaceModel }) {
  const { openEntity } = useNgWorkspaceNavigation()
  const primaryCompetition = model.competitions[0]
  const contextLine =
    primaryCompetition === undefined
      ? [model.ecosystemName, model.countryName]
          .filter((part): part is string => part !== null)
          .join(' · ')
      : `${primaryCompetition.name} · ${primaryCompetition.seasonLabel}`

  return (
    <div className="team-header">
      <div className="team-header__identity">
        <span aria-hidden className="team-header__crest">
          <TeamCrest code={model.shortCode} size={56} />
        </span>
        <div className="team-header__titles">
          <h1 className="team-header__name">{model.teamName}</h1>
          <div className="team-header__context">
            <span>{contextLine}</span>
            {contextLine.length === 0 ? null : (
              <>
                <span className="team-header__divider" aria-hidden />
                <span>{model.genderLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="team-header__actions">
        <button
          className="ng-canon__action"
          onClick={() => openEntity({ type: 'team', teamId: model.teamId, section: 'squad' })}
          type="button"
        >
          Roster
        </button>
        {primaryCompetition === undefined ? null : (
          <button
            className="ng-canon__action"
            onClick={() =>
              openEntity({
                type: 'competition',
                competitionId: primaryCompetition.competitionId,
                section: 'overview',
              })
            }
            type="button"
          >
            Competition
          </button>
        )}
      </div>
    </div>
  )
}

function TeamWorkspaceEmpty({ worldMissing }: { readonly worldMissing: boolean }) {
  return (
    <div className="team-workspace team-workspace--empty" data-ng-region="team">
      <section className="team-workspace__empty-state">
        <p className="ng-canon__eyebrow">Team dossier</p>
        <h1 className="team-workspace__empty-title">Team not found</h1>
        <p className="team-workspace__empty-message">
          {worldMissing
            ? 'There is no active game world to inspect yet.'
            : 'This team does not exist in the current world.'}
        </p>
      </section>
    </div>
  )
}

export function TeamWorkspace() {
  const world = useGameStore((state) => state.world)
  const { teamId, openEntity } = useNgWorkspaceNavigation()
  const [activeTab, setActiveTab] = useState('overview')

  const model = useMemo(
    () => (world === null || teamId === null ? null : buildTeamWorkspaceModel(world, teamId)),
    [world, teamId],
  )

  if (model === null) {
    return <TeamWorkspaceEmpty worldMissing={world === null} />
  }

  const colors = deriveTeamColors(model.teamId)
  const teamStyle = {
    '--po-team-primary': colors.primary,
    '--po-team-secondary': colors.secondary,
    '--po-team-muted': colors.muted,
  } as CSSProperties

  const handleTabSelect = (tabId: string) => {
    const tab = parseTeamDetailTabId(tabId)
    if (tab === TEAM_DETAIL_ROSTER_TAB) {
      openEntity({ type: 'team', teamId: model.teamId, section: 'squad' })
      return
    }
    setActiveTab(tab)
  }

  const tabs = TEAM_DETAIL_TABS.map((id) => ({ id, label: TEAM_DETAIL_TAB_LABELS[id] }))

  return (
    <div className="team-workspace" data-ng-region="team" style={teamStyle}>
      <ApplicationWorkspace
        header={<TeamHeader model={model} />}
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            disabledTabIds={TEAM_DETAIL_PREPARED_TABS}
            onTabSelect={handleTabSelect}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion>
          {activeTab === 'overview' ? (
            <TeamOverviewView model={model} />
          ) : (
            <div className="team-workspace__placeholder">
              <p className="ng-canon__eyebrow">Coming soon</p>
              <p className="team-workspace__placeholder-text">
                {TEAM_DETAIL_TAB_LABELS[parseTeamDetailTabId(activeTab)]} will be part of a future BDM
                milestone.
              </p>
            </div>
          )}
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
