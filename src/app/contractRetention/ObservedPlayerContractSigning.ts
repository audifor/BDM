import { hasFullSemanticPersonality } from '@/domain/personality'
import type { ContractId, PlayerId } from '@/domain/ids'
import { applyMoraleEventToWorld, type GameWorld } from '@/domain/world'

/** The signed contract is the fact. A pending proposal, a negotiated offer,
 * a Governance approval or a future contract start is NOT an observed signing.
 */
export interface VerifiedPlayerSigning {
  readonly kind: 'RETENTION' | 'FREE_AGENT'
  readonly negotiationId: string
  readonly playerId: PlayerId
  readonly contractId: ContractId
}

/** Publish exactly one PERSON experience for a completed, canonical signing.
 * This is intentionally an opt-in projection for full-50 profiles, not a new
 * negotiation authority. Old eight-dimensional careers are untouched.
 */
export function applyObservedPlayerSigning(world: GameWorld, signing: VerifiedPlayerSigning): GameWorld {
  const contract = world.contractsById[signing.contractId]
  const player = world.players[signing.playerId]
  if (contract === undefined || player === undefined || contract.playerId !== player.id) return world

  const signedOn = signing.kind === 'RETENTION'
    ? (() => {
        const negotiation = world.retentionNegotiationsById[signing.negotiationId]
        return negotiation?.playerId === signing.playerId && negotiation.execution?.status === 'SIGNED'
          && negotiation.execution.contractId === contract.id && contract.predecessorContractId === negotiation.predecessorContractId
          && negotiation.teamId === contract.teamId
          ? negotiation.execution.signedOn : undefined
      })()
    : (() => {
        const negotiation = world.negotiationsById[signing.negotiationId]
        return negotiation?.playerId === signing.playerId && negotiation.status === 'SIGNED'
          && negotiation.signedContractId === contract.id && negotiation.teamId === contract.teamId
          && world.playerTransactionsById[negotiation.signedTransactionId!]?.contractId === contract.id
          ? negotiation.signedOn : undefined
      })()
  if (signedOn === undefined || signedOn > world.currentDate) return world

  const personality = world.personalitiesByPersonId[player.id]
  if (personality === undefined || !hasFullSemanticPersonality(personality)
    || world.moraleByPersonId[player.id] === undefined) return world
  const birth = (player.personId === undefined ? undefined : world.personsById[player.personId]?.dateOfBirth)
    ?? player.bio.dateOfBirth
  if (!birth || birth >= signedOn) return world
  const age = Number(signedOn.slice(0, 4)) - Number(birth.slice(0, 4))
    - (signedOn.slice(5) < birth.slice(5) ? 1 : 0)
  if (age < 18) return world

  return applyMoraleEventToWorld(world, {
    id: `morale:player-contract-signed:${contract.id}`,
    personId: player.id,
    gameDate: signedOn,
    source: 'careerEvent',
    delta: 25,
    context: {
      personalityEventKind: 'NEW_CONTRACT_SIGNED',
      negotiationId: signing.negotiationId,
      contractId: String(contract.id),
      signingKind: signing.kind,
    },
  })
}
