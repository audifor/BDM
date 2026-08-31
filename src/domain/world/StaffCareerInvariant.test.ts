import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { staffContractIdFromString } from '@/domain/staffContract'
import { staffJobCandidacyIdFromString, staffJobOfferIdFromString, staffJobOpeningIdFromString } from '@/domain/staffCareer'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffJobOpeningForTeam, identifyStaffCandidate } from '@/app/staffCareer'
import { updateGameWorld, GameWorldValidationError } from './index'

describe('Staff employment <-> TeamStaffAssignment invariant', () => {
  it('employed => exactly one matching TeamStaffAssignment (already the case for every generated Staff person)', () => {
    const world = createNewGame()
    for (const [staffId, employment] of Object.entries(world.staffEmploymentByStaffId)) {
      if (employment.status !== 'employed') continue
      const matching = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId === staffId)
      expect(matching).toHaveLength(1)
      expect(matching[0]!.teamId).toBe(employment.teamId)
      expect(matching[0]!.role).toBe(employment.roleId)
    }
  })

  it('unemployed => zero TeamStaffAssignment rows', () => {
    const world = createNewGame()
    const staffId = staffPersonIdFromString('unemployed-invariant-staff')
    const withUnemployed = updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Un', lastName: 'Employed' }, professional: { attributes: Object.fromEntries(Object.keys(Object.values(world.staffPeopleById)[0]!.professional.attributes).map((key) => [key, 50])) as never } }],
      staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { status: 'unemployed' } },
    })
    expect(Object.values(withUnemployed.teamStaffAssignmentsById).some((assignment) => assignment.staffPersonId === staffId)).toBe(false)
  })

  it('rejects a mismatched role between employment and assignment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry
    expect(() => updateGameWorld(world, { staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { ...employment, roleId: 'headScout' } } })).toThrow(GameWorldValidationError)
  })

  it('rejects a mismatched team between employment and assignment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== employment.teamId)!.id
    expect(() => updateGameWorld(world, { staffEmploymentByStaffId: { ...world.staffEmploymentByStaffId, [staffId]: { ...employment, teamId: otherTeamId } } })).toThrow(GameWorldValidationError)
  })

  it('rejects duplicate active assignments for one employed Staff person', () => {
    const world = createNewGame()
    const assignment = Object.values(world.teamStaffAssignmentsById)[0]!
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== assignment.teamId)!.id as TeamId
    const duplicate = { id: teamStaffAssignmentIdFromString(`${assignment.id}-dup`), staffPersonId: assignment.staffPersonId, teamId: otherTeamId, role: assignment.role, assignedOn: world.currentDate }
    expect(() => updateGameWorld(world, { teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), duplicate] })).toThrow(GameWorldValidationError)
  })

  it('rejects more than one active StaffContract for the same Staff person', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry as [never, typeof employedEntry[1]]
    const secondContract = { id: staffContractIdFromString('duplicate-active-contract'), staffId, teamId: employment.teamId!, kind: 'standard' as const, term: { startsOn: world.currentDate, expiresOn: '2099-10-01' as never }, compensation: { annualSalary: 50_000 } }
    expect(() => updateGameWorld(world, { staffContracts: [...Object.values(world.staffContractsById), secondContract] })).toThrow(GameWorldValidationError)
  })

  it('rejects an active StaffContract whose team does not match employment', () => {
    const world = createNewGame()
    const employedEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'employed')!
    const [staffId, employment] = employedEntry as [never, typeof employedEntry[1]]
    const otherTeamId = Object.values(world.teams).find((team) => team.id !== employment.teamId)!.id
    const withoutOwnContract = { ...world.staffContractsById }
    for (const [id, contract] of Object.entries(withoutOwnContract)) if (contract.staffId === staffId && contract.termination === undefined) delete withoutOwnContract[id as never]
    const mismatched = { id: staffContractIdFromString('mismatched-team-contract'), staffId, teamId: otherTeamId, kind: 'standard' as const, term: { startsOn: world.currentDate, expiresOn: '2099-10-01' as never }, compensation: { annualSalary: 50_000 } }
    expect(() => updateGameWorld(world, { staffContracts: [...Object.values(withoutOwnContract), mismatched] })).toThrow(GameWorldValidationError)
  })
})

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as StaffAttributes

describe('StaffJobOffer semantic validation (Issue #19 review Blocker 6)', () => {
  /** A world with a real, valid opening/candidacy/offer triple to tamper with. */
  function offerFixture() {
    const base = createNewGame()
    const [teamA, teamB] = Object.values(base.teams)
    const staffId = staffPersonIdFromString('offer-validation-staff')
    const withStaff = updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Off', lastName: 'Er' }, professional: { attributes: flatAttributes } }] })
    const withReputation = updateGameWorld(withStaff, { staffReputationProfilesByStaffId: { ...withStaff.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() } })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withReputation, { teamId: teamA!.id, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    // A `pending` offer is only ever produced once its candidacy has reached `offered` (see
    // `createStaffJobOffer`) — advance the candidacy here so this fixture stays a genuinely
    // well-formed state under the offer<->candidacy consistency invariant (Issue #19 review Blocker 2).
    const withOfferedCandidacy = updateGameWorld(candidate.world, {
      staffJobCandidacies: [...Object.values(candidate.world.staffJobCandidaciesById).filter((item) => item.id !== candidate.candidacyId), { ...candidate.world.staffJobCandidaciesById[candidate.candidacyId as never]!, status: 'offered' }],
    })
    const offerId = staffJobOfferIdFromString('offer-validation-offer')
    const withOffer = updateGameWorld(withOfferedCandidacy, {
      staffJobOffers: [...Object.values(withOfferedCandidacy.staffJobOffersById), { id: offerId, jobOpeningId: opening.id, staffId, teamId: teamA!.id, annualSalary: 65_000, createdOn: withOfferedCandidacy.currentDate, status: 'pending' }],
    })
    return { world: withOffer, teamA: teamA!.id, teamB: teamB!.id, staffId, opening, offerId, candidacyId: candidate.candidacyId }
  }

  it('rejects an offer whose Team does not match its opening\'s Team (offer from Team B pointing at an opening for Team A)', () => {
    const fixture = offerFixture()
    const tampered = { ...fixture.world.staffJobOffersById[fixture.offerId]!, teamId: fixture.teamB }
    expect(() => updateGameWorld(fixture.world, { staffJobOffers: [...Object.values(fixture.world.staffJobOffersById).filter((o) => o.id !== fixture.offerId), tampered] })).toThrow(GameWorldValidationError)
  })

  it('rejects an offer for one Staff person whose candidacy belongs to a different Staff person', () => {
    const fixture = offerFixture()
    const otherStaffId = staffPersonIdFromString('offer-validation-other-staff')
    const withOtherStaff = updateGameWorld(fixture.world, { staffPeople: [...Object.values(fixture.world.staffPeopleById), { id: otherStaffId, identity: { firstName: 'Oth', lastName: 'Er' }, professional: { attributes: flatAttributes } }] })
    // Remove the real candidacy for `staffId` so the ONLY candidacy for this opening belongs to `otherStaffId`.
    const withoutRealCandidacy = Object.fromEntries(Object.entries(withOtherStaff.staffJobCandidaciesById).filter(([id]) => id !== fixture.candidacyId))
    const swappedCandidacy = { id: staffJobCandidacyIdFromString('offer-validation-swapped-candidacy'), jobOpeningId: fixture.opening.id, staffId: otherStaffId, status: 'identified' as const, createdOn: withOtherStaff.currentDate }
    expect(() => updateGameWorld(withOtherStaff, { staffJobCandidacies: [...Object.values(withoutRealCandidacy), swappedCandidacy] })).toThrow(GameWorldValidationError)
  })

  it('rejects an offer pointing at an opening with no matching candidacy at all', () => {
    const fixture = offerFixture()
    const withoutCandidacy = Object.fromEntries(Object.entries(fixture.world.staffJobCandidaciesById).filter(([id]) => id !== fixture.candidacyId))
    expect(() => updateGameWorld(fixture.world, { staffJobCandidacies: Object.values(withoutCandidacy) })).toThrow(GameWorldValidationError)
  })

  it('accepts a well-formed offer with a genuinely matching opening and candidacy', () => {
    const fixture = offerFixture()
    expect(() => updateGameWorld(fixture.world, {})).not.toThrow()
  })

  it('rejects an offer whose jobOpeningId does not exist at all', () => {
    const fixture = offerFixture()
    const tampered = { ...fixture.world.staffJobOffersById[fixture.offerId]!, jobOpeningId: staffJobOpeningIdFromString('nonexistent-opening') }
    expect(() => updateGameWorld(fixture.world, { staffJobOffers: [...Object.values(fixture.world.staffJobOffersById).filter((o) => o.id !== fixture.offerId), tampered] })).toThrow(GameWorldValidationError)
  })
})

describe('StaffJobOffer <-> StaffJobCandidacy status consistency (Issue #19 review Blocker 2)', () => {
  function offerCandidacyFixture() {
    const base = createNewGame()
    const teamA = Object.values(base.teams)[0]!
    const staffId = staffPersonIdFromString('offer-candidacy-consistency-staff')
    const withStaff = updateGameWorld(base, { staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Con', lastName: 'Sist' }, professional: { attributes: flatAttributes } }] })
    const withReputation = updateGameWorld(withStaff, { staffReputationProfilesByStaffId: { ...withStaff.staffReputationProfilesByStaffId, [staffId]: createDefaultStaffReputationProfile() } })
    const { world: withOpening, opening } = createStaffJobOpeningForTeam(withReputation, { teamId: teamA.id, roleId: 'advanceScout' })
    const candidate = identifyStaffCandidate(withOpening, { openingId: opening.id, staffId })
    const offerId = staffJobOfferIdFromString('offer-candidacy-consistency-offer')
    return { world: candidate.world, teamId: teamA.id, staffId, opening, offerId, candidacyId: candidate.candidacyId }
  }

  /** Builds a world with the offer at `offerStatus` and the candidacy at `candidacyStatus`, bypassing the state machine (direct fixture construction), to probe the invariant in isolation. */
  function worldWith(offerStatus: 'pending' | 'accepted' | 'declined' | 'withdrawn', candidacyStatus: 'identified' | 'interviewing' | 'rejected' | 'offered' | 'withdrawn' | 'hired') {
    const fixture = offerCandidacyFixture()
    const candidacy = fixture.world.staffJobCandidaciesById[fixture.candidacyId as never]!
    const worldWithCandidacy = updateGameWorld(fixture.world, {
      staffJobCandidacies: [...Object.values(fixture.world.staffJobCandidaciesById).filter((item) => item.id !== fixture.candidacyId), { ...candidacy, status: candidacyStatus }],
    })
    const offer = { id: fixture.offerId, jobOpeningId: fixture.opening.id, staffId: fixture.staffId, teamId: fixture.teamId, annualSalary: 65_000, createdOn: worldWithCandidacy.currentDate, status: offerStatus }
    return () => updateGameWorld(worldWithCandidacy, { staffJobOffers: [...Object.values(worldWithCandidacy.staffJobOffersById), offer] })
  }

  const validCombinations: readonly [Parameters<typeof worldWith>[0], Parameters<typeof worldWith>[1]][] = [
    ['pending', 'offered'],
    ['accepted', 'hired'],
    ['declined', 'rejected'],
    ['withdrawn', 'withdrawn'],
    ['withdrawn', 'rejected'],
  ]

  for (const [offerStatus, candidacyStatus] of validCombinations) {
    it(`accepts offer ${offerStatus} + candidacy ${candidacyStatus}`, () => {
      expect(worldWith(offerStatus, candidacyStatus)).not.toThrow()
    })
  }

  const invalidCombinations: readonly [Parameters<typeof worldWith>[0], Parameters<typeof worldWith>[1]][] = [
    ['pending', 'identified'],
    ['pending', 'hired'],
    ['accepted', 'offered'],
    ['accepted', 'rejected'],
    ['declined', 'offered'],
    ['withdrawn', 'hired'],
  ]

  for (const [offerStatus, candidacyStatus] of invalidCombinations) {
    it(`rejects offer ${offerStatus} + candidacy ${candidacyStatus} with the status-consistency error`, () => {
      try {
        worldWith(offerStatus, candidacyStatus)()
        expect.unreachable('expected GameWorldValidationError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(GameWorldValidationError)
        expect((error as Error).message).toMatch(/status .* is inconsistent with its Staff candidacy/)
      }
    })
  }
})
