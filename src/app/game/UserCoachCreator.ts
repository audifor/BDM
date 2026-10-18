import { addYears, compareGameDates, parseGameDate } from '@/domain/date'
import { createCoach } from '@/domain/coach'
import { createCoachFinanceProfile } from '@/domain/coachFinances'
import { applyCoachRpgPreset, createCoachRpgProfile, USER_COACH_AMBITIONS, USER_COACH_BACKGROUNDS, type CoachRpgPreset, type UserCoachAmbition, type UserCoachBackground } from '@/domain/coachRpg'
import { createPerson } from '@/domain/person'
import { createStaffPerson, createStaffProfessionalProfile } from '@/domain/staff'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { CountryId } from '@/domain/ids'
import type { Gender } from '@/domain/primitives'
import { queueOpeningDebtDecision } from '@/app/coachLife/CoachLifeDecision'
import { queueFirstStaffMeeting } from '@/app/coachLife/StaffTrustMeeting'
import { generateCreatedCoachPerson50 } from './UserCoachSemanticPersonality'

/** BS19B P0. Edits only the selected manager's canonical Person/StaffProfile.
 * Imported historical WorldDB coaches cannot be edited. Newly created WorldDB coaches have
 * their own BS19B IDs and may be customized without overwriting source records. */
export type { UserCoachBackground, UserCoachAmbition } from '@/domain/coachRpg'
export type UserCoachDisposition = 'balanced' | 'ambitious' | 'loyal'

export interface UserCoachCreationInput {
  readonly firstName: string
  readonly lastName: string
  readonly dateOfBirth: string
  readonly gender: Gender
  readonly nationalityId?: CountryId
  /** Country code or name resolved against the actual selected universe; never a fabricated Country. */
  readonly nationalityCountryCode?: string
  readonly background: UserCoachBackground
  readonly ambition?: UserCoachAmbition
  readonly biography?: string
  readonly disposition: UserCoachDisposition
  readonly coachingStyle: CoachRpgPreset
}

export function applyUserCoachCreation(world: GameWorld, input: UserCoachCreationInput): GameWorld {
  const coach = world.coaches[world.userCoachId]
  if (coach === undefined) throw new RangeError('Player-controlled head coach does not exist')
  if (String(coach.id).startsWith('worlddb:') || (world.worldDbCompetitionRuntime?.competitionRuntimeBundle != null && !String(coach.id).startsWith('bs19b:user:'))) {
    throw new RangeError('Custom Coach Creator cannot modify a sourced World DB manager; create a new PERSON with a career appointment')
  }
  const staff = world.staffPeopleById[coach.staffProfileId]
  if (staff?.personId !== coach.personId || staff.marketRole !== 'headCoach') {
    throw new RangeError('Player-controlled Coach must have its canonical headCoach StaffProfile')
  }
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (firstName.length < 1 || lastName.length < 1 || firstName.length > 60 || lastName.length > 90) throw new RangeError('Coach name must contain 1–60 first-name and 1–90 last-name characters')
  const dob = parseGameDate(input.dateOfBirth)
  if (compareGameDates(addYears(dob, 18), world.currentDate) > 0 || compareGameDates(addYears(dob, 100), world.currentDate) <= 0) {
    throw new RangeError('New head coach must be between 18 and 99 years old at the beginning of the career')
  }
  if (input.gender !== 'male' && input.gender !== 'female') throw new RangeError('Invalid coach gender')
  if (!USER_COACH_BACKGROUNDS.includes(input.background)) throw new RangeError('Invalid coach background')
  if (input.ambition !== undefined && !USER_COACH_AMBITIONS.includes(input.ambition)) throw new RangeError('Invalid coach ambition')
  if (input.biography !== undefined && (typeof input.biography !== 'string' || input.biography.trim().length > 600)) throw new RangeError('Coach biography is too long')
  if (!(['balanced', 'ambitious', 'loyal'] as readonly string[]).includes(input.disposition)) throw new RangeError('Invalid coach disposition')
  if (input.nationalityCountryCode !== undefined && input.nationalityId !== undefined) {
    throw new RangeError('Use nationality ID or country code, not both')
  }
  const nationalityLabel = input.nationalityCountryCode?.trim().toLocaleLowerCase()
  const matchedCountries = nationalityLabel === undefined || nationalityLabel === ''
    ? []
    : Object.values(world.countries).filter((country) => country.code.toLocaleLowerCase() === nationalityLabel || country.name.toLocaleLowerCase() === nationalityLabel)
  if (nationalityLabel !== undefined && nationalityLabel !== '' && matchedCountries.length !== 1) {
    throw new RangeError(`Coach nationality ${input.nationalityCountryCode} was not found uniquely in this GameWorld; choose a code present in the selected universe`)
  }
  const nationalityId: CountryId = matchedCountries[0]?.id ?? input.nationalityId ?? coach.nationalityId
  if (world.countries[nationalityId] === undefined) throw new RangeError('Coach nationality must be a country in the selected world')

  // Preserve the same Coach ID, StaffProfile ID and Person ID, hence career, contracts,
  // relations and every other reference continue to address the same human actor.
  const updatedCoach = createCoach({ ...coach, firstName, lastName, gender: input.gender, nationalityId })
  const baseProfile = applyCoachRpgPreset(staff.professional, input.coachingStyle)
  const backgroundBonuses: Readonly<Record<UserCoachBackground, Readonly<Partial<Record<keyof typeof baseProfile.attributes, number>>>>> = {
    rookie: {},
    formerPlayer: { coaching: 2, leadership: 3, motivation: 3 },
    inDebt: {},
    academyCoach: { playerDevelopment: 5, coaching: 3, communication: 2 },
    videoAnalyst: { analysis: 5, tacticalKnowledge: 4, talentEvaluation: 2 },
    formerAssistant: { coaching: 4, adaptability: 3, leadership: 2 },
  }
  const bonuses = backgroundBonuses[input.background]
  const adjusted = createStaffProfessionalProfile({ attributes: Object.fromEntries(
    Object.entries(baseProfile.attributes).map(([key, value]) => [key, Math.min(100, value + (bonuses[key as keyof typeof bonuses] ?? 0))]),
  ) as typeof baseProfile.attributes })
  const updatedStaff = createStaffPerson({ ...staff, identity: { ...staff.identity, firstName, lastName, dateOfBirth: dob, nationality: nationalityId }, professional: adjusted })
  const person = world.personsById[coach.personId]
  if (person === undefined) throw new RangeError('Player-controlled Coach is missing its canonical Person')
  const updatedPerson = createPerson({ ...person, firstName, lastName, gender: input.gender, dateOfBirth: dob, nationalityIds: [nationalityId] })
  let next = updateGameWorld(world, {
    persons: Object.values(world.personsById).map((entry) => entry.id === person.id ? updatedPerson : entry),
    coaches: Object.values(world.coaches).map((entry) => entry.id === coach.id ? updatedCoach : entry),
    staffPeople: Object.values(world.staffPeopleById).map((entry) => entry.id === staff.id ? updatedStaff : entry),
  })

  // This Coach is explicitly fictional and newly created. Generate the 50 canonical
  // PERSON-23C values once from user-selected biography/disposition, then project
  // the same personality onto both runtime role aliases for this single PERSON ID.
  // Sourced historical WorldDB people are guarded above and are never overwritten.
  const seed = [coach.personId, firstName, lastName, dob, input.background, input.disposition, input.ambition ?? 'firstTitle'].join(':')
  const createdPersonality = generateCreatedCoachPerson50(seed, input)
  next = updateGameWorld(next, { personalitiesByPersonId: {
    ...next.personalitiesByPersonId,
    [coach.id]: createdPersonality,
    [staff.id]: createdPersonality,
  } })

  // A single CoachRpg profile owns the creator's narrative and ambition. The same data is
  // restored by the existing Save V4 path, and remains separate from sourced WorldDB history.
  const rpg = next.coachRpgProfilesByCoachId[coach.id]
  if (rpg === undefined) throw new RangeError('Coach RPG profile is unavailable')
  if (rpg.creatorOrigin !== undefined) throw new RangeError('Coach creator has already initialized this career')
  next = updateGameWorld(next, { coachRpgProfilesByCoachId: {
    ...next.coachRpgProfilesByCoachId,
    [coach.id]: createCoachRpgProfile({ ...rpg, creatorOrigin: {
      background: input.background,
      ambition: input.ambition ?? 'firstTitle',
      ...(input.biography === undefined ? {} : { biography: input.biography }),
    } }),
  } })

  // A voluntarily chosen indebted origin is a source-backed fictional starting condition,
  // not a loan fabricated against someone imported from a historical WorldDB snapshot.
  if (input.background === 'inDebt') {
    const finances = next.coachFinancesByCoachId[coach.id]
    if (finances === undefined) throw new RangeError('Coach finances are unavailable')
    const debtId = `bs19b:starting-debt:${coach.id}`
    if (finances.debts.some((debt) => debt.id === debtId)) throw new RangeError('Starting debt has already been applied')
    next = updateGameWorld(next, { coachFinancesByCoachId: {
      ...next.coachFinancesByCoachId,
      [coach.id]: createCoachFinanceProfile({
        ...finances,
        cash: 2_500,
        debts: [...finances.debts, {
          id: debtId,
          name: 'Starting personal debt',
          principalRemaining: 30_000,
          monthlyPayment: 850,
          interestRate: 0.005,
          status: 'active',
        }],
      }),
    } })
  }
  return queueFirstStaffMeeting(queueOpeningDebtDecision(next, coach.id))
}
