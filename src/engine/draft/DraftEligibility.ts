import type { PlayerId } from '@/domain/ids'
import type { Draft, DraftRules } from '@/domain/draft'
import type { GameWorld } from '@/domain/world'

export type NbaInternationalClassification = 'QUALIFYING_INTERNATIONAL' | 'NON_INTERNATIONAL' | 'UNKNOWN'
export interface DraftEligibilityResult { readonly eligible: boolean; readonly automatic: boolean; readonly classification: NbaInternationalClassification; readonly reason: string }

/** Uses recorded education/residence facts only. Missing CBA facts remain UNKNOWN. */
export function classifyNbaInternational(world: GameWorld, playerId: PlayerId): NbaInternationalClassification {
  const education = world.recruitProfilesById && Object.values(world.recruitProfilesById).find((profile) => profile.playerId === playerId)?.education
  const hasUsCollegeEnrollment = Object.values(world.playerEnrollmentsById).some((item) => item.playerId === playerId && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
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
  const education = Object.values(world.recruitProfilesById ?? {}).find((profile) => profile.playerId === playerId)?.education
  const collegeEnrollments = Object.values(world.playerEnrollmentsById).filter((item) => item.playerId === playerId && world.ecosystems[item.ecosystemId]?.kind === 'ncaaLike')
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
