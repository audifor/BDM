import { useMemo } from 'react'
import { getUserTeam } from '@/engine/calendar'
import type { PlayerId } from '@/domain/ids'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'
import { resolveGameCapabilities } from '@/ui/gameContext'
import { useGameStore } from '@/stores/gameStore'
import { NgHoloShell } from '@/ui-ng/workspace/NgHoloShell'
import { navigateToPlayer, navigateToTalentApp, navigateToTalentDestination } from '@/ui-ng/workspace/workspaceApps'
import { TalentOperationsNav } from './TalentOperationsNav'
import { buildTalentAttentionItems, buildTalentDeadlineItems } from './TalentAttentionProjection'

export function TalentOperationsWorkspace() {
  const world = useGameStore((state) => state.world)
  const model = useMemo(() => {
    if (world === null) return null
    const team = getUserTeam(world)
    const organizationId = team?.organizationId
    const collegeCompetition = team === undefined ? undefined : Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id) && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
    const recruitingCycle = Object.values(world.recruitingCyclesById).find((item) => item.sourceSeasonId === world.currentSeasonId && item.ecosystemId === collegeCompetition?.ecosystemId && item.status === 'open')
    const assignments = organizationId === undefined ? [] : Object.values(world.scoutingAssignmentsById).filter((item) => item.organizationId === organizationId && ['ACTIVE', 'QUEUED'].includes(item.status))
    const discovered = organizationId === undefined ? [] : Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId).sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt)).filter((item) => getPlayerKnowledgeSummary(world, organizationId, item.playerId).knownDomains.length === 0).slice(0, 5)
    const board = team === undefined ? [] : world.recruitingBoards.filter((item) => item.programTeamId === team.id)
    const portal = collegeCompetition === undefined ? [] : Object.values(world.transferPortalEntriesById).filter((entry) => entry.ecosystemId === collegeCompetition.ecosystemId && entry.status === 'authorized')
    const draft = Object.values(world.draftsById).filter((item) => item.status === 'scheduled' || item.status === 'inProgress').sort((a, b) => a.scheduledOn.localeCompare(b.scheduledOn))[0]
    const deadlines = buildTalentDeadlineItems(world)
    const attention = buildTalentAttentionItems(world)
    return { team, assignments, discovered, board, portal, draft, deadlines, attention, isNcaa: collegeCompetition !== undefined, capabilities: resolveGameCapabilities(world) }
  }, [world])

  if (world === null || model === null) return <NgHoloShell appLabel="Talent Operations" empty emptyMessage="No career loaded." region="talent-operations-workspace" />

  const playerName = (playerId: string) => {
    const player = world.players[playerId as keyof typeof world.players]
    return player === undefined ? 'Player record unavailable' : `${player.firstName} ${player.lastName}`
  }
  const playerLink = (playerId: PlayerId) => <button className="ng-canon__link" onClick={() => navigateToPlayer(playerId)} type="button">{playerName(playerId)}</button>
  const activeDraftEntries = model.draft?.entries?.filter((entry) => entry.status === 'declaredEarlyEntry' || entry.status === 'finalPool').length ?? 0

  return (
    <NgHoloShell appLabel="Talent Operations" meta={model.team?.name ?? 'Talent pathways'} region="talent-operations-workspace" title="Operations overview">
      <TalentOperationsNav current="talent" />
      <div className="ng-canon__content talent-operations-overview">
        <section aria-label="Players requiring attention" className="ng-canon__panel ng-holo-panel">
          <h2 className="ng-canon__title">Priority actions</h2>
          <p>{model.board.length} recruiting targets · {model.capabilities.hasDraft ? `${activeDraftEntries} Draft decisions · ` : ''}{model.portal.length} authorized Portal entries</p>
          <div className="talent-operations-overview__actions">
            {model.isNcaa ? <button className="ng-canon__action" onClick={() => navigateToTalentApp('recruiting')} type="button">Review recruiting decisions</button> : null}
            {model.isNcaa ? <button className="ng-canon__action" onClick={() => navigateToTalentApp('portal')} type="button">Review Transfer Portal</button> : null}
            {model.capabilities.hasDraft ? <button className="ng-canon__action" onClick={() => navigateToTalentApp('draft')} type="button">Review Draft decisions</button> : null}
          </div>
          {model.attention.length === 0 ? <p className="ng-canon__empty">No new talent attention items.</p> : <ul>{model.attention.slice(0, 8).map((item) => <li key={item.id}><button className="ng-canon__link" onClick={() => navigateToTalentDestination(item.destination)} type="button">{item.title}: {playerName(item.playerId)}</button> · {item.explanation}{item.deadline ? ` · due ${item.deadline}` : ''}</li>)}</ul>}
        </section>
        <section aria-label="Scouting in progress" className="ng-canon__panel ng-holo-panel">
          <h2 className="ng-canon__title">Scouting missions in progress</h2>
          {model.assignments.length === 0 ? <p className="ng-canon__empty">No active or queued Scouting assignments.</p> : <ul>{model.assignments.slice(0, 5).map((assignment) => <li key={assignment.id}>{playerLink(assignment.subjectPlayerId)} · {assignment.missionType.replaceAll('_', ' ')} · {assignment.status}{assignment.expectedCompletionAt ? ` · expected ${assignment.expectedCompletionAt}` : ''}</li>)}</ul>}
          <button className="ng-canon__action" onClick={() => navigateToTalentApp('scouting')} type="button">Open Scouting</button>
        </section>
        <section aria-label="Upcoming talent deadlines" className="ng-canon__panel ng-holo-panel">
          <h2 className="ng-canon__title">Upcoming decisions and deadlines</h2>
          {model.deadlines.length === 0 ? <p className="ng-canon__empty">No configured talent deadlines are near.</p> : <ul>{model.deadlines.slice(0, 6).map((deadline) => <li key={deadline.id}>{deadline.date} · {deadline.meaning} · {deadline.urgency}. {deadline.consequence} <button className="ng-canon__link" onClick={() => deadline.playerId ? navigateToTalentDestination({ app: deadline.destination.app, playerId: deadline.playerId, ...(deadline.destination.focusPlayerId ? { focusPlayerId: deadline.destination.focusPlayerId } : {}) }) : navigateToTalentApp(deadline.destination.app)} type="button">Open {deadline.destination.app}</button></li>)}</ul>}
        </section>
        <section aria-label="Recently discovered players" className="ng-canon__panel ng-holo-panel">
          <h2 className="ng-canon__title">Newly discovered Players</h2>
          {model.discovered.length === 0 ? <p className="ng-canon__empty">No Players have been discovered by this organization yet.</p> : <ul>{model.discovered.map((item) => <li key={item.id}>{playerLink(item.playerId)} · discovered {item.discoveredAt} · not a completed Scouting report</li>)}</ul>}
          <button className="ng-canon__action" onClick={() => navigateToTalentApp('scouting')} type="button">Review known Players</button>
        </section>
        <section aria-label="Upcoming Draft" className="ng-canon__panel ng-holo-panel">
          <h2 className="ng-canon__title">Draft pathway</h2>
          {model.draft === undefined ? <p className="ng-canon__empty">No scheduled or active Draft decision.</p> : <p>{world.seasons[model.draft.sourceSeasonId]?.label ?? model.draft.sourceSeasonId} Draft · {model.draft.status} · scheduled {model.draft.scheduledOn}{model.draft.rules.earlyEntryDeadline ? ` · declaration deadline ${model.draft.rules.earlyEntryDeadline}` : ''}</p>}
          {model.capabilities.hasDraft ? <button className="ng-canon__action" onClick={() => navigateToTalentApp('draft')} type="button">Open Draft</button> : null}
        </section>
      </div>
    </NgHoloShell>
  )
}
