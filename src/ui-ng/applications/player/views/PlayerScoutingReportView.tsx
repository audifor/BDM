import { useMemo, useState } from 'react'

import {
  ArchetypePanel,
  KnowledgeAreasPanel,
  ObservedGamesPanel,
  PersonalityPanel,
  PotentialAssessmentPanel,
  ProjectedRolesPanel,
  ScoutConsensusPanel,
  ScoutNotesPanel,
  ScoutedAttributePanel,
  ScoutingActionsPanel,
  ScoutingStatusPanel,
  TeamFitPanel,
} from '@/ui-ng/applications/player/components/ScoutingBoardPanels'
import { buildPlayerScoutingModel } from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'
import { getAddressableScoutingPlayerIds } from '@/app/scouting'
import { ScoutingModalFrame, RequestScoutingModal } from '@/ui-ng/applications/scouting/ScoutingModals'
import { ReportDetailModal } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import type { ScoutingMission, ScoutingPriority } from '@/domain/scouting'

/**
 * PLAYER · SCOUTING REPORT — the reference's four bands: what the club knows, what it believes, how
 * much it trusts that, and what it has actually watched.
 *
 * Every reading here is knowledge, not truth: ranges instead of values, a knowledge state beside each
 * one, and an explicit `unknown` wherever the save holds nothing. Hidden ceilings are never shown.
 */
export function PlayerScoutingReportView() {
  const { model, playerId } = usePlayerWorkspace()
  const world = useGameStore((state) => state.world)
  const submitScouting = useGameStore((state) => state.requestScoutingAssignment)
  const updatePriority = useGameStore((state) => state.updateScoutingAssignmentPriority)
  const cancelAssignment = useGameStore((state) => state.cancelScoutingAssignment)
  const [actionModal, setActionModal] = useState<'request' | 'cancel' | null>(null)
  const [requestMission, setRequestMission] = useState<ScoutingMission>('QUICK_LOOK')
  const [reportModalId, setReportModalId] = useState<string | null>(null)

  const scouting = useMemo(
    () => (world === null || playerId === null ? null : buildPlayerScoutingModel(world, playerId)),
    [world, playerId],
  )

  if (model === null || scouting === null) return null

  const team = world === null ? undefined : getUserTeam(world)
  const assignment = world === null || team === undefined || playerId === null ? undefined : Object.values(world.scoutingAssignmentsById)
    .filter((item) => item.organizationId === team.organizationId && item.subjectPlayerId === playerId && (item.status === 'ACTIVE' || item.status === 'QUEUED'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const latestReport = world === null || team === undefined || playerId === null ? undefined : Object.values(world.evaluatorReportsById)
    .filter((item) => item.organizationId === team.organizationId && item.subjectPlayerId === playerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const nextGame = world === null || playerId === null ? undefined : (() => {
    const playerTeam = Object.values(world.teams).find((entry) => entry.rosterPlayerIds.includes(playerId))
    return playerTeam === undefined ? undefined : Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date > world.currentDate && (game.homeTeamId === playerTeam.id || game.awayTeamId === playerTeam.id)).sort((a, b) => a.date.localeCompare(b.date))[0]
  })()
  const addressable = world !== null && team !== undefined && playerId !== null && getAddressableScoutingPlayerIds(world, team.id).includes(playerId)
  const priorityOrder: readonly ScoutingPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
  const canIncrease = assignment !== undefined && assignment.priority !== 'URGENT'
  const canRequest = assignment === undefined && addressable
  const openRequest = (mission: ScoutingMission) => { setRequestMission(mission); setActionModal('request') }
  const onScoutingAction = (id: string) => {
    if (id === 'detailed-report' && latestReport !== undefined) setReportModalId(latestReport.id)
    if (id === 'assign-scout' && canRequest) openRequest('QUICK_LOOK')
    if (id === 'request-report' && canRequest) openRequest(scouting.statusPanel?.knownDimensionCount === 0 ? 'QUICK_LOOK' : 'FULL_REPORT')
    if (id === 'watch-next-game' && canRequest && nextGame !== undefined) openRequest('LIVE_GAME')
    if (id === 'increase-priority' && assignment !== undefined && canIncrease) updatePriority(assignment.id, priorityOrder[Math.min(priorityOrder.length - 1, priorityOrder.indexOf(assignment.priority) + 1)]!)
    if (id === 'end-scouting' && assignment !== undefined) setActionModal('cancel')
  }

  if (scouting.status === 'unavailable' && scouting.statusPanel === null) {
    return (
      <div className="po-sc-board" data-ng-region="player-scouting">
        <section className="po-sc-panel po-sc-empty-panel">
          <p className="po-sc-empty">{scouting.unavailableLabel}</p>
        </section>
      </div>
    )
  }

  const notesGap = scouting.gaps.find((gap) => gap.id === 'scout-notes')
  const gameNotesGap = scouting.gaps.find((gap) => gap.id === 'game-notes')

  return (
    <div className="po-sc-board" data-ng-region="player-scouting">
      {/* Band 1 — status, then the six knowledge areas. */}
      <div className="po-sc-band po-sc-band--status">
        {scouting.statusPanel !== null && <ScoutingStatusPanel status={scouting.statusPanel} />}
        <KnowledgeAreasPanel areas={scouting.knowledgeAreas} />
      </div>

      {/* Band 2 — the scouted profile, the consensus, the archetype and the actions. */}
      <div className="po-sc-band po-sc-band--profile">
        <ScoutedAttributePanel rows={scouting.attributes} />
        <ScoutConsensusPanel
          note={scouting.consensusNote}
          rows={scouting.consensus}
          summary={scouting.consensusSummary}
        />
        <ArchetypePanel
          roleTitle={scouting.archetypeRoleTitle}
          strengths={scouting.strengths}
          tags={scouting.archetypeTags}
          title={scouting.archetypeTitle}
          weaknesses={scouting.weaknesses}
        />
        <ScoutingActionsPanel
          note={assignment === undefined ? 'No active assignment.' : `${assignment.missionType.replaceAll('_', ' ')} · ${assignment.status.toLowerCase()} · ${assignment.priority.toLowerCase()} priority.`}
          onAction={onScoutingAction}
          disabled={{ 'detailed-report': latestReport === undefined, 'assign-scout': !canRequest, 'request-report': !canRequest, 'watch-next-game': !canRequest || nextGame === undefined, 'increase-priority': !canIncrease, 'end-scouting': assignment === undefined }}
          titles={{ 'detailed-report': latestReport === undefined ? 'No completed report exists.' : 'Open the latest report.', 'assign-scout': !canRequest ? 'An assignment is active or this Player is not addressable.' : 'Choose mission, Scout and priority.', 'request-report': !canRequest ? 'An assignment is active or this Player is not addressable.' : 'Configure a scouting report.', 'watch-next-game': nextGame === undefined ? 'No upcoming game involves this Player.' : 'Request a Live Game observation.', 'increase-priority': !canIncrease ? 'No active assignment, or already urgent.' : 'Increase to the next priority.', 'end-scouting': assignment === undefined ? 'No active assignment.' : 'Cancel the active assignment.' }}
        />
      </div>

      {/* Band 3 — projection, potential, character and fit. */}
      <div className="po-sc-band po-sc-band--projection">
        <ProjectedRolesPanel note={scouting.projectedRolesNote} roles={scouting.projectedRoles} />
        <PotentialAssessmentPanel
          note={scouting.potentialNote}
          outcomes={scouting.potentialOutcomes}
        />
        <PersonalityPanel note={scouting.personalityNote} rows={scouting.personalityTraits} />
        <TeamFitPanel
          note={scouting.teamFitNote}
          overallLabel={scouting.overallFitLabel}
          rows={scouting.teamFit}
        />
      </div>

      {/* Band 4 — what has actually been watched, and the filing timeline. */}
      <div className="po-sc-band po-sc-band--games">
        <ObservedGamesPanel
          games={scouting.observedGames}
          notesReason={gameNotesGap?.reason ?? 'No per-game note is stored.'}
        />
        <ScoutNotesPanel
          notes={scouting.consensusNote}
          onEmpty={notesGap?.reason ?? 'No report has been filed for this player.'}
          timeline={scouting.noteTimeline}
        />
      </div>
      {world !== null && team !== undefined && playerId !== null && actionModal === 'request' ? <RequestScoutingModal world={world} teamId={team.id} playerId={playerId} initialMission={requestMission} initialGameId={requestMission === 'LIVE_GAME' ? nextGame?.id : undefined} onClose={() => setActionModal(null)} onSubmit={submitScouting} /> : null}
      {world !== null && reportModalId !== null ? <ReportDetailModal world={world} reportId={reportModalId} onClose={() => setReportModalId(null)} /> : null}
      {actionModal === 'cancel' && assignment !== undefined ? <ScoutingModalFrame title="Cancel scouting assignment?" onClose={() => setActionModal(null)} footer={<><button className="ng-btn ng-btn--ghost" onClick={() => setActionModal(null)} type="button">Keep assignment</button><button className="ng-btn ng-btn--danger" onClick={() => { cancelAssignment(assignment.id); setActionModal(null) }} type="button">Cancel assignment</button></>}><p>{model.identity.firstName} {model.identity.lastName} · {assignment.missionType.replaceAll('_', ' ')} · {world?.staffPeopleById[assignment.evaluatorStaffId]?.identity.lastName ?? 'Unknown Scout'}</p><p>History and existing knowledge are preserved.</p></ScoutingModalFrame> : null}
    </div>
  )
}
