import type { ContractId, TeamId } from '@/domain/ids'
import type { RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import type { GameWorld } from '@/domain/world'
import { openRetentionNegotiation, respondToRetentionCounter, submitRetentionOffer, withdrawRetentionNegotiation, type RetentionCommandResult } from '@/engine/contractRetention/ContractRetentionEngine'
import { executeAcceptedRetentionAgreement } from './RetentionSigningService'

export function openUserContractRetention(world: GameWorld, input: { readonly teamId: TeamId; readonly contractId: ContractId; readonly actionId: string }): RetentionCommandResult {
  if (world.teams[input.teamId]?.coachId !== world.userCoachId) return { ok: false, world, reason: 'TEAM_NOT_USER_CONTROLLED' }
  return openRetentionNegotiation(world, input)
}

export function submitUserContractRetentionOffer(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly terms: RetentionTermSet }): RetentionCommandResult {
  if (world.teams[input.teamId]?.coachId !== world.userCoachId) return { ok: false, world, reason: 'TEAM_NOT_USER_CONTROLLED' }
  return submitRetentionOffer(world, input)
}

export function respondUserToContractRetentionCounter(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly expectedRound: number; readonly actionId: string; readonly action: 'ACCEPT_COUNTER' }): RetentionCommandResult {
  if (world.teams[input.teamId]?.coachId !== world.userCoachId) return { ok: false, world, reason: 'TEAM_NOT_USER_CONTROLLED' }
  const accepted = respondToRetentionCounter(world, input)
  if (!accepted.ok || accepted.negotiation.status !== 'ACCEPTED') return accepted
  const signing = executeAcceptedRetentionAgreement(accepted.world, accepted.negotiation.id)
  return signing.world === accepted.world ? accepted : { ...accepted, world: signing.world }
}

export function withdrawUserContractRetention(world: GameWorld, input: { readonly teamId: TeamId; readonly negotiationId: string; readonly actionId: string }): RetentionCommandResult {
  if (world.teams[input.teamId]?.coachId !== world.userCoachId) return { ok: false, world, reason: 'TEAM_NOT_USER_CONTROLLED' }
  return withdrawRetentionNegotiation(world, input)
}
