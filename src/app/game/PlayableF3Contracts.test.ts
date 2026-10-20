import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlayerContractStatus } from '@/domain/contract'
import { addYears, parseGameDate } from '@/domain/date'
import { getContractFinancialSchedule } from '@/domain/finance'
import { getOrganizationFinancialAuthorization } from '@/domain/finance/FinancialAuthorization'
import { authorizeTeamSalaryForTest } from '@/domain/finance/financeTestFixture'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getFreeAgents, getTeamRoster, isPlayerFreeAgent, updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { assessRetentionEligibility } from '@/engine/contractRetention/ContractRetentionEngine'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { assessContractRelease } from '@/app/market/ContractReleaseService'
import { assessPlayerContractSigningReadiness } from '@/app/governance'
import { assessRoutedFreeAgentOfferIntelligence } from '@/app/marketIntelligence'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, identifyStaffCandidate, rankStaffCandidates, startStaffInterview } from '@/app/staffCareer'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { buildMarketViability } from '@/ui-ng/applications/market/marketViability'
import { buildMarketOperationsHistory } from '@/ui-ng/applications/market/marketOperationsHistory'
import { createF3Day0, f3AdvanceDay, f3AdvanceDays, f3SignFirstViable, f3SignFreeAgent, f3Store, f3World, type F3SigningOutcome } from './testSupport/PlayableF3Support'

/**
 * F3 · renovación, liberación, staff y los límites económicos de las operaciones, sobre la misma partida real (ACB 2026/27, UCAM Murcia).
 * Los escenarios que el mundo no produce por sí solo (una contraoferta, una autorización reducida) usan fixtures canónicas
 * complementarias, identificadas como tales en cada test; el resto son acciones del store y días reales.
 */
// These tests play real days (matches, Board, signing) on a 16-club league: slow runners need more than the 30 s CI default, as the F2 suites do.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })
const savedAt = '2026-10-27T09:00:00.000Z'
const memoryRepository = (): GameSaveRepository & { file: string } => {
  const repository = { file: '', save: async (json: string) => { repository.file = json }, load: async () => repository.file, getInfo: async () => ({ savedAt }) }
  return repository
}
const roundTrip = async (world: GameWorld): Promise<GameWorld> => { const repository = memoryRepository(); await saveCurrentGame(world, repository, savedAt); return loadSavedGame(repository) }

let day0: GameWorld
let teamId: TeamId
const start = (world: GameWorld) => { f3Store().replaceWorld(world) }
const fullTerms = (salary: number, years: number) => ({ salary, years, guarantees: Array.from({ length: years }, (_, index) => ({ year: index + 1, guaranteedAmount: salary })) })
const margin = (world: GameWorld) => buildMarketViability(world, teamId).marginMajor!
const poolReality = (world: GameWorld, playerId: string) => world.marketRealityByPlayerId[playerId as PlayerId]!
const willing = (world: GameWorld, predicate: (reality: ReturnType<typeof poolReality>) => boolean) =>
  getFreeAgents(world).map((player) => player.id).filter((id) => world.marketRealityByPlayerId[id] !== undefined && poolReality(world, id).playerWillingness >= 50 && predicate(poolReality(world, id)))

beforeAll(async () => {
  day0 = await createF3Day0()
  teamId = getUserTeam(day0)!.id
}, 900_000)

describe('F3 · renovación: un contrato firmado, no una intención', () => {
  let signedOneYear: Extract<F3SigningOutcome, { status: 'SIGNED' }>
  let renewal: { negotiationId: string; successorId: string; predecessorId: string }

  it('0. la ventana de renovación de los contratos de la plantilla inicial se abre 365 días antes de vencer; con las reglas vigentes de la temporada resuelve el 1 de julio', () => {
    const earliest = Object.values(day0.contractsById).filter((contract) => contract.teamId === teamId).sort((a, b) => a.term.expiresOn.localeCompare(b.term.expiresOn))[0]!
    expect(earliest.term.expiresOn).toBe('2028-07-01')
    expect(assessRetentionEligibility(day0, teamId, earliest.id).reasons).toContain('RETENTION_WINDOW_CLOSED')
    // Complementary fixture (clock jump, no daily lifecycle): the window opens on 2027-07-02 (365 days before the leap-year expiry) and the off-season expiry date is governed by the last season's rules.
    const opened = updateGameWorld(day0, { currentDate: parseGameDate('2027-07-02') })
    const eligibility = assessRetentionEligibility(opened, teamId, earliest.id)
    expect(eligibility.reasons).not.toContain('RETENTION_WINDOW_CLOSED')
    expect(eligibility.reasons).not.toContain('EFFECTIVE_CONTRACT_RULES_UNAVAILABLE')
    expect(assessRetentionEligibility(opened, teamId, earliest.id, { salary: earliest.compensation.annualSalary, years: 3 }).reasons).not.toContain('EFFECTIVE_CONTRACT_RULES_UNAVAILABLE')
    expect(assessRetentionEligibility(opened, teamId, earliest.id, { salary: earliest.compensation.annualSalary, years: 9 }).reasons).toContain('CONTRACT_TERM_NOT_LEGAL')
  })

  it('1. ficha a un agente libre con contrato de un año (su ventana de renovación ya está abierta) usando el ciclo completo', () => {
    start(day0)
    const oneYear = willing(day0, (reality) => reality.expectedYears === 1 && reality.expectedSalary <= 500_000)
    expect(oneYear.length).toBeGreaterThan(0)
    const result = f3SignFirstViable(oneYear as PlayerId[])
    expect(result.signed).toBeDefined()
    signedOneYear = result.signed!
    const contract = f3World().contractsById[signedOneYear.contractId as keyof GameWorld['contractsById']]!
    expect(contract.term.expiresOn.slice(0, 4)).toBe('2027')
    expect(assessRetentionEligibility(f3World(), teamId, contract.id)).toMatchObject({ eligible: true, retentionWindowDays: 365 })
  })

  it('2. renovación aceptada: oferta → aceptación → Governance (consejo) → contrato sucesor firmado una sola vez, sin solapar el vigente', () => {
    const world = f3World()
    const predecessor = world.contractsById[signedOneYear.contractId as keyof GameWorld['contractsById']]!
    const marginBefore = margin(world)
    const rosterBefore = getTeamRoster(world, teamId).length
    f3Store().openContractRetention(teamId, predecessor.id, 'f3-open')
    const opened = Object.values(f3World().retentionNegotiationsById).find((item) => item.predecessorContractId === predecessor.id)!
    expect(opened.status).toBe('OPEN')
    f3Store().submitContractRetentionOffer(teamId, opened.id, 0, 'f3-offer-1', fullTerms(predecessor.compensation.annualSalary, 2))
    const answered = f3World().retentionNegotiationsById[opened.id]!
    expect(answered.status).toBe('ACCEPTED')
    expect(answered.acceptedTerms).toMatchObject({ salary: predecessor.compensation.annualSalary, years: 2 })
    // Accepted in principle is NOT a signed contract: no successor, same roster, same margin.
    expect(Object.values(f3World().contractsById).filter((contract) => contract.predecessorContractId === predecessor.id)).toHaveLength(0)
    f3Store().requestRetentionSigning(teamId, opened.id)
    expect(Object.values(f3World().governanceDecisionsById).filter((decision) => decision.subject.kind === 'GENERIC' && decision.subject.referenceId === `retention:${opened.id}`)).toHaveLength(1)
    f3AdvanceDay() // the Board decides on the following day; the approved renewal is then executed
    const signed = f3World().retentionNegotiationsById[opened.id]!
    expect(signed.execution?.status).toBe('SIGNED')
    const successor = f3World().contractsById[signed.execution!.contractId]!
    renewal = { negotiationId: opened.id, successorId: successor.id, predecessorId: predecessor.id }
    expect(successor.predecessorContractId).toBe(predecessor.id)
    expect(successor.term.startsOn).toBe(predecessor.term.expiresOn) // continuous, never overlapping
    expect(successor.compensation.annualSalary).toBe(predecessor.compensation.annualSalary)
    expect(getPlayerContractStatus(successor, f3World().currentDate)).toBe('scheduled')
    expect(Object.values(f3World().contractsById).filter((contract) => contract.playerId === predecessor.playerId && getPlayerContractStatus(contract, f3World().currentDate) === 'active')).toHaveLength(1)
    expect(getTeamRoster(f3World(), teamId)).toHaveLength(rosterBefore)
    expect(margin(f3World())).toBe(marginBefore) // the successor's first year falls in a later fiscal year
    const events = Object.values(f3World().governanceDecisionEventsById).filter((event) => event.decisionId.includes(encodeURIComponent(`retention:${opened.id}`)) || event.decisionId.includes('retention'))
    expect(events.filter((event) => event.kind === 'EXECUTED').length).toBe(1)
    expect(buildMarketOperationsHistory(f3World(), teamId).filter((row) => row.kind === 'RENOVACION' && row.playerId === predecessor.playerId)).toHaveLength(1)
  })

  it('3. compromiso futuro actualizado en Finance, reserva consumida, y repetir los días no duplica nada', () => {
    const world = f3World()
    const successor = world.contractsById[renewal.successorId as keyof GameWorld['contractsById']]!
    const schedule = getContractFinancialSchedule(world, { contractId: successor.id, currencyCode: 'EUR', includeConditional: false })
    expect(schedule.filter((entry) => entry.compensationStatus === 'GUARANTEED')).toHaveLength(2)
    expect(schedule.map((entry) => entry.effectiveOn)).toEqual([successor.term.startsOn, addYears(successor.term.startsOn, 1)]) // one guaranteed contract-year per year of the new term
    const bridge = Object.values(world.financialReservationsById).filter((reservation) => reservation.sourceEntityId === successor.id)
    expect(bridge.map((reservation) => reservation.status)).toEqual(['CONSUMED'])
    const contractsBefore = Object.keys(world.contractsById).length
    f3AdvanceDays(3)
    expect(Object.keys(f3World().contractsById)).toHaveLength(contractsBefore)
    expect(Object.values(f3World().contractsById).filter((contract) => contract.predecessorContractId === renewal.predecessorId)).toHaveLength(1)
    f3Store().requestRetentionSigning(teamId, renewal.negotiationId) // a repeated terminal command
    expect(Object.values(f3World().contractsById).filter((contract) => contract.predecessorContractId === renewal.predecessorId)).toHaveLength(1)
  })

  it('4. Save V4 conserva el acuerdo, la ejecución y el sucesor; y el nuevo periodo se aplica al vencer el vigente', async () => {
    const world = f3World()
    const loaded = await roundTrip(world)
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
    expect(loaded.retentionNegotiationsById[renewal.negotiationId]!.execution).toEqual(world.retentionNegotiationsById[renewal.negotiationId]!.execution)
    const predecessor = loaded.contractsById[renewal.predecessorId as keyof GameWorld['contractsById']]!
    const successor = loaded.contractsById[renewal.successorId as keyof GameWorld['contractsById']]!
    // Complementary fixture (clock jump to the boundary, then the daily reconciliation the Calendar runs): the new term takes over exactly there.
    const boundary = reconcileExpiredPlayerContracts(updateGameWorld(loaded, { currentDate: successor.term.startsOn }), successor.term.startsOn)
    expect(getPlayerContractStatus(predecessor, boundary.currentDate)).toBe('expired')
    expect(getPlayerContractStatus(boundary.contractsById[successor.id]!, boundary.currentDate)).toBe('active')
    expect(boundary.teams[teamId]!.rosterPlayerIds).toContain(successor.playerId)
    expect(Object.values(boundary.contractsById).filter((contract) => contract.playerId === successor.playerId && getPlayerContractStatus(contract, boundary.currentDate) === 'active')).toHaveLength(1)
  })

  it('5. oferta rechazada: una oferta muy por debajo no firma nada y deja constancia (no se confunde con una renovación)', () => {
    // Branch from the same signed world as test 2 (before the renewal): an offer far below the player's expectation.
    start(signedOneYear.worldAfterSigning)
    const predecessor = f3World().contractsById[signedOneYear.contractId as keyof GameWorld['contractsById']]!
    f3Store().openContractRetention(teamId, predecessor.id, 'f3-open-low')
    const opened = Object.values(f3World().retentionNegotiationsById).find((item) => item.predecessorContractId === predecessor.id)!
    f3Store().submitContractRetentionOffer(teamId, opened.id, 0, 'f3-offer-low', { salary: 1, years: 1 })
    const answered = f3World().retentionNegotiationsById[opened.id]!
    expect(['REJECTED', 'PLAYER_COUNTERED']).toContain(answered.status)
    expect(answered.rounds.at(-1)!.playerResponse.outcome).not.toBe('ACCEPTED')
    expect(Object.values(f3World().contractsById).filter((contract) => contract.predecessorContractId === predecessor.id)).toHaveLength(0)
    expect(buildMarketOperationsHistory(f3World(), teamId).filter((row) => row.kind === 'RENOVACION')).toHaveLength(0)
  })

  it('6. revisión de disponibilidad económica: un acuerdo cuyo salario supera el margen autorizado es rechazado por el consejo con Finance, y no hay sucesor', () => {
    start(signedOneYear.worldAfterSigning)
    const predecessor = f3World().contractsById[signedOneYear.contractId as keyof GameWorld['contractsById']]!
    const tooMuch = margin(f3World()) + 100_000
    f3Store().openContractRetention(teamId, predecessor.id, 'f3-open-big')
    const opened = Object.values(f3World().retentionNegotiationsById).find((item) => item.predecessorContractId === predecessor.id)!
    f3Store().submitContractRetentionOffer(teamId, opened.id, 0, 'f3-offer-big', fullTerms(tooMuch, 2))
    expect(f3World().retentionNegotiationsById[opened.id]!.status).toBe('ACCEPTED') // the player is delighted: the limit is the club's, not the player's
    f3Store().requestRetentionSigning(teamId, opened.id)
    f3AdvanceDay()
    const decision = Object.values(f3World().governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${opened.id}`)!
    const kinds = Object.values(f3World().governanceDecisionEventsById).filter((event) => event.decisionId === decision.id).map((event) => event.kind)
    expect(kinds).toContain('REJECTED')
    expect(kinds).not.toContain('EXECUTED')
    expect(f3World().retentionNegotiationsById[opened.id]!.execution).toBeUndefined()
    expect(Object.values(f3World().contractsById).filter((contract) => contract.predecessorContractId === predecessor.id)).toHaveLength(0)
  })
})

describe('F3 · liberación: baja real con sus consecuencias económicas, deportivas e históricas', () => {
  const playerId = 'acb-player-ucm-03' as PlayerId
  it('7. la vista previa explica lo que sobrevive (obligaciones garantizadas) y ejecutar es idempotente', () => {
    start(day0)
    const preview = assessContractRelease(f3World(), teamId, playerId)
    expect(preview.status).toBe('READY')
    if (preview.status !== 'READY') return
    expect(preview.financeConsequences.length).toBeGreaterThan(0) // future guaranteed salary is listed, not hidden
    expect(preview.financeConsequences.every((item) => item.amount === 10_000_000 && item.currencyCode === 'EUR')).toBe(true)
    const marginBefore = margin(f3World())
    const rosterBefore = getTeamRoster(f3World(), teamId).length
    f3Store().releasePlayer(teamId, playerId)
    const world = f3World()
    expect(getTeamRoster(world, teamId)).toHaveLength(rosterBefore - 1)
    const contract = world.contractsById[preview.contractIds[0]!]!
    expect(contract.termination).toEqual({ terminatedOn: world.currentDate, reason: 'released' })
    expect(Object.values(world.playerTransactionsById).filter((item) => item.playerId === playerId && item.kind === 'released')).toHaveLength(1)
    expect(JSON.stringify(world.lineupsByTeamId[teamId])).not.toContain(playerId)
    expect(margin(world)).toBe(marginBefore) // the guaranteed obligation does not vanish: Finance keeps counting it
    expect(f3Store().marketNotice?.kind).toBe('info')
    f3Store().releasePlayer(teamId, playerId) // repeated terminal command
    expect(Object.values(f3World().playerTransactionsById).filter((item) => item.playerId === playerId && item.kind === 'released')).toHaveLength(1)
    expect(getTeamRoster(f3World(), teamId)).toHaveLength(rosterBefore - 1)
    expect(buildMarketOperationsHistory(f3World(), teamId).filter((row) => row.kind === 'BAJA' && row.playerId === playerId)).toHaveLength(1)
  })

  it('8. el liberado no juega: el motor no usa a quien ya no pertenece al equipo, y el usuario puede volver a ver al jugador como agente libre', () => {
    let guard = 0
    let gameId: string | undefined
    while (gameId === undefined && guard < 14) {
      guard += 1
      const today = Object.values(f3World().games).find((game) => game.status === 'scheduled' && game.date === f3World().currentDate && (game.homeTeamId === teamId || game.awayTeamId === teamId))
      f3AdvanceDay()
      if (today !== undefined) gameId = today.id
    }
    const lines = f3World().matchStatLogsByGameId[gameId as keyof GameWorld['matchStatLogsByGameId']]!.playerLines
    expect(lines.some((line) => line.playerId === playerId)).toBe(false)
    expect(isPlayerFreeAgent(f3World(), playerId)).toBe(true)
    // A released player is a free agent like any other: contacting him reaches the same answer path (his market truth is derived on demand).
    const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, playerId).find((item) => item.playerId === playerId)
    if (offer?.contactReadiness === 'READY_TO_CONTACT') {
      f3Store().contactFreeAgent(teamId, playerId, offer.sourceProposalId!)
      f3AdvanceDay()
      const contact = Object.values(f3World().negotiationsById).find((item) => item.playerId === playerId)!
      expect(f3World().marketRealityByPlayerId[playerId]).toBeDefined()
      expect('contactResponse' in contact && contact.contactResponse !== undefined).toBe(true)
    }
  })

  it('9. no se libera a quien no tiene contrato con el club: se explica y no cambia nada', () => {
    const fa = getFreeAgents(day0)[0]!.id
    expect(assessContractRelease(day0, teamId, fa)).toMatchObject({ status: 'NO_ACTIVE_CONTRACT' })
    const foreign = Object.values(day0.teams).find((team) => team.id !== teamId)!.rosterPlayerIds[0]!
    expect(assessContractRelease(day0, teamId, foreign)).toMatchObject({ status: 'NO_ACTIVE_CONTRACT' })
    start(day0)
    f3Store().releasePlayer(teamId, fa)
    expect(f3World()).toBe(day0)
    expect(f3Store().marketNotice?.kind).toBe('error')
  })
})

describe('F3 · staff: contratación básica con su efecto económico y contractual', () => {
  it('10. contratar un candidato (identificar → entrevistar → oferta → confirmar) crea contrato, vínculo, historial y compromiso Staff; guardar/cargar lo conserva', async () => {
    start(day0)
    const staffLine = (world: GameWorld) => staffCommitted(world, world.teams[teamId]!.organizationId)
    let world = day0
    const opened = createStaffJobOpeningForTeam(world, { teamId, roleId: 'assistantCoach' })
    world = opened.world
    const candidate = rankStaffCandidates(world, opened.opening.id).find((id) => world.staffEmploymentByStaffId[id]?.status !== 'employed') ?? rankStaffCandidates(world, opened.opening.id)[0]!
    world = identifyStaffCandidate(world, { openingId: opened.opening.id, staffId: candidate }).world
    const candidacy = Object.values(world.staffJobCandidaciesById).find((item) => item.staffId === candidate && item.jobOpeningId === opened.opening.id)!
    world = completeStaffInterview(startStaffInterview(world, candidacy.id), candidacy.id)
    world = createStaffJobOffer(world, { candidacyId: candidacy.id }).world
    const offer = Object.values(world.staffJobOffersById).find((item) => item.staffId === candidate && item.status === 'pending')!
    expect(offer.annualSalary).toBeGreaterThan(0)
    const before = staffLine(world)
    expect(Object.values(world.staffContractsById).some((item) => item.staffId === candidate && item.teamId === teamId)).toBe(false) // an offer is not a hiring
    world = acceptStaffJobOffer(world, offer.id)
    const contract = Object.values(world.staffContractsById).find((item) => item.staffId === candidate && item.teamId === teamId)!
    expect(contract.compensation.annualSalary).toBe(offer.annualSalary)
    expect(world.staffEmploymentByStaffId[candidate]).toMatchObject({ status: 'employed', teamId, roleId: 'assistantCoach' })
    expect(Object.values(world.teamStaffAssignmentsById).filter((item) => item.staffPersonId === candidate && item.teamId === teamId)).toHaveLength(1)
    expect(world.staffCareerHistoryByStaffId[candidate]!.filter((entry) => entry.kind === 'appointment' && entry.reason === 'hired' && entry.teamId === teamId)).toHaveLength(1)
    expect(staffLine(world)).toBe(before + offer.annualSalary!)
    expect(world.staffJobOpeningsById[opened.opening.id]!.status).toBe('filled')
    // Available to be given a responsibility.
    f3Store().replaceWorld(world)
    f3Store().setStaffResponsibility({ teamId, kind: 'assignIndividualDevelopment', mode: 'delegated', holderStaffId: candidate })
    expect(Object.values(f3World().responsibilitiesById).some((item) => item.teamId === teamId && item.holderStaffId === candidate)).toBe(true)
    const loaded = await roundTrip(f3World())
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(f3World()))
    expect(buildMarketOperationsHistory(loaded, teamId).filter((row) => row.kind === 'STAFF_ALTA')).toHaveLength(1)

    // Releasing staff: contract terminated, vínculo and responsibility vacated, vacancy open, the commitment is withdrawn (no severance is modelled), once.
    f3Store().fireStaff(candidate)
    const fired = f3World()
    expect(fired.staffEmploymentByStaffId[candidate]!.status).toBe('unemployed')
    expect(fired.staffContractsById[contract.id]!.termination?.reason).toBe('performance')
    expect(Object.values(fired.responsibilitiesById).some((item) => item.teamId === teamId && item.holderStaffId === candidate)).toBe(false)
    expect(staffLine(fired)).toBe(before)
    expect(fired.staffCareerHistoryByStaffId[candidate]!.filter((entry) => entry.kind === 'departure' && entry.teamId === teamId)).toHaveLength(1)
    f3Store().fireStaff(candidate) // repeated command: refused, nothing duplicated
    expect(f3World()).toBe(fired)
    expect(f3Store().marketNotice?.kind).toBe('error')
  })
})

/** The STAFF_SALARY line of the canonical authorization: the same figure Finance uses to allow or refuse a hiring (major units). */
function staffCommitted(world: GameWorld, organizationId: string): number {
  return getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR' }).lines.find((item) => item.category === 'STAFF_SALARY')!.committedMinorUnits / 100
}

describe('F3 · límites económicos de las operaciones', () => {
  it('11. una operación inválida por presupuesto se rechaza de verdad: el jugador acepta hablar, pero su salario supera el margen y Finance impide presentar la oferta', () => {
    start(day0)
    const expensive = getFreeAgents(day0).map((player) => player.id).filter((id) => poolReality(day0, id).playerWillingness >= 50 && poolReality(day0, id).expectedSalary > margin(day0))
    expect(expensive.length).toBeGreaterThan(0)
    const playerId = expensive[0]! as PlayerId
    const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, playerId).find((item) => item.playerId === playerId)
    // Before contacting, nothing is known about his price: the market cannot say "not viable" about an unknown quantity.
    expect(buildMarketViability(f3World(), teamId).verdict).toBe('UNKNOWN')
    f3Store().contactFreeAgent(teamId, playerId, offer!.sourceProposalId!)
    f3AdvanceDay()
    const contact = Object.values(f3World().negotiationsById).find((item) => item.playerId === playerId)!
    const known = f3World().marketKnowledge.find((item) => item.playerId === playerId && item.expectedSalary !== undefined)!
    expect(known.expectedSalary).toBe(poolReality(day0, playerId).expectedSalary)
    const viability = buildMarketViability(f3World(), teamId, { annualSalary: known.expectedSalary!, years: known.expectedYears! })
    expect(viability.verdict).toBe('NOT_VIABLE')
    expect(viability.financeStatus).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(viability.cashMajor!).toBeGreaterThan(known.expectedSalary!) // there is cash: authorization, not cash, is the limit
    // The club's own recommendation disappears once the known price is beyond the authorization: there is no offer to prepare.
    expect(assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, playerId, contact.sourcePlanId).find((item) => item.sourceProposalId === contact.sourceProposalId)).toBeUndefined()
    const worldBefore = f3World()
    f3Store().submitFreeAgentOffer(teamId, contact.id, contact.sourceProposalId!)
    expect(f3World()).toBe(worldBefore) // rejected: nothing changed
    expect(f3Store().marketNotice?.kind).toBe('error')
    expect(f3Store().marketNotice?.text).toContain('Finance rechaza')
    expect(Object.values(f3World().negotiationsById).find((item) => item.id === contact.id)!.status).toBe('CONTACTED')
    expect(Object.keys(f3World().contractsById)).toHaveLength(Object.keys(day0.contractsById).length)
  })

  it('12. oferta que compromete recursos: tres acuerdos simultáneos que juntos superan el margen se aprueban uno a uno, pero sólo se firman los que caben; el último es rechazado al firmar', () => {
    // Complementary fixture: a reduced PLAYER_SALARY authorization (margin of 400,000) so that three real agreements compete for it.
    const committed = buildMarketViability(day0, teamId).committedMajor!
    const reduced = authorizeTeamSalaryForTest(day0, teamId, { currencyCode: 'EUR', playerSalaryMinorUnits: (committed + 400_000) * 100, staffSalaryMinorUnits: 280_400_000 })
    start(reduced)
    expect(margin(reduced)).toBe(400_000)
    const names = ['acb-free-agent-player-sg-01', 'acb-free-agent-player-sf-03', 'acb-free-agent-player-c-03'] as PlayerId[] // 230,000 + 160,000 + 120,000 = 510,000 > 400,000
    expect(names.every((id) => poolReality(reduced, id).playerWillingness >= 50)).toBe(true)
    for (const id of names) {
      const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, id).find((item) => item.playerId === id)!
      f3Store().contactFreeAgent(teamId, id, offer.sourceProposalId!)
    }
    f3AdvanceDay()
    for (const id of names) {
      const contact = Object.values(f3World().negotiationsById).find((item) => item.playerId === id)!
      f3Store().submitFreeAgentOffer(teamId, contact.id, contact.sourceProposalId!)
    }
    f3AdvanceDay()
    const agreements = names.map((id) => Object.values(f3World().negotiationsById).find((item) => item.playerId === id)!)
    expect(agreements.map((item) => item.status)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED'])
    for (const agreement of agreements) {
      const readiness = assessPlayerContractSigningReadiness(f3World(), teamId, agreement.id)
      const body = Object.values(f3World().governanceAppointmentsById).find((item) => item.actor.kind === 'COACH' && item.actor.id === f3World().userCoachId && readiness.executorBodyIds.includes(item.bodyId))!.bodyId
      f3Store().startFreeAgentSigningGovernance(teamId, agreement.id, agreement.sourceProposalId!, body)
    }
    f3AdvanceDay()
    // Each agreement is individually affordable when the Board looks at it, so all three are approved...
    expect(agreements.map((item) => assessPlayerContractSigningReadiness(f3World(), teamId, item.id).status)).toEqual(['APPROVED', 'APPROVED', 'APPROVED'])
    // ...but the binding step re-checks against the current world: capacity is spent in order and never twice.
    for (const agreement of agreements) f3Store().completeFreeAgentSigning(teamId, agreement.id, agreement.sourceProposalId!)
    const statuses = agreements.map((item) => f3World().negotiationsById[item.id]!.status)
    expect(statuses).toEqual(['SIGNED', 'SIGNED', 'ACCEPTED'])
    expect(margin(f3World())).toBe(10_000)
    expect(assessPlayerContractSigningReadiness(f3World(), teamId, agreements[2]!.id).status).toBe('FINANCIAL_BLOCK')
    expect(f3Store().marketNotice?.kind).toBe('error')
    expect(Object.values(f3World().contractsById).filter((contract) => names.includes(contract.playerId as PlayerId))).toHaveLength(2)
    expect(Object.values(f3World().financialReservationsById).filter((reservation) => reservation.status === 'OPEN' && agreements.some((item) => reservation.sourceEntityId.includes(item.id)))).toHaveLength(0)
  })

  it('13. contraoferta: si el agente pide más, el usuario puede rechazar (se cierra sin coste ni reserva) o aceptar (firma a las condiciones acordadas)', () => {
    // Complementary fixture: after the contact answer the player's hidden expectation rises by 100,000 (a competing interest), so the
    // club's prepared offer (based on what it knew) is below it and the agent counters.
    const play = async (decision: 'DECLINE_COUNTER' | 'ACCEPT_COUNTER') => {
      start(day0)
      const playerId = 'acb-free-agent-player-sg-01' as PlayerId
      const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, playerId).find((item) => item.playerId === playerId)!
      f3Store().contactFreeAgent(teamId, playerId, offer.sourceProposalId!)
      f3AdvanceDay()
      const contact = Object.values(f3World().negotiationsById).find((item) => item.playerId === playerId)!
      const risen = { ...poolReality(f3World(), playerId), expectedSalary: poolReality(f3World(), playerId).expectedSalary + 100_000 }
      f3Store().replaceWorld(updateGameWorld(f3World(), { marketReality: [...Object.values(f3World().marketRealityByPlayerId).filter((item) => item.playerId !== playerId), risen] }))
      f3Store().submitFreeAgentOffer(teamId, contact.id, contact.sourceProposalId!)
      f3AdvanceDay()
      const countered = f3World().negotiationsById[contact.id]!
      expect(countered.status).toBe('COUNTERED')
      const marginAtCounter = margin(f3World())
      f3Store().decideFreeAgentCounter(teamId, contact.id, countered.round ?? 0, { kind: decision })
      return { id: contact.id, playerId, marginAtCounter, counter: countered }
    }
    return play('DECLINE_COUNTER').then((declined) => {
      expect(['CLOSED', 'DECLINED', 'REJECTED', 'WITHDRAWN']).toContain(f3World().negotiationsById[declined.id]!.status)
      expect(margin(f3World())).toBe(declined.marginAtCounter) // nothing was ever reserved by the offer
      expect(Object.keys(f3World().contractsById)).toHaveLength(Object.keys(day0.contractsById).length)
      return play('ACCEPT_COUNTER')
    }).then((accepted) => {
      expect(f3World().negotiationsById[accepted.id]!.status).toBe('ACCEPTED')
      const signed = (() => {
        const readiness = assessPlayerContractSigningReadiness(f3World(), teamId, accepted.id)
        const body = Object.values(f3World().governanceAppointmentsById).find((item) => item.actor.kind === 'COACH' && item.actor.id === f3World().userCoachId && readiness.executorBodyIds.includes(item.bodyId))!.bodyId
        f3Store().startFreeAgentSigningGovernance(teamId, accepted.id, accepted.counter.sourceProposalId!, body)
        f3AdvanceDay()
        f3Store().completeFreeAgentSigning(teamId, accepted.id, accepted.counter.sourceProposalId!)
        return f3World().negotiationsById[accepted.id]!
      })()
      expect(signed.status).toBe('SIGNED')
      const agreed = accepted.counter
      const contract = f3World().contractsById[(signed as { signedContractId: string }).signedContractId as keyof GameWorld['contractsById']]!
      expect(contract.compensation.annualSalary).toBe('salary' in agreed ? agreed.salary : NaN)
      expect(margin(f3World())).toBe(accepted.marginAtCounter - contract.compensation.annualSalary)
    })
  })
})

describe('F3 · cancelar una operación', () => {
  it('14. un acuerdo aceptado puede cancelarse retirando la propuesta de firma antes de ejecutarla: no firma, no consume margen y no puede completarse después', () => {
    start(day0)
    const playerId = 'acb-free-agent-player-sg-01' as PlayerId
    const offer = assessRoutedFreeAgentOfferIntelligence(f3World(), teamId, playerId).find((item) => item.playerId === playerId)!
    f3Store().contactFreeAgent(teamId, playerId, offer.sourceProposalId!)
    f3AdvanceDay()
    const contact = Object.values(f3World().negotiationsById).find((item) => item.playerId === playerId)!
    f3Store().submitFreeAgentOffer(teamId, contact.id, contact.sourceProposalId!)
    f3AdvanceDay()
    const accepted = f3World().negotiationsById[contact.id]!
    expect(accepted.status).toBe('ACCEPTED')
    const readiness = assessPlayerContractSigningReadiness(f3World(), teamId, accepted.id)
    const body = Object.values(f3World().governanceAppointmentsById).find((item) => item.actor.kind === 'COACH' && item.actor.id === f3World().userCoachId && readiness.executorBodyIds.includes(item.bodyId))!.bodyId
    f3Store().startFreeAgentSigningGovernance(teamId, accepted.id, accepted.sourceProposalId!, body)
    const decision = Object.values(f3World().governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === accepted.id)!
    const marginBefore = margin(f3World())
    f3Store().recordFreeAgentSigningDecision(decision.id, 'WITHDRAWN', body)
    expect(assessPlayerContractSigningReadiness(f3World(), teamId, accepted.id).status).toBe('WITHDRAWN')
    f3AdvanceDay() // the Board does not approve a withdrawn proposal
    f3Store().completeFreeAgentSigning(teamId, accepted.id, accepted.sourceProposalId!)
    expect(f3World().negotiationsById[accepted.id]!.status).toBe('ACCEPTED')
    expect(Object.values(f3World().contractsById).some((contract) => contract.playerId === playerId)).toBe(false)
    expect(margin(f3World())).toBe(marginBefore)
    expect(f3Store().marketNotice?.kind).toBe('error')
    expect(Object.values(f3World().governanceDecisionEventsById).filter((event) => event.decisionId === decision.id).map((event) => event.kind).sort()).toEqual(['PROPOSED', 'WITHDRAWN'])
  })
})

void f3SignFreeAgent
