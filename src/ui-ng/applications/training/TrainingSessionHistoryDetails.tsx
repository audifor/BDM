import type { GameWorld } from '@/domain/world'
import type { ScheduledTrainingSession } from '@/domain/training'
import type { StaffPersonId } from '@/domain/ids'
import { STAFF_ROLE_LABELS, staffQualityBand, trainingContributionBand } from '@/ui/staffPresentation'

export function TrainingSessionHistoryDetails({ world, session }: { readonly world: GameWorld; readonly session: ScheduledTrainingSession }) {
  const execution = session.execution
  const planOutcome = Object.values(world.delegationOutcomesById).find((outcome) =>
    outcome.payload.sessionId === session.id && outcome.kind === (session.scope === 'team' ? 'createTeamTrainingPlan' : 'assignIndividualDevelopment'),
  )
  const intensityOutcome = Object.values(world.delegationOutcomesById).find((outcome) => outcome.payload.sessionId === session.id && outcome.kind === 'determineIntensity')

  if (execution === undefined) return <p>Historical Training session; detailed execution evidence is unavailable in this save.</p>

  const moduleChanged = execution.moduleName !== execution.plannedModuleName
  const intensityChanged = execution.effectiveIntensity !== session.intensity
  const stimulatedPlayers = execution.participants.filter((participant) => participant.developmentStimulusEventId !== undefined).length
  return (
    <div className="training-history-impact">
      <p><strong>Planned</strong> {execution.plannedModuleName}{' \u00B7 '}{session.intensity} intensity</p>
      <p><strong>Effective</strong> {execution.moduleName}{' \u00B7 '}{execution.effectiveIntensity} intensity{moduleChanged || intensityChanged ? ' \u00B7 changed from plan' : ' \u00B7 as planned'}</p>
      {planOutcome !== undefined && <p><strong>Plan Staff</strong> {staffName(world, planOutcome.staffId)}{' \u00B7 '}{planOutcome.staffRoleIdAtDecision ? STAFF_ROLE_LABELS[planOutcome.staffRoleIdAtDecision] : 'role not recorded'}{' \u00B7 '}{staffQualityBand(planOutcome.qualityScore)}{planOutcome.staffWasOverloadedAtDecision ? ' \u00B7 high workload' : ''}</p>}
      {intensityOutcome !== undefined && <p><strong>Intensity advice</strong> {intensityOutcome.staffRoleIdAtDecision ? STAFF_ROLE_LABELS[intensityOutcome.staffRoleIdAtDecision] : 'Staff'}{' \u00B7 '}{intensityOutcome.staffWasOverloadedAtDecision ? 'high workload' : 'workload within capacity'}</p>}
      <p><strong>Executor</strong> {execution.executingStaffPersonIds.map((staffId) => {
        const roleId = execution.executingStaffRoles.find((item) => item.staffId === staffId)?.roleId
        return `${staffName(world, staffId)}${roleId === undefined ? '' : ` \u00B7 ${STAFF_ROLE_LABELS[roleId]}`}`
      }).join(', ') || 'No assigned executor'}{' \u00B7 '}{trainingContributionBand(execution.executionQualityMultiplier)} quality</p>
      <p><strong>Result</strong> {execution.participants.length} players{' \u00B7 '}{stimulatedPlayers} development stimuli{' \u00B7 '}{execution.participants.reduce((total, participant) => total + participant.injuryIds.length, 0)} injuries</p>
      <ul>{execution.participants.map((participant) => {
        const player = world.players[participant.playerId]
        const stimulus = participant.developmentStimulusEventId === undefined ? undefined : world.developmentStimulusEventsById[participant.developmentStimulusEventId]
        const injuries = participant.injuryIds.map((id) => world.injuriesById[id]?.kind ?? String(id))
        return <li key={participant.playerId}>{player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`}{' \u00B7 '}{participant.participation}{' \u00B7 '}fatigue {participant.careerFatigueDelta > 0 ? '+' : ''}{participant.careerFatigueDelta}{' \u00B7 '}{stimulus === undefined ? 'no development stimulus' : 'development stimulus recorded'}{' \u00B7 '}{injuries.length === 0 ? 'no injury' : `injury: ${injuries.join(', ')}`}</li>
      })}</ul>
    </div>
  )
}

function staffName(world: GameWorld, staffId: StaffPersonId): string {
  const person = world.staffPeopleById[staffId]
  return person === undefined ? 'Staff member' : `${person.identity.firstName} ${person.identity.lastName}`
}
