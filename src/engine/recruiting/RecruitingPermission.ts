import { addDays, type GameDate } from '@/domain/date'
import type { RecruitingCalendar, RecruitingCalendarPeriod, RecruitingCalendarWindow, RecruitingEvaluationEvent, RecruitingProspectGroup } from '@/domain/recruiting'
import { getRecruitingPeriod } from '@/domain/recruiting'

export type RecruitingPermissionAction = 'inPersonContact'|'outboundCall'|'inboundCall'|'electronicMessage'|'phoneCall'|'correspondence'|'evaluation'|'officialVisit'|'unofficialVisit'|'offer'|'promise'|'sign'
export type RecruitingActionLocation = 'onCampus'|'offCampus'
export type RecruitingOffCampusSite = 'educationalInstitution'|'residence'|'other'
export type RecruitingCommunicationTarget = 'prospect'|'family'|'coach'|'associatedIndividual'|'chaperone'

export interface RecruitingProspectEducation {
  readonly highSchoolGraduationYear?: number
  readonly sophomoreConclusionOn?: GameDate
  readonly dayAfterSophomoreConclusionOn?: GameDate
  readonly sophomoreYearOpeningOn?: GameDate
  readonly juniorYearOpeningOn?: GameDate
  readonly seniorYearOpeningOn?: GameDate
  readonly nontraditionalCalendar?: boolean
}

export interface RecruitingPermissionContext {
  readonly date: GameDate
  readonly time?: string
  readonly isNCAA: boolean
  readonly calendar?: RecruitingCalendar
  readonly category?: 'men'|'women'
  readonly prospectGroup?: RecruitingProspectGroup
  readonly education?: RecruitingProspectEducation
  readonly action: RecruitingPermissionAction
  readonly location?: RecruitingActionLocation
  readonly offCampusSite?: RecruitingOffCampusSite
  readonly communicationTarget?: RecruitingCommunicationTarget
  readonly direct?: boolean
  readonly eventType?: RecruitingEvaluationEvent
  readonly eventApproved?: boolean
  readonly eventActive?: boolean
  readonly prospectCompetingToday?: boolean
  readonly signingDay?: boolean
  readonly signingRelatedActivity?: boolean
  readonly countsAsOpportunity?: boolean
  readonly countableOpportunitiesUsed?: number
  readonly signedWithOtherProgram?: boolean
  readonly releasedFromContactProhibition?: boolean
  readonly basketballChampionshipDate?: GameDate
  readonly institutionalRegularSigningEndOn?: GameDate
  readonly signedWithThisProgram?: boolean
  readonly JulyAdmissionException?: boolean
  readonly personDayRequired?: boolean
  readonly personDayException?: boolean
  readonly personDaysUsed?: number
  readonly designatedOffCampusRecruiter?: boolean
  readonly designatedOffCampusRecruitersUsed?: number
  readonly maximumDesignatedOffCampusRecruiters?: number
  readonly simultaneousOffCampusRecruiters?: number
  readonly maximumSimultaneousOffCampusRecruiters?: number
  readonly staffDailyCapacity?: number
  readonly staffDailyCapacityUsed?: number
  readonly staffActionCost?: number
}

export interface RecruitingPermissionDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly period?: RecruitingCalendarPeriod
  readonly rulesetId?: string
  readonly provenance: string
  readonly matchedRuleId?: string
  readonly matchedException?: string
  readonly countableOpportunityImpact: 0|1
  readonly recruitingPersonDayImpact: 0|1
  readonly staffCapacityImpact: number
}

/** Single activity legality authority for user and AI recruiting actions. */
export function canPerformRecruitingAction(context: RecruitingPermissionContext): RecruitingPermissionDecision {
  const calendar = context.calendar
  const missingCalendar = !calendar
  if (missingCalendar && context.isNCAA) return decision(context, undefined, false, 'NCAA_RULESET_MISSING')
  const active = calendar ? getRecruitingPeriod(calendar, context.date, context.prospectGroup ?? 'all') : undefined
  const base = decision(context, active, false, 'BLOCKED')
  let matchedException: string | undefined
  const normalizedAction = context.action === 'phoneCall' ? 'outboundCall' : context.action === 'correspondence' ? 'electronicMessage' : context.action
  const mayOccurOutsideCalendarWindows = ['outboundCall','inboundCall','electronicMessage','offer','promise','sign'].includes(normalizedAction)
  if (calendar && active === undefined && !mayOccurOutsideCalendarWindows) return { ...base, reasonCode: 'NO_ACTIVE_RECRUITING_PERIOD' }
  const communication = ['outboundCall','inboundCall','electronicMessage','inPersonContact','offer','promise','officialVisit','unofficialVisit'].includes(normalizedAction)
  if (context.signedWithOtherProgram && !context.releasedFromContactProhibition && communication) return { ...base, reasonCode: 'SIGNED_WITH_OTHER_PROGRAM', matchedException: 'signed-written-aid-contact-prohibition' }
  if (context.signingDay && (['inPersonContact','officialVisit','unofficialVisit'].includes(normalizedAction) || normalizedAction === 'evaluation' && context.signingRelatedActivity)) return { ...base, reasonCode: 'SIGNING_DAY_CONTACT_PROHIBITED', matchedException: 'bylaw-13-1-5-12' }
  if (active?.period === 'shutdown') return { ...base, reasonCode: 'RECRUITING_SHUTDOWN', matchedException: 'shutdown-blocks-all-recruiting' }

  const isWbbJuly = context.category === 'women' && active?.period === 'evaluation' && active.communicationBlackout === true
  const cbaCommunicationException = isWbbJuly && context.eventType === 'collegeBasketballAcademy' && context.eventApproved === true && context.eventActive === true && ['prospect','family','chaperone'].includes(context.communicationTarget ?? 'prospect') && normalizedAction !== 'inPersonContact'
  if (isWbbJuly && communication && !cbaCommunicationException) return { ...base, reasonCode: 'WBB_JULY_COMMUNICATION_BLACKOUT', matchedException: 'bylaw-13-1-6-2-1-d' }
  if (normalizedAction === 'inboundCall' && context.isNCAA) return { ...base, allowed: true, reasonCode: 'ALLOWED', matchedException: 'prospect-initiated-basketball-call' }

  if (normalizedAction === 'sign') {
    if (!context.isNCAA) return { ...base, allowed: true, reasonCode: 'ALLOWED' }
    const rules = calendar?.signingWindowRules
    if (rules === undefined) return { ...base, reasonCode: 'SIGNING_RULESET_MISSING' }
    if (context.prospectGroup !== rules.earlyPeriod.prospectGroup && context.prospectGroup !== 'highSchoolOrTwoYear') return { ...base, reasonCode: 'SIGNING_PROSPECT_CLASS_NOT_ELIGIBLE' }
    const seasonYear = Number(calendar?.derivedSeason?.slice(0, 4))
    if (!Number.isFinite(seasonYear)) return { ...base, reasonCode: 'SIGNING_SEASON_MISSING' }
    const earlyStart = nthWeekdayOfMonth(seasonYear, rules.earlyPeriod.month, rules.earlyPeriod.weekday, rules.earlyPeriod.ordinalWeekday)
    const earlyEnd = addDays(earlyStart, rules.earlyPeriod.durationDays)
    if (context.date >= earlyStart && context.date <= earlyEnd) {
      if (context.date === earlyStart && context.time !== undefined && context.time < rules.earlyPeriod.opensAt) return { ...base, reasonCode: 'SIGNING_PERIOD_NOT_YET_OPEN', matchedException: 'basketball-early-period-opens-at-0700' }
      return { ...base, allowed: true, reasonCode: 'ALLOWED', matchedException: 'basketball-early-signing-period' }
    }
    const regularEnd = context.institutionalRegularSigningEndOn ?? calendar?.institutionalRegularSigningEndOn
    if (context.basketballChampionshipDate !== undefined && regularEnd !== undefined) {
      const regularStart = firstWeekdayOnOrAfter(addDays(context.basketballChampionshipDate, rules.regularPeriod.daysAfterAnchor), rules.regularPeriod.nextWeekday)
      if (context.date >= regularStart && context.date <= regularEnd) {
        if (context.date === regularStart && context.time !== undefined && context.time < rules.regularPeriod.opensAt) return { ...base, reasonCode: 'SIGNING_PERIOD_NOT_YET_OPEN', matchedException: 'basketball-regular-period-opens-at-0700' }
        return { ...base, allowed: true, reasonCode: 'ALLOWED', matchedException: 'basketball-regular-signing-period' }
      }
    }
    return { ...base, reasonCode: context.basketballChampionshipDate === undefined || regularEnd === undefined ? 'SIGNING_PERIOD_CLOSED_OR_UNCONFIGURED' : 'SIGNING_PERIOD_CLOSED' }
  }

  if ((normalizedAction === 'outboundCall' || normalizedAction === 'electronicMessage' || normalizedAction === 'offer' || normalizedAction === 'promise') && context.isNCAA) {
    const threshold = communicationStart(context)
    if (!threshold) return { ...base, reasonCode: 'PROSPECT_EDUCATION_REQUIRED', matchedException: 'communication-start-threshold' }
    if (context.date < threshold) return { ...base, reasonCode: 'COMMUNICATION_BEFORE_START_DATE', matchedException: 'bylaw-13-1-3-and-13-4-1' }
  }

  if (context.signedWithOtherProgram && !context.releasedFromContactProhibition && normalizedAction === 'evaluation') return { ...base, reasonCode: 'SIGNED_WITH_OTHER_PROGRAM', matchedException: 'signed-written-aid-contact-prohibition' }
  if (context.isNCAA && context.countsAsOpportunity && ['inPersonContact','evaluation'].includes(normalizedAction) && (context.countableOpportunitiesUsed ?? 0) >= (calendar?.annualProspectOpportunityLimit ?? 7)) return { ...base, reasonCode: 'RECRUITING_OPPORTUNITY_LIMIT', matchedException: 'seven-contacts-and-evaluations-combined' }
  if (context.personDayRequired && context.isNCAA) {
    if (context.designatedOffCampusRecruiter === false) return { ...base, reasonCode: 'STAFF_NOT_DESIGNATED_OFF_CAMPUS_RECRUITER' }
    const designatedLimit = context.maximumDesignatedOffCampusRecruiters ?? calendar?.maximumDesignatedOffCampusRecruiters
    const simultaneousLimit = context.maximumSimultaneousOffCampusRecruiters ?? calendar?.maximumSimultaneousOffCampusRecruiters
    if (designatedLimit === undefined || simultaneousLimit === undefined) return { ...base, reasonCode: 'OFF_CAMPUS_RECRUITER_LIMITS_MISSING' }
    if ((context.designatedOffCampusRecruitersUsed ?? 0) > designatedLimit) return { ...base, reasonCode: 'OFF_CAMPUS_RECRUITER_DESIGNATION_LIMIT' }
    if ((context.simultaneousOffCampusRecruiters ?? 0) >= simultaneousLimit) return { ...base, reasonCode: 'OFF_CAMPUS_RECRUITER_DAILY_LIMIT' }
    const exempt = context.personDayException ?? active?.personDayException ?? false
    const annualLimit = calendar?.annualPersonDayLimit
    if (!exempt && annualLimit === undefined) return { ...base, reasonCode: 'RECRUITING_PERSON_DAY_LIMIT_MISSING' }
    if (!exempt && (context.personDaysUsed ?? 0) >= annualLimit!) return { ...base, reasonCode: 'RECRUITING_PERSON_DAY_LIMIT' }
  }
  if (context.staffDailyCapacity !== undefined && (context.staffDailyCapacityUsed ?? 0) + (context.staffActionCost ?? 0) > context.staffDailyCapacity) return { ...base, reasonCode: 'STAFF_RECRUITING_CAPACITY_EXHAUSTED' }

  if (active?.period === 'dead' && ['inPersonContact','evaluation','officialVisit','unofficialVisit'].includes(normalizedAction)) return { ...base, reasonCode: normalizedAction === 'evaluation' ? 'DEAD_PERIOD_EVALUATION_BLOCKED' : normalizedAction.includes('Visit') ? 'VISIT_NOT_ALLOWED_IN_PERIOD' : 'DEAD_PERIOD_IN_PERSON_BLOCKED' }
  if (normalizedAction === 'evaluation') {
    const permittedPeriod = active === undefined || active.period === 'evaluation' || active.period === 'recruiting' || active.period === 'contact'
    const permittedEvent = active?.allowedEvaluationEvents === undefined || (context.eventApproved === true && context.eventType !== undefined && active.allowedEvaluationEvents.includes(context.eventType))
    const permittedTime = active === undefined || (active.startTime === undefined || (context.date !== active.startsOn || context.time !== undefined && context.time >= active.startTime)) && (active.endTime === undefined || (context.date !== active.endsOn || context.time !== undefined && context.time <= active.endTime))
    if (!permittedPeriod || !permittedEvent || !permittedTime) return { ...base, reasonCode: 'EVALUATION_CONTEXT_NOT_ALLOWED', ...(!permittedEvent ? { matchedException: 'evaluation-event-filter' } : !permittedTime ? { matchedException: 'evaluation-time-window' } : {}) }
  }
  if (normalizedAction === 'inPersonContact') {
    if (context.prospectCompetingToday) return { ...base, reasonCode: 'PROSPECT_COMPETING_TODAY', matchedException: 'competition-day-contact-restriction' }
    if (context.location === 'offCampus') {
      const offCampusGate = offCampusContact(context)
      if (!offCampusGate.allowed) return { ...base, reasonCode: offCampusGate.reasonCode, matchedException: offCampusGate.matchedException }
      matchedException = offCampusGate.matchedException
      if (context.personDayRequired && context.designatedOffCampusRecruiter === undefined && context.isNCAA) return { ...base, reasonCode: 'STAFF_DESIGNATION_REQUIRED' }
    }
    const allowed = active === undefined || active.period === 'recruiting' || active.period === 'contact' || ((active.period === 'quiet' || active.period === 'evaluation') && context.location === 'onCampus')
    if (!allowed) return { ...base, reasonCode: active?.period === 'quiet' ? 'QUIET_PERIOD_OFF_CAMPUS' : active?.period === 'evaluation' ? 'EVALUATION_PERIOD_NO_IN_PERSON_CONTACT' : 'DEAD_PERIOD_IN_PERSON_BLOCKED' }
  }
  if (normalizedAction === 'officialVisit' || normalizedAction === 'unofficialVisit') {
    const timing = context.isNCAA ? visitStart(context, normalizedAction) : undefined
    if (timing === 'MISSING' && context.isNCAA) return { ...base, reasonCode: 'PROSPECT_EDUCATION_REQUIRED', matchedException: 'visit-start-threshold' }
    if (timing !== undefined && context.date < timing) return { ...base, reasonCode: 'VISIT_BEFORE_FIRST_OPPORTUNITY', matchedException: 'bylaw-13-6-2-1-or-13-7-1-3' }
    const periodAllows = active === undefined || ['recruiting','contact','evaluation','quiet'].includes(active.period)
    const activeRestrictions = calendar?.windows.filter((window) => window.startsOn <= context.date && context.date <= window.endsOn).map((window) => window.visitRestriction) ?? []
    const julyBlocked = activeRestrictions.includes('julyAllVisits') || (activeRestrictions.includes('julyUnofficialOnly') && normalizedAction === 'unofficialVisit')
    const exception = context.signedWithThisProgram === true && context.JulyAdmissionException === true
    if (!periodAllows || julyBlocked && !exception) return { ...base, reasonCode: julyBlocked ? 'JULY_VISIT_RESTRICTION' : 'VISIT_NOT_ALLOWED_IN_PERIOD', ...(julyBlocked ? { matchedException: exception ? 'written-aid-or-admission-deposit-exception' : 'july-visit-restriction' } : {}) }
  }
  return { ...base, allowed: true, reasonCode: 'ALLOWED', ...((cbaCommunicationException ? 'college-basketball-academy-limited-communication' : matchedException) === undefined ? {} : { matchedException: cbaCommunicationException ? 'college-basketball-academy-limited-communication' : matchedException }) }
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): GameDate {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const day = 1 + (weekday - first + 7) % 7 + (ordinal - 1) * 7
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as GameDate
}

function firstWeekdayOnOrAfter(date: GameDate, weekday: number): GameDate {
  const current = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, (weekday - current + 7) % 7)
}

function decision(context: RecruitingPermissionContext, active: RecruitingCalendarWindow | undefined, allowed: boolean, reasonCode: string): RecruitingPermissionDecision {
  const counts = context.countsAsOpportunity === true
  const personDay = context.personDayRequired === true && !(context.personDayException ?? active?.personDayException ?? false)
  const calendar = context.calendar
  return { allowed, reasonCode, ...(active === undefined ? {} : { period: active.period }), ...(calendar === undefined ? {} : { rulesetId: calendar.version }), provenance: calendar?.provenance ?? calendar?.authority ?? 'LEGACY', ...(active?.ruleId === undefined ? {} : { matchedRuleId: active.ruleId }), countableOpportunityImpact: counts ? 1 : 0, recruitingPersonDayImpact: personDay ? 1 : 0, staffCapacityImpact: context.staffActionCost ?? 0 }
}

function communicationStart(context: RecruitingPermissionContext): GameDate | undefined {
  const education = context.education
  if (!education) return undefined
  if (education.nontraditionalCalendar) return education.dayAfterSophomoreConclusionOn
  const year = education.highSchoolGraduationYear
  if (year === undefined) return education.sophomoreConclusionOn
  const month = context.category === 'women' ? 6 : 6
  const day = context.category === 'women' ? 1 : 15
  return `${year - 2}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` as GameDate
}

function offCampusContact(context: RecruitingPermissionContext): { allowed: boolean; reasonCode: string; matchedException?: string } {
  const education = context.education
  if (!education) return { allowed: false, reasonCode: 'PROSPECT_EDUCATION_REQUIRED' }
  const threshold = context.category === 'women'
    ? education.seniorYearOpeningOn === undefined ? undefined : `${education.seniorYearOpeningOn.slice(0,4)}-09-01` as GameDate
    : education.juniorYearOpeningOn
  if (!threshold || context.date < threshold) return { allowed: false, reasonCode: 'OFF_CAMPUS_CONTACT_BEFORE_START' }
  const site = context.offCampusSite ?? 'other'
  if (context.category === 'women') return ['educationalInstitution','residence'].includes(site) ? { allowed: true, reasonCode: 'ALLOWED' } : { allowed: false, reasonCode: 'OFF_CAMPUS_LOCATION_NOT_ALLOWED' }
  const seniorStart = education.seniorYearOpeningOn ?? (education.highSchoolGraduationYear === undefined ? undefined : `${education.highSchoolGraduationYear - 1}-08-01` as GameDate)
  if (seniorStart === undefined) return { allowed: false, reasonCode: 'PROSPECT_EDUCATION_REQUIRED' }
  if (context.date < seniorStart) {
    const aprilException = Number(context.date.slice(5,7)) === 4 && site === 'residence'
    if (site !== 'educationalInstitution' && !aprilException) return { allowed: false, reasonCode: 'JUNIOR_YEAR_CONTACT_LOCATION_RESTRICTED' }
    if (aprilException) return { allowed: true, reasonCode: 'ALLOWED', matchedException: 'april-junior-year-residence' }
  }
  return ['educationalInstitution','residence'].includes(site) ? { allowed: true, reasonCode: 'ALLOWED' } : { allowed: false, reasonCode: 'OFF_CAMPUS_LOCATION_NOT_ALLOWED' }
}

function visitStart(context: RecruitingPermissionContext, action: 'officialVisit'|'unofficialVisit'): GameDate | 'MISSING' | undefined {
  const education = context.education
  if (!education) return 'MISSING'
  const year = education.highSchoolGraduationYear
  if (action === 'unofficialVisit' && context.category === 'women') return undefined
  if (action === 'officialVisit' && context.category === 'women') return education.juniorYearOpeningOn === undefined ? year === undefined ? 'MISSING' : `${year - 2}-01-01` as GameDate : `${education.juniorYearOpeningOn.slice(0,4)}-01-01` as GameDate
  if (action === 'officialVisit') return education.juniorYearOpeningOn ?? (year === undefined ? 'MISSING' : `${year - 2}-08-01` as GameDate)
  return education.sophomoreYearOpeningOn ?? (year === undefined ? 'MISSING' : `${year - 3}-08-01` as GameDate)
}
