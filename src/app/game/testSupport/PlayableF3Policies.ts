import type { PlayerId } from '@/domain/ids'
import { getFreeAgents } from '@/domain/world'
import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import type { F2DayContext, F2Policy } from './PlayableF2Support'

/**
 * The managed arm of the F3 comparison: one legitimate market operation carried out day by day with the same store actions the
 * Courtside Market screen runs. The manager needs a shooting guard; candidates are tried in id order, and when one declines to talk
 * the next one is contacted (exactly what a user does). Once the player is signed he is placed in the SG starting slot.
 */
export function marketSigningPolicy(position: 'SG' | 'PG' | 'SF' | 'PF' | 'C' = 'SG'): F2Policy & { readonly state: { signedPlayerId?: PlayerId; signedOn?: string; lineupSetOn?: string; declined: PlayerId[] } } {
  const state: { signedPlayerId?: PlayerId; signedOn?: string; lineupSetOn?: string; declined: PlayerId[] } = { declined: [] }
  return {
    id: 'B-market',
    state,
    decide({ world, store, teamId, record, date }: F2DayContext) {
      if (state.signedPlayerId !== undefined) {
        if (state.lineupSetOn === undefined && Object.values(world.teams[teamId]!.rosterPlayerIds).includes(state.signedPlayerId)) {
          store.setLineupSlot('SG', state.signedPlayerId)
          state.lineupSetOn = date
          record('setLineupSlot', `SG <- ${state.signedPlayerId}`)
        }
        return
      }
      const negotiations = Object.values(world.negotiationsById).filter((item) => item.teamId === teamId)
      const active = negotiations.find((item) => !['SIGNED', 'CLOSED', 'REJECTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'].includes(item.status))
      if (active === undefined) {
        const closed = negotiations.filter((item) => item.status === 'CLOSED' || item.status === 'REJECTED')
        for (const item of closed) if (!state.declined.includes(item.playerId)) state.declined.push(item.playerId)
        const candidate = getFreeAgents(world).filter((player) => player.basketball.primaryPosition === position && !state.declined.includes(player.id))
          .map((player) => assessRoutedFreeAgentOfferIntelligence(world, teamId, player.id).find((offer) => offer.playerId === player.id))
          .find((offer) => offer?.contactReadiness === 'READY_TO_CONTACT')
        if (candidate?.playerId === undefined) return
        store.contactFreeAgent(teamId, candidate.playerId, candidate.sourceProposalId!)
        record('contactFreeAgent', `${candidate.playerId}`)
        return
      }
      if (active.status === 'CONTACTED') {
        if (active.contactResponse?.outcome !== 'OPEN_TO_TALKS') return
        const offer = assessRoutedFreeAgentOfferIntelligence(world, teamId, active.playerId, active.sourcePlanId).find((item) => item.sourceProposalId === active.sourceProposalId)
        const preparation = offer === undefined ? undefined : assessFormalOfferPreparation(world, offer)
        if (preparation?.readiness !== 'READY_TO_SUBMIT_OFFER') return
        store.submitFreeAgentOffer(teamId, active.id, active.sourceProposalId!)
        record('submitFreeAgentOffer', `${active.playerId} ${preparation.salaryProposal?.amount} x ${preparation.termProposalYears}`)
      } else if (active.status === 'COUNTERED') {
        store.decideFreeAgentCounter(teamId, active.id, active.round, { kind: 'ACCEPT_COUNTER' })
        record('decideFreeAgentCounter', `${active.playerId} ACCEPT_COUNTER`)
      } else if (active.status === 'ACCEPTED') {
        const readiness = assessPlayerContractSigningReadiness(world, teamId, active.id)
        if (readiness.governanceDecisionId === undefined) {
          const body = Object.values(world.governanceAppointmentsById).find((item) => item.actor.kind === 'COACH' && item.actor.id === world.userCoachId && readiness.executorBodyIds.includes(item.bodyId))?.bodyId
          store.startFreeAgentSigningGovernance(teamId, active.id, active.sourceProposalId!, body)
          record('startFreeAgentSigningGovernance', `${active.playerId}`)
        } else if (readiness.status === 'APPROVED') {
          store.completeFreeAgentSigning(teamId, active.id, active.sourceProposalId!)
          state.signedPlayerId = active.playerId
          state.signedOn = date
          record('completeFreeAgentSigning', `${active.playerId}`)
        }
      }
    },
  }
}
