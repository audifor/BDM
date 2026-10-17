import { addYears, compareGameDates, parseGameDate } from '@/domain/date'
import { createCoach } from '@/domain/coach'
import { createCoachFinanceProfile } from '@/domain/coachFinances'
import { applyCoachRpgPreset, type CoachRpgPreset } from '@/domain/coachRpg'
import { createPersonality } from '@/domain/personality'
import { createPerson } from '@/domain/person'
import { createStaffPerson, createStaffProfessionalProfile } from '@/domain/staff'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { CountryId } from '@/domain/ids'
import type { Gender } from '@/domain/primitives'

/** BS19B P0. The player edits the already allocated manager's canonical Person/StaffProfile.
 * No historical WorldDB person is changed: this command is only permitted for generated universes
 * and the synthetic ACB test manager; that gate is enforced by createConfiguredGame. */
export type UserCoachBackground = 'rookie' | 'formerPlayer' | 'inDebt'
export type UserCoachDisposition = 'balanced' | 'ambitious' | 'loyal'

export interface UserCoachCreationInput {
  readonly firstName: string
  readonly lastName: string
  readonly dateOfBirth: string
  readonly gender: Gender
  readonly nationalityId?: CountryId
  readonly background: UserCoachBackground
  readonly disposition: UserCoachDisposition
  readonly coachingStyle: CoachRpgPreset
}

export function applyUserCoachCreation(world: GameWorld, input: UserCoachCreationInput): GameWorld {
  const coach = world.coaches[world.userCoachId]
  if (coach === undefined) throw new RangeError('Player-controlled head coach does not exist')
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
  if (!(['rookie', 'formerPlayer', 'inDebt'] as readonly string[]).includes(input.background)) throw new RangeError('Invalid coach background')
  if (!(['balanced', 'ambitious', 'loyal'] as readonly string[]).includes(input.disposition)) throw new RangeError('Invalid coach disposition')
  const nationalityId = input.nationalityId ?? coach.nationalityId
  if (world.countries[nationalityId] === undefined) throw new RangeError('Coach nationality must be a country in the selected world')

  // Preserve the same Coach ID, StaffProfile ID and Person ID, hence career, contracts,
  // relations and every other reference continue to address the same human actor.
  const updatedCoach = createCoach({ ...coach, firstName, lastName, gender: input.gender, nationalityId })
  const baseProfile = applyCoachRpgPreset(staff.professional, input.coachingStyle)
  const adjusted = input.background === 'formerPlayer'
    ? createStaffProfessionalProfile({ ...baseProfile, attributes: {
        ...baseProfile.attributes,
        coaching: Math.min(100, baseProfile.attributes.coaching + 2),
        leadership: Math.min(100, baseProfile.attributes.leadership + 3),
        motivation: Math.min(100, baseProfile.attributes.motivation + 3),
      } })
    : baseProfile
  const updatedStaff = createStaffPerson({ ...staff, identity: { ...staff.identity, firstName, lastName, dateOfBirth: dob, nationality: nationalityId }, professional: adjusted })
  const person = world.personsById[coach.personId]
  if (person === undefined) throw new RangeError('Player-controlled Coach is missing its canonical Person')
  const updatedPerson = createPerson({ ...person, firstName, lastName, gender: input.gender, dateOfBirth: dob, nationalityIds: [nationalityId] })
  let next = updateGameWorld(world, {
    persons: Object.values(world.personsById).map((entry) => entry.id === person.id ? updatedPerson : entry),
    coaches: Object.values(world.coaches).map((entry) => entry.id === coach.id ? updatedCoach : entry),
    staffPeople: Object.values(world.staffPeopleById).map((entry) => entry.id === staff.id ? updatedStaff : entry),
  })

  // These are the eight existing runtime dimensions. PERSON50 must be carried forward
  // by its canonical bridge later, never replaced by a parallel personality.
  const personality = next.personalitiesByPersonId[coach.id]
  if (personality !== undefined && input.disposition !== 'balanced') {
    const values = input.disposition === 'ambitious'
      ? { ...personality.values, ambition: Math.max(70, personality.values.ambition), loyalty: Math.min(55, personality.values.loyalty) }
      : { ...personality.values, loyalty: Math.max(70, personality.values.loyalty), ambition: Math.min(55, personality.values.ambition) }
    next = updateGameWorld(next, { personalitiesByPersonId: { ...next.personalitiesByPersonId, [coach.id]: createPersonality({ values }) } })
  }

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
  return next
}
