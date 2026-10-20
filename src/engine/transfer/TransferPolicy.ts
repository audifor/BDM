import type { GameDate } from '@/domain/date'
import type { PlayerContract } from '@/domain/contract'
import type { PlayerId, TeamId } from '@/domain/ids'
import { currentClubRound, type PlayerTransferNegotiation, type TransferRefusalReason } from '@/domain/transfer'
import { getActivePlayerContract, type GameWorld } from '@/domain/world'
import { getPlayerMarketTerms } from '@/engine/market/PlayerMarketTerms'

/**
 * BDM_TRANSFER_POLICY_V1 — how a selling club answers a compensation proposal for one of its contracted players.
 *
 * Every figure below is a documented game parameter, not a federation rule and not a probability. The answer is a pure function of
 * facts anyone can verify in the world: the player's market terms (`getPlayerMarketTerms`, ability based), how long his contract
 * still runs, and the seller's own squad. Three different quantities are kept apart on purpose:
 *   - the PLAYER'S SALARY (what the buying club will pay him: negotiated with him, not here);
 *   - the VALUATION (what the player is worth to the seller for the time he still owes it);
 *   - the PRICE (the compensation the clubs agree, which can be above or below the valuation).
 * The asking price is private to the seller until it answers: it is revealed only through its counter or its acceptance.
 */
export const BDM_TRANSFER_POLICY_V1 = Object.freeze({
  id: 'BDM_TRANSFER_POLICY_V1',
  /** Share of the market salary for every remaining contract year the seller gives up. */
  valuationShare: 0.5,
  /** Remaining years beyond this are not paid for (a long contract does not make the compensation unbounded). */
  maximumRemainingYearsConsidered: 3,
  /** A contract about to expire is still worth a quarter of a year to the seller. */
  minimumRemainingYears: 0.25,
  /** The seller's best N players (by market salary) are franchise players and carry a premium. */
  franchisePlayerRank: 2,
  franchisePremium: 0.25,
  /** A proposal at or above this share of the asking price is countered at the asking price; below it, rejected. */
  counterThreshold: 0.7,
  /** A seller never sells below this many players left on its roster. */
  sellerMinimumRosterAfterSale: 10,
})

const DAYS_PER_YEAR = 365.25

function daysBetween(from: GameDate, to: GameDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export interface TransferAsk {
  readonly sellerContract: PlayerContract
  readonly remainingYears: number
  readonly marketAnnualSalary: number
  /** What the player is worth to the seller for the remaining contract (whole major units). */
  readonly valuation: number
  readonly franchisePlayer: boolean
  /** The price the seller asks: valuation plus the franchise premium. Private until the seller answers. */
  readonly askingFee: number
}

/** The seller's contract in force for this player, only when it really is held by the named seller. */
export function sellerContractInForce(world: GameWorld, sellerTeamId: TeamId, playerId: PlayerId): PlayerContract | undefined {
  const contract = getActivePlayerContract(world, playerId)
  const seller = world.teams[sellerTeamId]
  return contract !== undefined && contract.teamId === sellerTeamId && seller?.rosterPlayerIds.includes(playerId) === true ? contract : undefined
}

export function assessSellerAskingFee(world: GameWorld, sellerTeamId: TeamId, playerId: PlayerId): TransferAsk | undefined {
  const contract = sellerContractInForce(world, sellerTeamId, playerId)
  const seller = world.teams[sellerTeamId]
  if (contract === undefined || seller === undefined || world.players[playerId] === undefined) return undefined
  const policy = BDM_TRANSFER_POLICY_V1
  const remainingYears = Math.min(policy.maximumRemainingYearsConsidered, Math.max(policy.minimumRemainingYears, daysBetween(world.currentDate, contract.term.expiresOn) / DAYS_PER_YEAR))
  const marketAnnualSalary = getPlayerMarketTerms(world, playerId).annualSalary
  const valuation = Math.max(1, Math.round(marketAnnualSalary * remainingYears * policy.valuationShare / 1_000) * 1_000)
  const ranked = seller.rosterPlayerIds
    .filter((id) => world.players[id] !== undefined)
    .map((id) => ({ id, salary: getPlayerMarketTerms(world, id).annualSalary }))
    .sort((a, b) => b.salary - a.salary || a.id.localeCompare(b.id))
    .slice(0, policy.franchisePlayerRank)
  const franchisePlayer = ranked.some((item) => item.id === playerId)
  const askingFee = Math.max(1, Math.round(valuation * (1 + (franchisePlayer ? policy.franchisePremium : 0)) / 1_000) * 1_000)
  return Object.freeze({ sellerContract: contract, remainingYears, marketAnnualSalary, valuation, franchisePlayer, askingFee })
}

export interface SellerClubResponse {
  readonly outcome: 'ACCEPTED' | 'COUNTERED' | 'REJECTED'
  readonly counterFee?: number
  readonly reason?: TransferRefusalReason
}

/** The seller's answer to the buyer's current proposal. `undefined` while the seller has nothing to answer. */
export function deriveSellerClubResponse(world: GameWorld, transfer: PlayerTransferNegotiation): SellerClubResponse | undefined {
  const round = currentClubRound(transfer)
  if (round === undefined || round.response !== undefined || transfer.clubStatus !== 'AWAITING_CLUB_RESPONSE') return undefined
  const seller = world.teams[transfer.sellerTeamId]
  const ask = assessSellerAskingFee(world, transfer.sellerTeamId, transfer.playerId)
  if (seller === undefined || ask === undefined) return { outcome: 'REJECTED', reason: 'CONTRACT_NO_LONGER_HELD' }
  if (seller.rosterPlayerIds.length - 1 < BDM_TRANSFER_POLICY_V1.sellerMinimumRosterAfterSale) return { outcome: 'REJECTED', reason: 'NOT_FOR_SALE_ROSTER_MINIMUM' }
  if (round.fee >= ask.askingFee) return { outcome: 'ACCEPTED' }
  if (round.fee >= ask.askingFee * BDM_TRANSFER_POLICY_V1.counterThreshold) return { outcome: 'COUNTERED', counterFee: ask.askingFee }
  return { outcome: 'REJECTED', reason: 'BELOW_ACCEPTABLE_FRACTION' }
}
