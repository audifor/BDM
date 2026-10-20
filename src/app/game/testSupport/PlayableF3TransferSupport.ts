import type { PlayerId, TeamId } from '@/domain/ids'
import type { PlayerTransferNegotiation, TransferPlayerTerms } from '@/domain/transfer'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getPlayerMarketTerms } from '@/engine/market/PlayerMarketTerms'
import { assessSellerAskingFee } from '@/engine/transfer'
import { transferFeeAuthorization } from '@/app/transfer'
import { f3AdvanceDay, f3Store, f3World } from './PlayableF3Support'

/**
 * F3 · harness of the negotiated club-to-club transfer. Every decision is a `gameStore` action (the ones the Courtside Market and
 * Player Contract screens call). The harness may read the seller's asking price and the player's market terms to choose SENSIBLE
 * amounts, exactly as a tester would; the application never exposes them to the manager.
 */
export interface F3TransferPlan {
  /** Share of the seller's asking fee in the first proposal (1 = exactly the asking price). */
  readonly firstProposalShare?: number
  /** Share of the player's market salary offered (1 = his real ask). */
  readonly salaryShare?: number
  readonly years?: number
  readonly salt?: number
}

export const f3Transfer = (id: string): PlayerTransferNegotiation | undefined => f3World().playerTransferNegotiationsById[id]
export const f3TransferFor = (buyerTeamId: TeamId, playerId: PlayerId): PlayerTransferNegotiation | undefined =>
  Object.values(f3World().playerTransferNegotiationsById).filter((item) => item.buyerTeamId === buyerTeamId && item.playerId === playerId).sort((a, b) => a.id.localeCompare(b.id)).at(-1)

/** Players of the other clubs the manager could afford to approach, cheapest compensation first (a manager looks at what he can pay). */
export function f3TransferCandidates(world: GameWorld, limit = 12): readonly PlayerId[] {
  const team = getUserTeam(world)!
  const headroom = transferFeeAuthorization(world, team.id).headroomMinorUnits
  const rows = Object.values(world.teams).filter((item) => item.id !== team.id && item.rosterPlayerIds.length > 12).flatMap((seller) => seller.rosterPlayerIds.map((playerId) => {
    const ask = assessSellerAskingFee(world, seller.id, playerId)
    return ask === undefined ? [] : [{ playerId, ask, market: getPlayerMarketTerms(world, playerId).annualSalary }]
  }).flat())
  return rows
    .filter((row) => headroom !== null && row.ask.askingFee * 100 <= headroom && row.ask.sellerContract.term.expiresOn > world.currentDate)
    .sort((a, b) => a.ask.askingFee - b.ask.askingFee || a.playerId.localeCompare(b.playerId))
    .slice(0, limit)
    .map((row) => row.playerId)
}

export interface F3TransferOutcome {
  readonly status: 'EXECUTED' | 'STOPPED'
  readonly playerId: PlayerId
  readonly transferId?: string
  readonly stoppedAt?: string
  readonly log: readonly string[]
  readonly worldBefore?: GameWorld
  readonly worldAfter?: GameWorld
}

/** Plays the whole transfer with the manager's own actions. Stops (honestly) at the first stage that a canonical authority refuses. */
export function f3PlayTransfer(playerId: PlayerId, plan: F3TransferPlan = {}): F3TransferOutcome {
  const salt = plan.salt ?? 11
  const store = f3Store()
  const team = getUserTeam(f3World())!
  const log: string[] = []
  const note = (step: string) => log.push(`${f3World().currentDate} ${step}`)
  const stop = (stoppedAt: string): F3TransferOutcome => ({ status: 'STOPPED', playerId, stoppedAt, log, ...(f3TransferFor(team.id, playerId) === undefined ? {} : { transferId: f3TransferFor(team.id, playerId)!.id }) })

  const world = f3World()
  const seller = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(playerId))
  const ask = seller === undefined ? undefined : assessSellerAskingFee(world, seller.id, playerId)
  if (ask === undefined) return stop('NO_SELLER_CONTRACT')
  const fee = Math.max(1, Math.round(ask.askingFee * (plan.firstProposalShare ?? 1) / 1_000) * 1_000)
  store.proposeTransfer(team.id, playerId, fee)
  const proposed = f3TransferFor(team.id, playerId)
  if (proposed === undefined || proposed.status !== 'IN_PROGRESS') return stop(`PROPOSAL_REFUSED:${f3Store().marketNotice?.text ?? ''}`)
  note(`proposal ${fee}`)

  f3AdvanceDay(salt)
  let transfer = f3Transfer(proposed.id)!
  note(`club ${transfer.clubStatus}`)
  if (transfer.clubStatus === 'CLUB_COUNTERED') {
    store.respondTransferClubCounter(team.id, transfer.id, { kind: 'ACCEPT_COUNTER' })
    transfer = f3Transfer(proposed.id)!
    note(`acceptClubCounter ${transfer.clubStatus}`)
  }
  if (transfer.clubStatus !== 'CLUB_AGREED') return stop(`CLUB:${transfer.clubStatus}`)

  const marketSalary = getPlayerMarketTerms(f3World(), playerId).annualSalary
  const terms: TransferPlayerTerms = { salary: Math.round(marketSalary * (plan.salaryShare ?? 1.05) / 1_000) * 1_000, years: plan.years ?? 2 }
  store.proposeTransferPlayerTerms(team.id, transfer.id, terms)
  transfer = f3Transfer(proposed.id)!
  if (transfer.playerStatus !== 'AWAITING_PLAYER_RESPONSE') return stop(`PLAYER_OFFER_REFUSED:${f3Store().marketNotice?.text ?? ''}`)
  note(`playerOffer ${terms.salary} x ${terms.years}`)

  f3AdvanceDay(salt)
  transfer = f3Transfer(proposed.id)!
  note(`player ${transfer.playerStatus}`)
  if (transfer.playerStatus === 'PLAYER_COUNTERED') {
    store.respondTransferPlayerCounter(team.id, transfer.id, { kind: 'ACCEPT_COUNTER' })
    transfer = f3Transfer(proposed.id)!
    note(`acceptPlayerCounter ${transfer.playerStatus}`)
  }
  if (transfer.playerStatus !== 'PLAYER_AGREED') return stop(`PLAYER:${transfer.playerStatus}`)

  store.startTransferGovernance(team.id, transfer.id)
  transfer = f3Transfer(proposed.id)!
  if (transfer.governanceDecisionId === undefined) return stop(`GOVERNANCE_NOT_STARTED:${f3Store().marketNotice?.text ?? ''}`)
  note('governance started')
  f3AdvanceDay(salt)
  const decision = f3World().governanceDecisionsById[transfer.governanceDecisionId]
  note(`board decided ${decision === undefined ? 'MISSING' : 'DECISION_PRESENT'}`)

  const worldBefore = f3World()
  store.completeTransfer(team.id, transfer.id)
  transfer = f3Transfer(proposed.id)!
  if (transfer.status !== 'EXECUTED') return { ...stop(`EXECUTION:${f3Store().marketNotice?.text ?? ''}`), worldBefore }
  note('executed')
  return { status: 'EXECUTED', playerId, transferId: transfer.id, log, worldBefore, worldAfter: f3World() }
}
