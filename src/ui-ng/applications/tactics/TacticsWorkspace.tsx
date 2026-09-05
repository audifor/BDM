import { useMemo, useState, type CSSProperties } from 'react'

import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { useTacticalPlanStore } from '@/stores/tacticalPlanStore'
import { TacticsPcbPage, TACTICS_PCB_TABS, type TacticsPcbTab } from '@/ui/pcb-migrated/tactics/TacticsPcbPage'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'
import { WorkspaceTabs } from '@/ui-ng/workspace/WorkspaceTabs'

import './tactics-workspace.css'

function TacticsWorkspaceHeader({
  teamName,
  competitionLabel,
  seasonLabel,
  opponentName,
}: {
  readonly teamName: string
  readonly competitionLabel: string | null
  readonly seasonLabel: string | null
  readonly opponentName: string | null
}) {
  return (
    <header className="tactics-workspace-header" data-ng-region="tactics-workspace-header">
      <div className="tactics-workspace-header__main">
        <span className="tactics-workspace-header__app">Tactics</span>
        <span className="tactics-workspace-header__sep" aria-hidden />
        <span className="tactics-workspace-header__team">{teamName}</span>
        <span className="tactics-workspace-header__meta">
          {competitionLabel ?? '—'}
          {' · '}
          {seasonLabel ?? '—'}
          {opponentName === null ? null : ` · vs ${opponentName}`}
        </span>
      </div>
    </header>
  )
}

export function TacticsWorkspace() {
  const world = useGameStore((state) => state.world)
  const setLineupSlot = useGameStore((state) => state.setLineupSlot)
  const clearLineupSlot = useGameStore((state) => state.clearLineupSlot)
  const updateRotationMinutes = useGameStore((state) => state.updateRotationMinutes)
  const updateGamePlanMatchups = useGameStore((state) => state.updateGamePlanMatchups)
  const updateGamePlanTacticalOverride = useGameStore((state) => state.updateGamePlanTacticalOverride)
  const saveDesignerPlay = useGameStore((state) => state.saveDesignerPlay)
  const deleteDesignerPlay = useGameStore((state) => state.deleteDesignerPlay)
  const saveDesignerPlaybook = useGameStore((state) => state.saveDesignerPlaybook)
  const deleteDesignerPlaybook = useGameStore((state) => state.deleteDesignerPlaybook)
  const plan = useTacticalPlanStore((state) => state.plan)
  const setPlan = useTacticalPlanStore((state) => state.setPlan)
  const resetPlan = useTacticalPlanStore((state) => state.reset)
  const [activeTab, setActiveTab] = useState<TacticsPcbTab>('board')
  const { openEntity } = useNgWorkspaceNavigation()

  const context = useMemo(() => (world === null ? null : buildRosterWorkspaceContext(world)), [world])
  const team = useMemo(() => (world === null ? undefined : rosterTeamForWorld(world)), [world])
  const opponentName = useMemo(() => {
    if (world === null || team === undefined) return null
    const nextGame = getNextUserGame(world)
    if (nextGame === undefined) return null
    const opponent = world.teams[nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId]
    return opponent?.name ?? null
  }, [team, world])
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
      TACTICS_PCB_TABS.map(([id, label]) => ({
        id,
        label,
        active: id === activeTab,
      })),
    [activeTab],
  )

  if (world === null || context === null || team === undefined || getUserTeam(world) === undefined) {
    return (
      <div className="tactics-workspace tactics-workspace--empty" data-ng-region="tactics-workspace">
        <section className="tactics-workspace__empty-state">
          <h1 className="tactics-workspace__empty-title">Tactics</h1>
          <p className="tactics-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="tactics-workspace" data-ng-region="tactics-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={
          <TacticsWorkspaceHeader
            competitionLabel={context.competitionLabel}
            opponentName={opponentName}
            seasonLabel={context.seasonLabel}
            teamName={context.teamName}
          />
        }
        tabs={
          <WorkspaceTabs
            activeTabId={activeTab}
            onTabSelect={(tabId) => setActiveTab(tabId as TacticsPcbTab)}
            tabs={tabs}
          />
        }
      >
        <ScrollRegion className="tactics-workspace__scroll">
          <TacticsPcbPage
            activeTab={activeTab}
            onChange={setPlan}
            onDeleteDesignerPlay={deleteDesignerPlay}
            onDeleteDesignerPlaybook={deleteDesignerPlaybook}
            onLineupSlotChange={setLineupSlot}
            onLineupSlotClear={clearLineupSlot}
            onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            onReset={resetPlan}
            onSaveDesignerPlay={saveDesignerPlay}
            onSaveDesignerPlaybook={saveDesignerPlaybook}
            onSaveGamePlanTacticalOverride={updateGamePlanTacticalOverride}
            onTabChange={setActiveTab}
            onUpdateMatchups={updateGamePlanMatchups}
            onUpdateRotationMinutes={updateRotationMinutes}
            plan={plan}
            variant="ng"
            world={world}
          />
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
