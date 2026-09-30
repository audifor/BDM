import { createContractReviewDecision, contractReviewDecisionIdFor, type ContractReviewIntent } from '@/domain/contract/ContractReviewDecision'
import type { GameDate } from '@/domain/date'
import type { ContractId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessContractReviewOutlook, contractReviewNeedForContract } from '@/engine/clubNeeds'

export type ContractReviewCommandResult =
  | { readonly ok: true; readonly world: GameWorld }
  | { readonly ok: false; readonly reason: 'TEAM_NOT_USER_CONTROLLED' | 'REVIEW_NOT_AVAILABLE' }

export function recordContractReviewDecision(world: GameWorld, input: { readonly teamId: TeamId; readonly contractId: ContractId; readonly intent: ContractReviewIntent }): ContractReviewCommandResult {
  const team = world.teams[input.teamId]
  if (team?.coachId === undefined || team.coachId !== world.userCoachId) return { ok: false, reason: 'TEAM_NOT_USER_CONTROLLED' }
  const need = contractReviewNeedForContract(world, team.id, input.contractId)
  if (need === undefined) return { ok: false, reason: 'REVIEW_NOT_AVAILABLE' }
  const contract = world.contractsById[input.contractId]!
  const id = contractReviewDecisionIdFor(team.id, contract.playerId, contract.id)
  const decision = createContractReviewDecision({
    id, teamId: team.id, playerId: contract.playerId, contractId: contract.id, intent: input.intent,
    decidedOn: world.currentDate, decidedByCoachId: world.userCoachId,
    ...(input.intent === 'DEFER' ? { reviewAgainOn: nextReviewDate(world, team.id, contract.term.expiresOn, world.currentDate) } : {}),
  })
  const decisions = [...Object.values(world.contractReviewDecisionsById).filter((item) => item.id !== id), decision]
  const next = updateGameWorld(world, { contractReviewDecisions: decisions })
  // Re-assess through the same projection as the read path so stale/unsupported writes fail closed.
  const saved = assessContractReviewOutlook(next, team.id).reviews.find((review) => review.id === id)
  return saved === undefined ? { ok: false, reason: 'REVIEW_NOT_AVAILABLE' } : { ok: true, world: next }
}

function nextReviewDate(world: GameWorld, teamId: TeamId, expiresOn: GameDate, after: GameDate): GameDate {
  const nextSeasonCheckpoint = Object.values(world.seasons).flatMap((season) => {
    if (!(season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId)) return []
    return [season.startDate, season.endDate].filter((date) => date > after && date <= expiresOn)
  }).sort((left, right) => left.localeCompare(right))[0]
  return nextSeasonCheckpoint ?? expiresOn
}
