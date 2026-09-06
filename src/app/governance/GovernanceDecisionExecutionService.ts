import { fireCoachFromTeam } from '@/app/coachCareer/CoachCareerService'
import { createGovernanceDecisionEvent, deriveGovernanceDecisionStatus, resolveGovernanceDecisionEventAuthorityGrantIds, resolveGovernanceDecisionRights, validateGovernanceDecisionLifecycle } from '@/domain/governance'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { updateGameWorld } from '@/domain/world'

export interface GovernanceDecisionExecutionResult {
  readonly world: GameWorld
  readonly decisionId: string
  readonly executionEventId: string
  readonly decisionType: 'COACH_FIRING'
  readonly executorBodyId: string
  readonly effectiveOn: GameDate
  readonly coachId: string
  readonly teamId: string
}

/** Application orchestration: canonical Coach Career firing followed by immutable governance history. */
export function executeGovernanceCoachFiringDecision(world: GameWorld, input: { readonly decisionId: string; readonly executorBodyId: string; readonly effectiveOn: GameDate }): GovernanceDecisionExecutionResult {
  if (input.effectiveOn !== world.currentDate) throw new Error('Governance execution must use the current world date')
  const decision = world.governanceDecisionsById[input.decisionId]
  if (decision === undefined || decision.decisionType !== 'COACH_FIRING' || decision.subject.kind !== 'COACH') throw new Error('Decision is not an executable coach firing')
  const coachId = decision.subject.coachId
  const institution = world.governanceInstitutionsById[decision.institutionId]
  const coach = Object.values(world.coaches).find((candidate) => candidate.id === coachId)
  if (institution === undefined || coach === undefined) throw new Error('Decision target is missing')
  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id)
  if (events.some((event) => event.kind === 'EXECUTED')) throw new Error('Decision already executed')
  validateGovernanceDecisionLifecycle(events)
  const bodies = Object.values(world.governanceBodiesById), grants = Object.values(world.governanceAuthorityGrantsById), participations = Object.values(world.governanceDecisionParticipationGrantsById)
  const proposalRights = resolveGovernanceDecisionRights({ decisionType: decision.decisionType, institutionId: decision.institutionId, asOfDate: decision.proposedOn, bodies, authorityGrants: grants, participationGrants: participations })
  const approvals = new Set(events.filter((event) => event.kind === 'APPROVED').map((event) => event.bodyId))
  const status = deriveGovernanceDecisionStatus(events, proposalRights.approverBodyIds)
  if (status === 'REJECTED' || status === 'VETOED' || status === 'WITHDRAWN') throw new Error('Decision is terminal')
  if (proposalRights.approverBodyIds.some((bodyId) => !approvals.has(bodyId))) throw new Error('Decision lacks required approvals')
  const employment = world.coachEmploymentByCoachId[coach.id]
  if (employment?.status !== 'employed' || employment.teamId === undefined || !institution.teamIds.includes(employment.teamId)) throw new Error('Coach is not employed by a governed team')
  const team = world.teams[employment.teamId]
  if (team?.coachId !== coach.id) throw new Error('Coach assignment is not canonical')
  const authorityGrantIds = resolveGovernanceDecisionEventAuthorityGrantIds({ event: { kind: 'EXECUTED', bodyId: input.executorBodyId, effectiveOn: input.effectiveOn }, decisionType: decision.decisionType, institutionId: decision.institutionId, bodies, authorityGrants: grants, participationGrants: participations })
  if (authorityGrantIds.length === 0) throw new Error('Executor evidence is missing')
  const eventId = `governance-decision-executed:${decision.id}:${input.effectiveOn}`
  if (world.governanceDecisionEventsById[eventId] !== undefined) throw new Error('Execution event already exists')
  const fired = fireCoachFromTeam(world, employment.teamId)
  const execution = createGovernanceDecisionEvent({ id: eventId, decisionId: decision.id, kind: 'EXECUTED', bodyId: input.executorBodyId, effectiveOn: input.effectiveOn, authorityGrantIds })
  const updated = updateGameWorld(fired, { governanceDecisionEvents: [...Object.values(fired.governanceDecisionEventsById), execution] })
  return { world: updated, decisionId: decision.id, executionEventId: eventId, decisionType: 'COACH_FIRING', executorBodyId: input.executorBodyId, effectiveOn: input.effectiveOn, coachId: coach.id, teamId: employment.teamId }
}
