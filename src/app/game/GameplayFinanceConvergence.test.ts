import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { maintainAiTeamMinimumRosters } from '@/app/market/AiRosterMaintenance'
import { completeAcceptedFreeAgentSigning } from '@/app/marketIntelligence/FreeAgentSigningService'
import { acceptStaffJobOffer, completeStaffInterview, createStaffJobOffer, createStaffJobOpeningForTeam, identifyStaffCandidate, startStaffInterview } from '@/app/staffCareer/StaffCareerService'
import { addDays } from '@/domain/date'
import { getPlayerContractStatus } from '@/domain/contract'
import { staffPersonIdFromString, type StaffPersonId, type TeamId } from '@/domain/ids'
import { createNegotiationContact, type ContractNegotiation } from '@/domain/market'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { openNegotiation } from '@/engine/market/MarketEngine'
import { authorizeTeamSalaryForTest, commitTeamLiquidityForTest, financingDrawdownForTest } from '@/domain/finance/financeTestFixture'

/**
 * BS16M-A: gameplay decisions are answered by canonical Finance and by nothing else. Each test proves a
 * real production entry point both ways — it proceeds when canonical Finance allows it and it is refused
 * with canonical status/reasons when canonical Finance does not — so a legacy payroll budget can no
 * longer be the deciding authority.
 */
const FUNDED = 10_000_000_000
const AUTHORIZATION = { playerSalaryMinorUnits: 200_000_000_000, staffSalaryMinorUnits: 200_000_000_000 }

/**
 * BS16M-B2: the prototype clubs are provisioned and already carry canonical ledger history, so liquidity
 * comes from the canonical financing authority and the currency is the club's own canonical one.
 */
function financed(world: GameWorld, teamId: TeamId): GameWorld {
  const organizationId = world.teams[teamId]!.organizationId
  const currencyCode = String(world.organizationFinancialProfilesById[organizationId]!.baseCurrencyCode)
  return authorizeTeamSalaryForTest(
    financingDrawdownForTest(world, teamId, FUNDED, 'bs16m-a'),
    teamId,
    { currencyCode, ...AUTHORIZATION },
  )
}

function userClub(): { readonly world: GameWorld; readonly teamId: TeamId } {
  const world = createNewGame()
  const team = getUserTeam(world) ?? Object.values(world.teams)[0]!
  return { world, teamId: team.id }
}

function pickReleasablePlayer(world: GameWorld, excludedTeamIds: readonly TeamId[]): { readonly teamId: TeamId; readonly playerId: import('@/domain/ids').PlayerId } {
  const contract = Object.values(world.contractsById).find((item) => item.teamId !== undefined
    && !excludedTeamIds.includes(item.teamId)
    && getPlayerContractStatus(item, world.currentDate) === 'active'
    && world.teams[item.teamId]?.rosterPlayerIds.includes(item.playerId))
  if (contract === undefined) throw new Error('The fixture needs a rostered player with an active contract')
  return { teamId: contract.teamId, playerId: contract.playerId }
}

function contactFixture(): { readonly world: GameWorld; readonly teamId: TeamId; readonly playerId: import('@/domain/ids').PlayerId; readonly actionKey: string; readonly sourcePlanId: string; readonly sourceProposalId: string } {
  const { world, teamId } = userClub()
  const team = world.teams[teamId]!
  const donor = pickReleasablePlayer(world, [teamId])
  const released = releasePlayer(world, donor.teamId, donor.playerId)
  const actionKey = 'convergence:offer'
  const sourcePlanId = 'convergence-plan'
  const sourceProposalId = 'convergence-proposal'
  const responseDate = addDays(released.currentDate, 1)
  const contact = {
    ...createNegotiationContact({ organizationId: team.organizationId, teamId, playerId: donor.playerId, startedOn: released.currentDate, actionKey, sourcePlanId, sourceProposalId, responsibleActor: { kind: 'USER' } }),
    contactResponse: { outcome: 'OPEN_TO_TALKS' as const, respondedOn: responseDate, marketSignalId: 'signal:convergence' },
  } as ContractNegotiation
  return { world: updateGameWorld(released, { currentDate: responseDate, negotiations: [contact] }), teamId, playerId: donor.playerId, actionKey, sourcePlanId, sourceProposalId }
}

describe('BS16M-A canonical consumer convergence', () => {
  it('lets a formal market offer pass only on canonical capacity, and reports canonical reasons when it is refused', () => {
    const setup = contactFixture()
    const offer = { ...setup, salary: 500_000, years: 2, offerResponsibleActor: { kind: 'USER' as const } }

    expect(() => openNegotiation(setup.world, {
      organizationId: setup.world.teams[setup.teamId]!.organizationId,
      teamId: setup.teamId,
      playerId: setup.playerId,
      salary: offer.salary,
      years: offer.years,
      actionKey: setup.actionKey,
      sourcePlanId: setup.sourcePlanId,
      sourceProposalId: setup.sourceProposalId,
      offerResponsibleActor: offer.offerResponsibleActor,
    })).toThrow(/cannot afford the formal offer salary \((?:[A-Z_]+):(?:[A-Z_|]+)\)/)

    const funded = financed(setup.world, setup.teamId)
    const opened = openNegotiation(funded, {
      organizationId: funded.teams[setup.teamId]!.organizationId,
      teamId: setup.teamId,
      playerId: setup.playerId,
      salary: offer.salary,
      years: offer.years,
      actionKey: setup.actionKey,
      sourcePlanId: setup.sourcePlanId,
      sourceProposalId: setup.sourceProposalId,
      offerResponsibleActor: offer.offerResponsibleActor,
    })
    expect(Object.values(opened.negotiationsById).filter((item) => item.status === 'OPEN' && 'salary' in item && item.salary === 500_000)).toHaveLength(1)
  })
  it('re-evaluates canonical Finance immediately before a free-agent signing becomes binding', () => {
    const { world, teamId } = userClub()
    const team = world.teams[teamId]!
    const donor = pickReleasablePlayer(world, [teamId])
    const released = releasePlayer(world, donor.teamId, donor.playerId)

    expect(() => signFreeAgent(released, team.id, donor.playerId)).toThrow(/Team cannot afford salary/)

    const funded = financed(released, team.id)
    const signed = signFreeAgent(funded, team.id, donor.playerId)
    expect(signed.teams[team.id]!.rosterPlayerIds).toContain(donor.playerId)
    // Canonical convergence introduces no legacy dual write: the payroll pools are untouched.
    expect(signed.teamFinancesByTeamId).toEqual(funded.teamFinancesByTeamId)

    // A club whose liquidity is already committed cannot sign, however large its legacy payroll pool is.
    const second = pickReleasablePlayer(signed, [team.id])
    const secondReleased = releasePlayer(signed, second.teamId, second.playerId)
    const committed = commitTeamLiquidityForTest(secondReleased, team.id, FUNDED)
    expect(() => signFreeAgent(committed, team.id, second.playerId)).toThrow(/Team cannot afford salary/)
  })

  it('refuses an accepted agreement whose canonical Finance no longer allows it, before fee accounting', () => {
    const { world, teamId } = userClub()
    const team = world.teams[teamId]!
    const donor = pickReleasablePlayer(world, [teamId])
    const released = releasePlayer(world, donor.teamId, donor.playerId)
    const negotiation: ContractNegotiation = {
      id: 'negotiation:convergence:accepted',
      organizationId: team.organizationId,
      teamId: team.id,
      playerId: donor.playerId,
      sourceProposalId: 'proposal:convergence:accepted',
      status: 'ACCEPTED',
      salary: 500_000,
      years: 2,
      round: 1,
    }
    const committed = commitTeamLiquidityForTest(
      updateGameWorld(financed(released, team.id), { negotiations: [negotiation] }),
      team.id,
      FUNDED,
    )
    const result = completeAcceptedFreeAgentSigning(committed, { teamId: team.id, negotiationId: negotiation.id, expectedProposalId: negotiation.sourceProposalId! })
    expect(result.status).toBe('FINANCIAL_BLOCK')
    expect(result.reason).toMatch(/INSUFFICIENT_LIQUIDITY|REQUIRES_FINANCING/)
    expect(result.world).toBe(committed)
    expect(Object.values(committed.contractsById).some((contract) => contract.id === 'contract:signed-free-agent:negotiation:convergence:accepted')).toBe(false)
  })

  it('re-checks canonical Finance at staff offer and again at staff hiring execution', () => {
    const { world, teamId } = userClub()
    const staffId = staffPersonIdFromString('staff:convergence:hire')
    const openingBase = withFreeAgentStaff(financed(world, teamId), staffId)

    const { world: blockedWorld, opening: blockedOpening } = createStaffJobOpeningForTeam(commitTeamLiquidityForTest(openingBase, teamId, FUNDED), { teamId, roleId: 'advanceScout' })
    const blockedCandidate = identifyStaffCandidate(blockedWorld, { openingId: blockedOpening.id, staffId })
    const blockedInterview = completeStaffInterview(startStaffInterview(blockedCandidate.world, blockedCandidate.candidacyId), blockedCandidate.candidacyId)
    expect(() => createStaffJobOffer(blockedInterview, { candidacyId: blockedCandidate.candidacyId })).toThrow(/canonical Finance/)

    const { world: offerWorld, opening } = createStaffJobOpeningForTeam(openingBase, { teamId, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(offerWorld, { openingId: opening.id, staffId })
    const interviewed = completeStaffInterview(startStaffInterview(candidate.world, candidate.candidacyId), candidate.candidacyId)
    const offered = createStaffJobOffer(interviewed, { candidacyId: candidate.candidacyId })
    const accepted = acceptStaffJobOffer(offered.world, offered.offerId)
    expect(accepted.staffEmploymentByStaffId[staffId]).toMatchObject({ status: 'employed', teamId })
    expect(accepted.teamFinancesByTeamId).toEqual(offered.world.teamFinancesByTeamId)

    // The same offer can no longer be accepted once canonical liquidity is committed.
    const committed = commitTeamLiquidityForTest(offered.world, teamId, FUNDED)
    expect(() => acceptStaffJobOffer(committed, offered.offerId)).toThrow(/canonical Finance/)
  })

  it('keeps the AI minimum-roster repair on canonical Finance and reports the canonical blocker instead of "over budget"', () => {
    const { world, teamId } = userClub()
    const ai = Object.values(world.teams).find((team) => team.id !== teamId && team.coachId !== world.userCoachId)!
    const donor = pickReleasablePlayer(world, [ai.id, teamId])
    const released = releasePlayer(world, donor.teamId, donor.playerId)
    const short = updateGameWorld(released, { teams: Object.values(released.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.slice(0, 4) } : team) })

    const blocked = maintainAiTeamMinimumRosters(short, { source: 'WORLD_REPAIR' })
    expect(blocked.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(4)
    expect(blocked.unresolvedTeamIds).toContain(ai.id)
    expect(blocked.reports.find((report) => report.targetEntity === ai.id)).toMatchObject({ classification: 'UNRECOVERABLE' })
    expect(blocked.reports.find((report) => report.targetEntity === ai.id)!.diagnostics[0]!.message).toMatch(/canonical Finance/)

    const repaired = maintainAiTeamMinimumRosters(financed(short, ai.id), { source: 'WORLD_REPAIR' })
    expect(repaired.world.teams[ai.id]!.rosterPlayerIds).toHaveLength(5)
    expect(repaired.unresolvedTeamIds).not.toContain(ai.id)
  })
})

function withFreeAgentStaff(world: GameWorld, staffId: StaffPersonId): GameWorld {
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 90])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  return updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Convergence', lastName: 'Candidate' }, professional: { attributes } }],
    staffReputationProfilesByStaffId: { ...world.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() },
  })
}
