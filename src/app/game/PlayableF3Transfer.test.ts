import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlayerContractStatus } from '@/domain/contract'
import { addDays } from '@/domain/date'
import { createAuthorizedEconomicEvent, processOperatingCostEconomicEvent } from '@/domain/finance'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getFreeAgents, getTeamRoster, isPlayerAvailable, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { initializeFreeAgentMarketTruth } from '@/engine/market'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { assessSellerAskingFee } from '@/engine/transfer'
import { executePlayerTransfer, transferFeeAuthorization } from '@/app/transfer'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { buildMarketViability } from '@/ui-ng/applications/market/marketViability'
import { createF3Day0, f3AdvanceDay, f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning, f3PlayTransfer, f3Transfer, f3TransferCandidates, f3TransferFor } from './testSupport/PlayableF3TransferSupport'

/**
 * F3 · adendo: mercado global, negociacion libre y traspasos entre clubes. Cada decision es una accion del store de Courtside sobre la
 * partida real de New Game ACB 2026/27; los dias pasan por la frontera diaria de produccion. Los dos clubes de cada operacion se
 * comprueban siempre: el comprador (UCAM Murcia, el club del manager) y el club vendedor.
 */
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })
const savedAt = '2026-10-27T09:00:00.000Z'
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }

let day0: GameWorld
let buyerId: TeamId

const cash = (world: GameWorld, teamId: TeamId): number => buildMarketViability(world, teamId, { annualSalary: 1, years: 1 }).cashMajor!
const rosterIds = (world: GameWorld, teamId: TeamId): readonly string[] => getTeamRoster(world, teamId).map((player) => player.id)
const sellerOf = (world: GameWorld, playerId: PlayerId): TeamId => Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(playerId))!.id
const activeContracts = (world: GameWorld, playerId: PlayerId) => Object.values(world.contractsById).filter((item) => item.playerId === playerId && getPlayerContractStatus(item, world.currentDate) === 'active')
const reset = () => f3Store().replaceWorld(day0)

/** Every rostered player belongs to exactly one club and has exactly one active contract with it; nobody is missing or doubled. */
function expectSoundWorld(world: GameWorld): void {
  const seen = new Map<string, string>()
  for (const team of Object.values(world.teams)) {
    for (const playerId of team.rosterPlayerIds) {
      expect(seen.has(playerId), `${playerId} is in two rosters`).toBe(false)
      seen.set(playerId, team.id)
      expect(assessActiveContractRosterIntegrity(world, playerId)).toBe('VALID')
      expect(activeContracts(world, playerId)).toHaveLength(1)
      expect(activeContracts(world, playerId)[0]!.teamId).toBe(team.id)
    }
  }
}

/** The part of the world a refused or rejected operation must not touch. */
const stateOf = (world: GameWorld, ...teamIds: TeamId[]) => ({
  rosters: teamIds.map((id) => rosterIds(world, id)),
  contracts: Object.keys(world.contractsById).length,
  transactions: Object.keys(world.playerTransactionsById).length,
  ledger: Object.keys(world.financialTransactionsById).length,
  cash: teamIds.map((id) => cash(world, id)),
})

const willingness = (world: GameWorld, playerId: PlayerId): number => initializeFreeAgentMarketTruth(world, [playerId]).marketRealityByPlayerId[playerId]!.playerWillingness
const willing = (id: PlayerId) => willingness(day0, id) >= 50
const unwilling = (id: PlayerId) => willingness(day0, id) < 50

beforeAll(async () => {
  day0 = await createF3Day0()
  buyerId = getUserTeam(day0)!.id
  f3Store().replaceWorld(day0)
}, 900_000)

describe('F3 adendo · A/B · cualquier agente libre, con o sin necesidad, y una oferta a medida con respuesta real', () => {
  it('A1. el contacto directo y la oferta a medida funcionan con un agente libre que SI recomiendan las necesidades; el mismo camino sin ninguna recomendacion se prueba aparte (PlayableF3DirectApproach)', () => {
    reset()
    const pool = getFreeAgents(day0).map((player) => player.id).filter(willing)
    const outcomes = pool.slice(0, 3).map((id) => { reset(); return f3PlayDirectSigning(id, { salaryShare: 1.1, years: 3 }) })
    const signed = outcomes.find((outcome) => outcome.status === 'SIGNED')
    expect(signed, outcomes.map((o) => `${o.playerId}:${o.stoppedAt ?? o.status}`).join(' ; ')).toBeDefined()
    const world = signed!.worldAfter!
    expect(rosterIds(world, buyerId)).toContain(signed!.playerId)
    expect(activeContracts(world, signed!.playerId)).toHaveLength(1)
    expect(activeContracts(world, signed!.playerId)[0]!.teamId).toBe(buyerId)
    expectSoundWorld(world)
  })

  it('B1. un salario por debajo de lo que pide el jugador se evalua de verdad: la respuesta es una contraoferta que nunca baja de su minimo real, no una aceptacion al precio ofrecido', () => {
    reset()
    const candidates = getFreeAgents(day0).map((player) => player.id).filter(willing)
    let checked = 0
    for (const id of candidates) {
      const outcome = f3PlayDirectSigning(id, { salaryShare: 0.6, years: 2, stopAfterAnswer: true })
      if (outcome.status !== 'ANSWERED') continue
      const truth = f3World().marketRealityByPlayerId[id]!
      expect(outcome.offered!.salary).toBeLessThan(truth.expectedSalary)
      expect(outcome.answer, `a below-ask offer cannot be accepted at the offered price (${id})`).not.toBe('ACCEPTED')
      if (outcome.answer === 'COUNTERED') expect(outcome.counteredSalary!).toBeGreaterThanOrEqual(truth.expectedSalary)
      checked += 1
      if (checked === 2) break
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('B2. una oferta con anos y rol distintos de los esperados recibe una respuesta valida del motor, y la firma respeta lo acordado (anos y promesa de rol)', () => {
    reset()
    const pool = getFreeAgents(day0).map((player) => player.id).filter(willing)
    const outcomes = pool.slice(0, 3).map((id) => { reset(); return f3PlayDirectSigning(id, { salaryShare: 1.15, years: 4, role: 'ROTATION' }) })
    const signed = outcomes.find((outcome) => outcome.status === 'SIGNED')
    expect(signed, outcomes.map((o) => `${o.playerId}:${o.stoppedAt ?? o.status}`).join(' ; ')).toBeDefined()
    const world = signed!.worldAfter!
    const contract = activeContracts(world, signed!.playerId)[0]!
    expect(Number(contract.term.expiresOn.slice(0, 4)) - Number(contract.term.startsOn.slice(0, 4))).toBe(4)
    expect(Object.values(world.rolePromisesById).some((promise) => promise.playerId === signed!.playerId && promise.role === 'ROTATION' && promise.status === 'ACTIVE')).toBe(true)
    expectSoundWorld(world)
  })
})

describe('F3 adendo · C · traspaso negociado entre clubes de un jugador con contrato', () => {
  let candidates: readonly PlayerId[]
  let executedWorld: GameWorld
  beforeAll(() => { candidates = f3TransferCandidates(day0, 40) })

  it('C0. el mercado global ofrece jugadores de otros clubes de la liga con su situacion contractual, y existe autorizacion propia para compensaciones (distinta del presupuesto salarial)', () => {
    const authorization = transferFeeAuthorization(day0, buyerId)
    expect(authorization.state).toBe('AVAILABLE')
    expect(authorization.headroomMinorUnits).toBeGreaterThan(0)
    expect(candidates.length).toBeGreaterThanOrEqual(10)
    const sellers = new Set(candidates.map((id) => sellerOf(day0, id)))
    expect(sellers.has(buyerId)).toBe(false)
    expect(sellers.size).toBeGreaterThanOrEqual(2)
  })

  it('C1. se puede iniciar la negociacion con el club propietario de un jugador con contrato; no es un agente libre y su situacion no cambia', () => {
    reset()
    const playerId = candidates.find((id) => willing(id))!
    const sellerId = sellerOf(day0, playerId)
    expect(isPlayerFreeAgent(day0, playerId)).toBe(false)
    const before = stateOf(day0, buyerId, sellerId)
    const ask = assessSellerAskingFee(day0, sellerId, playerId)!
    f3Store().proposeTransfer(buyerId, playerId, ask.askingFee)
    const transfer = f3TransferFor(buyerId, playerId)!
    expect(transfer).toMatchObject({ status: 'IN_PROGRESS', clubStatus: 'AWAITING_CLUB_RESPONSE', sellerTeamId: sellerId, buyerTeamId: buyerId, playerStatus: 'NOT_STARTED' })
    // An offer is not a payment and not a movement.
    expect(stateOf(f3World(), buyerId, sellerId)).toEqual(before)
    // No second approach to the same player while this one is open.
    f3Store().proposeTransfer(buyerId, playerId, ask.askingFee)
    expect(Object.values(f3World().playerTransferNegotiationsById)).toHaveLength(1)
  })

  it('C2. el club vendedor rechaza una propuesta muy baja: no cambia ninguna plantilla, contrato ni movimiento economico de ninguno de los dos clubes', () => {
    reset()
    const playerId = candidates[0]!
    const sellerId = sellerOf(day0, playerId)
    const ask = assessSellerAskingFee(day0, sellerId, playerId)!
    const before = stateOf(day0, buyerId, sellerId)
    f3Store().proposeTransfer(buyerId, playerId, Math.max(1, Math.round(ask.askingFee * 0.3)))
    f3AdvanceDay()
    const transfer = f3TransferFor(buyerId, playerId)!
    expect(transfer).toMatchObject({ status: 'CLOSED', clubStatus: 'CLUB_REJECTED', closeReason: 'CLUB_REJECTED' })
    expect(transfer.clubRounds[0]!.response).toMatchObject({ outcome: 'REJECTED', reason: 'BELOW_ACCEPTABLE_FRACTION' })
    const after = stateOf(f3World(), buyerId, sellerId)
    expect(after.rosters).toEqual(before.rosters)
    expect(after.contracts).toBe(before.contracts)
    expect(after.transactions).toBe(before.transactions)
    expect(after.cash).toEqual(before.cash)
    expectSoundWorld(f3World())
  })

  it('C3. el club vendedor contraoferta y la propuesta se puede revisar (aceptar la contraoferta o revisar el importe); el precio que pide solo se conoce cuando responde', () => {
    reset()
    const playerId = candidates[1]!
    const sellerId = sellerOf(day0, playerId)
    const ask = assessSellerAskingFee(day0, sellerId, playerId)!
    f3Store().proposeTransfer(buyerId, playerId, Math.round(ask.askingFee * 0.8 / 1_000) * 1_000)
    // The asking price is private until the seller answers.
    expect(JSON.stringify(f3TransferFor(buyerId, playerId)!)).not.toContain(String(ask.askingFee))
    f3AdvanceDay()
    let transfer = f3TransferFor(buyerId, playerId)!
    expect(transfer.clubStatus).toBe('CLUB_COUNTERED')
    expect(transfer.clubRounds[0]!.response!.counterFee).toBe(ask.askingFee)
    // Revise below the asking price: a new round, answered again.
    f3Store().respondTransferClubCounter(buyerId, transfer.id, { kind: 'REVISE', fee: Math.round(ask.askingFee * 0.9 / 1_000) * 1_000 })
    transfer = f3Transfer(transfer.id)!
    expect(transfer).toMatchObject({ status: 'IN_PROGRESS', clubStatus: 'AWAITING_CLUB_RESPONSE' })
    expect(transfer.clubRounds).toHaveLength(2)
    f3AdvanceDay()
    transfer = f3Transfer(transfer.id)!
    expect(transfer.clubStatus).toBe('CLUB_COUNTERED')
    f3Store().respondTransferClubCounter(buyerId, transfer.id, { kind: 'ACCEPT_COUNTER' })
    transfer = f3Transfer(transfer.id)!
    expect(transfer).toMatchObject({ clubStatus: 'CLUB_AGREED', agreedFee: ask.askingFee })
    expect(sellerOf(f3World(), playerId)).toBe(sellerId)
  })

  it('C4. el club acepta pero el jugador rechaza: no hay traspaso y no se mueve nada', () => {
    reset()
    const playerId = candidates.find((id) => unwilling(id))!
    expect(playerId).toBeDefined()
    const sellerId = sellerOf(day0, playerId)
    const before = stateOf(day0, buyerId, sellerId)
    const outcome = f3PlayTransfer(playerId)
    expect(outcome.status).toBe('STOPPED')
    expect(outcome.stoppedAt).toBe('PLAYER:PLAYER_REJECTED')
    const transfer = f3TransferFor(buyerId, playerId)!
    expect(transfer).toMatchObject({ status: 'CLOSED', clubStatus: 'CLUB_AGREED', playerStatus: 'PLAYER_REJECTED', closeReason: 'PLAYER_REJECTED' })
    expect(transfer.execution).toBeUndefined()
    const after = stateOf(f3World(), buyerId, sellerId)
    expect(after.rosters).toEqual(before.rosters)
    expect(after.contracts).toBe(before.contracts)
    expect(after.cash).toEqual(before.cash)
    expectSoundWorld(f3World())
  })

  it('C5. con todo acordado y autorizado, el traspaso se completa de forma atomica en AMBOS clubes: contratos, plantillas, historial y dinero (sin crear ni destruir)', () => {
    reset()
    const results: string[] = []
    const done: { playerId: PlayerId; sellerId: TeamId }[] = []
    for (const playerId of candidates.filter(willing)) {
      const sellerId = sellerOf(f3World(), playerId)
      if (done.some((item) => item.sellerId === sellerId)) continue
      const outcome = f3PlayTransfer(playerId)
      results.push(`${playerId}:${outcome.status}:${outcome.stoppedAt ?? ''}`)
      if (outcome.status !== 'EXECUTED') continue
      done.push({ playerId, sellerId })
      const before = outcome.worldBefore!
      const after = outcome.worldAfter!
      const transfer = f3Transfer(outcome.transferId!)!
      const feeMajor = transfer.agreedFee!
      // People: the player belongs to the buyer only, no longer to the seller.
      expect(rosterIds(after, buyerId)).toContain(playerId)
      expect(rosterIds(after, sellerId)).not.toContain(playerId)
      expect(rosterIds(after, buyerId)).toHaveLength(rosterIds(before, buyerId).length + 1)
      expect(rosterIds(after, sellerId)).toHaveLength(rosterIds(before, sellerId).length - 1)
      // Contracts: the old one is terminated as transferred, exactly one new valid one with the buyer on the agreed terms.
      const sellerContract = after.contractsById[transfer.sellerContractId]!
      expect(sellerContract.termination).toMatchObject({ reason: 'transferred', terminatedOn: after.currentDate })
      expect(getPlayerContractStatus(sellerContract, after.currentDate)).toBe('terminated')
      expect(activeContracts(after, playerId)).toHaveLength(1)
      const buyerContract = activeContracts(after, playerId)[0]!
      expect(buyerContract).toMatchObject({ teamId: buyerId, compensation: { annualSalary: transfer.agreedTerms!.salary } })
      expect(buyerContract.id).toBe(transfer.execution!.buyerContractId)
      // History in both clubs.
      const movement = Object.values(after.playerTransactionsById).filter((item) => item.kind === 'transferred' && item.playerId === playerId)
      expect(movement).toHaveLength(1)
      expect(movement[0]).toMatchObject({ fromTeamId: sellerId, toTeamId: buyerId, contractId: buyerContract.id, sourceTransferId: transfer.id })
      // Money: the same compensation, out of the buyer and into the seller, nothing else moved by this operation.
      const minor = feeMajor * 100
      expect(transfer.execution!.feeMinorUnits).toBe(minor)
      expect(cash(after, buyerId)).toBe(cash(before, buyerId) - feeMajor)
      expect(cash(after, sellerId)).toBe(cash(before, sellerId) + feeMajor)
      const othersBefore = Object.values(before.teams).filter((team) => team.id !== buyerId && team.id !== sellerId).map((team) => cash(before, team.id))
      const othersAfter = Object.values(after.teams).filter((team) => team.id !== buyerId && team.id !== sellerId).map((team) => cash(after, team.id))
      expect(othersAfter).toEqual(othersBefore)
      // Provenance: the buyer recognised an expense, the seller revenue, both tied to the transfer.
      const buyerOrg = after.teams[buyerId]!.organizationId
      const sellerOrg = after.teams[sellerId]!.organizationId
      expect(Object.values(after.expenseRecognitionsById).filter((item) => item.organizationId === buyerOrg && item.category === 'TRANSFER_FEE' && String(item.id) === transfer.execution!.financeFactIds[0])).toHaveLength(1)
      expect(Object.values(after.revenueRecognitionsById).filter((item) => item.organizationId === sellerOrg && item.category === 'TRANSFER_BUYOUT' && String(item.id) === transfer.execution!.financeFactIds[3])).toHaveLength(1)
      // The authorization was spent: the same permission cannot be spent again.
      expect(transferFeeAuthorization(after, buyerId).spentMinorUnits).toBeGreaterThanOrEqual(minor)
      expectSoundWorld(after)
      if (done.length === 2) break
    }
    expect(done.length, results.join(' ; ')).toBeGreaterThanOrEqual(2)
    executedWorld = f3World()
  })

  it('C6. ejecutar de nuevo el mismo traspaso es idempotente: ni contratos duplicados ni movimientos economicos duplicados', () => {
    f3Store().replaceWorld(executedWorld)
    const transfer = Object.values(executedWorld.playerTransferNegotiationsById).find((item) => item.status === 'EXECUTED')!
    const before = f3World()
    const again = executePlayerTransfer(before, transfer.id)
    expect(again.status).toBe('ALREADY_EXECUTED')
    expect(again.world).toBe(before)
    f3Store().completeTransfer(buyerId, transfer.id)
    expect(f3World()).toBe(before)
    expect(Object.values(before.contractsById).filter((item) => item.id === transfer.execution!.buyerContractId)).toHaveLength(1)
    expect(Object.values(before.financialTransactionsById).filter((item) => String(item.id).startsWith(`financial:transfer-fee:${transfer.id}:`))).toHaveLength(2)
  })

  /** Another canonical commitment already holds almost all the TRANSFER_FEE permission of the period (an obligation owed to a third party). */
  const withCapacityTaken = (world: GameWorld): GameWorld => {
    const team = world.teams[buyerId]!
    const headroom = transferFeeAuthorization(world, buyerId).headroomMinorUnits!
    const event = createAuthorizedEconomicEvent({
      id: 'other-pending-transfer-fee', eventType: 'OPERATING_COST_RECOGNITION', sourceAuthority: 'FUTURE_COST_ENGINE', sourceEntityId: 'another-pending-operation',
      organizationId: team.organizationId, effectiveOn: world.currentDate, dueOn: addDays(world.currentDate, 30), amount: { currencyCode: 'EUR', minorUnits: headroom - 1_000 },
      provenance: { kind: 'TEST_PENDING_OPERATION', id: 'another-pending-operation' }, idempotencyKey: 'other-pending-transfer-fee', teamId: team.id, expenseCategory: 'TRANSFER_FEE',
    })
    const processed = processOperatingCostEconomicEvent(world, event, { recognize: false })
    expect(processed.status).toBe('accepted')
    return processed.world
  }

  it('C8. con ambos acuerdos pero sin autorizacion de Finance en el momento de ejecutar, no hay traspaso: ni movimiento, ni cobro, ni pago, ni contrato (en ninguno de los dos clubes)', () => {
    reset()
    const playerId = candidates.find((id) => willing(id) && !f3World().playerTransferNegotiationsById[`transfer:${buyerId}:${id}:0`])!
    const sellerId = sellerOf(day0, playerId)
    const outcome = f3PlayTransfer(playerId, { stopBefore: 'EXECUTION' })
    expect(outcome.stoppedAt).toBe('READY_FOR_EXECUTION')
    const transfer = f3TransferFor(buyerId, playerId)!
    expect(transfer).toMatchObject({ clubStatus: 'CLUB_AGREED', playerStatus: 'PLAYER_AGREED' })
    f3Store().replaceWorld(withCapacityTaken(f3World()))
    const before = f3World()
    const refused = executePlayerTransfer(before, transfer.id)
    expect(refused.status).toBe('FINANCE_REJECTED')
    expect(refused.world).toBe(before)
    f3Store().completeTransfer(buyerId, transfer.id)
    expect(f3World()).toBe(before)
    expect(f3Store().marketNotice?.kind).toBe('error')
    expect(f3Transfer(transfer.id)).toMatchObject({ status: 'IN_PROGRESS' })
    expect(f3Transfer(transfer.id)!.execution).toBeUndefined()
    expect(rosterIds(before, sellerId)).toContain(playerId)
    expect(rosterIds(before, buyerId)).not.toContain(playerId)
    expect(activeContracts(before, playerId)[0]!.teamId).toBe(sellerId)
    expect(Object.values(before.financialTransactionsById).some((item) => String(item.id).includes(`transfer-fee:${transfer.id}`))).toBe(false)
    expectSoundWorld(before)
  })

  it('C9. sin autorizacion de Governance (no pedida, retirada o denegada por el consejo) no hay traspaso aunque los dos acuerdos esten cerrados', () => {
    reset()
    const [first, second] = candidates.filter(willing)
    // (a) Never asked for authorization.
    f3PlayTransfer(first!, { stopBefore: 'GOVERNANCE' })
    const asked = f3TransferFor(buyerId, first!)!
    const noAuthorization = executePlayerTransfer(f3World(), asked.id)
    expect(noAuthorization.status).toBe('GOVERNANCE_REQUIRED')
    expect(noAuthorization.world).toBe(f3World())
    // (b) The Board decides AGAINST because Finance no longer allows it that day.
    f3Store().startTransferGovernance(buyerId, asked.id)
    f3Store().replaceWorld(withCapacityTaken(f3World()))
    f3AdvanceDay()
    const denied = executePlayerTransfer(f3World(), asked.id)
    expect(denied.status).toBe('GOVERNANCE_DENIED')
    expect(f3Transfer(asked.id)!.status).toBe('IN_PROGRESS')
    // The next day the denied request closes the negotiation for good: it cannot be executed afterwards either.
    f3AdvanceDay()
    expect(f3Transfer(asked.id)).toMatchObject({ status: 'CLOSED', closeReason: 'GOVERNANCE_REJECTED' })
    expect(executePlayerTransfer(f3World(), asked.id).status).toBe('NOT_AGREED')
    expect(rosterIds(f3World(), buyerId)).not.toContain(first!)
    expectSoundWorld(f3World())
    // (c) The proposer withdraws his own request: nothing executes either.
    reset()
    f3PlayTransfer(second!, { stopBefore: 'GOVERNANCE' })
    const other = f3TransferFor(buyerId, second!)!
    f3Store().startTransferGovernance(buyerId, other.id)
    const decisionId = f3Transfer(other.id)!.governanceDecisionId!
    const decision = f3World().governanceDecisionsById[decisionId]!
    f3Store().recordFreeAgentSigningDecision(decisionId, 'WITHDRAWN', decision.proposedByBodyId)
    const withdrawn = executePlayerTransfer(f3World(), other.id)
    expect(withdrawn.status).toBe('GOVERNANCE_DENIED')
    f3AdvanceDay()
    expect(f3Transfer(other.id)).toMatchObject({ status: 'CLOSED', closeReason: 'GOVERNANCE_REJECTED' })
    expect(rosterIds(f3World(), buyerId)).not.toContain(second!)
    expect(f3Transfer(other.id)!.execution).toBeUndefined()
    expectSoundWorld(f3World())
  })

  it('C10. el fichado por traspaso pertenece y juega con el club nuevo: titular en una rotacion valida, minutos reales en el siguiente partido, y no juega para el vendedor', () => {
    reset()
    const outcomes: string[] = []
    let played = false
    for (const playerId of candidates.filter(willing)) {
      reset()
      const sellerId = sellerOf(day0, playerId)
      const outcome = f3PlayTransfer(playerId)
      outcomes.push(`${playerId}:${outcome.status}`)
      if (outcome.status !== 'EXECUTED') continue
      expect(isPlayerAvailable(f3World(), playerId, f3World().currentDate)).toBe(true)
      const slot = f3World().players[playerId]!.basketball.primaryPosition
      f3Store().setLineupSlot(slot, playerId)
      expect(f3World().lineupsByTeamId[buyerId]!.starters[slot]).toBe(playerId)
      let gameId: string | undefined
      for (let guard = 0; gameId === undefined && guard < 14; guard += 1) {
        const today = Object.values(f3World().games).find((game) => game.status === 'scheduled' && game.date === f3World().currentDate && (game.homeTeamId === buyerId || game.awayTeamId === buyerId))
        f3AdvanceDay()
        if (today !== undefined) gameId = today.id
      }
      expect(gameId).toBeDefined()
      const lines = f3World().matchStatLogsByGameId[gameId as keyof GameWorld['matchStatLogsByGameId']]!.playerLines
      expect(lines.find((item) => item.playerId === playerId)!.stats.secondsPlayed).toBeGreaterThan(0)
      // And never for the club he left: the seller's rosters and lineups no longer know him.
      expect(rosterIds(f3World(), sellerId)).not.toContain(playerId)
      expect(Object.values(f3World().lineupsByTeamId[sellerId]?.starters ?? {})).not.toContain(playerId)
      expectSoundWorld(f3World())
      played = true
      break
    }
    expect(played, outcomes.join(' ; ')).toBe(true)
  })

  it('C7. Save V4 conserva el estado (en curso y ejecutado) y el historial completo de ambos clubes', async () => {
    const world = executedWorld
    const executed = Object.values(world.playerTransferNegotiationsById).filter((item) => item.status === 'EXECUTED')
    expect(executed.length).toBeGreaterThanOrEqual(2)
    const loaded = await roundTrip(world)
    expect(loaded.playerTransferNegotiationsById).toEqual(world.playerTransferNegotiationsById)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
    for (const transfer of executed) {
      expect(loaded.contractsById[transfer.sellerContractId]!.termination).toMatchObject({ reason: 'transferred' })
      expect(loaded.playerTransactionsById[transfer.execution!.transactionId as never]).toMatchObject({ kind: 'transferred', sourceTransferId: transfer.id })
      expect(rosterIds(loaded, buyerId)).toContain(transfer.playerId)
      expect(rosterIds(loaded, transfer.sellerTeamId)).not.toContain(transfer.playerId)
    }
    expectSoundWorld(loaded)
    // An in-flight negotiation survives too, with its rounds.
    reset()
    const playerId = candidates[2]!
    const ask = assessSellerAskingFee(day0, sellerOf(day0, playerId), playerId)!
    f3Store().proposeTransfer(buyerId, playerId, Math.round(ask.askingFee * 0.8 / 1_000) * 1_000)
    f3AdvanceDay()
    const midway = await roundTrip(f3World())
    expect(midway.playerTransferNegotiationsById).toEqual(f3World().playerTransferNegotiationsById)
    expect(Object.values(midway.playerTransferNegotiationsById)[0]!.clubStatus).toBe('CLUB_COUNTERED')
  })
})
