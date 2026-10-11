import type { PlayerId } from '@/domain/ids'
import type { Draft, DraftRules } from '@/domain/draft'
import type { GameWorld } from '@/domain/world'

export type NbaInternationalClassification = 'QUALIFYING_INTERNATIONAL' | 'NON_INTERNATIONAL' | 'UNKNOWN'
export interface DraftEligibilityResult { readonly eligible: boolean; readonly automatic: boolean; readonly classification: NbaInternationalClassification; readonly reason: string }

// Derived, collection-reference keyed indexes; they never retain a GameWorld or old collection.
const educationIndexes = new WeakMap<object, Map<PlayerId, NonNullable<GameWorld['recruitProfilesById'][string]['education']>>>()
const enrollmentIndexes = new WeakMap<object, Map<PlayerId, readonly GameWorld['playerEnrollmentsById'][string][]>>()
function educationFor(world: GameWorld, playerId: PlayerId) {
  let index = educationIndexes.get(world.recruitProfilesById)
  if (index === undefined) {
    index = new Map()
    const seen = new Set<PlayerId>()
    for (const profile of Object.values(world.recruitProfilesById)) {
      if (seen.has(profile.playerId)) continue
      seen.add(profile.playerId)
      if (profile.education !== undefined) index.set(profile.playerId, profile.education)
    }
    educationIndexes.set(world.recruitProfilesById, index)
  }
  return index.get(playerId)
}
function collegeEnrollmentsFor(world: GameWorld, playerId: PlayerId) {
  let index = enrollmentIndexes.get(world.playerEnrollmentsById)
  if (index === undefined) {
    const all = new Map<PlayerId, GameWorld['playerEnrollmentsById'][string][]>()
    for (const enrollment of Object.values(world.playerEnrollmentsById)) {
      const records = all.get(enrollment.playerId) ?? []
      records.push(enrollment)
      all.set(enrollment.playerId, records)
    }
    index = all
    enrollmentIndexes.set(world.playerEnrollmentsById, index)
  }
  return (index.get(playerId) ?? []).filter(item => world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
}

/** Uses recorded education/residence facts only. Missing CBA facts remain UNKNOWN. */
export function classifyNbaInternational(world: GameWorld, playerId: PlayerId): NbaInternationalClassification {
  const education = educationFor(world, playerId)
  const hasUsCollegeEnrollment = collegeEnrollmentsFor(world, playerId).length > 0
  if (hasUsCollegeEnrollment) return 'NON_INTERNATIONAL'
  if (!education) return 'UNKNOWN'
  if (education.completedUsHighSchool === true || education.enrolledAtUsCollege === true) return 'NON_INTERNATIONAL'
  const yearsOutside = education.yearsResidentOutsideUsBeforeDraft
  const basketballOutside = education.yearsPlayingBasketballOutsideUsBeforeDraft
  if (yearsOutside === undefined || basketballOutside === undefined) return 'UNKNOWN'
  if (yearsOutside < 3 || basketballOutside < 3) return 'NON_INTERNATIONAL'
  if (education.completedUsHighSchool === false && education.enrolledAtUsCollege === false) return 'QUALIFYING_INTERNATIONAL'
  return 'UNKNOWN'
}

export function assessNbaDraftEligibility(world: GameWorld, playerId: PlayerId, draft: Pick<Draft, 'scheduledOn' | 'rules'> | { readonly scheduledOn: string; readonly rules: DraftRules }): DraftEligibilityResult {
  const player = world.players[playerId]
  if (!player) return { eligible: false, automatic: false, classification: 'UNKNOWN', reason: 'Player does not exist' }
  const year = Number(draft.scheduledOn.slice(0, 4))
  const age = year - Number(player.bio.dateOfBirth.slice(0, 4))
  if (age < (draft.rules.minimumAgeDuringDraftYear ?? 19)) return { eligible: false, automatic: false, classification: classifyNbaInternational(world, playerId), reason: 'Minimum Draft age is not met' }
  const classification = classifyNbaInternational(world, playerId)
  const education = educationFor(world, playerId)
  const collegeEnrollments = collegeEnrollmentsFor(world, playerId)
  const enrolled = collegeEnrollments.length > 0
  if (classification === 'QUALIFYING_INTERNATIONAL' && age >= (draft.rules.internationalAutomaticEligibilityAge ?? 22)) return { eligible: true, automatic: true, classification, reason: 'Meets automatic international age threshold' }
  const gradYear = education?.highSchoolGraduationYear
  const firstCollegeYear = collegeEnrollments.length > 0 ? Math.min(...collegeEnrollments.map((item) => Number(item.startsOn.slice(0, 4)))) : undefined
  if (gradYear === undefined && firstCollegeYear === undefined) return { eligible: false, automatic: false, classification, reason: 'High-school graduation year is unknown' }
  // NCAA entry is evidence that secondary school was completed before enrollment. Elapsed college years provide a conservative lower bound without inventing a graduation date.
  const yearsAfterHighSchool = gradYear === undefined ? year - firstCollegeYear! : year - gradYear
  if (yearsAfterHighSchool < 1) return { eligible: false, automatic: false, classification, reason: 'Required post-high-school year has not elapsed' }
  const autoYears = (draft.rules.postHighSchoolSeasonRequirement ?? 1) + 3
  if (yearsAfterHighSchool >= autoYears) return { eligible: true, automatic: true, classification, reason: 'Meets automatic post-high-school eligibility' }
  if (age >= (draft.rules.minimumAgeDuringDraftYear ?? 19)) return { eligible: true, automatic: false, classification, reason: enrolled ? 'Eligible to declare after a post-high-school season' : 'Eligible to declare after a post-high-school year' }
  return { eligible: false, automatic: false, classification, reason: 'Draft eligibility requirements are not met' }
}
