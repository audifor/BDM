import { updateGameWorld, type GameWorld } from '@/domain/world'
import { currentClubRound, currentPlayerRound, createPlayerTransferNegotiation, type PlayerTransferNegotiation, type TransferPlayerTerms } from '@/domain/transfer'
import { derivePlayerTermsResponse, initializeFreeAgentMarketTruth } from '@/engine/market'
import { deriveSellerClubResponse, sellerContractInForce } from './TransferPolicy'

export function replaceTransfer(world: GameWorld, transfer: PlayerTransferNegotiation): GameWorld {
  const valid = createPlayerTransferNegotiation(transfer)
  return updateGameWorld(world, { playerTransferNegotiations: [...Object.values(world.playerTransferNegotiationsById).filter((item) => item.id !== valid.id), valid] })
}

/** The player will not even listen to a club he does not want to join: below this willingness he rejects every proposal. */
export const TRANSFER_PLAYER_WILLINGNESS_THRESHOLD = 50

/**
 * Daily progress of every in-flight transfer. A proposal made today is answered from tomorrow on (the same one-day delay of every
 * other market answer), by the SELLING CLUB first and, once the clubs agree, by the PLAYER. Nothing here moves a player or money:
 * execution is a separate, explicit, atomic act.
 */
export function progressPlayerTransferNegotiations(world: GameWorld): GameWorld {
  let current = world
  const open = Object.values(world.playerTransferNegotiationsById).filter((item) => item.status === 'IN_PROGRESS').sort((a, b) => a.id.localeCompare(b.id))
  for (const initial of open) {
    const transfer = current.playerTransferNegotiationsById[initial.id]
    if (transfer === undefined || transfer.status !== 'IN_PROGRESS') continue
    const held = sellerContractInForce(current, transfer.sellerTeamId, transfer.playerId)
    if (held === undefined || held.id !== transfer.sellerContractId) {
      current = replaceTransfer(current, { ...transfer, status: 'CLOSED', closedOn: current.currentDate, closeReason: 'PLAYER_UNAVAILABLE' })
      continue
    }

    const clubRound = currentClubRound(transfer)
    if (transfer.clubStatus === 'AWAITING_CLUB_RESPONSE' && clubRound !== undefined && clubRound.response === undefined && clubRound.proposedOn < current.currentDate) {
      const answer = deriveSellerClubResponse(current, transfer)
      if (answer === undefined) continue
      const response = { outcome: answer.outcome, respondedOn: current.currentDate, ...(answer.counterFee === undefined ? {} : { counterFee: answer.counterFee }), ...(answer.reason === undefined ? {} : { reason: answer.reason }) }
      const rounds = [...transfer.clubRounds.slice(0, -1), { ...clubRound, response }]
      current = replaceTransfer(current, answer.outcome === 'ACCEPTED'
        ? { ...transfer, clubRounds: rounds, clubStatus: 'CLUB_AGREED', agreedFee: clubRound.fee }
        : answer.outcome === 'COUNTERED'
          ? { ...transfer, clubRounds: rounds, clubStatus: 'CLUB_COUNTERED' }
          : { ...transfer, clubRounds: rounds, clubStatus: 'CLUB_REJECTED', status: 'CLOSED', closedOn: current.currentDate, closeReason: 'CLUB_REJECTED' })
      continue
    }

    const playerRound = currentPlayerRound(transfer)
    if (transfer.playerStatus === 'AWAITING_PLAYER_RESPONSE' && playerRound !== undefined && playerRound.response === undefined && playerRound.offeredOn < current.currentDate) {
      const withTruth = initializeFreeAgentMarketTruth(current, [transfer.playerId])
      const reality = withTruth.marketRealityByPlayerId[transfer.playerId]
      if (reality === undefined) continue
      const derived = reality.playerWillingness < TRANSFER_PLAYER_WILLINGNESS_THRESHOLD
        ? { outcome: 'REJECTED' as const, respondedOn: withTruth.currentDate, origin: 'PLAYER' as const }
        : derivePlayerTermsResponse(withTruth, { playerId: transfer.playerId, salary: playerRound.terms.salary, years: playerRound.terms.years, ...(playerRound.terms.role === undefined ? {} : { role: playerRound.terms.role }) }, withTruth.currentDate)
      if (derived === undefined) continue
      const counterTerms: TransferPlayerTerms | undefined = derived.counterTerms === undefined ? undefined
        : { salary: derived.counterTerms.salary, years: derived.counterTerms.years, ...(derived.counterTerms.role === undefined ? {} : { role: derived.counterTerms.role }) }
      const response = { outcome: derived.outcome, respondedOn: withTruth.currentDate, ...(counterTerms === undefined ? {} : { counterTerms }) }
      const rounds = [...transfer.playerRounds.slice(0, -1), { ...playerRound, response }]
      current = replaceTransfer(withTruth, derived.outcome === 'ACCEPTED'
        ? { ...transfer, playerRounds: rounds, playerStatus: 'PLAYER_AGREED', agreedTerms: playerRound.terms }
        : derived.outcome === 'COUNTERED'
          ? { ...transfer, playerRounds: rounds, playerStatus: 'PLAYER_COUNTERED' }
          : { ...transfer, playerRounds: rounds, playerStatus: 'PLAYER_REJECTED', status: 'CLOSED', closedOn: withTruth.currentDate, closeReason: 'PLAYER_REJECTED' })
    }
  }
  return current
}
