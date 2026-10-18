import { createCoach, coachProfileRefsForCoachId } from '@/domain/coach'
import { createCoachEmployment } from '@/domain/coachCareer'
import { createCoachFinanceProfile } from '@/domain/coachFinances'
import { createInitialCoachRpgProfile } from '@/domain/coachRpg'
import { addYears } from '@/domain/date'
import { coachIdFromString, type TeamId } from '@/domain/ids'
import { createPerson } from '@/domain/person'
import { createDefaultCoachReputationProfile } from '@/domain/coachReputation'
import { createStaffPerson } from '@/domain/staff'
import { createStaffContract, staffContractIdFromString } from '@/domain/staffContract'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { applyMoraleEventToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { createUserCoachRookieProfessionalProfile } from '@/engine/world/CoachProfessionalProfileGenerator'
import { acceptCoachJobOffer, applyUserCoachForJob, fireCoachFromTeam, getOpenCoachJobs } from '@/app/coachCareer'
import { applyUserCoachCreation, type UserCoachCreationInput } from './UserCoachCreator'
import { queueFirstStaffMeeting } from '@/app/coachLife/StaffTrustMeeting'

/**
 * BS19B WorldDB initial appointment. This is an explicitly simulated career divergence,
 * not an edit to the read-only database or a claim that its incumbent was fired in real life.
 * Reuse the existing Coach Career dismissal -> vacancy -> candidature -> offer -> acceptance
 * pipeline, rather than introducing another appointment authority.
 */
export function appointCreatedUserCoachToWorldDbClub(world: GameWorld, teamId: TeamId, input: UserCoachCreationInput): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined || team.coachId !== world.userCoachId || world.worldDbCompetitionRuntime?.competitionRuntimeBundle == null) {
    throw new RangeError('WorldDB Coach Creator requires the imported selected team and source runtime')
  }
  const incumbent = world.coaches[world.userCoachId]
  if (incumbent === undefined || !String(incumbent.id).startsWith('worlddb:coach:')) {
    throw new RangeError('WorldDB Coach Creator requires a historical incumbent Coach facade')
  }
  const id = coachIdFromString(`bs19b:user:worlddb:${teamId}`)
  const refs = coachProfileRefsForCoachId(id)
  if (world.coaches[id] !== undefined || world.personsById[refs.personId] !== undefined || world.staffPeopleById[refs.staffProfileId] !== undefined) {
    throw new RangeError('User Coach identity already exists in this world')
  }
  const historicalPerson = world.personsById[incumbent.personId]
  const historicalStaff = world.staffPeopleById[incumbent.staffProfileId]
  if (historicalPerson === undefined || historicalStaff?.personId !== incumbent.personId) throw new RangeError('WorldDB historical Coach is missing canonical identities')

  const vacancy = fireCoachFromTeam(world, teamId)
  const opening = getOpenCoachJobs(vacancy).find((item) => item.teamId === teamId)
  if (opening === undefined) throw new Error('WorldDB career vacancy did not open')

  const newCoach = createCoach({ id, ...refs, firstName: 'BDM', lastName: 'New Coach', gender: input.gender, nationalityId: team.countryId })
  const newStaff = createStaffPerson({
    id: refs.staffProfileId,
    personId: refs.personId,
    identity: { firstName: newCoach.firstName, lastName: newCoach.lastName, nationality: team.countryId },
    professional: createUserCoachRookieProfessionalProfile(),
    marketRole: 'headCoach',
    roleFamily: 'coaching',
  })
  const newPerson = createPerson({
    id: refs.personId,
    firstName: newCoach.firstName,
    lastName: newCoach.lastName,
    gender: input.gender,
    nationalityIds: [team.countryId],
    profileRefs: [{ kind: 'staff', profileId: refs.staffProfileId }],
  })
  const priorStaffHistory = vacancy.staffCareerHistoryByStaffId[incumbent.staffProfileId] ?? []
  const registered = updateGameWorld(vacancy, {
    userCoachId: id,
    persons: [...Object.values(vacancy.personsById), newPerson],
    coaches: [...Object.values(vacancy.coaches), newCoach],
    staffPeople: [...Object.values(vacancy.staffPeopleById), newStaff],
    coachEmploymentByCoachId: { ...vacancy.coachEmploymentByCoachId, [id]: createCoachEmployment({ status: 'unemployed' }) },
    coachCareerHistoryByCoachId: { ...vacancy.coachCareerHistoryByCoachId, [id]: [] },
    coachReputationProfilesByCoachId: { ...vacancy.coachReputationProfilesByCoachId, [id]: createDefaultCoachReputationProfile() },
    coachRpgProfilesByCoachId: { ...vacancy.coachRpgProfilesByCoachId, [id]: createInitialCoachRpgProfile() },
    coachFinancesByCoachId: { ...vacancy.coachFinancesByCoachId, [id]: createCoachFinanceProfile({ coachId: id, annualSalary: 0 }) },
    staffEmploymentByStaffId: { ...vacancy.staffEmploymentByStaffId, [refs.staffProfileId]: { status: 'unemployed' } },
    staffCareerHistoryByStaffId: {
      ...vacancy.staffCareerHistoryByStaffId,
      [incumbent.staffProfileId]: [...priorStaffHistory, {
        kind: 'departure', staffId: incumbent.staffProfileId, teamId, date: world.currentDate, reason: 'fired',
      }],
      [refs.staffProfileId]: [],
    },
    staffReputationProfilesByStaffId: {
      ...vacancy.staffReputationProfilesByStaffId,
      [refs.staffProfileId]: createDefaultStaffReputationProfile(),
    },
  })

  const customized = applyUserCoachCreation(registered, input)
  const candidacy = applyUserCoachForJob(customized, opening.id)
  const offer = Object.values(candidacy.world.coachJobOffersById).find((item) =>
    item.jobOpeningId === opening.id && item.coachId === id && item.status === 'pending')
  if (offer === undefined || offer.annualSalary === undefined) throw new Error('WorldDB new manager did not receive a valid offer')
  // The chosen club is contracted during NEW GAME, so an already-accepted offer must not
  // appear as a pending action the first time the player opens the Inbox.
  const hired = archiveInboxItem(acceptCoachJobOffer(candidacy.world, offer.id), `inbox:career-offer:${offer.id}:${id}`)

  // CoachCareer owns the appointment; StaffCareer mirrors it, retaining a single source
  // of professional salary through the same active StaffContract already used by payroll.
  const contract = createStaffContract({
    id: staffContractIdFromString(`bs19b:staff-contract:${id}:${teamId}`),
    staffId: newStaff.id,
    teamId,
    kind: 'standard',
    term: { startsOn: world.currentDate, expiresOn: addYears(world.currentDate, 2) },
    compensation: { annualSalary: offer.annualSalary },
  })
  const result = updateGameWorld(hired, {
    staffContracts: [...Object.values(hired.staffContractsById), contract],
    staffCareerHistoryByStaffId: {
      ...hired.staffCareerHistoryByStaffId,
      [newStaff.id]: [{
        kind: 'appointment', staffId: newStaff.id, teamId, roleId: 'headCoach', date: world.currentDate, reason: 'hired',
      }],
    },
  })

  // A signed and accepted *actual* job offer is valid PERSONALITY-23I observed evidence.
  // The semantic PERSON50 branch uses this exact catalog event only when a full 50/50
  // personality and adult DOB are available. Legacy eight-score profiles get morale
  // without fabricated personality evolution, keeping Save V4 backward compatible.
  if (result.coachJobOffersById[offer.id]?.status !== 'accepted') {
    throw new Error('PERSON50 evidence requires an accepted, committed job offer')
  }
  const observed = applyMoraleEventToWorld(result, {
    id: `morale:bs19c:contract-offer-accepted:${offer.id}:${id}`,
    personId: id,
    gameDate: world.currentDate,
    source: 'careerEvent',
    delta: 12,
    context: {
      personalityEventKind: 'CONTRACT_OFFER_ACCEPTED',
      offerId: offer.id,
      teamId,
      proof: 'coachCareer:acceptedJobOffer',
    },
  })

  // Coach and StaffProfile are two role-facing projections of one canonical PERSON.
  // PERSON23I applies evidence to its originating role ID; keep the second projection
  // synchronized when the verified job offer advances the new coach's 50-score profile.
  const evolvedPersonality = observed.personalitiesByPersonId[id]
  if (evolvedPersonality === undefined) throw new Error('Created coach lost PERSON50 after signing')
  const aligned = observed.personalitiesByPersonId[newStaff.id] === evolvedPersonality
    ? observed
    : updateGameWorld(observed, { personalitiesByPersonId: {
        ...observed.personalitiesByPersonId,
        [newStaff.id]: evolvedPersonality,
      } })

  // The imported incumbent remains a separate, available historical person and staff
  // profile, with unchanged identity and never the user's new coach.
  if (aligned.personsById[historicalPerson.id]?.firstName !== historicalPerson.firstName ||
      aligned.staffPeopleById[historicalStaff.id]?.personId !== historicalStaff.personId ||
      aligned.coaches[incumbent.id] === undefined) {
    throw new Error('WorldDB career handover unexpectedly changed the historical coach identity')
  }
  return queueFirstStaffMeeting(aligned)
}
