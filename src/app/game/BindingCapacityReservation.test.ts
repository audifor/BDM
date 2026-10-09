import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getFreeAgentMarketTerms, releasePlayer, signFreeAgent } from '@/app/market'
import { executeContractRelease } from '@/app/market/ContractReleaseService'
import { completeAcceptedFreeAgentSigning } from '@/app/marketIntelligence/FreeAgentSigningService'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, identifyStaffCandidate, startStaffInterview } from '@/app/staffCareer/StaffCareerService'
import { recordPlayerContractSigningDecisionEvent } from '@/app/governance/PlayerContractSigningGovernanceService'
import { executeAcceptedRetentionAgreement } from '@/app/contractRetention/RetentionSigningService'
import { createPlayerContract, getPlayerContractStatus } from '@/domain/contract'
import { createRetentionNegotiation, retentionNegotiationIdFor, type RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { addYears } from '@/domain/date'
import {
  bindTeamContractCapacity,
  contractOwnsCapacityAuthority,
  createFinancialReservation,
  findFinancialReservationByProvenance,
  getEffectiveAuthorizedHeadroomMinorUnits,
  getOrganizationFinancialAuthorization,
  materializeContractFinanceForDate,
  resolveExpenseRecognitionAccounts,
  sumReservedCapacity,
  type FinancialReservation,
} from '@/domain/finance'
import { authorizeTeamSalaryForTest, cashMinorUnitsForTest, financingDrawdownForTest, fundTeamWithOpeningCapital } from '@/domain/finance/financeTestFixture'
import { contractIdFromString, staffPersonIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import type { ContractNegotiation } from '@/domain/market'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { clearPlayerFromLineup } from '@/domain/tactics'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16M-B1C. The binding reservation is an **atomic bridge**, never a published hold: canonical Finance
 * derives salary commitment from `ContractFinancialSchedule` the moment a contract exists, so the
 * reservation is published `CONSUMED` in the same transition that creates the contract and the
 * contractual schedule owns capacity from then on. Every proof below goes through a real binding site
 * or a real canonical reconciliation point.
 *
 * Identity is unchanged from BS16M-B1: `sourceAuthority = CONTRACT`, `sourceEntityId = contractId`.
 */
const CURRENCY = 'EUR'
/** One legacy whole-major unit is 100 canonical minor units for every supported currency. */
const MINOR_UNITS_PER_MAJOR_UNIT = 100
/** 1 capacity unit = 1,000 legacy whole-major units = 100,000 canonical minor units. */
const UNIT_MINOR_UNITS = 1_000 * MINOR_UNITS_PER_MAJOR_UNIT
const RICH_AUTHORIZATION_MINOR_UNITS = 200_000_000_000
const RICH_CASH_MINOR_UNITS = 10_000_000_000
const CONTRACT_RESERVATION_AUTHORITY = 'CONTRACT'

function userTeam(world: GameWorld) {
  return Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
}

function headroomMinorUnits(world: GameWorld, organizationId: string, category: 'PLAYER_SALARY' | 'STAFF_SALARY'): number {
  return getEffectiveAuthorizedHeadroomMinorUnits(getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY }), category)
}

/** The contractual (or, for categories without a schedule, outstanding) amount the authorization already commits. */
function committedMinorUnits(world: GameWorld, organizationId: string, category: 'PLAYER_SALARY' | 'STAFF_SALARY'): number {
  return getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY }).lines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.committedMinorUnits, 0)
}

/** Capacity still protected by OPEN reservations; BS16M-B1C requires this to be 0 after every successful binding. */
function openReservedMinorUnits(world: GameWorld, organizationId: string): number {
  return sumReservedCapacity(Object.values(world.financialReservationsById), organizationId, CURRENCY).minorUnits
}

function reservationsOf(world: GameWorld, contractId: string): readonly FinancialReservation[] {
  return Object.values(world.financialReservationsById).filter((reservation) => reservation.sourceEntityId === contractId)
}

function bridgeOf(world: GameWorld, contractId: string): FinancialReservation {
  const matches = reservationsOf(world, contractId)
  if (matches.length !== 1) throw new Error(`Expected exactly one reservation for ${contractId}, found ${matches.length}`)
  return matches[0]!
}

function fundedClub(): GameWorld {
  const base = createNewGame()
  return fundTeamWithOpeningCapital(base, userTeam(base).id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS })
}

/**
 * Authorizes exactly `playerMinorUnits` / `staffMinorUnits` of headroom *above* whatever the club's own
 * contractual payroll already commits, so a test states the capacity it wants in canonical minor units.
 */
function authorizeAboveCommitted(world: GameWorld, teamId: TeamId, input: { readonly playerMinorUnits: number; readonly staffMinorUnits: number }): GameWorld {
  const organizationId = world.teams[teamId]!.organizationId
  return authorizeTeamSalaryForTest(world, teamId, {
    currencyCode: CURRENCY,
    playerSalaryMinorUnits: committedMinorUnits(world, organizationId, 'PLAYER_SALARY') + input.playerMinorUnits,
    staffSalaryMinorUnits: committedMinorUnits(world, organizationId, 'STAFF_SALARY') + input.staffMinorUnits,
  })
}

/** Releases one player from another club (with roster room) so the test club can sign them as a free agent. */
function availableFreeAgent(world: GameWorld, clubTeamId: TeamId, excludedTeamIds: readonly TeamId[] = []) {
  const contract = Object.values(world.contractsById).find((item) => item.teamId !== undefined && item.teamId !== clubTeamId
    && !excludedTeamIds.includes(item.teamId)
    && getPlayerContractStatus(item, world.currentDate) === 'active'
    && (world.teams[item.teamId]?.rosterPlayerIds.length ?? 0) >= 6
    && world.teams[item.teamId]?.rosterPlayerIds.includes(item.playerId))
  if (contract?.teamId === undefined) throw new Error('The fixture needs a releasable player from another club')
  const released = releasePlayer(world, contract.teamId, contract.playerId)
  return { world: released, playerId: contract.playerId, teamId: contract.teamId, salaryMinorUnits: marketSalaryMinorUnits(released, contract.playerId) }
}

function marketSalaryMinorUnits(world: GameWorld, playerId: PlayerId): number {
  return getFreeAgentMarketTerms(world, playerId).annualSalary * MINOR_UNITS_PER_MAJOR_UNIT
}

/** The exact contract id the atomic Market binder derives from its input world. */
function marketContractId(world: GameWorld, teamId: TeamId, playerId: PlayerId): string {
  const ordinal = Object.values(world.contractsById).filter((contract) => contract.playerId === playerId && contract.term.startsOn === world.currentDate).length + 1
  return `contract:${playerId}:${teamId}:${world.currentDate}:${ordinal}`
}

/** The canonical payroll materialization for one contract: accounting, not a capacity boundary any more. */
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

/** Represents the superseded BS16M-B1 published shape: the same canonical reservation, still OPEN. */
function asSupersededOpenReservation(reservation: FinancialReservation): FinancialReservation {
  return createFinancialReservation({
    id: reservation.id,
    organizationId: reservation.organizationId,
    currency: reservation.currency,
    amount: reservation.amount,
    sourceAuthority: reservation.sourceAuthority,
    sourceEntityId: reservation.sourceEntityId,
    createdOn: reservation.createdOn,
    status: 'OPEN',
  })
}

function roundTrip(world: GameWorld): GameWorld {
  return deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, world.currentDate))))
}

function withStaffPerson(world: GameWorld, staffId: ReturnType<typeof staffPersonIdFromString>): GameWorld {
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 90])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  return updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Binding', lastName: 'Candidate' }, professional: { attributes } }],
    staffReputationProfilesByStaffId: { ...world.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() },
  })
}

function staffOffer(world: GameWorld, teamId: TeamId, staffId: ReturnType<typeof staffPersonIdFromString>, roleId: 'advanceScout' | 'headScout', seed: string) {
  const ready = withStaffPerson(world, staffId)
  const { world: opened, opening } = createStaffJobOpeningForTeam(ready, { teamId, roleId })
  const candidate = identifyStaffCandidate(opened, { openingId: opening.id, staffId })
  const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
  const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId, id: seed })
  const salary = Object.values(offered.world.staffJobOffersById).find((offer) => String(offer.id) === offered.offerId)?.annualSalary
  if (salary === undefined) throw new Error('The prepared Staff offer has no recorded salary')
  return { world: offered.world, offerId: offered.offerId, salaryMinorUnits: salary * MINOR_UNITS_PER_MAJOR_UNIT }
}

function governanceFixture(world: GameWorld, negotiation: ContractNegotiation): GameWorld {
  const institution = { id: 'governance:capacity-handoff', universe: 'PROFESSIONAL_CLUB' as const, name: 'Capacity handoff club', teamIds: [negotiation.teamId!] }
  const authorities = [
    { id: 'authority:handoff-board-executive', fromBodyId: 'body:handoff-board', toBodyId: 'body:handoff-executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
    { id: 'authority:handoff-owner-board', fromBodyId: 'body:handoff-owner', toBodyId: 'body:handoff-board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: world.currentDate },
  ]
  const rights = [
    { id: 'right:handoff-propose', authorityGrantId: authorities[0]!.id, bodyId: 'body:handoff-executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
    { id: 'right:handoff-execute', authorityGrantId: authorities[0]!.id, bodyId: 'body:handoff-executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
    { id: 'right:handoff-approve', authorityGrantId: authorities[1]!.id, bodyId: 'body:handoff-board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const },
  ]
  const decision = { id: 'decision:capacity-handoff', institutionId: institution.id, decisionType: 'PLAYER_CONTRACT_SIGNING' as const, proposedByBodyId: 'body:handoff-executive', proposedOn: world.currentDate, subject: { kind: 'GENERIC' as const, referenceId: negotiation.id } }
  return updateGameWorld(world, {
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:handoff-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:handoff-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
      { id: 'body:handoff-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
    ],
    governanceAuthorityGrants: authorities,
    governanceDecisionParticipationGrants: rights,
    governanceDecisions: [decision],
    governanceDecisionEvents: [
      { id: '01:handoff-proposed', decisionId: decision.id, kind: 'PROPOSED' as const, bodyId: 'body:handoff-executive', effectiveOn: world.currentDate, authorityGrantIds: [authorities[0]!.id] },
      { id: '02:handoff-approved', decisionId: decision.id, kind: 'APPROVED' as const, bodyId: 'body:handoff-board', effectiveOn: world.currentDate, authorityGrantIds: [authorities[1]!.id] },
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
    id: 'negotiation:capacity-handoff',
    organizationId: team.organizationId,
    teamId: team.id,
    playerId,
    sourceProposalId: 'proposal:capacity-handoff',
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
  return { world, team, negotiation, contractId: `contract:signed-free-agent:${negotiation.id}`, salaryMinorUnits: negotiation.salary * MINOR_UNITS_PER_MAJOR_UNIT }
}

const retentionApproverId = staffPersonIdFromString('staff:handoff:retention-approver')

/** Retention Governance graph plus the club's canonical capacity, for the future-dated successor proof. */
function retentionSetup(extraTerms: Partial<RetentionTermSet> = {}) {
  const base = createNewGame()
  const team = userTeam(base)
  const playerId = team.rosterPlayerIds[0]!
  const predecessor = Object.values(base.contractsById).find((contract) => contract.playerId === playerId && contract.teamId === team.id)!
  const funded = authorizeTeamSalaryForTest(
    fundTeamWithOpeningCapital(base, team.id, { currencyCode: CURRENCY, cashMinorUnits: RICH_CASH_MINOR_UNITS }),
    team.id,
    { currencyCode: CURRENCY, playerSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS, staffSalaryMinorUnits: RICH_AUTHORIZATION_MINOR_UNITS },
  )
  const terms: RetentionTermSet = { salary: predecessor.compensation.annualSalary, years: 1, guarantees: [{ year: 1, guaranteedAmount: predecessor.compensation.annualSalary }], ...extraTerms }
  const negotiation = createRetentionNegotiation({
    id: retentionNegotiationIdFor(team.id, playerId, predecessor.id, 'retention-capacity-handoff'),
    openingActionId: 'retention-capacity-handoff', teamId: team.id, organizationId: team.organizationId, playerId,
    predecessorContractId: predecessor.id, openedOn: funded.currentDate, openedByCoachId: team.coachId!,
    status: 'ACCEPTED', acceptedTerms: terms, rounds: [],
  })
  const institution = { id: 'institution:handoff-retention', universe: 'PROFESSIONAL_CLUB' as const, name: 'Retention capacity governance', teamIds: [team.id] }
  const grants = [
    { id: 'authority:handoff-retention-executive', fromBodyId: 'body:handoff-owner', toBodyId: 'body:handoff-executive', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: funded.currentDate },
    { id: 'authority:handoff-retention-board', fromBodyId: 'body:handoff-owner', toBodyId: 'body:handoff-board', decision: 'PLAYER_CONTRACT_SIGNING' as const, grantedOn: funded.currentDate },
  ]
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  const world = updateGameWorld(funded, {
    retentionNegotiations: [negotiation],
    governanceInstitutions: [institution],
    governanceBodies: [
      { id: 'body:handoff-owner', institutionId: institution.id, kind: 'OWNERSHIP', name: 'Owner' },
      { id: 'body:handoff-executive', institutionId: institution.id, kind: 'EXECUTIVE', name: 'Executive' },
      { id: 'body:handoff-board', institutionId: institution.id, kind: 'BOARD', name: 'Board' },
    ],
    governanceAppointments: [
      { id: 'appointment:handoff-retention-proposer', bodyId: 'body:handoff-executive', actor: { kind: 'COACH', id: funded.userCoachId }, role: 'CEO', startedOn: funded.currentDate },
      { id: 'appointment:handoff-retention-approver', bodyId: 'body:handoff-board', actor: { kind: 'STAFF', id: retentionApproverId }, role: 'BOARD_MEMBER', startedOn: funded.currentDate },
    ],
    governanceAuthorityGrants: grants,
    governanceDecisionParticipationGrants: [
      { id: 'right:handoff-retention-propose', authorityGrantId: grants[0]!.id, bodyId: 'body:handoff-executive', edgeParticipant: 'DELEGATE' as const, right: 'PROPOSE' as const },
      { id: 'right:handoff-retention-execute', authorityGrantId: grants[0]!.id, bodyId: 'body:handoff-executive', edgeParticipant: 'DELEGATE' as const, right: 'EXECUTE' as const },
      { id: 'right:handoff-retention-approve', authorityGrantId: grants[1]!.id, bodyId: 'body:handoff-board', edgeParticipant: 'DELEGATE' as const, right: 'APPROVE' as const, approvalRequirement: 'ALL_OF' as const },
    ],
    staffPeople: [...Object.values(funded.staffPeopleById), { id: retentionApproverId, identity: { firstName: 'Retention', lastName: 'Approver' }, professional: { attributes } }],
  })
  const pending = executeAcceptedRetentionAgreement(world, negotiation.id)
  if (pending.status !== 'GOVERNANCE_REQUIRED') throw new Error(`The retention fixture expected a Governance proposal, received ${pending.status}:${pending.reason}`)
  const decision = Object.values(pending.world.governanceDecisionsById).find((item) => item.subject.kind === 'GENERIC' && item.subject.referenceId === `retention:${negotiation.id}`)!
  const approved = recordPlayerContractSigningDecisionEvent(pending.world, { decisionId: decision.id, kind: 'APPROVED', actor: { kind: 'STAFF', id: retentionApproverId }, bodyId: 'body:handoff-board' })
  const signed = executeAcceptedRetentionAgreement(approved.world, negotiation.id)
  if (signed.status !== 'SIGNED') throw new Error(`The retention fixture expected a signed successor, received ${signed.status}:${signed.reason}`)
  return { signed, approvedWorld: approved.world, team, playerId, predecessor, terms, successorId: `contract:retention-successor:${negotiation.id}`, salaryMinorUnits: terms.salary * MINOR_UNITS_PER_MAJOR_UNIT }
}

describe('BS16M-B1C binding capacity handoff', () => {
  describe('atomic bridge', () => {
    it('publishes the bridge CONSUMED in the binding transition and never leaves an OPEN reservation', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const world = authorizeAboveCommitted(base, team.id, { playerMinorUnits: 100 * UNIT_MINOR_UNITS, staffMinorUnits: 0 })
      const organizationId = team.organizationId
      const cashBefore = cashMinorUnitsForTest(world, organizationId)

      const capacity = bindTeamContractCapacity(world, {
        teamId: team.id,
        action: 'PLAYER_SIGNING',
        legacyAnnualAmountMajorUnits: 70_000,
        contractId: 'contract:handoff:bridge',
        effectiveDate: world.currentDate,
      })
      expect(capacity.allowed).toBe(true)
      expect(capacity.decision.status).toBe('AFFORDABLE_NOW')
      expect(capacity.reservation).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: 'contract:handoff:bridge', status: 'CONSUMED' })
      expect(capacity.reservation!.amount.minorUnits).toBe(7_000_000)
      expect(capacity.reservations.filter((reservation) => reservation.status === 'OPEN')).toHaveLength(0)

      const published = updateGameWorld(world, { financialReservations: [...capacity.reservations] })
      expect(bridgeOf(published, 'contract:handoff:bridge').status).toBe('CONSUMED')
      // A CONSUMED bridge protects nothing: the contractual schedule, not the reservation, owns capacity.
      expect(openReservedMinorUnits(published, organizationId)).toBe(0)
      expect(headroomMinorUnits(published, organizationId, 'PLAYER_SALARY')).toBe(headroomMinorUnits(world, organizationId, 'PLAYER_SALARY'))
      // It remains an authorization concern only: no cash, expense, payable, transaction or commitment.
      expect(cashMinorUnitsForTest(published, organizationId)).toBe(cashBefore)
      expect(Object.keys(published.expenseRecognitionsById)).toHaveLength(Object.keys(world.expenseRecognitionsById).length)
      expect(Object.keys(published.payablesById)).toHaveLength(Object.keys(world.payablesById).length)
      expect(Object.keys(published.financialTransactionsById)).toHaveLength(Object.keys(world.financialTransactionsById).length)
      expect(Object.keys(published.financialCommitmentsById)).toHaveLength(Object.keys(world.financialCommitmentsById).length)
    })

    it('refuses a binding canonical Finance cannot afford and publishes no reservation', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const world = authorizeAboveCommitted(base, team.id, { playerMinorUnits: 0, staffMinorUnits: 0 })
      const capacity = bindTeamContractCapacity(world, {
        teamId: team.id,
        action: 'PLAYER_SIGNING',
        legacyAnnualAmountMajorUnits: 70_000,
        contractId: 'contract:handoff:refused',
        effectiveDate: world.currentDate,
      })
      expect(capacity.allowed).toBe(false)
      expect(capacity.decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
      expect(capacity.reservation).toBeNull()
      expect(capacity.reservations).toEqual([])
      expect(world.financialReservationsById).toEqual({})
    })
  })

  describe('sequential capacity through the canonical contract commitment', () => {
    it('blocks a second signature of the same size because contract A owns capacity (70/70)', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const first = availableFreeAgent(base, team.id)
      const second = availableFreeAgent(first.world, team.id, [first.teamId])
      const world = authorizeAboveCommitted(second.world, team.id, {
        playerMinorUnits: first.salaryMinorUnits + second.salaryMinorUnits - UNIT_MINOR_UNITS,
        staffMinorUnits: 0,
      })
      const organizationId = team.organizationId
      const committedBefore = committedMinorUnits(world, organizationId, 'PLAYER_SALARY')

      const signed = signFreeAgent(world, team.id, first.playerId)
      const contractA = marketContractId(world, team.id, first.playerId)
      expect(signed.contractsById[contractA as never]).toBeDefined()
      const bridgeA = bridgeOf(signed, contractA)
      expect(bridgeA).toMatchObject({ sourceAuthority: CONTRACT_RESERVATION_AUTHORITY, sourceEntityId: contractA, status: 'CONSUMED' })
      expect(bridgeA.amount.minorUnits).toBe(first.salaryMinorUnits)
      // Exactly one mechanism owns the signing: no OPEN reservation, and the contract's guaranteed
      // payroll already commits the exact reserved amount.
      expect(openReservedMinorUnits(signed, organizationId)).toBe(0)
      expect(committedMinorUnits(signed, organizationId, 'PLAYER_SALARY')).toBe(committedBefore + first.salaryMinorUnits)
      expect(headroomMinorUnits(signed, organizationId, 'PLAYER_SALARY')).toBe(second.salaryMinorUnits - UNIT_MINOR_UNITS)

      expect(() => signFreeAgent(signed, team.id, second.playerId)).toThrow(/INSUFFICIENT_AUTHORIZED_HEADROOM/)
      expect(signed.contractsById[marketContractId(signed, team.id, second.playerId) as never]).toBeUndefined()
      expect(openReservedMinorUnits(signed, organizationId)).toBe(0)
    })

    it('binds two signatures and refuses the next one (70/30/1)', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const first = availableFreeAgent(base, team.id)
      const second = availableFreeAgent(first.world, team.id, [first.teamId])
      const third = availableFreeAgent(second.world, team.id, [first.teamId, second.teamId])
      const world = authorizeAboveCommitted(third.world, team.id, {
        playerMinorUnits: first.salaryMinorUnits + second.salaryMinorUnits,
        staffMinorUnits: 0,
      })
      const organizationId = team.organizationId

      const afterFirst = signFreeAgent(world, team.id, first.playerId)
      const afterSecond = signFreeAgent(afterFirst, team.id, second.playerId)
      expect(openReservedMinorUnits(afterFirst, organizationId)).toBe(0)
      expect(openReservedMinorUnits(afterSecond, organizationId)).toBe(0)
      expect([bridgeOf(afterSecond, marketContractId(world, team.id, first.playerId)).status, bridgeOf(afterSecond, marketContractId(afterFirst, team.id, second.playerId)).status]).toEqual(['CONSUMED', 'CONSUMED'])
      expect(headroomMinorUnits(afterSecond, organizationId, 'PLAYER_SALARY')).toBe(0)

      expect(() => signFreeAgent(afterSecond, team.id, third.playerId)).toThrow(/INSUFFICIENT_AUTHORIZED_HEADROOM/)
      expect(openReservedMinorUnits(afterSecond, organizationId)).toBe(0)
    })

    it('cannot be bypassed by BS16L financing: liquidity never creates authorization', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const first = availableFreeAgent(base, team.id)
      const second = availableFreeAgent(first.world, team.id, [first.teamId])
      const world = authorizeAboveCommitted(second.world, team.id, { playerMinorUnits: first.salaryMinorUnits, staffMinorUnits: 0 })
      const organizationId = team.organizationId

      const signed = signFreeAgent(world, team.id, first.playerId)
      expect(headroomMinorUnits(signed, organizationId, 'PLAYER_SALARY')).toBe(0)
      const financed = financingDrawdownForTest(signed, team.id, RICH_CASH_MINOR_UNITS)
      expect(cashMinorUnitsForTest(financed, organizationId)).toBeGreaterThan(cashMinorUnitsForTest(signed, organizationId))

      expect(() => signFreeAgent(financed, team.id, second.playerId)).toThrow(/INSUFFICIENT_AUTHORIZED_HEADROOM/)
      expect(openReservedMinorUnits(financed, organizationId)).toBe(0)
    })

    it('keeps player and staff authorization separate through real bindings', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const player = availableFreeAgent(base, team.id)
      const staffId = staffPersonIdFromString('staff:handoff:isolation')
      const staffSalary = staffOffer(player.world, team.id, staffId, 'advanceScout', 'staff-offer:handoff:isolation').salaryMinorUnits

      const playerOnly = authorizeAboveCommitted(player.world, team.id, { playerMinorUnits: player.salaryMinorUnits, staffMinorUnits: 0 })
      expect(signFreeAgent(playerOnly, team.id, player.playerId).contractsById[marketContractId(playerOnly, team.id, player.playerId) as never]).toBeDefined()
      expect(() => staffOffer(playerOnly, team.id, staffId, 'advanceScout', 'staff-offer:handoff:isolation:blocked')).toThrow(/canonical Finance/)

      const staffOnly = authorizeAboveCommitted(player.world, team.id, { playerMinorUnits: 0, staffMinorUnits: staffSalary })
      expect(() => signFreeAgent(staffOnly, team.id, player.playerId)).toThrow(/INSUFFICIENT_AUTHORIZED_HEADROOM/)
      const offered = staffOffer(staffOnly, team.id, staffId, 'advanceScout', 'staff-offer:handoff:isolation:allowed')
      const hired = acceptStaffJobOffer(offered.world, offered.offerId)
      expect(Object.keys(hired.staffContractsById).length).toBeGreaterThan(Object.keys(staffOnly.staffContractsById).length)
    })
  })

  describe('previews and formal offers', () => {
    it('never reserves from an evaluation or a prepared offer', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const world = authorizeAboveCommitted(base, team.id, { playerMinorUnits: 100 * UNIT_MINOR_UNITS, staffMinorUnits: 200 * UNIT_MINOR_UNITS })
      const staffId = staffPersonIdFromString('staff:handoff:preview')
      const offered = staffOffer(world, team.id, staffId, 'advanceScout', 'staff-offer:handoff:preview')
      expect(offered.world.financialReservationsById).toEqual({})
      expect(Object.values(offered.world.staffJobOffersById).find((offer) => String(offer.id) === offered.offerId)?.status).toBe('pending')
      expect(openReservedMinorUnits(offered.world, team.organizationId)).toBe(0)
    })

    it('refuses a stale staff offer once the canonical contract owns the capacity it was prepared against', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const generous = authorizeAboveCommitted(base, team.id, { playerMinorUnits: 0, staffMinorUnits: 1_000 * UNIT_MINOR_UNITS })
      const firstStaff = staffPersonIdFromString('staff:handoff:stale-first')
      const secondStaff = staffPersonIdFromString('staff:handoff:stale-second')
      const firstOffer = staffOffer(generous, team.id, firstStaff, 'advanceScout', 'staff-offer:handoff:first')
      const secondOffer = staffOffer(firstOffer.world, team.id, secondStaff, 'headScout', 'staff-offer:handoff:second')

      // Both offers were prepared when each was affordable on its own; canonical authorization fits one.
      const tight = authorizeAboveCommitted(secondOffer.world, team.id, {
        playerMinorUnits: 0,
        staffMinorUnits: firstOffer.salaryMinorUnits + secondOffer.salaryMinorUnits - UNIT_MINOR_UNITS,
      })
      const hired = acceptStaffJobOffer(tight, firstOffer.offerId)
      expect(openReservedMinorUnits(hired, team.organizationId)).toBe(0)
      expect(() => acceptStaffJobOffer(hired, secondOffer.offerId)).toThrow(/canonical Finance/)
      const secondContractId = `staff-contract:${secondStaff}:${team.id}:${hired.currentDate}`
      expect(hired.staffContractsById[secondContractId as never]).toBeUndefined()
      expect(reservationsOf(hired, secondContractId)).toHaveLength(0)
    })
  })

  describe('production flow handoff', () => {
    it('hands a free-agent signing to its contract, then keeps authorization stable at the first payroll occurrence', () => {
      const setup = freeAgentAgreement()
      const organizationId = setup.team.organizationId
      const committedBefore = committedMinorUnits(setup.world, organizationId, 'PLAYER_SALARY')
      const headroomBefore = headroomMinorUnits(setup.world, organizationId, 'PLAYER_SALARY')

      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(signed.status).toBe('SIGNED')
      const contractId = String(signed.contractId)
      expect(contractId).toBe(setup.contractId)
      expect(signed.world.contractsById[contractId as never]!.id).toBe(contractId)

      const bridge = bridgeOf(signed.world, contractId)
      expect(bridge).toMatchObject({ sourceAuthority: CONTRACT_RESERVATION_AUTHORITY, sourceEntityId: contractId, status: 'CONSUMED' })
      expect(bridge.amount.minorUnits).toBe(setup.salaryMinorUnits)
      expect(findFinancialReservationByProvenance(Object.values(signed.world.financialReservationsById), { organizationId, sourceAuthority: 'CONTRACT', sourceEntityId: contractId })).toEqual(bridge)
      expect(openReservedMinorUnits(signed.world, organizationId)).toBe(0)
      expect(committedMinorUnits(signed.world, organizationId, 'PLAYER_SALARY')).toBe(committedBefore + setup.salaryMinorUnits)
      expect(headroomMinorUnits(signed.world, organizationId, 'PLAYER_SALARY')).toBe(headroomBefore - setup.salaryMinorUnits)
      expect(signed.world.teamFinancesByTeamId).toEqual(setup.world.teamFinancesByTeamId)

      // The first payroll occurrence is accounting materialization only: authorization must not move.
      const materialized = materializePayroll(signed.world, setup.team.id, contractId, signed.world.currentDate)
      expect(materialized.status).toBe('accepted')
      expect(materialized.results.map((result) => result.status)).toEqual(['accepted'])
      expect(materialized.events[0]).toMatchObject({ sourceAuthority: 'CONTRACT', sourceEntityId: contractId })
      expect(materialized.events[0]!.amount.minorUnits).toBe(setup.salaryMinorUnits)
      expect(headroomMinorUnits(materialized.world, organizationId, 'PLAYER_SALARY')).toBe(headroomMinorUnits(signed.world, organizationId, 'PLAYER_SALARY'))
      expect(openReservedMinorUnits(materialized.world, organizationId)).toBe(0)
      expect(bridgeOf(materialized.world, contractId).status).toBe('CONSUMED')
      expect(Object.values(materialized.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${contractId}:${materialized.events[0]!.idempotencyKey}`)).toHaveLength(1)
    })

    it('hands the atomic Market signing over on its exact ordinal contract id', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const freeAgent = availableFreeAgent(base, team.id)
      const world = authorizeAboveCommitted(freeAgent.world, team.id, { playerMinorUnits: freeAgent.salaryMinorUnits, staffMinorUnits: 0 })
      const organizationId = team.organizationId
      const committedBefore = committedMinorUnits(world, organizationId, 'PLAYER_SALARY')

      const signed = signFreeAgent(world, team.id, freeAgent.playerId)
      const contractId = marketContractId(world, team.id, freeAgent.playerId)
      expect(signed.contractsById[contractId as never]).toBeDefined()
      const bridge = bridgeOf(signed, contractId)
      expect(bridge).toMatchObject({ sourceAuthority: CONTRACT_RESERVATION_AUTHORITY, sourceEntityId: contractId, status: 'CONSUMED' })
      expect(bridge.amount.minorUnits).toBe(freeAgent.salaryMinorUnits)
      expect(openReservedMinorUnits(signed, organizationId)).toBe(0)
      expect(committedMinorUnits(signed, organizationId, 'PLAYER_SALARY')).toBe(committedBefore + freeAgent.salaryMinorUnits)
      expect(headroomMinorUnits(signed, organizationId, 'PLAYER_SALARY')).toBe(0)
      expect(signed.teamFinancesByTeamId).toEqual(world.teamFinancesByTeamId)
    })

    it('hands a staff hire over on its exact staff contract id and stays stable at the first staff payroll', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const staffId = staffPersonIdFromString('staff:handoff:hire')
      const offered = staffOffer(authorizeAboveCommitted(base, team.id, { playerMinorUnits: 0, staffMinorUnits: 1_000 * UNIT_MINOR_UNITS }), team.id, staffId, 'advanceScout', 'staff-offer:handoff:hire')
      const organizationId = team.organizationId
      const contractId = `staff-contract:${staffId}:${team.id}:${offered.world.currentDate}`
      const committedBefore = committedMinorUnits(offered.world, organizationId, 'STAFF_SALARY')
      const headroomBefore = headroomMinorUnits(offered.world, organizationId, 'STAFF_SALARY')

      const hired = acceptStaffJobOffer(offered.world, offered.offerId)
      expect(hired.staffContractsById[contractId as never]).toBeDefined()
      const bridge = bridgeOf(hired, contractId)
      expect(bridge).toMatchObject({ sourceAuthority: CONTRACT_RESERVATION_AUTHORITY, sourceEntityId: contractId, status: 'CONSUMED' })
      expect(bridge.amount.minorUnits).toBe(offered.salaryMinorUnits)
      expect(openReservedMinorUnits(hired, organizationId)).toBe(0)
      expect(committedMinorUnits(hired, organizationId, 'STAFF_SALARY')).toBe(committedBefore + offered.salaryMinorUnits)
      expect(headroomMinorUnits(hired, organizationId, 'STAFF_SALARY')).toBe(headroomBefore - offered.salaryMinorUnits)
      expect(hired.teamFinancesByTeamId).toEqual(offered.world.teamFinancesByTeamId)

      const materialized = materializePayroll(hired, team.id, contractId, hired.currentDate)
      expect(materialized.status).toBe('accepted')
      expect(headroomMinorUnits(materialized.world, organizationId, 'STAFF_SALARY')).toBe(headroomMinorUnits(hired, organizationId, 'STAFF_SALARY'))
      expect(bridgeOf(materialized.world, contractId).status).toBe('CONSUMED')
      expect(openReservedMinorUnits(materialized.world, organizationId)).toBe(0)
    })

    it('hands a future-dated retention successor over immediately and keeps it out of the current period', () => {
      const setup = retentionSetup({ agentFee: 2_500, agentFeePayer: 'CLUB' })
      const organizationId = setup.team.organizationId
      const headroomBefore = headroomMinorUnits(setup.approvedWorld, organizationId, 'PLAYER_SALARY')

      const bridge = bridgeOf(setup.signed.world, setup.successorId)
      expect(bridge).toMatchObject({ sourceAuthority: CONTRACT_RESERVATION_AUTHORITY, sourceEntityId: setup.successorId, status: 'CONSUMED' })
      expect(bridge.amount.minorUnits).toBe(setup.salaryMinorUnits)
      expect(openReservedMinorUnits(setup.signed.world, organizationId)).toBe(0)
      // The successor owns its (next season) obligation, and canonical Finance keeps it out of the
      // current authorization period: a current-period hold is not used to represent a future salary.
      expect(contractOwnsCapacityAuthority(setup.signed.world, { contractId: setup.successorId, organizationId })).toBe(true)
      const successor = setup.signed.world.contractsById[setup.successorId as never]!
      expect(successor.term.startsOn > setup.signed.world.currentDate).toBe(true)
      expect(headroomMinorUnits(setup.signed.world, organizationId, 'PLAYER_SALARY')).toBe(headroomBefore)
      // The club agent fee stays an independent commitment and is never reserved.
      const fee = Object.values(setup.signed.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'PLAYER_AGENT_FEE')
      expect(fee).toHaveLength(1)
      expect(reservationsOf(setup.signed.world, String(fee[0]!.id))).toHaveLength(0)
    })

    it('creates exactly one terminal reservation when Governance executes an approved signing', () => {
      const setup = freeAgentAgreement()
      const first = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(first.status).toBe('SIGNED')
      expect(Object.values(first.world.financialReservationsById).filter((reservation) => reservation.status === 'OPEN')).toHaveLength(0)
      expect(reservationsOf(first.world, setup.contractId)).toHaveLength(1)
      expect(Object.values(first.world.governanceDecisionEventsById).filter((event) => event.decisionId === 'decision:capacity-handoff' && event.kind === 'EXECUTED')).toHaveLength(1)

      const retry = completeAcceptedFreeAgentSigning(first.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      expect(retry.status).toBe('ALREADY_SIGNED')
      expect(retry.world).toBe(first.world)
      expect(reservationsOf(retry.world, setup.contractId)).toHaveLength(1)
    })
  })

  describe('compatibility and durability', () => {
    it('leaves no OPEN reservation when a bound contract is released before its first payroll', () => {
      const setup = retentionSetup()
      expect(bridgeOf(setup.signed.world, setup.successorId).status).toBe('CONSUMED')
      const released = executeContractRelease(setup.signed.world, setup.team.id, setup.playerId)
      expect(released.status).toBe('RELEASED')
      // Nothing to leak: the released successor never held an OPEN reservation, so no reservation-specific
      // release patch is needed and released contractual salary follows the contract lifecycle alone.
      expect(Object.values(released.world.financialReservationsById).filter((reservation) => reservation.status === 'OPEN')).toHaveLength(0)
      expect(openReservedMinorUnits(released.world, setup.team.organizationId)).toBe(0)
      expect(bridgeOf(released.world, setup.successorId).status).toBe('CONSUMED')
    })

    it('repairs a superseded BS16M-B1 world that still carries a matching OPEN reservation', () => {
      const setup = freeAgentAgreement()
      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      const organizationId = setup.team.organizationId
      const contractId = String(signed.contractId)
      const published = signed.world
      expect(openReservedMinorUnits(published, organizationId)).toBe(0)

      // A club whose authorization still has exactly this contract's amount free.
      const free = setup.salaryMinorUnits
      const tightened = authorizeAboveCommitted(published, setup.team.id, { playerMinorUnits: free, staffMinorUnits: 0 })
      expect(openReservedMinorUnits(tightened, organizationId)).toBe(0)
      expect(headroomMinorUnits(tightened, organizationId, 'PLAYER_SALARY')).toBe(free)

      // The BS16M-B1 shape is representable from the canonical facts: the same reservation, still OPEN.
      const superseded = updateGameWorld(tightened, {
        financialReservations: Object.values(tightened.financialReservationsById).map((reservation) => reservation.sourceEntityId === contractId ? asSupersededOpenReservation(reservation) : reservation),
      })
      expect(openReservedMinorUnits(superseded, organizationId)).toBe(free)
      // Superseded shape: the same obligation is counted twice, so the free authorization disappears.
      expect(headroomMinorUnits(superseded, organizationId, 'PLAYER_SALARY')).toBe(0)

      // The canonical reconciliation point (payroll materialization) repairs it in one transition.
      const reconciled = materializePayroll(superseded, setup.team.id, contractId, superseded.currentDate)
      expect(reconciled.status).toBe('accepted')
      expect(bridgeOf(reconciled.world, contractId).status).toBe('CONSUMED')
      expect(openReservedMinorUnits(reconciled.world, organizationId)).toBe(0)
      expect(headroomMinorUnits(reconciled.world, organizationId, 'PLAYER_SALARY')).toBe(free)
      expect(contractOwnsCapacityAuthority(reconciled.world, { contractId, organizationId })).toBe(true)

      // The defensive path also covers an already processed event: a lingering OPEN reservation is
      // consumed rather than left double-counted indefinitely.
      const reOpened = updateGameWorld(reconciled.world, {
        financialReservations: Object.values(reconciled.world.financialReservationsById).map((reservation) => reservation.sourceEntityId === contractId ? asSupersededOpenReservation(reservation) : reservation),
      })
      const replay = materializePayroll(reOpened, setup.team.id, contractId, reOpened.currentDate)
      expect(replay.status).toBe('alreadyProcessed')
      expect(bridgeOf(replay.world, contractId).status).toBe('CONSUMED')
      expect(openReservedMinorUnits(replay.world, organizationId)).toBe(0)
      expect(headroomMinorUnits(replay.world, organizationId, 'PLAYER_SALARY')).toBe(free)
      expect(Object.keys(replay.world.financialCommitmentsById)).toHaveLength(Object.keys(reOpened.financialCommitmentsById).length)
    })

    it('keeps a historical commitment without a reservation valid', () => {
      const base = fundedClub()
      const team = userTeam(base)
      const freeAgent = availableFreeAgent(base, team.id)
      const world = authorizeAboveCommitted(freeAgent.world, team.id, { playerMinorUnits: 100 * UNIT_MINOR_UNITS, staffMinorUnits: 0 })
      const legacyContractId = 'contract:handoff:legacy'
      const withLegacy = updateGameWorld(world, {
        contracts: [...Object.values(world.contractsById), createPlayerContract({
          id: contractIdFromString(legacyContractId),
          playerId: freeAgent.playerId,
          teamId: team.id,
          kind: 'standard',
          term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) },
          compensation: { annualSalary: 400_000 },
        })],
      })
      expect(withLegacy.financialReservationsById).toEqual({})

      const materialized = materializePayroll(withLegacy, team.id, legacyContractId, withLegacy.currentDate)
      expect(materialized.status).toBe('accepted')
      expect(materialized.world.financialReservationsById).toEqual({})
      expect(Object.values(materialized.world.financialCommitmentsById).filter((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `CONTRACT:${legacyContractId}:${materialized.events[0]!.idempotencyKey}`)).toHaveLength(1)
      const replay = materializePayroll(materialized.world, team.id, legacyContractId, withLegacy.currentDate)
      expect(replay.status).toBe('alreadyProcessed')
      expect(replay.world).toBe(materialized.world)
    })

    it('keeps a terminal bridge across save/load and replay without duplicating anything', () => {
      const setup = freeAgentAgreement()
      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      const contractId = String(signed.contractId)
      const organizationId = setup.team.organizationId

      const restored = roundTrip(signed.world)
      expect(restored.financialReservationsById).toEqual(signed.world.financialReservationsById)
      expect(bridgeOf(restored, contractId).status).toBe('CONSUMED')
      expect(headroomMinorUnits(restored, organizationId, 'PLAYER_SALARY')).toBe(headroomMinorUnits(signed.world, organizationId, 'PLAYER_SALARY'))

      const materialized = materializePayroll(restored, setup.team.id, contractId, restored.currentDate)
      expect(materialized.status).toBe('accepted')
      const replay = materializePayroll(materialized.world, setup.team.id, contractId, restored.currentDate)
      expect(replay.status).toBe('alreadyProcessed')
      expect(replay.world).toBe(materialized.world)
      expect(bridgeOf(replay.world, contractId).status).toBe('CONSUMED')
      expect(openReservedMinorUnits(replay.world, organizationId)).toBe(0)
      expect(roundTrip(materialized.world).financialReservationsById).toEqual(materialized.world.financialReservationsById)
    })

    it('proves the capacity authority predicate the binders guard on', () => {
      const setup = freeAgentAgreement()
      const signed = completeAcceptedFreeAgentSigning(setup.world, { teamId: setup.team.id, negotiationId: setup.negotiation.id, expectedProposalId: setup.negotiation.sourceProposalId! })
      const organizationId = setup.team.organizationId
      expect(contractOwnsCapacityAuthority(signed.world, { contractId: String(signed.contractId), organizationId })).toBe(true)
      expect(contractOwnsCapacityAuthority(setup.world, { contractId: String(signed.contractId), organizationId })).toBe(false)
      expect(contractOwnsCapacityAuthority(signed.world, { contractId: 'contract:handoff:missing', organizationId })).toBe(false)
      // A future-dated successor is derivable capacity authority even though the current period excludes it.
      const retention = retentionSetup()
      expect(contractOwnsCapacityAuthority(retention.signed.world, { contractId: retention.successorId, organizationId: retention.team.organizationId })).toBe(true)
    })
  })
})
