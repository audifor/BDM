import { useMemo, useState, type CSSProperties } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { TRAINING_PCB_TABS, TrainingPcbPage, type TrainingPcbTab } from '@/ui/pcb-migrated/training/TrainingPcbPage'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import './training-workspace.css'

function TrainingWorkspaceHeader({
  teamName,
  competitionLabel,
  seasonLabel,
}: {
  readonly teamName: string
  readonly competitionLabel: string | null
  readonly seasonLabel: string | null
}) {
  return (
    <header className="training-workspace-header" data-ng-region="training-workspace-header">
      <div className="training-workspace-header__main">
        <span className="training-workspace-header__app">Training</span>
        <span className="training-workspace-header__sep" aria-hidden />
        <span className="training-workspace-header__team">{teamName}</span>
        <span className="training-workspace-header__meta">
          {competitionLabel ?? '—'}
          {' · '}
          {seasonLabel ?? '—'}
        </span>
      </div>
    </header>
  )
}

export function TrainingWorkspace() {
  const world = useGameStore((state) => state.world)
  const setTrainingIntensity = useGameStore((state) => state.setTrainingIntensity)
  const setTrainingFocus = useGameStore((state) => state.setTrainingFocus)
  const scheduleTrainingSession = useGameStore((state) => state.scheduleTrainingSession)
  const scheduleTeamModuleSession = useGameStore((state) => state.scheduleTeamModuleSession)
  const scheduleAutomaticTeamTrainingWeek = useGameStore((state) => state.scheduleAutomaticTeamTrainingWeek)
  const cancelTrainingSession = useGameStore((state) => state.cancelTrainingSession)
  const saveUserTrainingModule = useGameStore((state) => state.saveUserTrainingModule)
  const deleteUserTrainingModule = useGameStore((state) => state.deleteUserTrainingModule)
  const assignTrainingModuleToPlayer = useGameStore((state) => state.assignTrainingModuleToPlayer)
  const [activeTab, setActiveTab] = useState<TrainingPcbTab>('team')
  const { openEntity } = useNgWorkspaceNavigation()

  const context = useMemo(() => (world === null ? null : buildRosterWorkspaceContext(world)), [world])
  const team = useMemo(() => (world === null ? undefined : rosterTeamForWorld(world)), [world])
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
      TRAINING_PCB_TABS.map(([id, label]) => ({
        id,
        label,
        active: id === activeTab,
      })),
    [activeTab],
  )

  if (world === null || context === null || team === undefined || getUserTeam(world) === undefined) {
    return (
      <div className="training-workspace training-workspace--empty" data-ng-region="training-workspace">
        <section className="training-workspace__empty-state">
          <h1 className="training-workspace__empty-title">Training</h1>
          <p className="training-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="training-workspace" data-ng-region="training-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={
          <TrainingWorkspaceHeader
            competitionLabel={context.competitionLabel}
            seasonLabel={context.seasonLabel}
            teamName={context.teamName}
          />
        }
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as TrainingPcbTab)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="training-workspace__scroll">
          <TrainingPcbPage
            activeTab={activeTab}
            onAssignModule={assignTrainingModuleToPlayer}
            onCancelSession={cancelTrainingSession}
            onDeleteModule={deleteUserTrainingModule}
            onFocus={setTrainingFocus}
            onIntensity={setTrainingIntensity}
            onSaveModule={saveUserTrainingModule}
            onScheduleSession={scheduleTrainingSession}
            onScheduleAutomaticWeek={scheduleAutomaticTeamTrainingWeek}
            onScheduleTeamModule={scheduleTeamModuleSession}
            onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            onTabChange={setActiveTab}
            variant="ng"
            world={world}
          />
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
