import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getFreeAgentMarketTerms, releasePlayer, signFreeAgent } from '@/app/market'
import { completeAcceptedFreeAgentSigning } from '@/app/marketIntelligence/FreeAgentSigningService'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, identifyStaffCandidate, startStaffInterview } from '@/app/staffCareer/StaffCareerService'
import { recordPlayerContractSigningDecisionEvent } from '@/app/governance/PlayerContractSigningGovernanceService'
import { executeAcceptedRetentionAgreement } from '@/app/contractRetention/RetentionSigningService'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import { createRetentionNegotiation, retentionNegotiationIdFor, type RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { addYears } from '@/domain/date'
import {
  bindTeamContractCapacity,
  findFinancialReservationByProvenance,
  getEffectiveAuthorizedHeadroomMinorUnits,
  getOrganizationFinancialAuthorization,
  materializeContractFinanceForDate,
  resolveExpenseRecognitionAccounts,
  sumReservedCapacity,
  type FinancialReservation,
} from '@/domain/finance'
import { authorizeTeamSalaryForTest, cashMinorUnitsForTest, financingDrawdownForTest, fundTeamWithOpeningCapital } from '@/domain/finance/financeTestFixture'
import { contractIdFromString, staffPersonIdFromString, type TeamId } from '@/domain/ids'
import type { ContractNegotiation } from '@/domain/market'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16M-B1. Binding capacity is reserved by the economic contract, not by the gameplay action that
 * created it (`sourceAuthority = CONTRACT`, `sourceEntityId = contractId`), and the payroll
 * `AuthorizedEconomicEvent` of that same contract replaces the reservation with the canonical
 * `FinancialCommitment`. Every proof below goes through a real authority: the canonical reservation
 * collections, the real binding services and the canonical economic-event adapter.
 */
const CURRENCY = 'EUR'
/** 1 unit = 1,000 legacy whole-major units = 100,000 canonical minor units (the BS16G crossing). */
const UNIT_MAJOR_UNITS = 1_000
const UNIT_MINOR_UNITS = 100_000
/** One legacy whole-major unit is 100 canonical minor units for every supported currency. */
const MINOR_UNITS_PER_MAJOR_UNIT = 100
const RICH_AUTHORIZATION_MINOR_UNITS = 200_000_000_000
const RICH_CASH_MINOR_UNITS = 10_000_000_000

const majorUnits = (units: number) => units * UNIT_MAJOR_UNITS
const minorUnits = (units: number) => units * UNIT_MINOR_UNITS

function userTeam(world: GameWorld) {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
}

/**
 * A club whose canonical authorization is exactly `playerUnits` / `staffUnits` above what its existing
 * contractual payroll already commits, so "authorization 100" means exactly 100 units of headroom.
 */
function club(input: { readonly playerUnits?: number; readonly staffUnits?: number } = {}) {
  const base = createNewGame()
  const team = userTeam(base)
  const funded = fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS })
  const baseline = getOrganizationFinancialAuthorization(funded, { organizationId: team.organizationId, currencyCode: CURRENCY })
  const committed = (category: string) => baseline.lines.filter((line) => line.category === category).reduce((sum, line) => sum + line.committedMinorUnits, 0)
  const world = authorizeTeamSalaryForTest(funded, team.id, {
    currencyCode: CURRENCY,
    playerSalaryMinorUnits: committed('PLAYER_SALARY') + minorUnits(input.playerUnits ?? 100),
    staffSalaryMinorUnits: committed('STAFF_SALARY') + minorUnits(input.staffUnits ?? 50),
  })
  return { world, team, organizationId: team.organizationId }
}

function headroomMinorUnits(world: GameWorld, organizationId: string, category: 'PLAYER_SALARY' | 'STAFF_SALARY'): number {
  return getEffectiveAuthorizedHeadroomMinorUnits(getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY }), category)
}

function bind(world: GameWorld, teamId: TeamId, contractId: string, units: number, action: 'PLAYER_SIGNING' | 'STAFF_HIRING' = 'PLAYER_SIGNING') {
  return bindTeamContractCapacity(world, { teamId, action, legacyAnnualAmountMajorUnits: majorUnits(units), contractId, effectiveDate: world.currentDate })
}

/** Publishes a reservation collection exactly as a binding site does: with the mutation it protects. */
function publish(world: GameWorld, reservations: readonly FinancialReservation[]): GameWorld {
  return updateGameWorld(world, { financialReservations: [...reservations] })
}

function reservationsOf(world: GameWorld, contractId: string): readonly FinancialReservation[] {
  return Object.values(world.financialReservationsById).filter((reservation) => reservation.sourceEntityId === contractId)
}

function staffOfferOf(world: GameWorld, offerId: string) {
  const offer = Object.values(world.staffJobOffersById).find((item) => String(item.id) === offerId)
  if (offer === undefined) throw new Error(`Missing Staff job offer ${offerId}`)
  return offer
}

function reservedMinorUnits(world: GameWorld, organizationId: string): number {
  return sumReservedCapacity(Object.values(world.financialReservationsById), organizationId, CURRENCY).minorUnits
}

/** The canonical payroll materialization for one contract: the event that replaces its reservation. */
function materializePayroll(world: GameWorld, teamId: TeamId, contractId: string, date: string) {
  const organizationId = world.teams[teamId]!.organizationId
  return materializeContractFinanceForDate(world, date, {
    organizationId,
    contractId,
    currencyCode: CURRENCY,
    includeConditional: true,
    dueDatePolicy: 'ON_RECOGNITION',
    ledger: resolveExpenseRecognitionAccounts(world, organizationId),
  })
}

function roundTrip(world: GameWorld): GameWorld {
  return deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, world.currentDate))))
}

function governanceFixture(world: GameWorld, negotiation: ContractNegotiation): GameWorld {
  const institution = { id: 'governance:binding-capacity', universe: 'PROFESSIONAL_CLUB' as const, name: 'Binding capacity club', teamIds: [negotiation.teamId!] }
  const authorities = [
    { id: 'authority:capacity-board-executive', fromBodyId: 'body:capacity-board', toBodyId: 'body:capacity-executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
    { id: 'authority:capacity-owner-board', fromBodyId: 'body:capacity-owner', toBodyId: 'body:capacity-board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
  ]
  const rights = [
    { id: 'right:capacity-propose', authorityGrantId: authorities[0]!.id, bodyId: 'body:capacity-executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: 'right:capacity-execute', authorityGrantId: authorities[0]!.id, bodyId: 'body:capacity-executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    { id: 'right:capacity-approve', authorityGrantId: authorities[1]!.id, bodyId: 'body:capacity-board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const },
  ]
  const decision = { id: 'decision:binding-capacity', institutionId: institution.id, decisionType: 'PLAYER_CONTRACT_SIGNING' as const, proposedByBodyId: 'body:capacity-executive', proposedOn: world.currentDate, subject: { kind: 'GENERIC' as const, referenceId: negotiation.id } }
  return updateGameWorld(world, {
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:capacity-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:capacity-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
      { id: 'body:capacity-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
    ],
    governanceAuthorityGrants: authorities,
    governanceDecisionParticipationGrants: rights,
    governanceDecisions: [decision],
    governanceDecisionEvents: [
      { id: '01:capacity-proposed', decisionId: decision.id, kind: 'PROPOSED' as const, bodyId: 'body:capacity-executive', effectiveOn: world.currentDate, authorityGrantIds: [authorities[0]!.id] },
      { id: '02:capacity-approved', decisionId: decision.id, kind: 'APPROVED' as const, bodyId: 'body:capacity-board', effectiveOn: world.currentDate, authorityGrantIds: [authorities[1]!.id] },
    ],
  })
}

/** A club with ample canonical capacity plus one accepted, Governance-approved free-agent agreement. */
function freeAgentAgreement() {
  const base = createNewGame()
  const team = userTeam(base)
  const funded = authorizeTeamSalaryForTest(
    fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
    team.id,
    { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
  )
  const playerId = team.rosterPlayerIds[0]!
  const negotiation: ContractNegotiation = {
    id: 'negotiation:binding-capacity',
    organizationId: team.organizationId,
    teamId: team.id,
    playerId,
    sourceProposalId: 'proposal:binding-capacity',
    status: 'ACCEPTED',
    salary: 1_234_567,
    years: 3,
    round: 1,
  }
  const world = governanceFixture(updateGameWorld(funded, {
    negotiations: [negotiation],
    contracts: Object.values(funded.contractsById).map((contract) => contract.playerId === playerId ? { ...contract, termination: { terminatedOn: funded.currentDate, reason: 'released' as const } } : contract),
    teams: Object.values(funded.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.filter((id) => id !== playerId) } : item),
    lineupsByTeamId: Object.fromEntries(Object.entries(funded.lineupsByTeamId).map(([id, lineup]) => [id, clearPlayerFromLineup(lineup, playerId)])),
  }), negotiation)
  return { world, team, negotiation, expectedContractId: `contract:signed-free-agent:${negotiation.id}` }
}

function withStaffPerson(world: GameWorld, staffId: ReturnType<typeof staffPersonIdFromString>): GameWorld {
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 90])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  return updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Binding', lastName: 'Candidate' }, professional: { attributes } }],
    staffReputationProfilesByStaffId: { ...world.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() },
  })
}

describe('BS16M-B1 binding capacity reservations', () => {
  describe('sequential authorized capacity', () => {
    it('reserves the exact evaluated amount and refuses a second binding that would overcommit the authorization', () => {
      const { world, team, organizationId } = club({ playerUnits: 100, staffUnits: 0 })
      expect(headroomMinorUnits(world, organizationId, 'PLAYER_SALARY')).toBe(minorUnits(100))

      const first = bind(world, team.id, 'contract:capacity:1', 70)
      expect(first.allowed).toBe(true)
      expect(first.decision.status).toBe('AFFORDABLE_NOW')
      expect(first.decision.authorization.availableHeadroom?.minorUnits).toBe(minorUnits(100))
      expect(first.reservation).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: 'contract:capacity:1', status: 'OPEN' })
      expect(first.reservation!.amount.minorUnits).toBe(minorUnits(70))

      const bound = publish(world, first.reservations)
      expect(reservedMinorUnits(bound, organizationId)).toBe(minorUnits(70))
      expect(headroomMinorUnits(bound, organizationId, 'PLAYER_SALARY')).toBe(minorUnits(30))

      const second = bind(bound, team.id, 'contract:capacity:2', 70)
      expect(second.allowed).toBe(false)
      expect(second.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(second.reservation).toBeNull()
      expect(second.reservations).toEqual(first.reservations)
      expect(reservedMinorUnits(bound, organizationId)).toBe(minorUnits(70))
    })

    it('binds 70 then 30 and refuses the next single unit', () => {
      const { world, team, organizationId } = club({ playerUnits: 100, staffUnits: 0 })
      const first = bind(world, team.id, 'contract:capacity:70', 70)
      const bound = publish(world, first.reservations)
      const second = bind(bound, team.id, 'contract:capacity:30', 30)
      expect([first.allowed, second.allowed]).toEqual([true, true])
      const both = publish(bound, second.reservations)
      expect(headroomMinorUnits(both, organizationId, 'PLAYER_SALARY')).toBe(0)
      expect(reservedMinorUnits(both, organizationId)).toBe(minorUnits(100))

      const third = bind(both, team.id, 'contract:capacity:1', 1)
      expect(third.allowed).toBe(false)
      expect(third.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(third.reservations).toEqual(second.reservations)
      expect(reservedMinorUnits(both, organizationId)).toBe(minorUnits(100))
    })

    it('protects authorized headroom only: a reservation never moves cash', () => {
      const { world, team, organizationId } = club({ playerUnits: 100, staffUnits: 0 })
      const cashBefore = cashMinorUnitsForTest(world, organizationId)
      const capacity = bind(world, team.id, 'contract:capacity:cash', 70)
      const bound = publish(world, capacity.reservations)
      expect(capacity.allowed).toBe(true)
      expect(cashMinorUnitsForTest(bound, organizationId)).toBe(cashBefore)
      expect(Object.keys(bound.expenseRecognitionsById)).toHaveLength(Object.keys(world.expenseRecognitionsById).length)
      expect(Object.keys(bound.payablesById)).toHaveLength(Object.keys(world.payablesById).length)
      expect(Object.keys(bound.financialTransactionsById)).toHaveLength(Object.keys(world.financialTransactionsById).length)
      expect(Object.keys(bound.financialCommitmentsById)).toHaveLength(Object.keys(world.financialCommitmentsById).length)
    })

    it('cannot be bypassed by BS16L financing: liquidity never creates authorization', () => {
      const { world, team, organizationId } = club({ playerUnits: 100, staffUnits: 0 })
      const first = bind(world, team.id, 'contract:capacity:exhaust', 100)
      const exhausted = publish(world, first.reservations)
      expect(headroomMinorUnits(exhausted, organizationId, 'PLAYER_SALARY')).toBe(0)

      const fundedWorld = financingDrawdownForTest(exhausted, team.id, RICH_CASH_MINOR_UNITS)
      expect(cashMinorUnitsForTest(fundedWorld, organizationId)).toBeGreaterThan(cashMinorUnitsForTest(exhausted, organizationId))

      const afterFinancing = bind(fundedWorld, team.id, 'contract:capacity:after-financing', 1)
      expect(afterFinancing.allowed).toBe(false)
      expect(afterFinancing.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(afterFinancing.decision.outcome).toBe('HAS_LIQUIDITY_BUT_NO_AUTHORIZATION')
      expect(afterFinancing.reservations).toEqual(first.reservations)
    })

    it('keeps the canonical categories separate and constrains the organization-wide headroom', () => {
      const isolated = club({ playerUnits: 100, staffUnits: 0 })
      const player = bind(isolated.world, isolated.team.id, 'contract:capacity:player', 70)
      expect(player.allowed).toBe(true)
      expect(player.decision.category).toBe('PLAYER_SALARY')

      // The staff category has its own authorization line, so a player action never grants staff
      // permission: the staff contract is refused on the canonical category.
      const staff = bind(isolated.world, isolated.team.id, 'contract:capacity:staff', 30, 'STAFF_HIRING')
      expect(staff.allowed).toBe(false)
      expect(staff.decision.category).toBe('STAFF_SALARY')
      expect(staff.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(staff.reservation).toBeNull()
      expect(isolated.world.financialReservationsById).toEqual({})

      // Reservations carry no canonical category, so they constrain the organization-wide headroom.
      const split = club({ playerUnits: 60, staffUnits: 40 })
      const staffFirst = bind(split.world, split.team.id, 'contract:capacity:staff-first', 40, 'STAFF_HIRING')
      expect(staffFirst.allowed).toBe(true)
      const staffBound = publish(split.world, staffFirst.reservations)
      expect(headroomMinorUnits(staffBound, split.organizationId, 'PLAYER_SALARY')).toBe(minorUnits(60))
      const playerAfter = bind(staffBound, split.team.id, 'contract:capacity:player-after', 60)
      expect(playerAfter.allowed).toBe(true)
      const consumed = publish(staffBound, playerAfter.reservations)
      expect(headroomMinorUnits(consumed, split.organizationId, 'PLAYER_SALARY')).toBe(0)
      expect(headroomMinorUnits(consumed, split.organizationId, 'STAFF_SALARY')).toBe(0)
      expect(bind(consumed, split.team.id, 'contract:capacity:one-more', 1).allowed).toBe(false)
    })

    it('never reserves from a preview or a formal offer', () => {
      const { world, team } = club({ playerUnits: 100, staffUnits: 200 })
      const evaluated = bindTeamContractCapacity(world, { teamId: team.id, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: majorUnits(70), contractId: 'contract:capacity:preview', effectiveDate: world.currentDate })
      expect(evaluated.allowed).toBe(true)
      // Evaluation is not binding: nothing was published, so the world still holds no reservation.
      expect(world.financialReservationsById).toEqual({})
      expect(evaluated.reservations).toHaveLength(1)

      const staffId = staffPersonIdFromString('staff:capacity:preview')
      const ready = withStaffPerson(world, staffId)
      const { world: opened, opening } = createStaffJobOpeningForTeam(ready, { teamId: team.id, roleId: 'advanceScout' })
      const candidate = identifyStaffCandidate(opened, { openingId: opening.id, staffId })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
      expect(offered.world.financialReservationsById).toEqual({})
      expect(staffOfferOf(offered.world, offered.offerId).status).toBe('pending')
    })

    it('refuses a stale player preview once another binding consumed the capacity', () => {
      const { world, team } = club({ playerUnits: 100, staffUnits: 0 })
      const preview = bindTeamContractCapacity(world, { teamId: team.id, action: 'PLAYER_SIGNING', legacyAnnualAmountMajorUnits: majorUnits(70), contractId: 'contract:capacity:stale-preview', effectiveDate: world.currentDate })
      expect(preview.allowed).toBe(true)
      const committedElsewhere = publish(world, bind(world, team.id, 'contract:capacity:elsewhere', 100).reservations)
      const stale = bind(committedElsewhere, team.id, 'contract:capacity:stale-preview', 70)
      expect(stale.allowed).toBe(false)
      expect(stale.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(committedElsewhere.contractsById['contract:capacity:stale-preview' as never]).toBeUndefined()
    })

    it('refuses a stale staff offer whose capacity was reserved after the offer was prepared', () => {
      const { world, team } = club({ playerUnits: 0, staffUnits: 200 })
      const staffId = staffPersonIdFromString('staff:capacity:stale')
      const ready = withStaffPerson(world, staffId)
      const { world: opened, opening } = createStaffJobOpeningForTeam(ready, { teamId: team.id, roleId: 'advanceScout' })
      const candidate = identifyStaffCandidate(opened, { openingId: opening.id, staffId })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
      const offeredSalary = staffOfferOf(offered.world, offered.offerId).annualSalary
      if (offeredSalary === undefined) throw new Error('The prepared staff offer has no recorded salary')
      const salaryUnits = offeredSalary / UNIT_MAJOR_UNITS
      expect(staffOfferOf(offered.world, offered.offerId).status).toBe('pending')

      // Another staff binding consumes the organization-wide headroom down to less than this offer,
      // exactly as a second hiring would: the prepared offer is no longer affordable.
      const other = bind(offered.world, team.id, 'contract:capacity:other-staff', 201 - Math.ceil(salaryUnits), 'STAFF_HIRING')
      expect(other.allowed).toBe(true)
      const constrained = publish(offered.world, other.reservations)
      expect(() => acceptStaffJobOffer(constrained, offered.offerId)).toThrow(/canonical Finance/)
      expect(constrained.staffContractsById[`staff-contract:${staffId}:${team.id}:${offered.world.currentDate}` as never]).toBeUndefined()
      expect(reservationsOf(constrained, `staff-contract:${staffId}:${team.id}:${offered.world.currentDate}`)).toHaveLength(0)
    })
  })

  describe('binding site provenance and replacement', () => {
    it('reserves exactly the free-agent contract id and replaces it with the payroll commitment', () => {
      const setup = freeAgentAgreement()
      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(signed.status).toBe('SIGNED')
      const contractId = String(signed.contractId)
      expect(contractId).toBe(setup.expectedContractId)
      expect(signed.world.contractsById[contractId as never]!.id).toBe(contractId)
      expect(Object.keys(signed.world.financialReservationsById)).toHaveLength(1)
      const open = reservationsOf(signed.world, contractId)
      expect(open).toHaveLength(1)
      expect(open[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: contractId, status: 'OPEN' })
      expect(open[0]!.amount.minorUnits).toBe(setup.negotiation.salary * MINOR_UNITS_PER_MAJOR_UNIT)
      expect(findFinancialReservationByProvenance(Object.values(signed.world.financialReservationsById), { organizationId: setup.team.organizationId, sourceAuthority: 'CONTRACT', sourceEntityId: contractId })).toEqual(open[0])
      expect(signed.world.teamFinancesByTeamId).toEqual(setup.world.teamFinancesByTeamId)

      const materialized = materializePayroll(signed.world, setup.team.id, contractId, signed.world.currentDate)
      expect(materialized.status).toBe('accepted')
      expect(materialized.results.map((result) => result.status)).toEqual(['accepted'])
      const event = materialized.events[0]!
      expect(event.sourceAuthority).toBe('CONTRACT')
      expect(event.sourceEntityId).toBe(contractId)
      expect(event.amount.minorUnits).toBe(setup.negotiation.salary * MINOR_UNITS_PER_MAJOR_UNIT)
      const commitment = Object.values(materialized.world.financialCommitmentsById).find((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${contractId}:${event.idempotencyKey}`)!
      expect(commitment.amount.minorUnits).toBe(setup.negotiation.salary * MINOR_UNITS_PER_MAJOR_UNIT)
      // The contract's own footprint is protected by exactly one mechanism at every observable world:
      // the OPEN reservation before the event, the canonical commitment after it.
      expect(reservationsOf(signed.world, contractId).filter((reservation) => reservation.status === 'OPEN')).toHaveLength(1)
      expect(Object.values(signed.world.financialCommitmentsById).some((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${contractId}:${event.idempotencyKey}`)).toBe(false)
      const consumed = reservationsOf(materialized.world, contractId)
      expect(consumed).toHaveLength(1)
      expect(consumed[0]!.status).toBe('CONSUMED')
      expect(sumReservedCapacity(consumed, setup.team.organizationId, CURRENCY).minorUnits).toBe(0)
    })

    it('reserves the market ordinal contract id derived from the input world', () => {
      const base = createNewGame()
      const team = userTeam(base)
      const world = authorizeTeamSalaryForTest(
        fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
        team.id,
        { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
      )
      const donor = Object.values(world.contractsById).find((contract) => contract.teamId !== team.id && getPlayerContractStatus(contract, world.currentDate) === 'active' && world.teams[contract.teamId]?.rosterPlayerIds.includes(contract.playerId))!
      const released = releasePlayer(world, donor.teamId, donor.playerId)
      const terms = getFreeAgentMarketTerms(released, donor.playerId)
      const ordinal = Object.values(released.contractsById).filter((contract) => contract.playerId === donor.playerId && contract.term.startsOn === released.currentDate).length + 1
      const expectedContractId = `contract:${donor.playerId}:${team.id}:${released.currentDate}:${ordinal}`

      const signed = signFreeAgent(released, team.id, donor.playerId)
      expect(signed.contractsById[expectedContractId as never]).toBeDefined()
      const reservation = reservationsOf(signed, expectedContractId)
      expect(reservation).toHaveLength(1)
      expect(reservation[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: expectedContractId, status: 'OPEN' })
      expect(reservation[0]!.amount.minorUnits).toBe(terms.annualSalary * MINOR_UNITS_PER_MAJOR_UNIT)
      expect(signed.teamFinancesByTeamId).toEqual(released.teamFinancesByTeamId)
    })

    it('reserves exactly the staff contract id and replaces it with the staff payroll commitment', () => {
      const { world, team } = club({ playerUnits: 0, staffUnits: 200 })
      const staffId = staffPersonIdFromString('staff:capacity:hire')
      const ready = withStaffPerson(world, staffId)
      const { world: opened, opening } = createStaffJobOpeningForTeam(ready, { teamId: team.id, roleId: 'advanceScout' })
      const candidate = identifyStaffCandidate(opened, { openingId: opening.id, staffId })
      const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
      const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
      const salary = staffOfferOf(offered.world, offered.offerId).annualSalary
      if (salary === undefined) throw new Error('The prepared staff offer has no recorded salary')
      const expectedContractId = `staff-contract:${staffId}:${team.id}:${offered.world.currentDate}`

      const accepted = acceptStaffJobOffer(offered.world, offered.offerId)
      expect(accepted.staffContractsById[expectedContractId as never]).toBeDefined()
      const open = reservationsOf(accepted, expectedContractId)
      expect(open).toHaveLength(1)
      expect(open[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: expectedContractId, status: 'OPEN' })
      expect(open[0]!.amount.minorUnits).toBe(salary * MINOR_UNITS_PER_MAJOR_UNIT)
      expect(accepted.teamFinancesByTeamId).toEqual(offered.world.teamFinancesByTeamId)

      const materialized = materializePayroll(accepted, team.id, expectedContractId, accepted.currentDate)
      expect(materialized.status).toBe('accepted')
      const event = materialized.events[0]!
      expect(event.sourceAuthority).toBe('CONTRACT')
      expect(event.sourceEntityId).toBe(expectedContractId)
      const consumed = reservationsOf(materialized.world, expectedContractId)
      expect(consumed).toHaveLength(1)
      expect(consumed[0]!.status).toBe('CONSUMED')
      expect(Object.values(materialized.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${expectedContractId}:${event.idempotencyKey}`)).toHaveLength(1)
    })

    it('reserves the retention successor id, replaces the salary reservation and leaves the agent fee independent', () => {
      const base = createNewGame()
      const team = userTeam(base)
      const playerId = team.rosterPlayerIds[0]!
      const predecessor = Object.values(base.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === team.id)!
      const world = authorizeTeamSalaryForTest(
        fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
        team.id,
        { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
      )
      const terms: RetentionTermSet = { salary: predecessor.compensation.annualSalary, years: 1, guarantees: [{ year: 1, guaranteedAmount: predecessor.compensation.annualSalary }], agentFee: 2_500, agentFeePayer: 'CLUB' }
      const negotiation = createRetentionNegotiation({
        id: retentionNegotiationIdFor(team.id, playerId, predecessor.id, 'retention-binding-capacity'),
        openingActionId: 'retention-binding-capacity', teamId: team.id, organizationId: team.organizationId, playerId,
        predecessorContractId: predecessor.id, openedOn: world.currentDate, openedByCoachId: team.coachId!,
        status: 'ACCEPTED', acceptedTerms: terms, rounds: [],
      })
      const prepared = retentionWorld(world, team.id, negotiation)
      const pending = executeAcceptedRetentionAgreement(prepared, negotiation.id)
      expect(pending.status).toBe('GOVERNANCE_REQUIRED')
      const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${negotiation.id}`)!
      const approved = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: retentionApproverId }, bodyId: 'body:capacity-board' })
      expect(approved.status).toBe('APPROVED')

      const signed = executeAcceptedRetentionAgreement(approved.world, negotiation.id)
      expect(signed.status, signed.reason).toBe('SIGNED')
      const successorId = `contract:retention-successor:${negotiation.id}`
      expect(String(signed.contractId)).toBe(successorId)
      const open = reservationsOf(signed.world, successorId)
      expect(open).toHaveLength(1)
      expect(open[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: successorId, status: 'OPEN' })
      expect(open[0]!.amount.minorUnits).toBe(terms.salary * MINOR_UNITS_PER_MAJOR_UNIT)
      // The club agent fee is an independent commitment, never a reserved salary.
      const fee = Object.values(signed.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'PLAYER_AGENT_FEE')
      expect(fee).toHaveLength(1)
      expect(reservationsOf(signed.world, String(fee[0]!.id))).toHaveLength(0)

      const successor = signed.world.contractsById[successorId as never]!
      const materialized = materializePayroll(signed.world, team.id, successorId, successor.term.startsOn)
      expect(materialized.status).toBe('accepted')
      const event = materialized.events[0]!
      expect(event.sourceEntityId).toBe(successorId)
      const consumed = reservationsOf(materialized.world, successorId)
      expect(consumed).toHaveLength(1)
      expect(consumed[0]!.status).toBe('CONSUMED')
      // Replacing the salary reservation leaves the fee commitment untouched.
      expect(Object.values(materialized.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'PLAYER_AGENT_FEE')).toEqual(fee)
    })

    it('creates exactly one reservation when Governance executes an approved signing', () => {
      const setup = freeAgentAgreement()
      const first = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(first.status).toBe('SIGNED')
      const contractId = String(first.contractId)
      expect(Object.values(first.world.financialReservationsById)).toHaveLength(Object.keys(setup.world.financialReservationsById).length + 1)
      expect(Object.values(first.world.governanceDecisionEventsById).filter((event) => event.decisionId === 'decision:binding-capacity' && event.kind === 'EXECUTED')).toHaveLength(1)
      const retry = completeAcceptedFreeAgentSigning(first.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(retry.status).toBe('ALREADY_SIGNED')
      expect(retry.world).toBe(first.world)
      expect(reservationsOf(retry.world, contractId)).toHaveLength(1)
    })

    it('keeps OPEN and CONSUMED reservations across save/load', () => {
      const setup = freeAgentAgreement()
      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      const contractId = String(signed.contractId)
      const restoredOpen = roundTrip(signed.world)
      expect(restoredOpen.financialReservationsById).toEqual(signed.world.financialReservationsById)
      expect(Object.values(restoredOpen.financialReservationsById)[0]!.status).toBe('OPEN')
      expect(sumReservedCapacity(Object.values(restoredOpen.financialReservationsById), setup.team.organizationId, CURRENCY).minorUnits).toBe(setup.negotiation.salary * MINOR_UNITS_PER_MAJOR_UNIT)
      expect(headroomMinorUnits(restoredOpen, setup.team.organizationId, 'PLAYER_SALARY')).toBe(headroomMinorUnits(signed.world, setup.team.organizationId, 'PLAYER_SALARY'))

      const materialized = materializePayroll(signed.world, setup.team.id, contractId, signed.world.currentDate)
      const restoredConsumed = roundTrip(materialized.world)
      expect(restoredConsumed.financialReservationsById).toEqual(materialized.world.financialReservationsById)
      expect(Object.values(restoredConsumed.financialReservationsById)[0]!.status).toBe('CONSUMED')
      expect(sumReservedCapacity(Object.values(restoredConsumed.financialReservationsById), setup.team.organizationId, CURRENCY).minorUnits).toBe(0)
    })

    it('replays a binding and a payroll event without duplicating a reservation or a commitment', () => {
      const base = createNewGame()
      const team = userTeam(base)
      const world = authorizeTeamSalaryForTest(
        fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
        team.id,
        { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
      )
      const donor = Object.values(world.contractsById).find((contract) => contract.teamId !== team.id && getPlayerContractStatus(contract, world.currentDate) === 'active' && world.teams[contract.teamId]?.rosterPlayerIds.includes(contract.playerId))!
      const released = releasePlayer(world, donor.teamId, donor.playerId)
      const first = signFreeAgent(released, team.id, donor.playerId)
      const replay = signFreeAgent(released, team.id, donor.playerId)
      expect(Object.values(replay.financialReservationsById)).toEqual(Object.values(first.financialReservationsById))
      expect(Object.values(replay.contractsById).map((contract) => contract.id).sort()).toEqual(Object.values(first.contractsById).map((contract) => contract.id).sort())
      const contractId = String(Object.values(first.financialReservationsById)[0]!.sourceEntityId)

      const materialized = materializePayroll(first, team.id, contractId, first.currentDate)
      expect(materialized.status).toBe('accepted')
      const commitmentsAfterFirst = Object.keys(materialized.world.financialCommitmentsById).length
      const second = materializePayroll(materialized.world, team.id, contractId, first.currentDate)
      expect(second.status).toBe('alreadyProcessed')
      expect(second.world).toBe(materialized.world)
      expect(Object.keys(second.world.financialCommitmentsById)).toHaveLength(commitmentsAfterFirst)
      const reservations = reservationsOf(second.world, contractId)
      expect(reservations).toHaveLength(1)
      expect(reservations[0]!.status).toBe('CONSUMED')
      expect(sumReservedCapacity(reservations, team.organizationId, CURRENCY).minorUnits).toBe(0)
    })

    it('keeps a historical commitment without a reservation valid', () => {
      const base = createNewGame()
      const team = userTeam(base)
      const world = authorizeTeamSalaryForTest(
        fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
        team.id,
        { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
      )
      const donor = Object.values(world.contractsById).find((contract) => contract.teamId !== team.id && getPlayerContractStatus(contract, world.currentDate) === 'active' && world.teams[contract.teamId]?.rosterPlayerIds.includes(contract.playerId))!
      const released = releasePlayer(world, donor.teamId, donor.playerId)
      const legacyContractId = 'contract:capacity:legacy'
      const withLegacy = updateGameWorld(released, {
        contracts: [...Object.values(released.contractsById), createPlayerContract({
          id: contractIdFromString(legacyContractId),
          playerId: donor.playerId,
          teamId: team.id,
          kind: 'standard',
          term: { startsOn: released.currentDate, expiresOn: addYears(released.currentDate, 2) },
          compensation: { annualSalary: 400_000 },
        })],
      })
      expect(withLegacy.financialReservationsById).toEqual({})

      const materialized = materializePayroll(withLegacy, team.id, legacyContractId, withLegacy.currentDate)
      expect(materialized.status).toBe('accepted')
      expect(materialized.results.map((result) => result.status)).toEqual(['accepted'])
      // No retroactive reservation is synthesized for a commitment that never had one.
      expect(materialized.world.financialReservationsById).toEqual({})
      expect(Object.values(materialized.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${legacyContractId}:${materialized.events[0]!.idempotencyKey}`)).toHaveLength(1)
      const retry = materializePayroll(materialized.world, team.id, legacyContractId, withLegacy.currentDate)
      expect(retry.status).toBe('alreadyProcessed')
      expect(retry.world).toBe(materialized.world)
    })
  })
})

const retentionApproverId = staffPersonIdFromString('staff:capacity:retention-approver')

/** Retention Governance graph for the successor signing proof. */
function retentionWorld(world: GameWorld, teamId: TeamId, negotiation: ReturnType<typeof createRetentionNegotiation>): GameWorld {
  const institution = { id: 'institution:capacity-retention', universe: 'PROFESSIONAL_CLUB' as const, name: 'Retention capacity governance', teamIds: [teamId] }
  const grants = [
    { id: 'authority:capacity-retention-executive', fromBodyId: 'body:capacity-owner', toBodyId: 'body:capacity-executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
    { id: 'authority:capacity-retention-board', fromBodyId: 'body:capacity-owner', toBodyId: 'body:capacity-board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
  ]
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  return updateGameWorld(world, {
    retentionNegotiations: [negotiation],
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:capacity-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:capacity-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
      { id: 'body:capacity-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
    ],
    governanceAppointments: [
      { id: 'appointment:capacity-retention-proposer', bodyId: 'body:capacity-executive', actor: { kind: 'COACH', id: world.userCoachId }, role: 'CEO', startedOn: world.currentDate },
      { id: 'appointment:capacity-retention-approver', bodyId: 'body:capacity-board', actor: { kind: 'STAFF', id: retentionApproverId }, role: 'BOARD_MEMBER', startedOn: world.currentDate },
    ],
    governanceAuthorityGrants: grants,
    governanceDecisionParticipationGrants: [
      { id: 'right:capacity-retention-propose', authorityGrantId: grants[0]!.id, bodyId: 'body:capacity-executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:capacity-retention-execute', authorityGrantId: grants[0]!.id, bodyId: 'body:capacity-executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
      { id: 'right:capacity-retention-approve', authorityGrantId: grants[1]!.id, bodyId: 'body:capacity-board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
    ],
    staffPeople: [...Object.values(world.staffPeopleById), { id: retentionApproverId, identity: { firstName: 'Retention', lastName: 'Approver' }, professional: { attributes } }],
  })
}
