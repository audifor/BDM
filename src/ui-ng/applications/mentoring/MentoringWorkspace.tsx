import { useMemo, type CSSProperties } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { MentoringPcbPage } from '@/ui/pcb-migrated/plantilla/PlantillaPcbPage'
import { deriveTeamColors } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  buildRosterWorkspaceContext,
  rosterTeamForWorld,
} from '@/ui-ng/applications/roster/buildRosterWorkspaceContext'
import { ApplicationWorkspace } from '@/ui-ng/workspace/ApplicationWorkspace'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScrollRegion } from '@/ui-ng/workspace/ScrollRegion'

import './mentoring-workspace.css'

function MentoringWorkspaceHeader({
  teamName,
  competitionLabel,
  seasonLabel,
}: {
  readonly teamName: string
  readonly competitionLabel: string | null
  readonly seasonLabel: string | null
}) {
  return (
    <header className="mentoring-workspace-header" data-ng-region="mentoring-workspace-header">
      <div className="mentoring-workspace-header__main">
        <span className="mentoring-workspace-header__app">Mentoring</span>
        <span className="mentoring-workspace-header__sep" aria-hidden />
        <span className="mentoring-workspace-header__team">{teamName}</span>
        <span className="mentoring-workspace-header__meta">
          {competitionLabel ?? '—'}
          {' · '}
          {seasonLabel ?? '—'}
        </span>
      </div>
    </header>
  )
}

export function MentoringWorkspace() {
  const world = useGameStore((state) => state.world)
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

  if (world === null || context === null || team === undefined || getUserTeam(world) === undefined) {
    return (
      <div className="mentoring-workspace mentoring-workspace--empty" data-ng-region="mentoring-workspace">
        <section className="mentoring-workspace__empty-state">
          <h1 className="mentoring-workspace__empty-title">Mentoring</h1>
          <p className="mentoring-workspace__empty-message">No team assigned to the user coach.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="mentoring-workspace" data-ng-region="mentoring-workspace" style={teamStyle}>
      <ApplicationWorkspace
        header={
          <MentoringWorkspaceHeader
            competitionLabel={context.competitionLabel}
            seasonLabel={context.seasonLabel}
            teamName={context.teamName}
          />
        }
      >
        <ScrollRegion className="mentoring-workspace__scroll">
          <MentoringPcbPage
            onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            variant="ng"
            world={world}
          />
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}
