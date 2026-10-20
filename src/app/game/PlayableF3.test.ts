import { beforeAll, describe, expect, it } from 'vitest'
import { getPlayerContractStatus } from '@/domain/contract'
import { evaluateTeamGameplayFinancialDecision } from '@/domain/finance'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getFreeAgents, getTeamRoster, isPlayerAvailable, isPlayerFreeAgent, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessFormalOfferPreparation } from '@/engine/marketIntelligence'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { assessPlayerContractSigningReadiness } from '@/app/governance'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { useGameStore } from '@/stores/gameStore'
import { buildMarketViability } from '@/ui-ng/applications/market/marketViability'
import { isAcbSyntheticFreeAgentId } from './AcbSyntheticFreeAgentPool'
import { createF3Day0, f3AdvanceDay, f3AdvanceDays, f3SignFirstViable, f3Store, f3World, type F3SigningOutcome } from './testSupport/PlayableF3Support'

/**
 * F3 · mercado, contratos y finanzas sobre la partida real de New Game ACB 2026/27 (UCAM Murcia, tras el primer partido). Cada decisión
 * es una acción del store de Courtside; los días pasan por la frontera diaria de producción. Nada se escribe en el mundo a mano.
 */
const savedAt = '2026-10-27T09:00:00.000Z'
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }

let day0: GameWorld
let teamId: TeamId
let signed: Extract<F3SigningOutcome, { status: 'SIGNED' }>
let before: ReturnType<typeof snapshot>
let after: ReturnType<typeof snapshot>

const snapshot = (world: GameWorld) => {
  const viability = buildMarketViability(world, teamId)
  return {
    date: world.currentDate,
    roster: getTeamRoster(world, teamId).map((player) => player.id),
    contracts: Object.keys(world.contractsById).length,
    signedTransactions: Object.values(world.playerTransactionsById).filter((item) => item.kind === 'signedFreeAgent').length,
    ledgerTransactions: Object.keys(world.financialTransactionsById).length,
    reservations: Object.values(world.financialReservationsById).map((item) => `${item.status}:${item.sourceEntityId}`).sort(),
    margin: viability.marginMajor!, authorized: viability.authorizedMajor!, committed: viability.committedMajor!, cash: buildMarketViability(world, teamId, { annualSalary: 1, years: 1 }).cashMajor!,
    freeAgents: getFreeAgents(world).map((player) => player.id),
  }
}
const poolRealities = (world: GameWorld) => Object.values(world.marketRealityByPlayerId).filter((reality) => isAcbSyntheticFreeAgentId(reality.playerId))

beforeAll(async () => {
  day0 = await createF3Day0()
  teamId = getUserTeam(day0)!.id
  f3Store().replaceWorld(day0)
}, 900_000)

describe('F3 · el mercado de partida: población sintética identificada, verdad de mercado y conocimiento legítimo', () => {
  it('0. quince agentes libres sintéticos identificados, sin contrato ni club, con verdad de mercado propia (los fichados de club no la tienen)', () => {
    const pool = getFreeAgents(day0)
    expect(pool).toHaveLength(15)
    expect(pool.every((player) => isAcbSyntheticFreeAgentId(player.id) && player.lastName.endsWith('[sintético]'))).toBe(true)
    expect(new Set(pool.map((player) => player.basketball.primaryPosition))).toEqual(new Set(['PG', 'SG', 'SF', 'PF', 'C']))
    for (const player of pool) {
      expect(Object.values(day0.contractsById).some((contract) => contract.playerId === player.id)).toBe(false)
      expect(Object.values(day0.teams).some((team) => team.rosterPlayerIds.includes(player.id))).toBe(false)
      expect(isPlayerFreeAgent(day0, player.id)).toBe(true)
    }
    const realities = poolRealities(day0)
    expect(realities).toHaveLength(15)
    expect(realities.every((reality) => reality.availability === 'OPEN' && reality.expectedSalary > 0 && reality.expectedYears >= 1 && reality.expectedYears <= 4)).toBe(true)
    // Willingness is seeded, not tuned: it varies, and some candidates really decline.
    expect(realities.some((reality) => reality.playerWillingness < 50) && realities.some((reality) => reality.playerWillingness >= 50)).toBe(true)
    // Rostered players keep their absent MarketReality (AI retention is untouched by the pool).
    expect(Object.keys(day0.marketRealityByPlayerId)).toHaveLength(15)
    expect(Object.keys(day0.agentsById).length).toBeGreaterThan(0)
    expect(pool.every((player) => day0.playerRepresentations.some((item) => item.playerId === player.id))).toBe(true)
  })

  it('1. un jugador externo no revela su verdad oculta: el club sólo tiene OrganizationKnowledge con incertidumbre, y la sal. esperada es desconocida hasta contactar', () => {
    const team = day0.teams[teamId]!
    for (const player of getFreeAgents(day0)) {
      const knowledge = day0.organizationKnowledge.find((entry) => entry.organizationId === team.organizationId && entry.subjectPlayerId === player.id)
      expect(knowledge).toBeDefined()
      expect(Object.values(knowledge!.dimensions).every((dimension) => (dimension.uncertainty ?? 0) > 0 && dimension.coverage < 1)).toBe(true)
      expect(day0.marketKnowledge.some((entry) => entry.organizationId === team.organizationId && entry.playerId === player.id && entry.expectedSalary !== undefined)).toBe(false)
    }
    const viability = buildMarketViability(day0, teamId)
    expect(viability.verdict).toBe('UNKNOWN')
    expect(viability.annualSalaryMajor).toBeNull() // unknown, not zero
    expect(viability.reasons.join(' ')).toContain('desconocido')
  })

  it('2. la necesidad (SG) se detecta con el análisis canónico y abre una vía de fichaje de agente libre para el usuario', () => {
    const context = assessGMDecisionContext(day0, teamId, day0.currentDate, { includeAllDetectedNeeds: true })
    const sg = context.needsAssessment.needs.filter((need) => need.targetPosition === 'SG' && (need.kind === 'STARTER_QUALITY_GAP' || need.kind === 'BENCH_QUALITY_GAP'))
    expect(sg.length).toBeGreaterThan(0)
    expect(context.options.some((option) => option.kind === 'EXTERNAL_ACQUISITION' && sg.some((need) => need.id === option.needId) && option.planningEligibility === 'SELECTABLE')).toBe(true)
    // The default (AI) importance threshold is unchanged: these MEDIUM/PLANNED needs yield no autonomous acquisition option.
    expect(assessGMDecisionContext(day0, teamId).options.some((option) => option.kind === 'EXTERNAL_ACQUISITION')).toBe(false)
    const offers = assessRoutedFreeAgentOfferIntelligence(day0, teamId)
    expect(offers.filter((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.contactReadiness === 'READY_TO_CONTACT').length).toBeGreaterThanOrEqual(3)
  })
})

describe('F3 · economía: presupuesto ≠ tesorería ≠ compromisos, con margen real', () => {
  it('3. el club tiene caja y margen salarial autorizado POSITIVO tras atribuir cada año contractual a un único ejercicio; margen = autorizado − comprometido', () => {
    const viability = buildMarketViability(day0, teamId)
    expect(viability.currencyCode).toBe('EUR')
    expect(viability.authorizedMajor).toBe(10_700_000)
    expect(viability.committedMajor).toBe(9_130_000) // one contract year per contract, not two (the payroll of the 16 players)
    expect(viability.marginMajor).toBe(viability.authorizedMajor! - viability.committedMajor! - viability.reservedMajor!)
    expect(viability.marginMajor!).toBeGreaterThan(0)
    expect(viability.cashMajor).toBeNull() // cash is only quoted for a concrete proposal
    expect(viability.salaryCap).toBe('NOT_APPLICABLE')
    const probe = buildMarketViability(day0, teamId, { annualSalary: 100_000, years: 2 })
    expect(probe.cashMajor!).toBeGreaterThan(1_000_000) // the simulated opening treasury exists and is not the budget
    expect(probe.cashMajor).not.toBe(probe.marginMajor)
    expect(probe.verdict).toBe('VIABLE')
    expect(probe.totalContractMajor).toBe(200_000)
    expect(probe.marginAfterMajor).toBe(probe.marginMajor! - 100_000)
  })

  it('4. rechazo por límite real: un salario un euro por encima del margen no es viable aunque haya caja de sobra, y explica por qué', () => {
    const margin = buildMarketViability(day0, teamId).marginMajor!
    const over = buildMarketViability(day0, teamId, { annualSalary: margin + 1, years: 1 })
    expect(over.verdict).toBe('NOT_VIABLE')
    expect(over.financeStatus).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(over.cashMajor!).toBeGreaterThan(margin) // plenty of cash: an authorization is not cash, and cash is not an authorization
    expect(over.reasons.join(' ')).toContain('margen salarial')
    const exact = buildMarketViability(day0, teamId, { annualSalary: margin, years: 1 })
    expect(exact.verdict).toBe('VIABLE')
    expect(exact.marginAfterMajor).toBe(0)
    // The same verdict is what the engine enforces at the binding step.
    const decision = evaluateTeamGameplayFinancialDecision(day0, { teamId, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: margin + 1, sourceAuthority: 'F3', sourceEntityId: 'over' })
    expect(decision.allowed).toBe(false)
    expect(decision.outcome).toBe('HAS_LIQUIDITY_BUT_NO_AUTHORIZATION')
  })
})

describe('F3 · fichaje de un agente libre: Buscar → Contactar → Negociar → Oferta → Respuesta → Governance → Firma → Plantilla', () => {
  it('5. el ciclo completo, cambiando de candidato cuando uno no se interesa, termina en un contrato firmado una sola vez', () => {
    before = snapshot(f3World())
    const candidates = getFreeAgents(f3World()).filter((player) => player.basketball.primaryPosition === 'SG').map((player) => player.id)
    const result = f3SignFirstViable(candidates)
    expect(result.signed).toBeDefined()
    signed = result.signed!
    after = snapshot(f3World())
    // Governance is exercised, not skipped: proposal by the executive, approval by the Board on a later day, one execution.
    const steps = signed.log.map((item) => item.step)
    expect(steps).toEqual(['contact', 'contactResponse', 'preparation', 'offer', 'playerResponse', 'governanceStarted', 'board', 'signed'])
    expect(signed.log.find((item) => item.step === 'board')!.detail).toBe('APPROVED')
    const decisions = Object.values(f3World().governanceDecisionsById).filter((decision) => decision.decisionType === 'PLAYER_CONTRACT_SIGNING' && decision.subject.kind === 'GENERIC' && decision.subject.referenceId === signed.negotiationId)
    expect(decisions).toHaveLength(1)
    const events = Object.values(f3World().governanceDecisionEventsById).filter((event) => event.decisionId === decisions[0]!.id)
    expect(events.map((event) => event.kind).sort()).toEqual(['APPROVED', 'EXECUTED', 'PROPOSED'])
  })

  it('6. efectos contractuales, de plantilla e históricos: un contrato nuevo, un jugador más, una transacción, un jugador libre menos', () => {
    const world = f3World()
    const contract = world.contractsById[signed.contractId as keyof typeof world.contractsById]!
    const negotiation = world.negotiationsById[signed.negotiationId]!
    expect(negotiation.status).toBe('SIGNED')
    expect(contract.playerId).toBe(signed.playerId)
    expect(contract.teamId).toBe(teamId)
    expect('salary' in negotiation && contract.compensation.annualSalary === negotiation.salary).toBe(true)
    expect(getPlayerContractStatus(contract, world.currentDate)).toBe('active')
    expect(after.contracts).toBe(before.contracts + 1)
    expect(after.roster).toHaveLength(before.roster.length + 1)
    expect(after.roster).toContain(signed.playerId)
    expect(after.signedTransactions).toBe(before.signedTransactions + 1)
    expect(after.freeAgents).toHaveLength(before.freeAgents.length - 1)
    expect(after.freeAgents).not.toContain(signed.playerId)
    expect(Object.values(world.contractsById).filter((item) => item.playerId === signed.playerId && getPlayerContractStatus(item, world.currentDate) !== 'expired')).toHaveLength(1) // no overlapping contracts
  })

  it('7. efectos económicos: el margen baja exactamente el salario anual, la firma no mueve la tesorería ni el libro mayor, y la reserva queda consumida (nunca abierta)', () => {
    const world = f3World()
    const negotiation = world.negotiationsById[signed.negotiationId]!
    const salary = 'salary' in negotiation ? negotiation.salary! : NaN
    const pre = snapshot(signed.worldBeforeSigning)
    const post = snapshot(signed.worldAfterSigning)
    expect(post.margin).toBe(pre.margin - salary)
    expect(post.committed).toBe(pre.committed + salary)
    expect(post.authorized).toBe(pre.authorized) // the authorization is a budget fact: signing does not rewrite it
    expect(post.ledgerTransactions).toBe(pre.ledgerTransactions) // signing posts nothing: payroll is recognized by the daily lifecycle on its due date
    expect(post.cash).toBe(pre.cash) // no cash moves when a contract is signed
    const bridge = post.reservations.filter((item) => !pre.reservations.includes(item))
    expect(bridge).toEqual([`CONSUMED:${signed.contractId}`])
    // The signing opens no reservation of its own: the OPEN holds that exist belong to other operations and are unchanged.
    expect(post.reservations.filter((item) => item.startsWith('OPEN:'))).toEqual(pre.reservations.filter((item) => item.startsWith('OPEN:')))
    // Across the whole cycle the margin moved by that salary and nothing else: the offer and the Board approval reserved nothing.
    expect(after.margin).toBe(before.margin - salary)
    expect(after.reservations.filter((item) => item.endsWith(`:${signed.contractId}`))).toEqual([`CONSUMED:${signed.contractId}`])
  })

  it('8. el comando terminal repetido no duplica nada: ni contrato, ni transacción, ni reserva, ni evento de ejecución', () => {
    const world = f3World()
    const negotiation = world.negotiationsById[signed.negotiationId]!
    f3Store().completeFreeAgentSigning(teamId, negotiation.id, negotiation.sourceProposalId!)
    f3Store().contactFreeAgent(teamId, signed.playerId, negotiation.sourceProposalId!)
    f3Store().submitFreeAgentOffer(teamId, negotiation.id, negotiation.sourceProposalId!)
    const again = snapshot(f3World())
    expect(again.contracts).toBe(after.contracts)
    expect(again.signedTransactions).toBe(after.signedTransactions)
    expect(again.reservations).toEqual(after.reservations)
    expect(again.margin).toBe(after.margin)
    expect(Object.values(f3World().negotiationsById).filter((item) => item.playerId === signed.playerId)).toHaveLength(1)
  })

  it('9. el jugador fichado es elegible y puede ser titular: juega el siguiente partido del usuario con minutos reales', () => {
    const player = signed.playerId
    expect(isPlayerAvailable(f3World(), player, f3World().currentDate)).toBe(true)
    f3Store().setLineupSlot('SG', player as PlayerId)
    expect(f3World().lineupsByTeamId[teamId]!.starters.SG).toBe(player)
    let guard = 0
    let gameId: string | undefined
    while (gameId === undefined && guard < 14) {
      guard += 1
      const today = Object.values(f3World().games).find((game) => game.status === 'scheduled' && game.date === f3World().currentDate && (game.homeTeamId === teamId || game.awayTeamId === teamId))
      f3AdvanceDay()
      if (today !== undefined) gameId = today.id
    }
    expect(gameId).toBeDefined()
    const lines = f3World().matchStatLogsByGameId[gameId as keyof GameWorld['matchStatLogsByGameId']]!.playerLines
    const line = lines.find((item) => item.playerId === player)
    expect(line).toBeDefined()
    expect(line!.stats.secondsPlayed).toBeGreaterThan(0)
  })
})

describe('F3 · Save V4 conserva el fichaje y su rastro económico, y continuar días no repite operaciones', () => {
  it('10. guardar → cargar da un mundo idéntico; avanzar varios días después no duplica contratos, transacciones, eventos ni compromisos', async () => {
    const world = f3World()
    const loaded = await roundTrip(world)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
    expect(loaded.contractsById[signed.contractId as keyof typeof loaded.contractsById]).toEqual(world.contractsById[signed.contractId as keyof typeof world.contractsById])
    expect(Object.keys(loaded.marketRealityByPlayerId)).toHaveLength(15)
    expect(loaded.negotiationsById[signed.negotiationId]!.status).toBe('SIGNED')
    f3Store().replaceWorld(loaded)
    const base = snapshot(loaded)
    f3AdvanceDays(5)
    const later = snapshot(f3World())
    expect(later.contracts).toBe(base.contracts)
    expect(later.signedTransactions).toBe(base.signedTransactions)
    expect(later.roster).toContain(signed.playerId)
    expect(Object.values(f3World().governanceDecisionEventsById).filter((event) => event.kind === 'EXECUTED' && event.decisionId.includes(encodeURIComponent(signed.negotiationId))).length).toBeLessThanOrEqual(1)
    expect(assessPlayerContractSigningReadiness(f3World(), teamId, signed.negotiationId).status).toBe('ALREADY_SIGNED')
  })
})

void assessFormalOfferPreparation
void useGameStore
