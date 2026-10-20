import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { addYears } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { getContractFinancialSchedule } from '@/domain/finance'
import { playerTransferId, type PlayerTransferNegotiation } from '@/domain/transfer'
import { updateGameWorld } from '@/domain/world'
import type { GameWorld } from '@/domain/world'
import { getPlayerMarketTerms } from '@/engine/market/PlayerMarketTerms'
import { assessSellerAskingFee, BDM_TRANSFER_POLICY_V1, deriveSellerClubResponse } from './TransferPolicy'

const world = (): GameWorld => createNewGame()
const sellerAndPlayer = (w: GameWorld) => {
  const [seller, buyer] = Object.values(w.teams)
  const playerId = seller!.rosterPlayerIds.map((id) => ({ id, salary: getPlayerMarketTerms(w, id).annualSalary })).sort((a, b) => a.salary - b.salary || a.id.localeCompare(b.id))[0]!.id
  return { seller: seller!, buyer: buyer!, playerId }
}
const transferFor = (w: GameWorld, fee: number): PlayerTransferNegotiation => {
  const { seller, buyer, playerId } = sellerAndPlayer(w)
  const contract = Object.values(w.contractsById).find((item) => item.playerId === playerId)!
  return {
    id: playerTransferId(buyer.id, playerId, 0), playerId, sellerTeamId: seller.id, sellerOrganizationId: seller.organizationId, buyerTeamId: buyer.id, buyerOrganizationId: buyer.organizationId,
    sellerContractId: contract.id, openedOn: w.currentDate, status: 'IN_PROGRESS', clubStatus: 'AWAITING_CLUB_RESPONSE', clubRounds: [{ round: 1, fee, proposedOn: w.currentDate }],
    playerStatus: 'NOT_STARTED', playerRounds: [],
  }
}

describe('BDM_TRANSFER_POLICY_V1 · cómo responde el club vendedor', () => {
  it('el precio que pide es una función verificable del mercado y del tiempo de contrato restante, no del salario del jugador: valoración ≠ salario ≠ precio', () => {
    const w = world()
    const { seller, playerId } = sellerAndPlayer(w)
    const ask = assessSellerAskingFee(w, seller.id, playerId)!
    expect(ask.askingFee % 1_000).toBe(0)
    expect(ask.valuation).toBe(Math.max(1, Math.round(ask.marketAnnualSalary * ask.remainingYears * BDM_TRANSFER_POLICY_V1.valuationShare / 1_000) * 1_000))
    // The contract salary is not the price: tripling it changes nothing.
    const contract = ask.sellerContract
    const richer = updateGameWorld(w, { contracts: Object.values(w.contractsById).map((item) => item.id === contract.id ? createPlayerContract({ ...item, compensation: { annualSalary: item.compensation.annualSalary * 3 } }) : item) })
    expect(assessSellerAskingFee(richer, seller.id, playerId)!.askingFee).toBe(ask.askingFee)
  })

  it('los jugadores franquicia del vendedor cuestan más (prima verificable) y los demás cuestan su valoración', () => {
    const w = world()
    const seller = Object.values(w.teams)[0]!
    const ranked = seller.rosterPlayerIds.map((id) => ({ id, salary: getPlayerMarketTerms(w, id).annualSalary })).sort((a, b) => b.salary - a.salary || a.id.localeCompare(b.id))
    const top = assessSellerAskingFee(w, seller.id, ranked[0]!.id)!
    const bottom = assessSellerAskingFee(w, seller.id, ranked.at(-1)!.id)!
    expect(top.franchisePlayer).toBe(true)
    expect(top.askingFee).toBe(Math.max(1, Math.round(top.valuation * (1 + BDM_TRANSFER_POLICY_V1.franchisePremium) / 1_000) * 1_000))
    expect(bottom.franchisePlayer).toBe(false)
    expect(bottom.askingFee).toBe(bottom.valuation)
  })

  it('acepta desde su precio, contraoferta a su precio desde el 70 % y rechaza por debajo; sólo el vendedor conoce su precio hasta que responde', () => {
    const w = world()
    const { seller, playerId } = sellerAndPlayer(w)
    const ask = assessSellerAskingFee(w, seller.id, playerId)!.askingFee
    expect(deriveSellerClubResponse(w, transferFor(w, ask))).toEqual({ outcome: 'ACCEPTED' })
    expect(deriveSellerClubResponse(w, transferFor(w, ask + 50_000))).toEqual({ outcome: 'ACCEPTED' })
    const counterFee = Math.ceil(ask * BDM_TRANSFER_POLICY_V1.counterThreshold)
    expect(deriveSellerClubResponse(w, transferFor(w, counterFee))).toEqual({ outcome: 'COUNTERED', counterFee: ask })
    expect(deriveSellerClubResponse(w, transferFor(w, Math.max(1, counterFee - 1)))).toEqual({ outcome: 'REJECTED', reason: 'BELOW_ACCEPTABLE_FRACTION' })
  })

  it('un club no vende si se queda por debajo de su plantilla mínima: no está en venta', () => {
    const w = world()
    const { seller, playerId } = sellerAndPlayer(w)
    const trimmed = updateGameWorld(w, { teams: Object.values(w.teams).map((team) => team.id === seller.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, BDM_TRANSFER_POLICY_V1.sellerMinimumRosterAfterSale) } : team) })
    const kept = trimmed.teams[seller.id]!.rosterPlayerIds.includes(playerId) ? playerId : trimmed.teams[seller.id]!.rosterPlayerIds[0]!
    const transfer = { ...transferFor(trimmed, 1_000_000), playerId: kept, sellerContractId: Object.values(trimmed.contractsById).find((item) => item.playerId === kept)!.id }
    expect(deriveSellerClubResponse(trimmed, transfer)).toEqual({ outcome: 'REJECTED', reason: 'NOT_FOR_SALE_ROSTER_MINIMUM' })
  })

  it('el contrato traspasado deja de obligar al vendedor en los años futuros; una liberación, en cambio, conserva las garantías', () => {
    const w = world()
    const { seller, playerId } = sellerAndPlayer(w)
    const base = Object.values(w.contractsById).find((item) => item.playerId === playerId)!
    const longContract = createPlayerContract({ ...base, term: { startsOn: base.term.startsOn, expiresOn: addYears(base.term.startsOn, 3) }, compensation: { annualSalary: 400_000 } })
    const withLong = updateGameWorld(w, { contracts: Object.values(w.contractsById).map((item) => item.id === base.id ? longContract : item) })
    const entries = (world: GameWorld) => getContractFinancialSchedule(world, { organizationId: seller.organizationId, teamId: seller.id, contractId: base.id, currencyCode: world.organizationFinancialProfilesById[seller.organizationId]?.baseCurrencyCode ?? 'EUR' }).filter((entry) => entry.compensationStatus === 'GUARANTEED').length
    const midway = addYears(base.term.startsOn, 1)
    const terminate = (reason: 'released' | 'transferred') => updateGameWorld(withLong, { currentDate: midway, contracts: Object.values(withLong.contractsById).map((item) => item.id === base.id ? createPlayerContract({ ...longContract, termination: { terminatedOn: midway, reason } }) : item) })
    const full = entries(withLong)
    expect(full).toBe(3)
    expect(entries(terminate('released'))).toBe(3)
    expect(entries(terminate('transferred'))).toBe(1)
  })
})
