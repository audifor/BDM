import { useMemo, useState, type CSSProperties } from 'react'

import { getUserTeam } from '@/engine/calendar'
import { STAFF_ROLE_LABELS, staffQualityBand, trainingContributionBand } from '@/ui/staffPresentation'
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
import type { GameWorld } from '@/domain/world'

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
  const setTrainingParticipation = useGameStore((state) => state.setTrainingParticipation)
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
            onSetTrainingParticipation={(sessionId, playerId, participation) => setTrainingParticipation({ sessionId, playerId, participation })}
            onScheduleAutomaticWeek={scheduleAutomaticTeamTrainingWeek}
            onScheduleTeamModule={scheduleTeamModuleSession}
            onOpenPlayer={(playerId) => openEntity({ type: 'player', playerId, section: 'overview' })}
            onTabChange={setActiveTab}
            variant="ng"
            world={world}
          />
          <TeamTrainingHistory world={world} teamId={team.id} />
        </ScrollRegion>
      </ApplicationWorkspace>
    </div>
  )
}

function TeamTrainingHistory({ world, teamId }: { readonly world: GameWorld; readonly teamId: import('@/domain/ids').TeamId }) {
  const [visibleCount, setVisibleCount] = useState(40)
  const completed = Object.values(world.scheduledTrainingSessionsById)
    .filter((session) => session.teamId === teamId && session.status === 'completed' && session.execution !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
  return (
    <section className="po-dev-panel" data-ng-region="training-history">
      <header className="po-dev-panel__head"><span className="po-dev-panel__title">Completed sessions</span><span className="po-dev-panel__meta">{completed.length}</span></header>
      {completed.length === 0 ? <p className="po-dev-stat__note">Completed Training sessions will appear here.</p> : (
        <div className="training-history-list">
          {completed.slice(0, visibleCount).map((session) => {
            const execution = session.execution!
            const counts = { FULL: 0, REDUCED: 0, REST: 0 }
            for (const participant of execution.participants) counts[participant.participation] += 1
            const staff = execution.executingStaffPersonIds.map((id) => {
              const person = world.staffPeopleById[id]
              const role = execution.executingStaffRoles.find((item) => item.staffId === id)?.roleId
              return person === undefined ? 'Staff member' : `${person.identity.firstName} ${person.identity.lastName}${role === undefined ? '' : ` · ${STAFF_ROLE_LABELS[role]}`}`
            })
            const planOutcome = Object.values(world.delegationOutcomesById).find((outcome) => outcome.payload.sessionId === session.id && outcome.kind === (session.scope === 'team' ? 'createTeamTrainingPlan' : 'assignIndividualDevelopment'))
            const intensityOutcome = Object.values(world.delegationOutcomesById).find((outcome) => outcome.payload.sessionId === session.id && outcome.kind === 'determineIntensity')
            const stimulusPlayers = execution.participants.filter((participant) => participant.developmentStimulusEventId !== undefined).length
            const plannedIntensity = session.intensity
            const intensityChanged = plannedIntensity !== execution.effectiveIntensity
            const moduleChanged = execution.plannedModuleName !== execution.moduleName
            const qualityBand = trainingContributionBand(execution.executionQualityMultiplier)
            return (
              <details className="training-history-session" key={session.id}>
                <summary>
                  <span><strong>{execution.moduleName}</strong><small>{session.date} · {execution.category}</small></span>
                  <span><small>{staff.join(', ') || 'No assigned executor'}</small><small>FULL {counts.FULL} · REDUCED {counts.REDUCED} · REST {counts.REST}</small></span>
                  <span><small>{qualityBand} execution</small><small>{execution.participants.reduce((total, participant) => total + participant.injuryIds.length, 0)} injuries</small></span>
                </summary>
                <div className="training-history-impact">
                  <p><strong>Planned</strong> {execution.plannedModuleName} · {plannedIntensity} intensity</p>
                  <p><strong>Effective</strong> {execution.moduleName} · {execution.effectiveIntensity} intensity{moduleChanged || intensityChanged ? ' · changed from plan' : ' · as planned'}</p>
                  {planOutcome ? <p><strong>Plan Staff</strong> {world.staffPeopleById[planOutcome.staffId] ? `${world.staffPeopleById[planOutcome.staffId]!.identity.firstName} ${world.staffPeopleById[planOutcome.staffId]!.identity.lastName}` : 'Staff member'} · {planOutcome.staffRoleIdAtDecision ? STAFF_ROLE_LABELS[planOutcome.staffRoleIdAtDecision] : 'role not recorded'} · {staffQualityBand(planOutcome.qualityScore)}{planOutcome.staffWasOverloadedAtDecision ? ' · high workload' : ''}</p> : null}
                  {intensityOutcome ? <p><strong>Intensity advice</strong> {intensityOutcome.staffRoleIdAtDecision ? STAFF_ROLE_LABELS[intensityOutcome.staffRoleIdAtDecision] : 'Staff'} · {intensityOutcome.staffWasOverloadedAtDecision ? 'high workload' : 'workload within capacity'}</p> : null}
                  <p><strong>Consequence</strong> {stimulusPlayers} player{stimulusPlayers === 1 ? '' : 's'} received a development stimulus; {execution.participants.filter((participant) => participant.participation !== 'REST').length} took part.</p>
                </div>
                <ul>{execution.participants.map((participant) => {
                  const player = world.players[participant.playerId]
                  const name = player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`
                  const stimulus = participant.developmentStimulusEventId === undefined ? undefined : world.developmentStimulusEventsById[participant.developmentStimulusEventId]
                  const injuries = participant.injuryIds.map((id) => world.injuriesById[id]?.kind ?? String(id)).join(', ') || 'none'
                  return <li key={participant.playerId}><span>{name} · {participant.participation}</span><span>{stimulus === undefined ? 'No development stimulus' : 'Development stimulus recorded'} · {injuries === 'none' ? 'no injury' : `injury: ${injuries}`}</span></li>
                })}</ul>
              </details>
            )
          })}
        </div>
      )}
      {completed.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + 40)}>Show 40 older sessions</button>}
    </section>
  )
}
