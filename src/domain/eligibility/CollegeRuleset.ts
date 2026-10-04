import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'

/** Clearly fictional rules used to exercise effective-dated eligibility architecture. */
export interface CollegeRuleset {
  readonly id: string
  readonly version: string
  readonly ecosystemId: EcosystemId
  readonly effectiveFrom: GameDate
  readonly effectiveTo?: GameDate
  readonly minimumAcademicPerformance: number
  readonly minimumAcademicProgress: number
  readonly maximumEligibilitySeasons: number
  readonly participationThreshold: number
  readonly provenance: string
  readonly eligibilityClock?: { readonly model: 'AGE_OR_ENROLLMENT_FIVE_YEAR'; readonly effectiveFrom: GameDate; readonly periodYears: 5; readonly ageTriggerYears: 19; readonly academicYearStartMonthDay: '09-01'; readonly source: string; readonly transitionSource: string }
}

export interface PlayerEnrollment {
  readonly id: string
  readonly playerId: PlayerId
  readonly ecosystemId: EcosystemId
  readonly teamId: TeamId
  readonly organizationId: string
  readonly startsOn: GameDate
  readonly endsOn?: GameDate
  readonly sourceRegistrationId?: string
  readonly status: 'active' | 'ended'
  readonly fullTimeEnrollmentTermStartedAt?: GameDate
  readonly firstClassAttendanceAt?: GameDate
  readonly academicLevel?: 'UNDERGRADUATE' | 'POSTGRADUATE'
  readonly transferFromEnrollmentId?: string
  readonly firstAcademicTermEndsOn?: GameDate
  readonly nextAcademicYearStartsOn?: GameDate
  readonly transitionPolicySelection?: 'AGE_BASED' | 'PREVIOUS_RULES'
  readonly transitionPolicySource?: string
}

export type CollegeEligibilityReason = 'NOT_ENROLLED' | 'ACADEMIC_REQUIREMENT_NOT_MET' | 'PARTICIPATION_LIMIT_REACHED' | 'ACTIVE_ELIGIBILITY_RESTRICTION' | 'ELIGIBILITY_CLOCK_EXPIRED' | 'TRANSITION_POLICY_UNDETERMINED' | 'UNDERGRADUATE_MIDYEAR_TRANSFER_DELAY' | 'ELIGIBLE'

export interface CollegeEligibilityAssessment {
  readonly id: string
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly ecosystemId: EcosystemId
  readonly assessedOn: GameDate
  readonly eligible: boolean
  readonly reasons: readonly CollegeEligibilityReason[]
  readonly rulesetId: string
  readonly rulesetVersion: string
  readonly rulesetValues: Pick<CollegeRuleset, 'minimumAcademicPerformance' | 'minimumAcademicProgress' | 'maximumEligibilitySeasons' | 'participationThreshold'>
  readonly evidence: {
    readonly enrollmentId?: string
    readonly academicProfileId?: string
    readonly performance?: number
    readonly progress?: number
    readonly seasonsUsed: number
    readonly registrationIds: readonly string[]
    readonly restrictionIds: readonly string[]
    readonly eligibilityClockStart?: GameDate
    readonly eligibilityClockTrigger?: 'ENROLLMENT' | 'AGE_19_ACADEMIC_YEAR'
    readonly enrollmentClockEvidence?: 'KNOWN' | 'UNKNOWN'
    readonly transitionPolicySelection?: PlayerEnrollment['transitionPolicySelection']
    readonly academicLevel?: PlayerEnrollment['academicLevel']
    readonly competitionEligibleFrom?: GameDate
  }
}

export function createCollegeRuleset(value: CollegeRuleset): CollegeRuleset {
  if (!value.id.trim() || !value.version.trim() || !value.ecosystemId || !value.provenance.trim()) throw new TypeError('College ruleset identity or provenance is invalid')
  parseGameDate(value.effectiveFrom)
  if (value.effectiveTo !== undefined && compareGameDates(parseGameDate(value.effectiveTo), value.effectiveFrom) < 0) throw new RangeError('College ruleset effective interval is invalid')
  for (const threshold of [value.minimumAcademicPerformance, value.minimumAcademicProgress]) if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new RangeError('College ruleset academic threshold is invalid')
  if (!Number.isInteger(value.maximumEligibilitySeasons) || value.maximumEligibilitySeasons < 0 || !Number.isInteger(value.participationThreshold) || value.participationThreshold < 0) throw new RangeError('College ruleset participation rules are invalid')
  if (value.eligibilityClock !== undefined) {
    parseGameDate(value.eligibilityClock.effectiveFrom)
    if (value.eligibilityClock.model !== 'AGE_OR_ENROLLMENT_FIVE_YEAR' || value.eligibilityClock.periodYears !== 5 || value.eligibilityClock.ageTriggerYears !== 19 || value.eligibilityClock.academicYearStartMonthDay !== '09-01' || !value.eligibilityClock.source || !value.eligibilityClock.transitionSource) throw new TypeError('College eligibility clock authority is invalid')
  }
  return Object.freeze({ ...value })
}

export function createPlayerEnrollment(value: PlayerEnrollment): PlayerEnrollment {
  if (!value.id.trim() || !value.playerId || !value.ecosystemId || !value.teamId || !value.organizationId) throw new TypeError('Player enrollment identity is invalid')
  parseGameDate(value.startsOn)
  if (value.endsOn !== undefined && compareGameDates(parseGameDate(value.endsOn), value.startsOn) < 0) throw new RangeError('Player enrollment interval is invalid')
  if ((value.status === 'active') !== (value.endsOn === undefined)) throw new TypeError('Player enrollment status does not match its end date')
  for (const date of [value.fullTimeEnrollmentTermStartedAt, value.firstClassAttendanceAt, value.firstAcademicTermEndsOn, value.nextAcademicYearStartsOn]) if (date !== undefined) parseGameDate(date)
  if (value.firstClassAttendanceAt !== undefined && value.fullTimeEnrollmentTermStartedAt === undefined) throw new TypeError('Class attendance requires full-time enrollment term evidence')
  if (value.firstClassAttendanceAt !== undefined && compareGameDates(value.firstClassAttendanceAt, value.fullTimeEnrollmentTermStartedAt!) < 0) throw new TypeError('Class attendance cannot precede its full-time term')
  if (value.transitionPolicySelection !== undefined && !value.transitionPolicySource) throw new TypeError('Transition selection requires provenance')
  if (value.nextAcademicYearStartsOn !== undefined && value.firstAcademicTermEndsOn !== undefined && compareGameDates(value.nextAcademicYearStartsOn, value.firstAcademicTermEndsOn) <= 0) throw new TypeError('Academic year evidence is invalid')
  return Object.freeze({ ...value })
}

const COLLEGE_REASONS: readonly CollegeEligibilityReason[] = ['NOT_ENROLLED', 'ACADEMIC_REQUIREMENT_NOT_MET', 'PARTICIPATION_LIMIT_REACHED', 'ACTIVE_ELIGIBILITY_RESTRICTION', 'ELIGIBILITY_CLOCK_EXPIRED', 'TRANSITION_POLICY_UNDETERMINED', 'UNDERGRADUATE_MIDYEAR_TRANSFER_DELAY', 'ELIGIBLE']

export function createCollegeEligibilityAssessment(value: CollegeEligibilityAssessment): CollegeEligibilityAssessment {
  if (!value.id.trim() || !value.playerId || !value.teamId || !value.ecosystemId || !value.rulesetId.trim() || !value.rulesetVersion.trim()) throw new TypeError('College eligibility assessment identity is invalid')
  parseGameDate(value.assessedOn)
  if (value.reasons.length === 0 || value.reasons.some((reason) => !COLLEGE_REASONS.includes(reason)) || (value.eligible !== (value.reasons.length === 1 && value.reasons[0] === 'ELIGIBLE'))) throw new TypeError('College eligibility assessment result is invalid')
  if (value.rulesetValues.minimumAcademicPerformance < 0 || value.rulesetValues.minimumAcademicPerformance > 100 || value.rulesetValues.minimumAcademicProgress < 0 || value.rulesetValues.minimumAcademicProgress > 100 || !Number.isInteger(value.rulesetValues.maximumEligibilitySeasons) || value.rulesetValues.maximumEligibilitySeasons < 0 || !Number.isInteger(value.rulesetValues.participationThreshold) || value.rulesetValues.participationThreshold < 0) throw new TypeError('College eligibility ruleset snapshot is invalid')
  if (!Number.isInteger(value.evidence.seasonsUsed) || value.evidence.seasonsUsed < 0) throw new TypeError('College eligibility evidence is invalid')
  return Object.freeze({ ...value, reasons: Object.freeze([...value.reasons]), rulesetValues: Object.freeze({ ...value.rulesetValues }), evidence: Object.freeze({ ...value.evidence, registrationIds: Object.freeze([...value.evidence.registrationIds]), restrictionIds: Object.freeze([...value.evidence.restrictionIds]) }) })
}
