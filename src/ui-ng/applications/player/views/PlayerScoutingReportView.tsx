import { useMemo, useState } from 'react'
import { ScoutingCourtsideBoard } from '@/ui-ng/applications/player/components/ScoutingCourtsideBoard'
import { buildPlayerScoutingModel } from '@/ui-ng/applications/player/data/buildPlayerScoutingModel'
import { usePlayerWorkspace } from '@/ui-ng/applications/player/context/PlayerWorkspaceContext'
import { useGameStore } from '@/stores/gameStore'
import { getUserTeam } from '@/engine/calendar'
import { getAddressableScoutingPlayerIds, getAvailableScoutingEvaluators } from '@/app/scouting'
import { useNgWorkspaceNavigation } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { ScoutingModalFrame, RequestScoutingModal } from '@/ui-ng/applications/scouting/ScoutingModals'
import { ReportDetailModal } from '@/ui-ng/applications/scouting/ScoutingWorkspace'
import type { ScoutingMission, ScoutingPriority } from '@/domain/scouting'

/** PLAYER SCOUTING V3: actionable reports and evidence, never unscouted Player Truth. */
export function PlayerScoutingReportView() {
  const { model, playerId, session } = usePlayerWorkspace()
  const { setActiveApp } = useNgWorkspaceNavigation()
  const world = useGameStore(state => state.world)
  const submitScouting = useGameStore(state => state.requestScoutingAssignment)
  const updatePriority = useGameStore(state => state.updateScoutingAssignmentPriority)
  const cancelAssignment = useGameStore(state => state.cancelScoutingAssignment)
  const [actionModal, setActionModal] = useState<'request' | 'cancel' | null>(null)
  const [requestMission, setRequestMission] = useState<ScoutingMission>('QUICK_LOOK')
  const [reportModalId, setReportModalId] = useState<string | null>(null)

  const scouting = useMemo(
    () => world === null || playerId === null ? null : buildPlayerScoutingModel(world, playerId),
    [world, playerId],
  )
  if (world === null || model === null || scouting === null || playerId === null) return null

  const team = getUserTeam(world)
  const assignment = team === undefined ? undefined : Object.values(world.scoutingAssignmentsById)
    .filter(item => item.organizationId === team.organizationId && item.subjectPlayerId === playerId &&
      (item.status === 'ACTIVE' || item.status === 'QUEUED'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const latestReport = team === undefined ? undefined : Object.values(world.evaluatorReportsById)
    .filter(item => item.organizationId === team.organizationId && item.subjectPlayerId === playerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const nextGame = (() => {
    const rosterTeam = Object.values(world.teams).find(entry => entry.rosterPlayerIds.includes(playerId))
    return rosterTeam === undefined ? undefined :
      Object.values(world.games).filter(game => game.status === 'scheduled' && game.date > world.currentDate &&
        (game.homeTeamId === rosterTeam.id || game.awayTeamId === rosterTeam.id))
        .sort((a, b) => a.date.localeCompare(b.date))[0]
  })()
  const addressable = team !== undefined && getAddressableScoutingPlayerIds(world, team.id).includes(playerId)
  const scoutCapacity = team !== undefined && (['QUICK_LOOK', 'FULL_REPORT', 'SKILL_EVALUATION'] as const)
    .some(mission => getAvailableScoutingEvaluators(world, team.id, mission).length > 0)
  const priorityOrder: readonly ScoutingPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
  const canIncrease = assignment !== undefined && assignment.priority !== 'URGENT'
  const requestReason = assignment !== undefined
    ? 'Existing assignment is ' + assignment.status.toLowerCase() + '. Review or change it before requesting another.'
    : !addressable
      ? 'Player is not yet addressable by your scouting organization. Explore competition or country coverage.'
      : !scoutCapacity
        ? 'No eligible scout with capacity is available. Review assignments and workload.'
        : null
  const openRequest = (mission: ScoutingMission) => {setRequestMission(mission);setActionModal('request')}
  const onAction = (id: 'assign-scout' | 'request-report' | 'watch-next-game' |
    'increase-priority' | 'end-scouting' | 'detailed-report' | 'contract-route' | 'development-route') => {
    if (id === 'detailed-report' && latestReport !== undefined) setReportModalId(latestReport.id)
    if (id === 'assign-scout' && requestReason === null) openRequest('QUICK_LOOK')
    if (id === 'request-report' && requestReason === null) openRequest(scouting.statusPanel?.knownDimensionCount === 0 ? 'QUICK_LOOK' : 'FULL_REPORT')
    if (id === 'watch-next-game' && requestReason === null && nextGame !== undefined) openRequest('LIVE_GAME')
    if (id === 'increase-priority' && assignment !== undefined && canIncrease) {
      updatePriority(assignment.id, priorityOrder[Math.min(priorityOrder.length-1,priorityOrder.indexOf(assignment.priority)+1)]!)
    }
    if (id === 'end-scouting' && assignment !== undefined) setActionModal('cancel')
    if (id === 'contract-route') session.setActiveView('contract')
    if (id === 'development-route') session.setActiveView('development')
  }

  return <>
    <ScoutingCourtsideBoard
      world={world} model={model} scouting={scouting}
      assignmentSummary={assignment === undefined ? null :
        `${assignment.missionType.replaceAll('_',' ')} · ${assignment.status} · ${assignment.priority} priority`}
      nextGameLabel={nextGame?.date ?? null}
      requestReason={requestReason}
      canIncrease={canIncrease}
      canCancel={assignment !== undefined}
      hasReport={latestReport !== undefined}
      onAction={onAction}
      onOpenScoutingCentre={()=>setActiveApp('scouting')}
    />
    {team !== undefined && actionModal === 'request' && <RequestScoutingModal
      world={world} teamId={team.id} playerId={playerId} initialMission={requestMission}
      initialGameId={requestMission==='LIVE_GAME'?nextGame?.id:undefined}
      onClose={()=>setActionModal(null)} onSubmit={submitScouting}/>}
    {reportModalId !== null && <ReportDetailModal
      world={world} reportId={reportModalId} onClose={()=>setReportModalId(null)}/>}
    {actionModal === 'cancel' && assignment !== undefined &&
      <ScoutingModalFrame title="Cancel scouting assignment?" onClose={()=>setActionModal(null)}
        footer={<><button className="ng-btn ng-btn--ghost" type="button" onClick={()=>setActionModal(null)}>
          Keep assignment</button><button className="ng-btn ng-btn--danger" type="button"
          onClick={()=>{cancelAssignment(assignment.id);setActionModal(null)}}>Cancel assignment</button></>}>
        <p>{model.identity.firstName} {model.identity.lastName} · {assignment.missionType.replaceAll('_',' ')} ·
          {world.staffPeopleById[assignment.evaluatorStaffId]?.identity.lastName ?? 'Unknown scout'}</p>
        <p>Recorded scouting knowledge and filed reports remain available.</p>
      </ScoutingModalFrame>}
  </>
}
